import type { LintIssue } from "../types/messages";

type Tab = "output" | "lint";

interface OutputPanelProps {
  output: string[];
  error: string | null;
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
            {error && (
              <p className="text-red-400 whitespace-pre-wrap">{error}</p>
            )}
            {output.map((line, i) => (
              <p key={i} className="text-green-300 whitespace-pre-wrap">
                {line}
              </p>
            ))}
            {!isRunning && !error && output.length === 0 && (
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
