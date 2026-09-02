import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, ArtifactsRules } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import { classifySyntaxError, isKnownRuleKey } from "./syntaxDiagnostics";
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
   * instantiates every export of abaplint's rules barrel and reads
   * `getMetadata().key`; a bundler that mangles class names, or an abaplint
   * refactor, could quietly return far fewer. A collapsed set is safe — every
   * key gets dropped — but it would look identical to "syntax errors stopped
   * carrying keys", so pin the order of magnitude here where it is diagnosable.
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
    expect(classifySyntaxError("parser_error", 3)).toEqual({
      key: "parser_error",
      errorCount: 3,
    });
  });

  /**
   * The failure mode that matters: detail goes, the count stays. Note what does
   * NOT reach this branch — a renamed abaplint rule, because the allowed set is
   * built from the same `getMetadata().key` as the value and both move at once.
   * What lands here is a key from outside the registry that `NON_RULE_KEYS`
   * does not name, and anything our own code passes by mistake.
   */
  it("drops an unrecognised key but still reports the count", () => {
    expect(classifySyntaxError("zcust_secret", 2)).toEqual({
      key: undefined,
      errorCount: 2,
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

  async function firstErrorKey(source: string): Promise<[string, number]> {
    const reg = new Registry(abaplintConfig);
    reg.addFile(new MemoryFile("ztest.prog.abap", source));
    await reg.parseAsync();
    const errors = reg
      .findIssues()
      .filter((i) => i.getSeverity().toString() === "Error");
    return [errors[0].getKey(), errors.length];
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
      const [key, count] = await firstErrorKey(source);
      expect(key).toBe(expected);
      expect(classifySyntaxError(key, count)).toEqual({
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
