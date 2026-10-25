// src/workers/unexpectedStatement.ts
//
// abaplint's structure pass has a second message besides the `Expected <X>`
// that structureExplanation.ts handles: `Unexpected <X>`, where X is a
// statement CLASS name upper-cased (`structure_parser.js` `runFile`, the
// `result.unmatched` branch). Unlike `Expected`, it is reported at the
// statement's own line, so the line is right; what is wrong is the text. A bare
// `METHOD run. ... ENDMETHOD.` reads `Unexpected METHODIMPLEMENTATION`, which
// is not even the keyword the user wrote. Measured 2026-10-20..24 that form was
// 29% of `structure` errors (#72).
//
// It is emitted when the top-level matcher stops: every statement before X
// was consumed as a complete top-level item, so no block is open at X. (A
// block that fails part way through is an `Expected` at (1,1) instead.) What
// abaplint cannot see is an opener that did not parse, or that a `"` turned
// into a comment, so `IF x == 1. ... ELSE.` reports `Unexpected ELSE` with
// the IF's parser_error listed after it. The sentence below names those
// causes and never asserts the opener is absent.
//
// Where X belongs is derived, not listed: abaplint's own `Structures` say
// which structures contain X, and the climb stops at the first block pair
// (`deriveBlockPairs`). A statement that can also be reached from the top level
// (WRITE, DATA, FORM) gets no explanation, nor does one whose containers number
// more than three — a long list helps nobody. The derived sets are pinned by
// a test, and the expected sentences are written out by hand there, because a
// pin alone would lock in a wrong derivation as readily as a right one.
//
// Display only. Analytics read the raw Issue, as with structureExplanation.ts.

import { Statements, Structures } from "@abaplint/core";
import { CLOSER_KEYWORD, OPENER_KEYWORD, deriveBlockPairs } from "./openBlock";

const UNEXPECTED = /^Unexpected ([A-Z]+)$/;

/**
 * What to call the statements that are not closers but can only appear inside
 * some block. Hand-kept and deliberately short: a test fails if any entry
 * derives no container. `METHODS`, `CLASS-DATA` and `CLASS-DATA BEGIN OF` are
 * left out on purpose — their derived containers are true but skip the
 * SECTION in between ("inside CLASS … DEFINITION or INTERFACE"), which reads
 * as wrong advice. `MethodImplementation` is the only opener here: every other
 * opener can stand at the top level and so is never `Unexpected`.
 */
export const INNER_KEYWORD: Readonly<Record<string, string>> = {
  MethodImplementation: "METHOD",
  Public: "PUBLIC SECTION",
  Protected: "PROTECTED SECTION",
  Private: "PRIVATE SECTION",
  When: "WHEN",
  WhenOthers: "WHEN OTHERS",
  Else: "ELSE",
  ElseIf: "ELSEIF",
  Catch: "CATCH",
  Cleanup: "CLEANUP",
};

const MAX_CONTAINERS = 3;

const CAUSES =
  "The statement that opens it may be missing, closed earlier than intended, " +
  'commented out (in ABAP a " starts a comment), or written in a form abaplint ' +
  "could not parse. If other errors are listed, fix those first.";

interface Grammar {
  /** Statement class name upper-cased, as abaplint prints it -> export name. */
  byUpper: Map<string, string>;
  /** Structure name -> the structures whose matcher lists it, or a statement. */
  parentsOf: Map<string, Set<string>>;
  /** Structure name -> the statement it starts with, when it starts with one. */
  openerOf: Map<string, string>;
  /** Block structure name -> its opener's class name. */
  blockOpener: Map<string, string>;
}

let grammar: Grammar | null = null;

function loadGrammar(): Grammar {
  if (grammar !== null) return grammar;
  const parentsOf = new Map<string, Set<string>>();
  const openerOf = new Map<string, string>();
  for (const [name, cls] of Object.entries(Structures)) {
    const using = new (cls as new () => { getMatcher(): { getUsing(): string[] } })()
      .getMatcher()
      .getUsing();
    using.forEach((entry, i) => {
      if (i === 0 && entry.startsWith("statement/")) {
        openerOf.set(name, entry.slice("statement/".length));
        return;
      }
      let set = parentsOf.get(entry);
      if (set === undefined) parentsOf.set(entry, (set = new Set()));
      set.add(name);
    });
  }
  const blockOpener = new Map(deriveBlockPairs().map((p) => [p.structure, p.opener]));
  const byUpper = new Map(Object.keys(Statements).map((k) => [k.toUpperCase(), k]));
  grammar = { byUpper, parentsOf, openerOf, blockOpener };
  return grammar;
}

/**
 * The opener keywords of the blocks `statement` may appear in, or null when
 * it can also appear at the top level, appears nowhere, or appears in more
 * than `MAX_CONTAINERS` blocks.
 *
 * The structures `statement` opens are excluded from its own answer: a METHOD
 * belongs in CLASS … IMPLEMENTATION, not "in METHOD" because the Method
 * structure lists it first (Gate2 H1).
 */
export function containersOf(statement: string): string[] | null {
  const g = loadGrammar();
  const own = new Set<string>();
  for (const [structure, opener] of g.openerOf) {
    if (opener === statement) own.add(structure);
  }
  const queue = [`statement/${statement}`, ...[...own].map((s) => `structure/${s}`)];
  const seen = new Set(queue);
  const found = new Set<string>();
  while (queue.length > 0) {
    const entry = queue.shift()!;
    for (const parent of g.parentsOf.get(entry) ?? []) {
      if (own.has(parent)) continue;
      const opener = g.blockOpener.get(parent);
      if (opener !== undefined) {
        const keyword = OPENER_KEYWORD[opener];
        if (keyword === undefined) return null;
        found.add(keyword);
        continue;
      }
      const next = `structure/${parent}`;
      if (!g.parentsOf.has(next)) return null;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  if (found.size === 0 || found.size > MAX_CONTAINERS) return null;
  return [...found];
}

function listOf(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/**
 * The text to show in place of an `Unexpected <X>` structure message, or null
 * when the issue is not one or there is nothing reliable to add. The caller
 * keeps abaplint's position: it is the statement's own.
 */
export function explainUnexpected(key: string, message: string): string | null {
  if (key !== "structure") return null;
  const match = UNEXPECTED.exec(message);
  if (match === null) return null;
  const statement = loadGrammar().byUpper.get(match[1]);
  if (statement === undefined) return null;

  const closer = CLOSER_KEYWORD[statement];
  if (closer !== undefined) {
    // ENDLOOP closes four kinds of LOOP and derives none: say "a block".
    const opened = containersOf(statement);
    const what = opened === null ? "a block" : `a block opened by ${listOf(opened)}`;
    const which = opened === null ? "no block open" : `no ${listOf(opened)} block open`;
    return (
      `${message}. ${closer} closes ${what}, but abaplint saw ${which} ` +
      `for it to close at this line. ${CAUSES}`
    );
  }

  const keyword = INNER_KEYWORD[statement];
  if (keyword === undefined) return null;
  const containers = containersOf(statement);
  if (containers === null) return null;
  return (
    `${message}. ${keyword} is only allowed inside ${listOf(containers)}, ` +
    `and abaplint saw no such block open at this line. ${CAUSES}`
  );
}
