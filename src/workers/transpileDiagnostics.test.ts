import { describe, it, expect } from "vitest";
import { Statements, Expressions } from "@abaplint/core";
import { TRANSPILE_REASONS } from "../types/diagnostics";
import { classifyTranspileError, isKnownAstNode } from "./transpileDiagnostics";

describe("classifyTranspileError", () => {
  /**
   * `Multiply`, not `Select`: every message below is one the transpiler can
   * actually produce. `SelectTranspiler` exists, so `Statement Select not
   * supported` is unreachable and would make this suite agree with a message
   * production never sends. `MULTIPLY x BY 3.` really does throw this.
   */
  it("names the statement we failed to transpile", () => {
    expect(
      classifyTranspileError("Statement Multiply not supported, MULTIPLY lv_secret BY 3."),
    ).toEqual({ reason: "unsupported_statement", node: "Multiply" });
  });

  it("names the expression we failed to transpile", () => {
    expect(
      classifyTranspileError("Expression Source not supported, lv_secret + 1"),
    ).toEqual({ reason: "unsupported_expression", node: "Source" });
  });

  /**
   * Every message here is copied from a real `throw new Error(...)` in
   * @abaplint/transpiler that runs at transpile time. Messages the transpiler
   * only ever writes *into the generated JS* — `Void type:`, `Unknown type:`,
   * `UpdateDatabaseTranspiler: table x not found`, `X, kernel class missing` —
   * are deliberately absent: they are thrown by the sandbox, arrive as
   * `runtime_error`, and asserting on them here would be testing a code path
   * production cannot reach. Check which kind you have before adding a case:
   * a `new Chunk(...)`/`appendString(...)` argument is generated code, not a
   * transpile-time throw, and a multi-line template hides that on its inner lines.
   */
  it("classifies the remaining transpiler failure shapes", () => {
    const cases: Array<[string, string]> = [
      ["TypeNameOrInfer, type not found: zcl_secret", "unknown_type"],
      ["lookupType, type not found, lv_secret", "unknown_type"],
      ["PACKAGE SIZED loop larger than package size not supported", "not_implemented"],
      ["SQL Condition, transpiler todo, lv_secret = 1", "not_implemented"],
      ["ValueBody FOR todo, variable, lv_secret", "not_implemented"],
      ["internal error, InsertDatabaseTranspiler", "internal"],
      ["Traverse, unexpected node type", "internal"],
      ["buildConstructor node undefined", "internal"],
      ["isBuiltin, unable to lookup position", "internal"],
      ["TableExpressionTranspiler: Source chunk is undefined", "internal"],
      ["RaiseTranspiler, RESUMABLE not implemented", "not_implemented"],
      ["CastTranspiler, Source not found", "other"],
      ["something nobody has seen before", "other"],
      ["", "other"],
    ];
    for (const [message, reason] of cases) {
      expect({ message, ...classifyTranspileError(message) }).toEqual({
        message,
        reason,
      });
    }
  });

  /**
   * The bucket is steered by the whole message, user identifiers included, so
   * pin how far the word boundaries actually get us. `lv_todo` must not turn an
   * internal failure into `not_implemented`; a variable named exactly `todo`
   * still does, and that residual noise is accepted, not fixed.
   */
  it("keeps prefixed user identifiers from steering the bucket", () => {
    expect(
      classifyTranspileError('DataTranspiler, var not found, "lv_todo", ztest.prog.abap').reason,
    ).toBe("other");
    expect(
      classifyTranspileError('FieldSymbolTranspiler, var not found, "gv_unexpected"').reason,
    ).toBe("other");
    expect(
      classifyTranspileError('DataTranspiler, var not found, "todo"').reason,
    ).toBe("not_implemented");
  });

  it("only ever reports a reason from the declared set", () => {
    const messages = [
      "Statement Multiply not supported, x",
      "lookupType, type not found, x",
      "anything at all",
    ];
    for (const message of messages) {
      expect(TRANSPILE_REASONS).toContain(classifyTranspileError(message).reason);
    }
  });

  /**
   * The privacy property this module exists to hold. Every message below is a
   * real transpiler throw shape with a secret substituted into the slot that
   * embeds user source; none of them may produce a `node`.
   */
  it("never returns a node that is not an abaplint AST class", () => {
    const leaky = [
      "Statement zsecret_password not supported, SELECT * FROM zsecret",
      "Expression my_api_key not supported, foo",
      "Statement Select not supported, Statement Loop not supported",
      "Unknown type: Statement Select not supported",
      "UpdateDatabaseTranspiler: table Select not found",
      "Statement  not supported, x",
      "Statement Select_secret not supported, x",
      "prefix Statement Select not supported, x",
    ];
    for (const message of leaky) {
      const { node } = classifyTranspileError(message);
      if (node !== undefined) {
        expect(isKnownAstNode(node)).toBe(true);
      }
    }
    // The three that fabricate a plausible-looking name must drop it outright.
    expect(
      classifyTranspileError("Statement zsecret_password not supported, x").node,
    ).toBeUndefined();
    expect(
      classifyTranspileError("Expression my_api_key not supported, foo").node,
    ).toBeUndefined();
    expect(
      classifyTranspileError("prefix Statement Select not supported, x").node,
    ).toBeUndefined();
  });

  /**
   * A statement name must not be accepted as an expression name or vice versa —
   * the two sets are looked up separately, so a mismatch drops the parameter.
   * Note the separation is not total: six names (`Select`, `SelectLoop`,
   * `Field`, `FieldSymbol`, `Type`, `Constant`) are exported as both, and for
   * those it decides nothing. `find()` below deliberately picks names that are
   * genuinely in one set only, which is what makes the assertion meaningful.
   */
  it("checks statement and expression names against their own sets", () => {
    const statementOnly = Object.keys(Statements).find(
      (n) => !(n in Expressions),
    )!;
    const expressionOnly = Object.keys(Expressions).find(
      (n) => !(n in Statements),
    )!;

    expect(
      classifyTranspileError(`Statement ${statementOnly} not supported, x`).node,
    ).toBe(statementOnly);
    expect(
      classifyTranspileError(`Expression ${statementOnly} not supported, x`).node,
    ).toBeUndefined();

    expect(
      classifyTranspileError(`Expression ${expressionOnly} not supported, x`).node,
    ).toBe(expressionOnly);
    expect(
      classifyTranspileError(`Statement ${expressionOnly} not supported, x`).node,
    ).toBeUndefined();
  });

  it("builds its vocabulary from abaplint's own exports", () => {
    expect(Object.keys(Statements).length).toBeGreaterThan(100);
    expect(isKnownAstNode("Multiply")).toBe(true);
    expect(isKnownAstNode("Loop")).toBe(true);
    expect(isKnownAstNode("NoSuchAbaplintClass")).toBe(false);
  });

  /**
   * The assumption the whole design rests on, stated as a test rather than left
   * as a comment. The transpiler throws `node.get().constructor.name`; we match
   * it against the *export* names of the same package. Those are two different
   * things that happen to coincide, and nothing in abaplint promises they will.
   *
   * If they diverge — a renamed export, a version bump, a `keepNames` regression
   * mangling classes in the worker bundle — `transpile_node` silently stops
   * being reported while `transpile_reason` carries on. That is a loss of
   * detail, never a leak, because an unrecognised name is discarded. This test
   * is what turns the silent version into a loud one.
   *
   * It cannot see bundler mangling, which only happens in the production worker
   * chunk; `keepNames: true` in vite.config.ts is what covers that, and the
   * comment there explains why it must stay.
   */
  it("pins export names to the class names the transpiler actually throws", () => {
    const mismatched: string[] = [];
    for (const group of [Statements, Expressions]) {
      for (const [exportName, value] of Object.entries(group)) {
        if (typeof value !== "function") continue;
        if (value.name !== exportName) {
          mismatched.push(`${exportName} -> ${value.name}`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});
