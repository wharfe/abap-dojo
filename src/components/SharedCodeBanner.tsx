interface SharedCodeBannerProps {
  visible: boolean;
  onDismiss: () => void;
}

export function SharedCodeBanner({ visible, onDismiss }: SharedCodeBannerProps) {
  if (!visible) return null;

  return (
    <section
      role="alert"
      className="relative px-6 py-2.5 text-sm border-b border-amber-700/50 bg-amber-900/30 text-amber-100"
    >
      <div className="flex items-center justify-center gap-2 pr-8">
        <span aria-hidden="true">⚠</span>
        <span>
          This code came from a shared link. Review before running —
          <span className="text-amber-200/80"> anyone can craft a share URL.</span>
        </span>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss shared code warning"
        className="absolute top-1.5 right-3 text-amber-300/70 hover:text-amber-100 text-sm leading-none"
      >
        ✕
      </button>
    </section>
  );
}
