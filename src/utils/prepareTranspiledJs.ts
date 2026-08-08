/**
 * Reshape the transpiler's output so it can run inside the execution worker.
 *
 * This lived inside a template literal in ExecutionSandbox.tsx, where no test
 * could reach it — and it is the most brittle code in the execution path,
 * because every rule here is a guess about the shape of somebody else's
 * codegen. Moving it out is the point: when @abaplint/transpiler changes its
 * output, this file is where that shows up as a red test rather than as a
 * blank Output panel.
 *
 * Known limit, deliberately kept: the import and export rules are anchored to
 * the start of a line, so they cannot touch a string literal on the right-hand
 * side of an expression, but a transpiler that ever emitted a multi-line
 * template whose inner line began with `import ` would still be mangled. That
 * has not happened; the test suite pins the shapes we have actually seen.
 */
export function prepareTranspiledJs(js: string): string {
  const body = js
    .replace(/^import\s+.*$/gm, "")
    .replace(/^export\s+/gm, "")
    // The init script constructs its own runtime. Ours carries the console that
    // captures WRITE output, so theirs must not overwrite it.
    .replace(/globalThis\.abap\s*=\s*new\s+runtime\.ABAP\(\);?/g, "");

  // @abaplint/runtime reaches for globalThis.abap from inside its own methods
  // (append, loop, sy handling), so it has to be bound before the body runs.
  return `globalThis.abap = abap;\n${body}`;
}
