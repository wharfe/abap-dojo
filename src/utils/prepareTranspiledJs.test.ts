import { describe, it, expect } from "vitest";
import { prepareTranspiledJs } from "./prepareTranspiledJs";

describe("prepareTranspiledJs", () => {
  it("strips the ES module imports the transpiler emits", () => {
    const input = [
      `import runtime from "@abaplint/runtime";`,
      `import "./_top.mjs";`,
      `abap.statements.write("hello");`,
    ].join("\n");
    const out = prepareTranspiledJs(input);
    expect(out).not.toMatch(/^import\s/m);
    expect(out).toContain(`abap.statements.write("hello");`);
  });

  it("turns exported declarations into plain ones", () => {
    const out = prepareTranspiledJs(`export async function initializeABAP() {}`);
    expect(out).toContain("async function initializeABAP() {}");
    expect(out).not.toMatch(/^export\s/m);
  });

  /**
   * The init script builds its own runtime instance. Ours has the console that
   * captures WRITE output, so letting theirs win means the run produces nothing.
   */
  it("removes the init script's own ABAP construction", () => {
    const out = prepareTranspiledJs(`globalThis.abap = new runtime.ABAP();`);
    expect(out).not.toContain("new runtime.ABAP()");
  });

  it("binds globalThis.abap to the instance the caller passes in", () => {
    const out = prepareTranspiledJs(`abap.statements.write("x");`);
    expect(out.startsWith("globalThis.abap = abap;")).toBe(true);
  });

  /**
   * A string literal that merely looks like an import must survive: the ABAP
   * source is embedded in the transpiled output as data, and mangling it would
   * change what the user's program does.
   */
  it("leaves import-like text inside string literals alone", () => {
    const input = `abap.statements.write("import runtime from nowhere");`;
    expect(prepareTranspiledJs(input)).toContain(
      `write("import runtime from nowhere")`,
    );
  });

  it("handles an empty program", () => {
    expect(prepareTranspiledJs("")).toBe("globalThis.abap = abap;\n");
  });
});
