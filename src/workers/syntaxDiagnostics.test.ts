import { describe, it, expect } from "vitest";
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { Registry, MemoryFile, Config, ArtifactsRules } from "@abaplint/core";
import { config as transpilerConfig } from "@abaplint/transpiler";
import {
  classifySyntaxError,
  isKnownStatementKeyword,
  isKnownRuleKey,
  STATEMENT_KEYWORDS,
} from "./syntaxDiagnostics";
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
   * Extraction is fail-closed, which is stronger than the membership test
   * alone. Both of these carry the real message prefix — an earlier version of
   * this test did not, so it proved only that an off-shape message is
   * rejected, which is a different and weaker claim. With the prefix present,
   * a second quoted run still fails to match, because `([^"]*)"$` requires the
   * quoted token to be the last thing on the line.
   *
   * Even if it did match, nothing user-controlled escapes: whatever comes out
   * is tested against STATEMENT_KEYWORDS, so the worst a crafted program can
   * do is have a different real ABAP keyword reported about itself.
   */
  it.each([
    [
      "a second quoted run after the token",
      'Statement does not exist in x(or a parser error), "WRITE", "ZSECRET"',
    ],
    [
      "a quote inside the token itself",
      'Statement does not exist in x(or a parser error), "WRI"TE"',
    ],
    [
      "trailing text after the closing quote",
      'Statement does not exist in x(or a parser error), "WRITE" and more',
    ],
  ])("refuses to extract from %s", (_name, message) => {
    expect(
      classifySyntaxError("parser_error", 1, message).statement,
    ).toBeUndefined();
  });

  /**
   * The end-to-end half. Every one of these is a `parser_error`, so
   * `syntax_key` says the same thing about all of them; `syntax_statement`
   * names a keyword for some and nothing for others.
   *
   * What that split is NOT is "ABAP we should fix" versus "not ABAP" — see the
   * colliding JavaScript rows below, which report keywords just as `WRITE`
   * does. Nor is the absent side one thing: `SELCT` is a typo of real ABAP,
   * `frobnicate` is an invented word, and `const` is JavaScript that happens
   * not to collide. The parameter cannot tell those apart and these rows are
   * here to keep that visible.
   *
   * Measured against the real Registry, not hand-written messages.
   */
  it.each([
    ["a real statement we could not parse", "WRITE 'a'\nWRITE 'b'.", "WRITE"],
    // ABAP is case-insensitive and abaplint quotes the token exactly as
    // written, so these are the same finding as the row above. LLMs write
    // lower-case ABAP routinely; dropping them would leave the parameter
    // mostly empty, hiding exactly the keywords it exists to surface.
    ["the same statement in lower case", "write 'a'\nwrite 'b'.", "WRITE"],
    ["the same statement in mixed case", "Write 'a'\nWrite 'b'.", "WRITE"],
    ["an invented statement", "FROBNICATE zsecret_table.", undefined],
    ["an invented statement in lower case", "frobnicate zsecret.", undefined],
    ["a misspelled keyword", "SELCT * FROM mara.", undefined],
    // The limit of what this parameter can tell you, pinned so nobody reads
    // the rows above as "ABAP vs not ABAP". ABAP and JavaScript share a lot of
    // keywords, and abaplint reports the first token either way — so pasted JS
    // is indistinguishable here from ABAP we failed to parse.
    ["JavaScript that collides with ABAP: class", "class Foo {}", "CLASS"],
    ["JavaScript that collides with ABAP: if", "if (x) {\n  y();\n}", "IF"],
    ["JavaScript that collides with ABAP: function", "function f() {}", "FUNCTION"],
    ["JavaScript that collides with ABAP: return", "return x;", "RETURN"],
    ["JavaScript that collides with ABAP: try", "try { f(); }", "TRY"],
    // Not every JS keyword collides — `const`, `throw`, `for`, `var`, `let`
    // and `switch` are not ABAP statement keywords, so those land in the
    // absence. Which side a paste falls on is an accident of vocabulary
    // overlap, not a judgement about the code, which is the whole point.
    ["JavaScript that does not collide: const", "const x = 5.", undefined],
    ["JavaScript that does not collide: throw", "throw new Error();", undefined],
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

  /**
   * `parser_error` is not one message shape. abaplint's parser_error rule emits
   * four (build/src/rules/parser_error.js): the unknown-statement one this
   * parameter is about, "Statement too long, refactor statement",
   * `Macro recursion detected involving "X"`, and "Pragmas not allowed in v700".
   * Two of those are the trap — the macro one ALSO ends in a quoted token, so
   * keying on `parser_error` alone reports a macro's name as though it were a
   * statement we cannot parse, and the too-long one has no token at all, so it
   * carries no token at all, adding a fourth unrelated cause to the absent
   * bucket.
   */
  it.each([
    ["a macro recursion", 'Macro recursion detected involving "WRITE"'],
    ["a statement that is too long", "Statement too long, refactor statement"],
    ["a pragma rejection", "Pragmas not allowed in v700"],
  ])("ignores %s, which shares the parser_error key", (_name, message) => {
    expect(
      classifySyntaxError("parser_error", 1, message).statement,
    ).toBeUndefined();
  });

  it("accepts the unknown-statement message across ABAP version strings", () => {
    for (const version of ["the configured ABAP version", "ABAPopen-abap"]) {
      expect(
        classifySyntaxError(
          "parser_error",
          1,
          `Statement does not exist in ${version}(or a parser error), "WRITE"`,
        ).statement,
      ).toBe("WRITE");
    }
  });

  /**
   * `"ı".toUpperCase()` is `"I"`, so a dotless i folds a non-ABAP token into a
   * real keyword: `ıf x.` really does parse to a token of `"ı" + "f"`. No
   * source escapes — `IF` is still abaplint's own word — but the parameter
   * would claim we cannot parse `IF` when the user never wrote it. Folding is
   * therefore restricted to ASCII.
   */
  it("does not fold non-ASCII tokens into ASCII keywords", () => {
    expect(
      classifySyntaxError(
        "parser_error",
        1,
        'Statement does not exist in x(or a parser error), "\u0131f"',
      ).statement,
    ).toBeUndefined();
  });

  /**
   * The same guard `RULE_KEYS` gets: every member of the enumerated set has to
   * survive the analytics shape, or a keyword abaplint adds later goes quiet
   * in reports with nothing failing. Checking a handful of representatives
   * would not catch that.
   */
  it("passes every enumerated keyword through the analytics shape", () => {
    const rejected = [...STATEMENT_KEYWORDS].filter(
      (syntax_statement) =>
        sanitizeParams("run_result", {
          outcome: "syntax_error",
          syntax_key: "parser_error",
          syntax_statement,
        }).syntax_statement !== syntax_statement,
    );
    expect(rejected).toEqual([]);
  });

  it("drops the statement when the key is not parser_error, at the sanitizer too", () => {
    expect(
      sanitizeParams("run_result", {
        outcome: "syntax_error",
        syntax_key: "check_syntax",
        syntax_statement: "WRITE",
      }).syntax_statement,
    ).toBeUndefined();

    // And with no key at all — the worker never does this, which is the point:
    // the boundary must not depend on the producer being correct.
    expect(
      sanitizeParams("run_result", {
        outcome: "syntax_error",
        syntax_statement: "WRITE",
      }).syntax_statement,
    ).toBeUndefined();
  });

  it("only admits keywords abaplint itself enumerates", () => {
    expect(isKnownStatementKeyword("WRITE")).toBe(true);
    expect(isKnownStatementKeyword("DATA")).toBe(true);
    expect(isKnownStatementKeyword("ZSECRET")).toBe(false);
    expect(isKnownStatementKeyword("")).toBe(false);
  });
});
