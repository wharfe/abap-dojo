import type { AppMode } from "../types/validation";

interface ModeHeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

const MODES: { id: AppMode; label: string }[] = [
  { id: "playground", label: "Playground" },
  { id: "validator", label: "AI Validator" },
];

export function ModeHeader({ mode, onModeChange }: ModeHeaderProps) {
  return (
    <header className="flex items-center px-4 py-2 bg-gray-800 border-b border-gray-700">
      <h1 className="text-lg font-bold tracking-wide text-gray-100 mr-6">
        ABAP Dojo
      </h1>
      <nav className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              mode === m.id
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
