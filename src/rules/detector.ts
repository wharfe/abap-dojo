import type { Registry } from "@abaplint/core";
import type { LintIssue } from "../types/messages";
import type { PitfallMatch } from "../types/validation";
import { matchStringCharConfusion } from "./matchers/stringCharConfusion";
import { matchPythonLoopPattern } from "./matchers/pythonLoopPattern";
import { matchDynamicTyping } from "./matchers/dynamicTyping";
import { matchHallucinatedClass } from "./matchers/hallucinatedClass";

export function detectPitfalls(
  registry: Registry,
  lintIssues: LintIssue[],
): PitfallMatch[] {
  return [
    ...matchStringCharConfusion(registry),
    ...matchPythonLoopPattern(registry),
    ...matchDynamicTyping(registry),
    ...matchHallucinatedClass(lintIssues),
  ];
}
