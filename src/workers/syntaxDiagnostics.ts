/**
 * Turn a set of abaplint syntax issues into something we are allowed to measure.
 *
 * Same problem as src/workers/transpileDiagnostics.ts, one branch over: the
 * text abaplint hands us embeds the user's own source —
 *
 *   `Database table or view "zcust_secret" not found`
 *   `Statement does not exist in ABAPopen-abap(or a parser error), "print"`
 *
 * — so the message never leaves the browser. What travels is the issue's rule
 * key, and only after it is checked for membership in the set abaplint itself
 * enumerates. That check, not any pattern, is the privacy guarantee: the user
 * cannot add a key to abaplint's rule registry, so a value that passes is
 * drawn from a vocabulary they do not control.
 *
 * What the check does NOT do is notice when abaplint moves under us. The
 * allowed set and the value tested against it are both `getMetadata().key`, so
 * a renamed rule renames both at once and the new name keeps travelling: there
 * is no alarm here to hear. Do not copy the reasoning from
 * transpileDiagnostics.ts, which looks identical and is not — there the value
 * is a `constructor.name` and the set is the export names, two things a
 * minifier really can pull apart, which is what `keepNames` in vite.config.ts
 * is for. Reflection over class names plays no part in this module.
 *
 * The part that does fail closed is `NON_RULE_KEYS` below: those are hardcoded,
 * so if abaplint renames one, `key` goes quiet while `errorCount` keeps
 * reporting. We lose detail; we never leak source.
 */
import { ArtifactsRules, Statements } from "@abaplint/core";
import type { SyntaxDiagnostics } from "../types/diagnostics";

/**
 * Keys abaplint attaches to issues it builds outside its rule classes. There
 * are several — `parser_error`, `check_syntax`, `structure` — but a key only
 * needs listing here if it is *also* absent from the rule registry, and today
 * that is `structure` alone; the other two are registered rules too, so
 * `ArtifactsRules` already covers them. Without this line every structure
 * failure would be silently dropped.
 *
 * A dropped value is safe but not harmless: a bucket that can never be
 * anything but zero reads as "this never happens", which is worse than having
 * no bucket at all. So when bumping @abaplint/core, re-audit against the
 * invariant — every key abaplint can attach is in the rule registry or in this
 * list — rather than against one grep. Searching `Issue.at*(..., "<literal>",
 * ...)` outside `src/rules/` finds most of them and not all: `check_syntax`
 * comes from the syntax engine and that search misses it.
 */
const NON_RULE_KEYS: readonly string[] = ["structure"];

const RULE_KEYS: ReadonlySet<string> = new Set([
  ...ArtifactsRules.getRules().map((rule) => rule.getMetadata().key),
  ...NON_RULE_KEYS,
]);

/**
 * The leading keyword of every statement abaplint knows how to parse.
 *
 * This is the second closed set in this file, and it exists for a different
 * value than `RULE_KEYS`. `parser_error` is the largest syntax bucket, and its
 * key alone says only "abaplint did not recognise this" — never which syntax,
 * so it cannot tell "support more ABAP" from "the user typed nonsense". The
 * identifying token IS in the message, exactly as in transpileDiagnostics.ts:
 *
 *   `Statement does not exist in ABAPopen-abap(or a parser error), "FOO"`
 *
 * — but unlike `transpile_node`, the value in that slot is the user's own
 * source. `FOO` and `ZSECRET` and `lv_password` all arrive the same way. So it
 * travels only if it is a member of this set, which abaplint enumerates and
 * the user cannot extend: 176 keywords, drawn from the 317 statement classes
 * (`CALL FUNCTION` and `CALL METHOD` both reduce to `CALL`).
 *
 * The empty string is dropped deliberately. At least one matcher answers `""`,
 * and a set containing it would admit an empty token — the one value that
 * passes a membership test without meaning anything.
 */
export const STATEMENT_KEYWORDS: ReadonlySet<string> = new Set(
  Object.values(Statements).flatMap((Statement) =>
    new Statement()
      .getMatcher()
      .first()
      .filter((keyword) => keyword !== ""),
  ),
);

/** True if `token` is a leading keyword of a statement abaplint can parse. */
export function isKnownStatementKeyword(token: string): boolean {
  return STATEMENT_KEYWORDS.has(token);
}

/**
 * The failing statement's first token, from the one `parser_error` message
 * that carries it.
 *
 * `parser_error` is four messages, not one (see abaplint's
 * `rules/parser_error.js`), and matching on the key alone gets two of them
 * wrong. `Macro recursion detected involving "X"` also ends in a quoted token,
 * so it would report a macro's name as a statement we cannot parse;
 * `Statement too long, refactor statement` and `Pragmas not allowed in v700`
 * carry no token, so they would land in the absence that means "not ABAP".
 * Hence the whole sentence is matched, not just the tail. The middle is
 * wildcarded because abaplint interpolates the configured version there
 * (`the configured ABAP version`, `ABAPopen-abap`).
 *
 * The anchors are not the safety property and must not be read as one: the
 * user's source is interpolated into this same message and can contain quotes,
 * so a crafted program can steer which characters land in the slot. That is
 * fine, and it is the argument `transpile_node` rests on — whatever comes out
 * is then tested against `STATEMENT_KEYWORDS`, so the only strings that can
 * leave the browser are abaplint's own 176 keywords. Steering changes which
 * keyword is reported, never whether the user's text can be one.
 */
const UNKNOWN_STATEMENT =
  /^Statement does not exist in .*\(or a parser error\), "([^"]*)"$/;

function unparsedToken(message: string): string | undefined {
  return UNKNOWN_STATEMENT.exec(message)?.[1];
}

/** True if `key` is one abaplint can attach to an issue. */
export function isKnownRuleKey(key: string): boolean {
  return RULE_KEYS.has(key);
}

/**
 * Describe a failed parse using `first` — the issue whose message the user is
 * being shown — and `errorCount`, how many Error-severity issues there were.
 *
 * `first` rather than a "most interesting" pick: abaplint does not promise an
 * order, and a missing period really does surface `check_syntax` ahead of the
 * `parser_error` that caused it. Ranking them would mean burying our own guess
 * about which one matters inside the measurement, and then reading that guess
 * back out as if it were evidence. Reporting what the user saw keeps the
 * number checkable against the screen; `errorCount` is what says whether one
 * line broke or the whole program did.
 */
export function classifySyntaxError(
  firstKey: string,
  errorCount: number,
  firstMessage: string,
): SyntaxDiagnostics {
  const key = isKnownRuleKey(firstKey) ? firstKey : undefined;
  return {
    key,
    errorCount,
    // `parser_error` only. The other keys interpolate different things into
    // that trailing slot — `unknown_types` puts a type name there, and
    // `check_syntax` a table or class name — none of which is drawn from a set
    // abaplint enumerates. Widening this to them is #56's problem, not a
    // one-line change here.
    statement: key === "parser_error" ? knownKeyword(firstMessage) : undefined,
  };
}

/**
 * Every ABAP statement keyword is ASCII, so case folding is restricted to
 * tokens that already are. `"\u0131".toUpperCase()` is `"I"` — a dotless i
 * folds `\u0131f` into `IF`, and `\u0131f x.` really does reach here as that
 * token. Nothing leaks (`IF` is abaplint's own word either way), but the
 * parameter would report that we cannot parse `IF` when nobody wrote `IF`,
 * which is the analytic meaning this whole module exists to keep honest.
 */
const ASCII_TOKEN = /^[A-Za-z][A-Za-z0-9-]*$/;

function knownKeyword(message: string): string | undefined {
  const token = unparsedToken(message);
  if (token === undefined || !ASCII_TOKEN.test(token)) return undefined;
  // ABAP is case-insensitive and abaplint quotes the token exactly as the user
  // typed it, so `write` and `WRITE` are the same statement and the same
  // finding. LLMs write lower-case ABAP routinely; testing the raw token would
  // drop most real keywords AND make the resulting emptiness read as "not
  // ABAP", which is the opposite of what happened.
  //
  // Case-folding user input before a membership test does not widen what can
  // travel: `zsecret` folds to `ZSECRET`, which is not a member either. And
  // what is emitted is the folded string, which `has` proved byte-identical to
  // a member of the set — so the value leaving here is one of abaplint's own
  // 176 keywords, not a string the user shaped. `toUpperCase` rather than
  // `toLocaleUpperCase`: the locale-aware one maps `i` to `İ` under a Turkish
  // locale and would silently stop recognising `IF`.
  const keyword = token.toUpperCase();
  return isKnownStatementKeyword(keyword) ? keyword : undefined;
}
