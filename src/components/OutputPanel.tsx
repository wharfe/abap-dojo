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
  lintIssues,
  isRunning,
  activeTab,
  onTabChange,
}: OutputPanelProps) {
  return (
    <div className="flex flex-col h-full bg-gray-900">
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
            {silentLossHint && (
              <p className="text-yellow-400 whitespace-pre-wrap">
                {silentLossHint}
              </p>
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
