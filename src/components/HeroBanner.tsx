interface HeroBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

const PILLS = [
  { icon: "▶", label: "Execute ABAP", bg: "bg-blue-950/50", text: "text-blue-300" },
  { icon: "✓", label: "AI Pitfall Detection", bg: "bg-emerald-950/50", text: "text-emerald-300" },
  { icon: "⚡", label: "163 Lint Rules", bg: "bg-amber-950/50", text: "text-amber-300" },
  {
    icon: "🔒",
    label: "Safe for Client Code",
    bg: "bg-purple-950/50",
    text: "text-purple-300",
    title: "All processing runs in your browser. Your code is never sent to any server.",
  },
] as const;

export function HeroBanner({ visible, onDismiss }: HeroBannerProps) {
  if (!visible) return null;

  return (
    <section
      className="relative px-6 py-5 text-center border-b border-gray-700"
      style={{ background: "linear-gradient(180deg, #1e293b 0%, #111827 100%)" }}
    >
      <button
        onClick={onDismiss}
        aria-label="Dismiss hero banner"
        className="absolute top-2 right-3 text-gray-500 hover:text-gray-300 text-sm"
      >
        ✕
      </button>

      <h2 className="text-xl font-bold text-gray-100 tracking-wide">
        Write, Lint & Run ABAP — In Your Browser
      </h2>
      <p className="text-sm text-gray-400 mt-1.5">
        No SAP system required. Validate LLM-generated code.{" "}
        <span className="text-gray-500">SAPシステム不要の道場。</span>
      </p>

      <div className="flex flex-wrap gap-2.5 justify-center mt-4">
        {PILLS.map((pill) => (
          <span
            key={pill.label}
            title={"title" in pill ? pill.title : undefined}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm ${pill.bg} ${pill.text}`}
          >
            <span>{pill.icon}</span>
            {pill.label}
          </span>
        ))}
      </div>
    </section>
  );
}
