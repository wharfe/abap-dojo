// src/workers/openBlock.ts
//
// Which block did the user leave open? abaplint's structure pass does not say:
// `Expected ENDMETHOD` is reported at (1,1) and names the closer the matcher
// was waiting for when it gave up, which is the OUTER block's (#72). So this
// module walks the statements abaplint did parse, with a stack, and names the
// innermost block that is still open when a closer for an outer one arrives or
// the file ends.
//
// Two things it deliberately does not do:
//
// - It does not read the source. The walk sees statement classes only, and the
//   text it produces holds keywords from the table below and line numbers. A
//   closer that failed to parse (a missing period, a typo) is an `Unknown`
//   statement and is as invisible here as it is to abaplint's own matcher; a
//   closer that a `"` turned into a comment is a comment. The wording in
//   `describeOpenBlock` is written for that: it never asserts the closer is
//   absent, it says abaplint did not see one, and points at the closing line.
// - It does not keep the opener/closer table by hand. Every block structure
//   abaplint exports reports the statement it starts with and the one it ends
//   with (`getMatcher().getUsing()`), so the table is derived from those, and a
//   test pins the derived result so a bump that changes it goes red.

import { Statements, Structures, VirtualPosition } from "@abaplint/core";
import type { Nodes, Token } from "@abaplint/core";

type StatementNode = Nodes.StatementNode;
/** What `StatementNode.get()` returns: abaplint does not export the interface. */
type IStatement = ReturnType<StatementNode["get"]>;

/**
 * A statement class that is legal on its own as well as opening a block, and
 * therefore cannot be pushed: `MODULE x.` in flow logic is a plain statement,
 * so pushing it would name a MODULE as the unclosed block above a real
 * unclosed IF. Derived, not listed: it is every opener that some structure's
 * `getUsing()` also lists bare, anywhere other than as its own first element.
 */
function bareStatementNames(
  usings: ReadonlyArray<readonly string[]>,
): Set<string> {
  const bare = new Set<string>();
  for (const using of usings) {
    for (const entry of using) {
      if (entry.startsWith("statement/") && entry !== using[0]) {
        bare.add(entry.slice("statement/".length));
      }
    }
  }
  return bare;
}

export interface BlockPair {
  /** The structure's name as `Structures` exports it, e.g. `Loop`. */
  structure: string;
  /** The opening statement's class name as `Statements` exports it. */
  opener: string;
  /** The closing statement's class name as `Statements` exports it. */
  closer: string;
}

/**
 * Every opener/closer pair abaplint's structures declare: a structure whose
 * matcher starts with a statement and ends with a statement named like a
 * closer, minus the openers that are also legal as bare statements.
 */
export function deriveBlockPairs(): BlockPair[] {
  const usings = Object.entries(Structures).map(
    ([name, cls]) =>
      [name, new (cls as new () => { getMatcher(): { getUsing(): string[] } })()
        .getMatcher()
        .getUsing()] as const,
  );
  const bare = bareStatementNames(usings.map(([, u]) => u));
  const pairs: BlockPair[] = [];
  for (const [structure, using] of usings) {
    const first = using[0];
    const last = using[using.length - 1];
    if (first === undefined || last === undefined) continue;
    if (!first.startsWith("statement/") || !last.startsWith("statement/")) continue;
    const opener = first.slice("statement/".length);
    const closer = last.slice("statement/".length);
    if (!/^End|End$/.test(closer)) continue;
    if (bare.has(opener)) continue;
    pairs.push({ structure, opener, closer });
  }
  return pairs;
}

/** The names `bareStatementNames` excludes today; pinned by the test. */
export const EXCLUDED_BARE_OPENERS: readonly string[] = ["Module"];

/**
 * What to call each opener in a sentence. Hand-kept, and a test fails if its
 * keys are not exactly the derived openers. Three entries never fire under the
 * transpiler's config (`WITH` and `TYPES BEGIN OF MESH` do not parse there,
 * and a `LOOP` in flow logic is always `Unexpected` at its own line); they
 * stay so the table and the derivation agree.
 */
export const OPENER_KEYWORD: Readonly<Record<string, string>> = {
  At: "AT NEW / AT END OF",
  AtFirst: "AT FIRST",
  AtLast: "AT LAST",
  Case: "CASE",
  CaseType: "CASE TYPE OF",
  CatchSystemExceptions: "CATCH SYSTEM-EXCEPTIONS",
  Chain: "CHAIN",
  ClassDataBegin: "CLASS-DATA BEGIN OF",
  ClassDefinition: "CLASS … DEFINITION",
  ClassImplementation: "CLASS … IMPLEMENTATION",
  ConstantBegin: "CONSTANTS BEGIN OF",
  DataBegin: "DATA BEGIN OF",
  Define: "DEFINE",
  Do: "DO",
  DynproLoop: "LOOP (screen flow logic)",
  Enhancement: "ENHANCEMENT",
  EnhancementSection: "ENHANCEMENT-SECTION",
  ExecSQL: "EXEC SQL",
  Form: "FORM",
  FunctionModule: "FUNCTION",
  If: "IF",
  Interface: "INTERFACE",
  Loop: "LOOP",
  LoopAtScreen: "LOOP AT SCREEN",
  LoopExtract: "LOOP (extract dataset)",
  MethodImplementation: "METHOD",
  OnChange: "ON CHANGE OF",
  Provide: "PROVIDE",
  SelectLoop: "SELECT",
  StaticBegin: "STATICS BEGIN OF",
  TestInjection: "TEST-INJECTION",
  TestSeam: "TEST-SEAM",
  Try: "TRY",
  TypeBegin: "TYPES BEGIN OF",
  TypeEnumBegin: "TYPES BEGIN OF ENUM",
  TypeMeshBegin: "TYPES BEGIN OF MESH",
  While: "WHILE",
  WithLoop: "WITH … SELECT",
};

/** What to call each closer. Same contract as `OPENER_KEYWORD`. */
export const CLOSER_KEYWORD: Readonly<Record<string, string>> = {
  ClassDataEnd: "END OF",
  ConstantEnd: "END OF",
  DataEnd: "END OF",
  EndAt: "ENDAT",
  EndCase: "ENDCASE",
  EndCatch: "ENDCATCH",
  EndChain: "ENDCHAIN",
  EndClass: "ENDCLASS",
  EndDo: "ENDDO",
  EndEnhancement: "ENDENHANCEMENT",
  EndEnhancementSection: "END-ENHANCEMENT-SECTION",
  EndExec: "ENDEXEC",
  EndForm: "ENDFORM",
  EndFunction: "ENDFUNCTION",
  EndIf: "ENDIF",
  EndInterface: "ENDINTERFACE",
  EndLoop: "ENDLOOP",
  EndMethod: "ENDMETHOD",
  EndOfDefinition: "END-OF-DEFINITION",
  EndOn: "ENDON",
  EndProvide: "ENDPROVIDE",
  EndSelect: "ENDSELECT",
  EndTestInjection: "END-TEST-INJECTION",
  EndTestSeam: "END-TEST-SEAM",
  EndTry: "ENDTRY",
  EndWhile: "ENDWHILE",
  EndWith: "ENDWITH",
  StaticEnd: "END OF",
  TypeEnumEnd: "END OF ENUM",
  TypeEnd: "END OF",
  TypeMeshEnd: "END OF MESH",
};

/**
 * Openers whose blocks cannot nest in themselves. When one of these is still
 * open as another of the same kind begins, the second one is the evidence,
 * not a nested block; the wording differs.
 */
const NOT_NESTABLE: ReadonlySet<string> = new Set([
  "MethodImplementation",
  "Form",
  "FunctionModule",
  "ClassImplementation",
  "ClassDefinition",
  "Interface",
]);

/**
 * Openers whose chained form puts several blocks under one keyword
 * (`TYPES: BEGIN OF a, …, END OF a, BEGIN OF b, …`). Every statement in the
 * chain reports the chain's first token, so for these the row comes from the
 * first token after the colon instead. For any other opener the keyword row
 * is the one the user looks for (`IF:` on its own line is still "the IF on
 * that line").
 */
const CHAINED_BEGIN: ReadonlySet<string> = new Set([
  "ClassDataBegin",
  "ConstantBegin",
  "DataBegin",
  "StaticBegin",
  "TypeBegin",
  "TypeEnumBegin",
  "TypeMeshBegin",
]);

export interface OpenFrame {
  /** Opener class name as `Statements` exports it. */
  className: string;
  row: number;
  col: number;
  /** The statement came out of a macro: `row` is the macro call's row. */
  virtual: boolean;
  /**
   * A block closed by the same closer was closed while this one was open:
   * set on the frame below when a frame is popped and the new top shares its
   * closer (IF inside IF, but also CLASS … DEFINITION over CLASS …
   * IMPLEMENTATION through ENDCLASS, LOOP over LOOP AT SCREEN through
   * ENDLOOP). `closedRow` is the closer's row, `closedOpenerRow` and
   * `closedOpenerClass` the opener it closed. For a block that can nest the
   * last such closer is kept (the nearest to where one is missing); for one
   * that cannot, the first — the sibling that began while it was open is
   * where its closer belongs.
   */
  sameKind?: { closedRow: number; closedOpenerRow: number; closedOpenerClass: string };
}

interface FindingBase {
  /** The innermost block still open: the one the text names. */
  block: OpenFrame;
  /**
   * Every block open at the moment of the finding, outermost first. The
   * caller checks abaplint's own `Expected <closer>` against it
   * (`findingExplains`): a finding about a block none of whose open frames
   * that closer could close is about a different mistake.
   */
  open: readonly OpenFrame[];
}

export type OpenBlockFinding =
  /** The file ended with `block` still open, and `outside` more below it. */
  | (FindingBase & { kind: "unclosed"; outside: number })
  /**
   * A closer arrived for `matched`, which sits below `block` in the stack;
   * `between` lists the frames between the two, innermost first.
   */
  | (FindingBase & {
      kind: "closed-over";
      closer: { className: string; row: number };
      matched: OpenFrame;
      between: OpenFrame[];
    })
  /** A METHOD body began directly inside a CLASS … DEFINITION. */
  | (FindingBase & { kind: "method-in-definition"; definition: OpenFrame });

interface Classified {
  opener?: string;
  closer?: string;
}

type StatementClass = new () => IStatement;

const STATEMENT_CLASSES = Statements as Record<string, StatementClass | undefined>;
/**
 * Pairs whose both classes `Statements` exports. A structure naming a class
 * it does not export would otherwise put `undefined` into an `instanceof`,
 * which throws inside every lint with a structure error. The pinned test
 * notices the pair; this keeps the worker alive if it lands anyway.
 */
export const PAIRS: readonly BlockPair[] = deriveBlockPairs().filter(
  (p) => STATEMENT_CLASSES[p.opener] !== undefined && STATEMENT_CLASSES[p.closer] !== undefined,
);
const OPENER_CLASSES: ReadonlyArray<readonly [StatementClass, string]> = PAIRS.map(
  (p) => [STATEMENT_CLASSES[p.opener]!, p.opener] as const,
);
const CLOSER_CLASSES: ReadonlyArray<readonly [StatementClass, string]> = [
  ...new Set(PAIRS.map((p) => p.closer)),
].map((c) => [STATEMENT_CLASSES[c]!, c] as const);
/** closer class name -> the opener class names it closes (shared closers). */
const OPENERS_OF: ReadonlyMap<string, readonly string[]> = new Map(
  [...new Set(PAIRS.map((p) => p.closer))].map((c) => [
    c,
    PAIRS.filter((p) => p.closer === c).map((p) => p.opener),
  ]),
);
/** opener class name -> its closer class name. */
const CLOSER_OF: ReadonlyMap<string, string> = new Map(
  PAIRS.map((p) => [p.opener, p.closer]),
);

function classify(statement: IStatement): Classified {
  for (const [cls, name] of OPENER_CLASSES) {
    if (statement instanceof cls) return { opener: name };
  }
  for (const [cls, name] of CLOSER_CLASSES) {
    if (statement instanceof cls) return { closer: name };
  }
  return {};
}

/** The closers of `CHAINED_BEGIN`: `END OF` inside a chain needs the same row rule. */
const CHAINED_END: ReadonlySet<string> = new Set(
  [...CHAINED_BEGIN].map((o) => CLOSER_OF.get(o)).filter((c): c is string => c !== undefined),
);

function positionOf(
  node: StatementNode,
  className: string,
): { row: number; col: number; virtual: boolean } {
  let token: Token = node.getFirstToken();
  const colon = node.getColon();
  if (colon !== undefined && (CHAINED_BEGIN.has(className) || CHAINED_END.has(className))) {
    const after = node.getTokens().find((t) => t.getStart().isAfter(colon.getStart()));
    if (after !== undefined) token = after;
  }
  const start = token.getStart();
  return { row: start.getRow(), col: start.getCol(), virtual: start instanceof VirtualPosition };
}

/**
 * Walk the statements with a stack of open blocks and return the first thing
 * that explains an `Expected <closer>` — or null when nothing does, in which
 * case the caller keeps the generic explanation and names no line.
 *
 * A closer whose opener is not on the stack at all is ignored: abaplint would
 * have reported that as `Unexpected`, so under an `Expected` it is not the
 * cause (and `SELECT … INTO TABLE` followed by a stray `ENDSELECT` would
 * otherwise be blamed on the enclosing METHOD).
 */
export function findOpenBlock(
  statements: readonly StatementNode[],
): OpenBlockFinding | null {
  const stack: OpenFrame[] = [];
  for (const node of statements) {
    const { opener, closer } = classify(node.get());
    if (opener !== undefined) {
      const frame: OpenFrame = { className: opener, ...positionOf(node, opener) };
      const top = stack[stack.length - 1];
      if (opener === "MethodImplementation" && top?.className === "ClassDefinition") {
        return { kind: "method-in-definition", block: frame, definition: top, open: [...stack] };
      }
      stack.push(frame);
      continue;
    }
    if (closer === undefined) continue;
    const openers = OPENERS_OF.get(closer) ?? [];
    let idx = stack.length - 1;
    while (idx >= 0 && !openers.includes(stack[idx].className)) idx--;
    if (idx < 0) continue;
    if (idx === stack.length - 1) {
      const closed = stack.pop()!;
      const below = stack[stack.length - 1];
      if (
        below !== undefined &&
        CLOSER_OF.get(below.className) === closer &&
        (below.sameKind === undefined || !NOT_NESTABLE.has(below.className))
      ) {
        below.sameKind = {
          closedRow: positionOf(node, closer).row,
          closedOpenerRow: closed.row,
          closedOpenerClass: closed.className,
        };
      }
      continue;
    }
    const block = stack[stack.length - 1];
    return {
      kind: "closed-over",
      block,
      closer: { className: closer, row: positionOf(node, closer).row },
      matched: stack[idx],
      between: stack.slice(idx + 1, stack.length - 1).reverse(),
      open: [...stack],
    };
  }
  if (stack.length === 0) return null;
  return { kind: "unclosed", block: stack[stack.length - 1], outside: stack.length - 1, open: [...stack] };
}

/**
 * Whether abaplint's `Expected <X>` can be about this finding: true when
 * `X` (the closer class name upper-cased, as abaplint prints it) closes some
 * block that was open at the finding. Two independent mistakes — a FORM
 * inside an IF, and an unrelated DO left open at the end — give
 * `Expected ENDIF` with a walk that names the DO; naming it would send the
 * user to a line that has nothing to do with the error on screen.
 */
export function findingExplains(finding: OpenBlockFinding, expectedNode: string): boolean {
  return finding.open.some(
    (frame) => (CLOSER_OF.get(frame.className) ?? "").toUpperCase() === expectedNode,
  );
}

function nameOf(frame: OpenFrame): string {
  const keyword = OPENER_KEYWORD[frame.className];
  return frame.virtual
    ? `${keyword} expanded from the macro call on line ${frame.row}`
    : `${keyword} on line ${frame.row}`;
}

function closerKeywordOf(frame: OpenFrame): string {
  return CLOSER_KEYWORD[CLOSER_OF.get(frame.className) ?? ""] ?? "";
}

function selectNote(frame: OpenFrame): string {
  return frame.className === "SelectLoop"
    ? " (a SELECT without SINGLE or INTO TABLE loops until ENDSELECT)"
    : "";
}

function sameKindSentence(frame: OpenFrame): string | null {
  if (frame.sameKind === undefined) return "";
  const { closedRow, closedOpenerRow, closedOpenerClass } = frame.sameKind;
  const closed = OPENER_KEYWORD[closedOpenerClass];
  if (closed === undefined) return null;
  if (NOT_NESTABLE.has(frame.className)) {
    return ` It was still open when the ${closed} on line ${closedOpenerRow} began.`;
  }
  return (
    ` The ${closerKeywordOf(frame)} on line ${closedRow} closed the ${closed} on line ` +
    `${closedOpenerRow}; if it was meant for line ${frame.row}, the ${closed} on line ` +
    `${closedOpenerRow} is the one left open.`
  );
}

/**
 * The closing sentences. They never say the closer is absent or that it did
 * not parse — a closer that closed a different block (ENDIF and ENDLOOP in
 * the wrong order) parsed fine, and a closer a `"` turned into a comment
 * leaves no parser error to point at. What is true in every case is that
 * abaplint did not take it as closing this block.
 */
function tailAtEnd(closer: string, keyword: string): string {
  return (
    ` If you did write ${closer} for it, abaplint did not take it as closing this ${keyword}. ` +
    "If another error is listed below, that is usually the line: a missing period, a ; or a " +
    ': chain. If this is the only error, look for a " earlier on that line or on the line ' +
    'above it: a " starts a comment, and the statement it cuts short swallows the next line.'
  );
}

function tailAtCloser(closer: string, keyword: string, reached: string, row: number): string {
  return (
    ` If you did write ${closer} for it before the ${reached} on line ${row}, abaplint did not ` +
    `take it as closing this ${keyword}: it may close a different block, it may not have parsed ` +
    "(a missing period, a ; or a : chain; another error below usually names the line), or a " +
    '" earlier on its line may have turned it into a comment.'
  );
}

/**
 * The sentence(s) to append to abaplint's `Expected <X>`. Returns null when
 * the finding names a class the tables do not cover, so the caller falls back
 * to the generic explanation rather than printing an empty keyword.
 */
export function describeOpenBlock(finding: OpenBlockFinding): string | null {
  const keyword = OPENER_KEYWORD[finding.block.className];
  if (keyword === undefined) return null;
  const hedge = sameKindSentence(finding.block);
  if (hedge === null) return null;
  switch (finding.kind) {
    case "unclosed": {
      const closer = closerKeywordOf(finding.block);
      if (closer === "") return null;
      const outside =
        finding.outside === 0
          ? ""
          : `; ${finding.outside} more ${finding.outside === 1 ? "is" : "are"} open outside it`;
      return (
        `abaplint found no ${closer} for the ${nameOf(finding.block)}${selectNote(finding.block)} ` +
        `(the innermost block still open${outside}).` +
        hedge +
        tailAtEnd(closer, keyword)
      );
    }
    case "closed-over": {
      const closer = closerKeywordOf(finding.block);
      const reached = CLOSER_KEYWORD[finding.closer.className];
      const matchedKeyword = OPENER_KEYWORD[finding.matched.className];
      if (closer === "" || reached === undefined || matchedKeyword === undefined) return null;
      if (finding.between.some((f) => OPENER_KEYWORD[f.className] === undefined)) return null;
      const between =
        finding.between.length === 0
          ? ""
          : `, and ${finding.between.length} more between the ${matchedKeyword} and it (` +
            finding.between.map((f) => nameOf(f)).join("; ") +
            ")";
      return (
        `When abaplint reached the ${reached} on line ${finding.closer.row}, the ` +
        `${nameOf(finding.block)}${selectNote(finding.block)} was still open${between}.` +
        hedge +
        tailAtCloser(closer, keyword, reached, finding.closer.row)
      );
    }
    case "method-in-definition":
      return (
        `The METHOD on line ${finding.block.row} is inside CLASS … DEFINITION (line ` +
        `${finding.definition.row}), which only declares methods (METHODS …). A method body ` +
        "belongs in a separate CLASS … IMPLEMENTATION … ENDCLASS block after the definition's ENDCLASS."
      );
  }
}
