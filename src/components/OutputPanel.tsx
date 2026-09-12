import type { LintIssue } from "../types/messages";

type Tab = "output" | "lint";

interface OutputPanelProps {
  output: string[];
  error: string | null;
  /**
   * Non-error status text, e.g. "Execution stopped." after the user presses
   * Stop. Kept separate from `error` so a deliberate user choice is not
   * painted red the way an actual failure is.
   */
  statusMessage: string | null;
  /**
   * The #68 hint: a statement the user wrote was parsed away as a comment.
   *
   * Its own slot rather than folded into `statusMessage` or `error`, because
   * it belongs to a run that SUCCEEDED. `endRun` moves any message it is given
   * into `error` on every outcome except `stopped`, so a hint routed through
   * either of those would vanish on exactly the runs that also timed out or
   * threw — and painting it red would tell the user their program failed when
   * it ran.
   */
  silentLossHint: string | null;
  /**
   * Whether the searches that explain a failure have answered for the run on
   * screen (#67/#75).
   *
   * The worker replies twice now — the verdict, then whatever the re-parse
   * searches found — so "there is no hint" is not decided at the moment the
   * error appears. Nothing renders differently for `pending` today; it is
   * here because the difference is real state, and because a test that
   * asserts a hint is ABSENT has no other way to know it waited long enough.
   * That gap is #70: a negative assertion that runs before the last moment
   * the element could appear passes against a build without the fix.
   *
   * `done` means "nothing more is coming for this run", NOT "the follow-up
   * arrived". A run that ends `stalled` is exactly the case where the worker
   * may never answer at all, and reading it the other way left this stuck on
   * `pending` for good — the negative tests above then waited out their own
   * timeout instead of asserting anything (Gate2 1 周目 H2). The cost of the
   * wider meaning: `done` alone no longer proves a search ran, so a test that
   * waits for it must also assert the verdict it expected is on screen.
   */
  searchState: "idle" | "pending" | "done";
  lintIssues: LintIssue[];
  isRunning: boolean;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  error: "text-red-400",
  warning: "text-yellow-400",
  info: "text-blue-400",
};

const SEVERITY_ICONS: Record<string, string> = {
  error: "\u2717",
  warning: "\u26A0",
  info: "\u24D8",
};

export function OutputPanel({
  output,
  error,
  statusMessage,
  silentLossHint,
  searchState,
  lintIssues,
  isRunning,
  activeTab,
  onTabChange,
}: OutputPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gray-900" data-search={searchState}>
      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "output"
              ? "text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
          onClick={() => onTabChange("output")}
        >
          Output
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === "lint"
              ? "text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-gray-200"
          }`}
          onClick={() => onTabChange("lint")}
        >
          Lint ({lintIssues.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 font-mono text-sm">
        {activeTab === "output" && (
          <>
            {isRunning && (
              <p className="text-gray-400">Running...</p>
            )}
            {statusMessage && (
              <p className="text-gray-400 whitespace-pre-wrap">{statusMessage}</p>
            )}
            {error && (
              <p className="text-red-400 whitespace-pre-wrap">{error}</p>
            )}
            {output.map((line, i) => (
              <p
                key={i}
                data-testid="output-line"
                className="text-green-300 whitespace-pre-wrap"
              >
                {line}
              </p>
            ))}
            {/* Below the output, not above it: the hint is about the program
                that just ran, so it reads as a note on the result rather than
                as a header the user has to get past. The case it is worst for
                is a run that printed thousands of lines — display stops at
                10,000 — where it lands at the bottom of a long scroll. That is
                the rarer shape by far: the failure this hint is about usually
                produces no output at all, and the partial one produces the few
                lines that survived. */}
            {silentLossHint && (
              <p className="text-yellow-400 whitespace-pre-wrap">
                {silentLossHint}
              </p>
            )}
            {/* A silent loss produces no output and no error, so without the
                hint in this test the placeholder renders directly underneath
                it and tells the user to press the button they just pressed. */}
            {!isRunning &&
              !error &&
              !statusMessage &&
              !silentLossHint &&
              output.length === 0 && (
                <p className="text-gray-500">
                  Click Run to execute your ABAP code.
                </p>
              )}
          </>
        )}

        {activeTab === "lint" && (
          <>
            {lintIssues.length === 0 ? (
              <p className="text-gray-500">No issues found.</p>
            ) : (
              <ul className="space-y-1">
                {lintIssues.map((issue, i) => (
                  <li key={i} className={SEVERITY_STYLES[issue.severity]}>
                    {SEVERITY_ICONS[issue.severity]} L{issue.startLine}:{issue.startCol}{" "}
                    [{issue.key}] {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
