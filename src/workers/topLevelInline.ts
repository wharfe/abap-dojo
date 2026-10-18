import {
  Expressions,
  Nodes,
  Objects,
  ScopeType,
  Structures,
  SyntaxLogic,
} from "@abaplint/core";
import type { Registry } from "@abaplint/core";
import type { IOutput } from "@abaplint/transpiler";
// Deep imports into @abaplint/transpiler's build output. Nothing here is its
// public API: if a path moves the build fails, if an export is renamed
// typecheck fails. Both are loud, which is the point - there is no runtime
// fallback for "the internals changed shape".
import { TranspileTypes } from "@abaplint/transpiler/build/src/transpile_types";
import { Traversal } from "@abaplint/transpiler/build/src/traversal";
// The STATEMENT FieldSymbolTranspiler: it emits `let fs_x_ = ...`. The
// expression transpiler of the same name emits no declaration.
import { FieldSymbolTranspiler } from "@abaplint/transpiler/build/src/statements";
import { prepareTranspiledJs } from "../utils/prepareTranspiledJs";

/**
 * Why this file exists (#95): @abaplint/transpiler emits the `let` for an
 * inline declaration (`DATA(x) = ...`, `FIELD-SYMBOL(<fs>)`) only inside
 * METHOD, FORM, FUNCTION and LOOP. Written at the top level of a report - the
 * shape LLMs produce - it throws `ReferenceError: x is not defined` on every
 * Run. Upstream's answer is to wrap the code in a FORM or METHOD
 * (abaplint/transpiler#1665), so we declare those variables ourselves.
 *
 * Ground rules, each pinned by src/workers/topLevelInline.test.ts:
 * - Never declare what upstream already declares: a second `let` is a
 *   SyntaxError, which is worse than today. Hence the skip set below and the
 *   Program-scope filter, and the compile check at the end as a backstop.
 * - Never move a throw to line 1: a declaration upstream would only reach on
 *   an executed path (an unsupported type) must not run before the program.
 * - If anything goes wrong, return exactly what the transpiler produced.
 * - When upstream starts declaring these itself, the tripwire test goes red
 *   and this file should be deleted.
 */

/**
 * Where upstream already declares inline variables (grep `buildDeclarations`
 * in node_modules/@abaplint/transpiler/build/src). MODULE bodies are not
 * emitted at all. LOOP stays skipped even inside a top-level IF: declaring
 * its variable at the top would be shadowed by the loop's own `let` and a
 * later read would print a stale value with no error.
 */
const UPSTREAM_DECLARES = [
  Structures.Method,
  Structures.Form,
  Structures.FunctionModule,
  Structures.Loop,
  Structures.Module,
];

export interface RunnableJs {
  /** The JS the sandbox runs. */
  js: string;
  /** The declarations prepended to the program, "" when there were none. */
  prologue: string;
  /** True when a prologue was built but discarded, and `js` is the plain output. */
  fellBack: boolean;
}

/** The transpiler's output joined the way the sandbox expects it. */
function joinOutput(output: IOutput, prologue = ""): string {
  return [
    ...output.objects.map((o) =>
      o.object.type === "PROG" && prologue
        ? `${prologue}\n${o.chunk.getCode()}`
        : o.chunk.getCode(),
    ),
    output.initializationScript,
    output.initializationScript2,
  ].join("\n");
}

const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as new (...args: string[]) => unknown;

/**
 * Must be called after `transpiler.run(reg)` on the same registry: the run
 * rearranges the program's tree in place, and the walk reads that tree.
 */
export function buildRunnableJs(reg: Registry, output: IOutput): RunnableJs {
  const plain = joinOutput(output);
  let prologue = "";
  try {
    prologue = topLevelPrologue(reg);
  } catch {
    return { js: plain, prologue: "", fellBack: true };
  }
  // Programs without a top-level inline declaration are untouched by
  // construction, not by argument.
  if (prologue === "") return { js: plain, prologue, fellBack: false };

  const js = joinOutput(output, prologue);
  try {
    // Compile, do not run, exactly as src/sandbox/executor.js will. A
    // duplicate `let` (or anything else we did not foresee) is an early error
    // and surfaces here.
    new AsyncFunction("abap", prepareTranspiledJs(js));
  } catch {
    return { js: plain, prologue, fellBack: true };
  }
  return { js, prologue, fellBack: false };
}

function topLevelPrologue(reg: Registry): string {
  const obj = [...reg.getObjects()].find(
    (o): o is Objects.Program => o instanceof Objects.Program,
  );
  const file = obj?.getABAPFiles()[0];
  const structure = file?.getStructure();
  if (!obj || !file || !structure) return "";

  // Cached on the object: this is the same analysis the transpiler used.
  const spaghetti = new SyntaxLogic(reg, obj).run().spaghetti;
  const traversal = new Traversal(spaghetti, file, obj, reg, {
    ignoreSourceMap: true,
  });

  const lines: string[] = [];
  const declared = new Set<string>();
  const add = (line: string) => {
    // Upstream's own filter (TranspileTypes.declareStaticSkipVoid): these
    // throw when evaluated, and at line 1 they would kill the whole program.
    if (line.includes("typeTodo") || line.includes("throw new Error")) return;
    const id = /^let\s+([^\s=]+)/.exec(line)?.[1];
    if (!id || declared.has(id)) return;
    declared.add(id);
    lines.push(line);
  };
  const atProgramScope = (node: Nodes.ExpressionNode) =>
    traversal.findCurrentScopeByToken(node.getFirstToken())?.getIdentifier()
      .stype === ScopeType.Program;

  const walk = (node: Nodes.StructureNode | Nodes.StatementNode | Nodes.ExpressionNode | Nodes.TokenNode) => {
    if (
      node instanceof Nodes.StructureNode &&
      UPSTREAM_DECLARES.some((s) => node.get() instanceof s)
    ) {
      return;
    }
    if (node instanceof Nodes.ExpressionNode) {
      if (node.get() instanceof Expressions.InlineData) {
        declareData(node);
        return;
      }
      if (node.get() instanceof Expressions.InlineFS) {
        declareFieldSymbol(node);
        return;
      }
    }
    if (node instanceof Nodes.TokenNode) return;
    for (const child of node.getChildren()) walk(child);
  };

  const declareData = (node: Nodes.ExpressionNode) => {
    const spelled = node.findFirstExpression(Expressions.TargetField)?.concatTokens();
    // A namespace (/abc/x) needs escaping that TranspileTypes.declare does not do.
    if (!spelled || spelled.includes("/") || !atProgramScope(node)) return;
    const variable = traversal
      .findCurrentScopeByToken(node.getFirstToken())
      ?.findVariable(spelled);
    if (!variable) return;
    const line = TranspileTypes.declare(variable);
    const before = lines.length;
    add(line);
    if (lines.length === before) return;
    // Upstream writes the inline target in the source's spelling
    // (`LV_X.set(...)`) while every other reference is lower-cased, so an
    // upper-case name needs a second binding to the same object.
    const js = /^let\s+([^\s=]+)/.exec(line)?.[1];
    if (js && spelled !== spelled.toLowerCase() && !(spelled in globalThis)) {
      add(`let ${spelled} = ${js};`);
    }
  };

  const declareFieldSymbol = (node: Nodes.ExpressionNode) => {
    const target = node.findFirstExpression(Expressions.TargetFieldSymbol);
    if (!target || !atProgramScope(node)) return;
    const code = new FieldSymbolTranspiler()
      .transpile(target as never, traversal)
      .getCode();
    for (const line of code.split("\n")) if (line.trim()) add(line.trim());
  };

  walk(structure);
  return lines.join("\n");
}
