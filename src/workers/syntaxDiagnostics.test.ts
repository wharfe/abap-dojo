import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, ArtifactsRules } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { classifySyntaxError, isKnownStatementKeyword, isKnownRuleKey } from "./syntaxDiagnostics";
import { sanitizeParams } from "../utils/analytics";

describe("isKnownRuleKey", () => {
  it("accepts the keys abaplint enumerates", () => {
    for (const key of ["parser_error", "check_syntax", "unknown_types"]) {
      expect(isKnownRuleKey(key)).toBe(true);
    }
  });

  /**
   * `structure` is attached by `structure_parser.ts`, which builds its Issue
   * directly instead of going through a rule, so `ArtifactsRules` does not
   * know it. Without the explicit entry it would be dropped and the bucket
   * would read as a permanent zero — "structure failures never happen" — which
   * is a worse lie than having no bucket. If a core bump ever adds it to the
   * rule registry this test still passes; what it pins is that the key works.
   */
  it("accepts the keys abaplint attaches outside the rule registry", () => {
    expect(isKnownRuleKey("structure")).toBe(true);
  });

  /**
   * The whole privacy argument in one assertion: abaplint's messages
   * interpolate the user's source, so the only reason a key is safe to send is
   * that it must already be a member of a set the user cannot add to. Anything
   * lifted out of a message that is not in that set has to be dropped, however
   * innocent it looks — a snake_case identifier is exactly the shape of an ABAP
   * variable or a customer's own table.
   */
  it("rejects anything the user could have authored", () => {
    for (const key of [
      "zcust_secret",
      "lv_password",
      "mara",
      "PARSER_ERROR",
      "parser_error ",
      "",
      'Database table or view "zcust_secret" not found',
    ]) {
      expect(isKnownRuleKey(key)).toBe(false);
    }
  });

  /**
   * Guards the reflection this module depends on. `ArtifactsRules.getRules()`
   * walks the exports of abaplint's rules barrel, instantiates each one and
   * keeps those with a `getMetadata`. Nothing here reads a `constructor.name`,
   * so name mangling is not the risk — `keepNames` is what the *transpile*
   * classifier needs, not this one. What can quietly cut this set down is a
   * missing export, tree-shaking of the barrel, or abaplint changing how it
   * enumerates. A collapsed set is safe (every key gets dropped) but would
   * look identical to "syntax errors stopped carrying keys", so pin the order
   * of magnitude here where it is diagnosable.
   */
  it("reflects a full rule set, not a collapsed one", () => {
    expect(ArtifactsRules.getRules().length).toBeGreaterThan(150);
  });

  /**
   * The two gates have to agree. This module decides what may travel, but
   * `sanitizeParams` gets the last word, so a key this one accepts and the
   * `RULE_KEY` shape rejects is reported as `syntax_error_count` with no
   * `syntax_key` — a bucket permanently `(not set)`, which reads as "this
   * never happens" rather than "our two checks disagree". `7bit_ascii` was
   * exactly that: a real rule key that a `^[a-z]` pattern dropped. Assert the
   * whole allowed set survives the round trip so the next one fails here.
   */
  it("passes every allowed key through the analytics shape gate", () => {
    const keys = [
      ...ArtifactsRules.getRules().map((rule) => rule.getMetadata().key),
      "structure",
    ];
    const rejected = keys.filter(
      (key) =>
        sanitizeParams("run_result", {
          outcome: "syntax_error",
          duration_ms: 1,
          syntax_key: key,
        }).syntax_key !== key,
    );
    expect(rejected).toEqual([]);
  });
});

describe("classifySyntaxError", () => {
  it("keeps a recognised key and the error count", () => {
    expect(classifySyntaxError("parser_error", 3, "no quoted token here")).toEqual(
      {
        key: "parser_error",
        errorCount: 3,
        statement: undefined,
      },
    );
  });

  /**
   * The failure mode that matters: detail goes, the count stays. Note what does
   * NOT reach this branch — a renamed abaplint rule, because the allowed set is
   * built from the same `getMetadata().key` as the value and both move at once.
   * What lands here is a key from outside the registry that `NON_RULE_KEYS`
   * does not name, and anything our own code passes by mistake.
   */
  it("drops an unrecognised key but still reports the count", () => {
    expect(classifySyntaxError("zcust_secret", 2, 'unknown, "WRITE"')).toEqual({
      key: undefined,
      errorCount: 2,
      // Dropped with the key: `statement` is scoped to `parser_error`, so an
      // unrecognised key cannot carry one even when the token is a real
      // keyword.
      statement: undefined,
    });
  });
});

/**
 * The end-to-end half: run real broken ABAP through the same Registry
 * configuration the worker uses and assert on what abaplint actually reports.
 * Hand-written key strings above prove the filter; these prove the filter is
 * pointed at the values production will really see. Each case is a shape an
 * LLM emits routinely.
 */
describe("keys produced by real ABAP", () => {
  const abaplintConfig = new Config(JSON.stringify(transpilerConfig));

  async function firstErrorKey(
    source: string,
  ): Promise<[string, number, string]> {
    const reg = new Registry(abaplintConfig);
    reg.addFile(new MemoryFile("ztest.prog.abap", source));
    await reg.parseAsync();
    const errors = reg
      .findIssues()
      .filter((i) => i.getSeverity().toString() === "Error");
    return [errors[0].getKey(), errors.length, errors[0].getMessage()];
  }

  const cases: Array<[string, string, string]> = [
    ["syntax abaplint does not recognise", "DATA lv = 1.\nprint(lv).", "parser_error"],
    [
      "a lookup that failed after parsing",
      "SELECT * FROM zsecret INTO TABLE @DATA(lt).\nWRITE 'x'.",
      "check_syntax",
    ],
    [
      "a standard type we do not carry",
      "DATA lt TYPE string_table.\nWRITE lines( lt ).",
      "unknown_types",
    ],
  ];

  for (const [name, source, expected] of cases) {
    it(`reports ${expected} for ${name}`, async () => {
      const [key, count, message] = await firstErrorKey(source);
      expect(key).toBe(expected);
      expect(classifySyntaxError(key, count, message)).toMatchObject({
        key: expected,
        errorCount: count,
      });
    });
  }

  /**
   * `STRING_TABLE` is the reason this whole parameter is worth the GA4
   * registration. It is a type every ABAP developer expects to exist and every
   * LLM emits, and here it is a `syntax_error` — so a large `unknown_types`
   * share would mean the work is "carry more standard SAP artifacts", not
   * "support more syntax". Those are opposite investments, and before this
   * change the metric could not tell them apart.
   */
  it("puts a missing standard type in a different bucket from broken syntax", async () => {
    const [missingType] = await firstErrorKey("DATA lt TYPE string_table.\nWRITE lines( lt ).");
    const [brokenSyntax] = await firstErrorKey("DATA lv = 1.\nprint(lv).");
    expect(missingType).not.toBe(brokenSyntax);
  });
});

/**
 * `syntax_statement`: the half of a `parser_error` the key cannot express.
 *
 * The membership test against abaplint's own statement keywords is the privacy
 * guarantee, so these cases are about proving it holds in both directions — a
 * real keyword travels, and anything the user invented does not, whatever it
 * looks like.
 */
describe("syntax_statement", () => {
  it("reports the keyword when abaplint names a statement it knows", () => {
    expect(
      classifySyntaxError(
        "parser_error",
        1,
        'Statement does not exist in ABAPopen-abap(or a parser error), "WRITE"',
      ).statement,
    ).toBe("WRITE");
  });

  /**
   * The case the whole membership test exists for. Every one of these is a
   * plausible thing to find in the quoted slot, and none of them is abaplint's
   * vocabulary — so none of them may leave the browser.
   */
  it.each([
    ["an invented statement", "FOO"],
    ["a customer namespace object", "ZSECRET"],
    ["a customer table", "ZCUST_SECRET"],
    ["a variable name", "lv_password"],
    ["a lower-case customer object", "zsecret"],
    ["an empty token", ""],
  ])("drops %s", (_name, token) => {
    expect(
      classifySyntaxError(
        "parser_error",
        1,
        `Statement does not exist in ABAPopen-abap(or a parser error), "${token}"`,
      ).statement,
    ).toBeUndefined();
  });

  it("is absent on every key other than parser_error", () => {
    for (const key of ["check_syntax", "unknown_types", "structure"]) {
      expect(
        classifySyntaxError(key, 1, 'something, "WRITE"').statement,
      ).toBeUndefined();
    }
  });

  it("survives a message with no quoted token at all", () => {
    expect(
      classifySyntaxError("parser_error", 1, "no quotes here").statement,
    ).toBeUndefined();
  });

  /**
   * Steering the extraction is possible — the user's source is interpolated
   * into the same message and may contain quotes — and it is supposed to be
   * harmless. Whatever the anchor lands on is still tested for membership, so
   * the worst a crafted program achieves is reporting a different real ABAP
   * keyword about itself.
   */
  it("cannot be steered into emitting the user's own text", () => {
    expect(
      classifySyntaxError(
        "parser_error",
        1,
        'Statement does not exist, "WRITE", "ZSECRET"',
      ).statement,
    ).toBeUndefined();
  });

  /**
   * The end-to-end half, and the case for the parameter existing at all. Every
   * one of these is a `parser_error`, so `syntax_key` says the same thing
   * about all four and cannot tell them apart. `syntax_statement` splits them
   * along the line the work actually follows: `WRITE` is a form of a statement
   * every ABAP developer uses and we failed to parse it, while the other three
   * are not ABAP at all and no amount of parser work would help.
   *
   * Measured against the real Registry, not hand-written messages.
   */
  it.each([
    ["a real statement we could not parse", "WRITE 'a'\nWRITE 'b'.", "WRITE"],
    // ABAP is case-insensitive and abaplint quotes the token exactly as
    // written, so these are the same finding as the row above. LLMs write
    // lower-case ABAP routinely; dropping them would leave the parameter
    // mostly empty AND make that emptiness read as "not ABAP", which is the
    // opposite of the truth.
    ["the same statement in lower case", "write 'a'\nwrite 'b'.", "WRITE"],
    ["the same statement in mixed case", "Write 'a'\nWrite 'b'.", "WRITE"],
    ["an invented statement", "FROBNICATE zsecret_table.", undefined],
    ["an invented statement in lower case", "frobnicate zsecret.", undefined],
    ["JavaScript pasted into ABAP", "const x = 5.", undefined],
    ["a misspelled keyword", "SELCT * FROM mara.", undefined],
  ])("reports %s", async (_name, source, expected) => {
    const reg = new Registry(new Config(JSON.stringify(transpilerConfig)));
    reg.addFile(new MemoryFile("ztest.prog.abap", source));
    await reg.parseAsync();
    const errors = reg
      .findIssues()
      .filter((i) => i.getSeverity().toString() === "Error");

    expect(errors[0].getKey()).toBe("parser_error");
    expect(
      classifySyntaxError(
        errors[0].getKey(),
        errors.length,
        errors[0].getMessage(),
      ).statement,
    ).toBe(expected);
  });

  it("only admits keywords abaplint itself enumerates", () => {
    expect(isKnownStatementKeyword("WRITE")).toBe(true);
    expect(isKnownStatementKeyword("DATA")).toBe(true);
    expect(isKnownStatementKeyword("ZSECRET")).toBe(false);
    expect(isKnownStatementKeyword("")).toBe(false);
  });
});
