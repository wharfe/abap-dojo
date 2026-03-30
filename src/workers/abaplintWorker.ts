import { Registry, MemoryFile, Config, Issue } from "@abaplint/core";
import { Transpiler, config as transpilerConfig } from "@abaplint/transpiler";
import type { WorkerRequest, WorkerResponse, LintIssue } from "../types/messages";

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
    return { type: "transpile-error", message: msg };
  }
}

// eslint-disable-next-line no-restricted-globals
const worker = self as unknown as DedicatedWorkerGlobalScope;

worker.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;

  if (request.type === "lint") {
    response = await handleLint(request.source);
  } else if (request.type === "transpile") {
    response = await handleTranspile(request.source);
  } else {
    return;
  }

  worker.postMessage(response);
};
