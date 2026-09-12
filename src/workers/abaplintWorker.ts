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
import { pitfallToLintIssue } from "../rules/pitfallToLintIssue";
import { classifyTranspileError } from "./transpileDiagnostics";
import { classifySyntaxError } from "./syntaxDiagnostics";
import {
  errorCounter,
  statementScorer,
  countErrors,
  countRealStatements,
  errorIssues,
  findSyntaxRepair,
  findSilentLoss,
} from "./syntaxRepair";
import {
  errorRowCounter,
  errorSpanOf,
  findStatementEndRepair,
} from "./statementEndRepair";
import { bounded, SEARCH_BUDGET_MS } from "./searchDeadline";
import type { SyntaxRepair, TranspileDiagnostics } from "../types/diagnostics";
import type { SilentLossSearch } from "./syntaxRepair";

const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

/**
 * The one in-memory filename every parse in this worker uses. Named once so a
 * repair candidate is judged under the same conditions as the source it
 * repairs — abaplint derives the object name and type from it.
 */
const SOURCE_FILENAME = "ztest.prog.abap";

// Wrapped where they are created, so the unbounded form is never in scope at
// a call site and a forgotten deadline cannot compile (Gate2 1 周目 M1).
// Each is now `(deadline) => reparse`, not a re-parse.
const errorsIn = bounded(errorCounter(abaplintConfig, SOURCE_FILENAME));
const scoreIn = bounded(statementScorer(abaplintConfig, SOURCE_FILENAME));
const errorRowsIn = bounded(errorRowCounter(abaplintConfig, SOURCE_FILENAME));

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
  reg.addFile(new MemoryFile(SOURCE_FILENAME, source));
  await reg.parseAsync();
  const issues = reg.findIssues().map(issueToLintIssue);
  // The LLM-pitfall rules run here as well as in AI Validator mode: they are
  // the reason to use this tool over an ordinary linter, and hiding them behind
  // a mode switch meant almost nobody saw them.
  const pitfalls = detectPitfalls(reg, issues).map(pitfallToLintIssue);
  return { type: "lint-result", issues: [...issues, ...pitfalls] };
}

/**
 * Answer a Run, in two messages.
 *
 * The verdict goes out as soon as it is known; the searches run afterwards
 * and their answer follows on its own message. That ordering is the whole
 * point (#75): a search over a heavy paste can occupy this worker for
 * seconds, and while it sat in front of the reply, App.tsx's 20s watchdog
 * fired first and a real `syntax_error` was shown and counted as `stalled`.
 *
 * Returns void rather than a response: there are two messages now, and having
 * this function post them itself keeps "exactly one follow-up, always" in one
 * place instead of spread across the caller's branches.
 *
 * ## Why the whole body is inside one try/finally
 *
 * The invariant App.tsx waits on is that a follow-up is sent NO MATTER WHAT.
 * Wrapping only the parts known to be risky is what broke it once already:
 * `new Registry(...)`, `first.getMessage()` and `classifySyntaxError(...)` sit
 * on the verdict path, and a throw from any of them left the request with
 * zero messages — the App then showed a real syntax error as `stalled` 20s
 * later, which is the exact failure this change exists to remove (Gate2 1
 * 周目 H3). So the rule here is structural, not a list of risky calls: every
 * exit runs `finally`, and `finally` sends a follow-up if nothing else did.
 *
 * `sent.verdict` records which one is owed, so the follow-up still pairs with
 * the message the App received (`syntax-hint` after a syntax verdict,
 * `silent-loss` after everything else). App.tsx treats the two the same, but
 * a mismatched pair would make the protocol unreadable in a trace.
 *
 * ## Build the verdict message AS AN ARGUMENT, never in a step of its own
 *
 * `sent.verdict` answers "what has already gone out", and the `catch` below
 * reads it as "was a verdict sent at all". The calls that can throw —
 * `classifySyntaxError`, `first.getMessage()`, `classifyTranspileError` — all
 * sit INSIDE the object literal passed to `postVerdict`, so they are
 * evaluated before the call is entered: a throw from one of them leaves
 * `sent.verdict` at `"none"`, the catch sees no verdict was sent and sends
 * one. That is the whole mechanism. Assigning the flag on a line of its own
 * before the call is what breaks it, and it broke it once: with the flag set
 * first, the catch decided a verdict had gone out and sent none, leaving
 * verdict 0 通・追いかけ 1 通 and the App stalling for 20s — the exact failure
 * this change exists to remove (Gate2 2 周目 C1, reproduced in review).
 *
 * `sent` is an object rather than a `let` for a TypeScript reason, not a
 * style one: a `let` assigned only inside the `postVerdict` closure stays
 * narrowed to `"none"` in the enclosing scope, and `finally`'s
 * `verdict === "syntax"` is then rejected as TS2367 — which stops
 * `tsc -b`, and with it `npm run build` and every e2e run (Gate2 3 周目 C1,
 * measured). A property is re-widened across a call, so the comparison holds.
 */
async function handleTranspile(source: string, requestId: string): Promise<void> {
  // A property, not a `let` — see the TypeScript note above.
  const sent: { verdict: "none" | "syntax" | "other" } = { verdict: "none" };
  let followUpSent = false;
  /** Post the verdict and record it. Never record it at a call site. */
  const postVerdict = (kind: "syntax" | "other", message: WorkerResponse) => {
    self.postMessage(message);
    sent.verdict = kind;
  };
  // Unlike postVerdict, the flag goes up BEFORE the post — deliberately. Its
  // job is "never send two", so a throw must not leave the door open for a
  // second attempt; postVerdict's job is "did one get out", which needs the
  // opposite order. Both are about the same throw, read from opposite ends.
  const postFollowUp = (message: WorkerResponse) => {
    if (followUpSent) return;
    followUpSent = true;
    self.postMessage(message);
  };

  try {
    const reg = new Registry(abaplintConfig);
    // `readonly`, not `Issue[]`: findIssues returns `readonly Issue[]`
    // (abaplint.d.ts:4197). The current code infers it; annotating it by hand
    // is what makes the mismatch visible (TS4104). Gate2 C1.
    let issues: readonly Issue[];
    try {
      reg.addFile(new MemoryFile(SOURCE_FILENAME, source));
      await reg.parseAsync();
      issues = reg.findIssues();
    } catch (e) {
      // The parse itself threw, so there is no verdict and nothing to search.
      const msg = e instanceof Error ? e.message : String(e);
      postVerdict("other", {
        type: "transpile-error",
        kind: "transpile",
        message: msg,
        diagnostics: classifyTranspileError(msg),
        requestId,
      });
      return;
    }

    const errors = errorIssues(issues);
    if (errors.length > 0) {
      const first = errors[0];
      postVerdict("syntax", {
        type: "transpile-error",
        kind: "syntax",
        message: first.getMessage(),
        line: first.getStart().getRow(),
        // The message above is what the user reads and it embeds their source;
        // this is the half we are allowed to count. `first` is deliberately the
        // same issue in both, so the metric can be checked against the screen.
        syntaxDiagnostics: classifySyntaxError(
          first.getKey(),
          errors.length,
          first.getMessage(),
        ),
        requestId,
      });

      // The verdict is out. Everything below only decides whether a hint
      // follows it, and costs at most 33 re-parses — 11 per kind, none above
      // MAX_SOURCE_CHARS, none started once SEARCH_BUDGET_MS has passed. Never
      // on `lint`, which fires on every keystroke. Not scoped to the
      // parse-failure keys: any Error-severity outcome gets the search, which is
      // a superset of what can ever match and one fewer rule to keep in step
      // with abaplint.
      //
      // The double quote is tried first and unchanged; the statement-end search
      // (#67) only runs when it found nothing, so what `double_quote` reports
      // cannot move except where the deadline cuts a search short.
      let repair: SyntaxRepair | undefined;
      try {
        const deadline = performance.now() + SEARCH_BUDGET_MS;
        repair =
          (await findSyntaxRepair(source, countErrors(issues), errorsIn(deadline))) ??
          (await findStatementEndRepair(
            source,
            errors.map(errorSpanOf),
            errorRowsIn(deadline),
          ));
      } catch {
        repair = undefined;
      }
      postFollowUp({ type: "syntax-hint", requestId, repair });
      return;
    }

    // No error, so the hint search has nothing to improve on. Transpile and
    // answer FIRST — the sandbox can start executing while we look — then run
    // the other search: a chained statement whose operand a comment ate, which
    // parses, transpiles and runs while printing less than the user wrote
    // (#68). It used to run before transpiling so its answer existed on both
    // exits; running it after both exits below gives the same coverage and
    // stops every successful Run from waiting on it.
    try {
      const transpiler = new Transpiler({ ignoreSourceMap: true });
      const output = await transpiler.run(reg);

      // Combine all transpiled chunks into a single JS string
      const jsChunks = output.objects.map((o) => o.chunk.getCode());
      const js = [
        ...jsChunks,
        output.initializationScript,
        output.initializationScript2,
      ].join("\n");

      postVerdict("other", { type: "transpile-result", js, requestId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      postVerdict("other", {
        type: "transpile-error",
        kind: "transpile",
        message: msg,
        diagnostics: classifyTranspileError(msg),
        requestId,
      });
    }

    let search: SilentLossSearch = { completed: false };
    try {
      search = await findSilentLoss(
        source,
        { errors: 0, real: countRealStatements(reg) },
        scoreIn(performance.now() + SEARCH_BUDGET_MS),
      );
    } catch {
      search = { completed: false };
    }
    // Only a search that ran to the end may be reported as having run. A search
    // that gave up leaves `loss` unset with `completed: false`, so the event
    // omits `silent_loss` rather than claiming `none` for a look that never
    // finished.
    postFollowUp({
      type: "silent-loss",
      requestId,
      completed: search.completed,
      loss: search.completed ? search.loss : undefined,
    });
  } catch (e) {
    // Reached only from the verdict path — every search above swallows its
    // own failures. If no verdict went out, send one: a `transpile_error` is
    // both true (we could not produce JS) and the outcome this code produced
    // before the message was split, so the `transpile_error`/`stalled` pair
    // CLAUDE.md calls load-bearing keeps its meaning.
    if (sent.verdict === "none") {
      const msg = e instanceof Error ? e.message : String(e);
      let diagnostics: TranspileDiagnostics | undefined;
      try {
        diagnostics = classifyTranspileError(msg);
      } catch {
        // The classifier is the other thing on this path that can throw, and
        // the field is optional — report the failure without its diagnosis
        // rather than losing the verdict to a second throw.
        diagnostics = undefined;
      }
      postVerdict("other", {
        type: "transpile-error",
        kind: "transpile",
        message: msg,
        diagnostics,
        requestId,
      });
    }
  } finally {
    // The one place "exactly one follow-up" is enforced. A no-op on every
    // path that already sent one.
    postFollowUp(
      sent.verdict === "syntax"
        ? { type: "syntax-hint", requestId }
        : { type: "silent-loss", requestId, completed: false },
    );
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
  reg.addFile(new MemoryFile(SOURCE_FILENAME, source));

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
    // Posts its own two messages — see the note on handleTranspile.
    await handleTranspile(request.source, request.requestId);
  } else if (request.type === "validate") {
    await handleValidate(request.source);
  }
};
