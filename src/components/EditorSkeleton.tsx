import { useMemo, type ChangeEvent } from "react";

const MONACO_FONT = "Menlo, Monaco, Consolas, 'Courier New', monospace";
// Monaco's own metrics for a 14px font, matched so the handoff does not reflow.
const FONT_SIZE = 14;
const LINE_HEIGHT = 19;
// vs-dark theme colors, so the swap is not a flash of a different surface.
const BACKGROUND = "#1e1e1e";
const FOREGROUND = "#d4d4d4";
const GUTTER = "#858585";

interface EditorSkeletonProps {
  value: string;
  /** Reports the new text and the caret offset, so Monaco can resume there. */
  onChange: (value: string, caretOffset: number) => void;
}

/**
 * Stands in for Monaco until its chunk has loaded.
 *
 * A plain <pre> would have been simpler, but then the first second of the page
 * would silently swallow anything typed into it. This is a real textarea: edits
 * made here flow through the same onChange as Monaco's, so nothing is lost.
 *
 * Line numbers can drift from wrapped long lines here, since a textarea gives
 * us no way to count visual rows. It is visible only during the handoff.
 */
export function EditorSkeleton({ value, onChange }: EditorSkeletonProps) {
  const lineNumbers = useMemo(() => {
    const count = value === "" ? 1 : value.split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value, event.target.selectionStart);
  };

  return (
    <div
      className="relative flex h-full overflow-hidden"
      style={{ background: BACKGROUND }}
    >
      <div
        aria-hidden="true"
        className="select-none overflow-hidden pt-0 text-right"
        style={{
          color: GUTTER,
          fontFamily: MONACO_FONT,
          fontSize: FONT_SIZE,
          lineHeight: `${LINE_HEIGHT}px`,
          minWidth: "3.5rem",
          paddingRight: "1.25rem",
        }}
      >
        {lineNumbers.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>

      <textarea
        aria-label="ABAP source code"
        // Monaco renders a textarea of its own, so tests need a way to tell the
        // skeleton's apart from it.
        data-editor-skeleton="true"
        className="flex-1 resize-none border-0 bg-transparent outline-none"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        value={value}
        onChange={handleChange}
        style={{
          color: FOREGROUND,
          fontFamily: MONACO_FONT,
          fontSize: FONT_SIZE,
          lineHeight: `${LINE_HEIGHT}px`,
          padding: 0,
        }}
      />

      <span
        className="pointer-events-none absolute bottom-2 right-3 text-xs"
        style={{ color: GUTTER }}
      >
        Loading editor&hellip;
      </span>
    </div>
  );
}
