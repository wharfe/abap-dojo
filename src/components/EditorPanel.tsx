import { useEffect, useRef, useState, useCallback, type ComponentType } from "react";
import type { LintIssue } from "../types/messages";
import { scheduleIdle } from "../utils/scheduleIdle";
import { EditorSkeleton } from "./EditorSkeleton";
import type { MonacoEditorProps } from "./MonacoEditor";

interface EditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  lintIssues: LintIssue[];
}

/**
 * Shows a usable editor immediately and upgrades it to Monaco once loaded.
 *
 * Monaco is ~2.7 MB of JavaScript to fetch, parse and initialize, which used to
 * block the main thread before anything on the page could respond. It now lives
 * in its own chunk, requested at the first idle moment.
 *
 * The placeholder is deliberately not a Suspense fallback. A fallback is a
 * separate subtree, so switching to it would unmount and remount the textarea —
 * dropping focus, caret, and any in-flight IME composition. Importing the module
 * by hand instead keeps the skeleton mounted until the single swap.
 */
export function EditorPanel({ value, onChange, lintIssues }: EditorPanelProps) {
  const [Monaco, setMonaco] = useState<ComponentType<MonacoEditorProps> | null>(
    null,
  );
  // Where the caret sat in the skeleton, or undefined if it was never touched.
  const caretOffsetRef = useRef<number | undefined>(undefined);

  // Wait for an idle moment so the browser can paint and start responding first.
  useEffect(
    () =>
      scheduleIdle(() => {
        void import("./MonacoEditor").then((module) => {
          // The state setter treats a bare function as an updater, so wrap it.
          setMonaco(() => module.default);
        });
      }),
    [],
  );

  const handleSkeletonChange = useCallback(
    (next: string, caretOffset: number) => {
      caretOffsetRef.current = caretOffset;
      onChange(next);
    },
    [onChange],
  );

  if (!Monaco) {
    return <EditorSkeleton value={value} onChange={handleSkeletonChange} />;
  }

  return (
    <Monaco
      value={value}
      onChange={onChange}
      lintIssues={lintIssues}
      caretOffsetRef={caretOffsetRef}
    />
  );
}
