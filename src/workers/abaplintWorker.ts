// src/workers/abaplintWorker.ts
import { Buffer } from "buffer";
// @abaplint/core uses Buffer.from(...) for built-in constant initialization;
// supply a polyfill before any abaplint import sees a missing global.
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, Issue } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import type { WorkerRequest, WorkerResponse, LintIssue } from "../types/messages";
import type { StageResult, ValidationStage } from "../types/validation";
import { detectPitfalls } from "../rules/detector";

const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

function mapSeverity(s: string): LintIssue["severity"] {
  if (s === "Error") return "error";
  if (s === "Warning") return "warning";
  return "info";
}

function issueToLintIssue(issue: Issue): LintIssue {
  const start = issue.getStart();
  const end = issue.getEnd();
  return {
    message: issue.getMessage(),
    key: issue.getKey(),
    startLine: start.getRow(),
    startCol: start.getCol(),
    endLine: end.getRow(),
    endCol: end.getCol(),
    severity: mapSeverity(issue.getSeverity().toString()),
  };
}

async function handleLint(source: string): Promise<WorkerResponse> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));
  await reg.parseAsync();
  const issues = reg.findIssues().map(issueToLintIssue);
  return { type: "lint-result", issues };
}

async function handleTranspile(source: string): Promise<WorkerResponse> {
  try {
    const reg = new Registry(abaplintConfig);
    reg.addFile(new MemoryFile("ztest.prog.abap", source));
    await reg.parseAsync();

    // Check for parser errors first
    const issues = reg.findIssues();
    const errors = issues.filter((i) => i.getSeverity().toString() === "Error");
    if (errors.length > 0) {
      const first = errors[0];
      return {
        type: "transpile-error",
        kind: "syntax",
        message: first.getMessage(),
        line: first.getStart().getRow(),
      };
    }

    const transpiler = new Transpiler({ ignoreSourceMap: true });
    const output = await transpiler.run(reg);

    // Combine all transpiled chunks into a single JS string
    const jsChunks = output.objects.map((o) => o.chunk.getCode());
    const js = [
      ...jsChunks,
      output.initializationScript,
      output.initializationScript2,
    ].join("\n");

    return { type: "transpile-result", js };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { type: "transpile-error", kind: "transpile", message: msg };
  }
}

function postProgress(stage: ValidationStage, status: "running" | "skipped"): void {
  self.postMessage({ type: "validate-progress", stage, status });
}

function postStageResult(stage: ValidationStage, result: StageResult): void {
  self.postMessage({ type: "validate-stage-result", stage, result });
}

async function handleValidate(source: string): Promise<void> {
  const reg = new Registry(abaplintConfig);
  reg.addFile(new MemoryFile("ztest.prog.abap", source));

  // Stage 1: Syntax
  postProgress("syntax", "running");
  await reg.parseAsync();
  const allIssues = reg.findIssues();
  const syntaxErrors = allIssues.filter(
    (i) => i.getSeverity().toString() === "Error",
  );
  const hasSyntaxErrors = syntaxErrors.length > 0;

  postStageResult("syntax", {
    status: hasSyntaxErrors ? "fail" : "pass",
    error: hasSyntaxErrors ? syntaxErrors[0].getMessage() : undefined,
  });

  // Stage 2: Lint + LLM Pitfalls
  postProgress("lint", "running");
  const lintIssues = allIssues.map(issueToLintIssue);
  const pitfalls = detectPitfalls(reg, lintIssues);

  const hasLintWarnings = lintIssues.some((i) => i.severity === "warning");
  const hasLintErrors = lintIssues.some((i) => i.severity === "error");
  const hasPitfallErrors = pitfalls.some((p) => p.severity === "error");

  let lintStatus: StageResult["status"] = "pass";
  if (hasLintErrors || hasPitfallErrors) lintStatus = "fail";
  else if (hasLintWarnings || pitfalls.length > 0) lintStatus = "warn";

  postStageResult("lint", {
    status: lintStatus,
    issues: lintIssues,
    pitfalls,
  });

  // Stage 3: Transpile (skip if syntax errors)
  if (hasSyntaxErrors) {
    postProgress("transpile", "skipped");
    postStageResult("transpile", { status: "skipped" });
    // Also skip runtime
    postProgress("runtime", "skipped");
    postStageResult("runtime", { status: "skipped" });
    return;
  }

  postProgress("transpile", "running");
  try {
    const transpiler = new Transpiler({ ignoreSourceMap: true });
    const output = await transpiler.run(reg);
    const jsChunks = output.objects.map((o) => o.chunk.getCode());
    const js = [
      ...jsChunks,
      output.initializationScript,
      output.initializationScript2,
    ].join("\n");

    postStageResult("transpile", { status: "pass", js });
    // Runtime will be handled by main thread
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    postStageResult("transpile", { status: "fail", error: msg });
    // Skip runtime
    postProgress("runtime", "skipped");
    postStageResult("runtime", { status: "skipped" });
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "lint") {
    self.postMessage(await handleLint(request.source));
  } else if (request.type === "transpile") {
    self.postMessage(await handleTranspile(request.source));
  } else if (request.type === "validate") {
    await handleValidate(request.source);
  }
};
