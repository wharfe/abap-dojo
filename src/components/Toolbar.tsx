import { SampleSelector } from "./SampleSelector";
import type { Sample } from "../samples";
import type { AppMode } from "../types/validation";

interface ToolbarProps {
  mode: AppMode;
  onRun: () => void;
  onValidate: () => void;
  isRunning: boolean;
  isValidating: boolean;
  onShare: () => void;
  onSelectSample: (sample: Sample) => void;
}

export function Toolbar({
  mode,
  onRun,
  onValidate,
  isRunning,
  isValidating,
  onShare,
  onSelectSample,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
      {mode === "playground" && (
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
        >
          {isRunning ? "Running..." : "\u25B6 Run"}
        </button>
      )}
      {mode === "validator" && (
        <button
          onClick={onValidate}
          disabled={isValidating}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
        >
          {isValidating ? "Validating..." : "\uD83D\uDD0D Validate"}
        </button>
      )}
      <SampleSelector onSelect={onSelectSample} />
      <div className="flex-1" />
      <button
        onClick={onShare}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm font-medium rounded transition-colors"
      >
        Share
      </button>
    </div>
  );
}
