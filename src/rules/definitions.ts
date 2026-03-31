import type { PitfallRule } from "../types/validation";

export const pitfallRules: PitfallRule[] = [
  {
    id: "llm-string-char-confusion",
    severity: "warning",
    message: "STRING used where CHAR may be expected",
    explanation:
      "LLMs default to STRING like Python's str. In ABAP, CHAR(n) and STRING are fundamentally different — CHAR is fixed-length and stored inline, STRING is variable-length on the heap. Using STRING for short fixed-length fields (names, codes, statuses) wastes memory and can cause type mismatches with DDIC structures.",
    suggestion: "Use a fixed-length type: DATA lv_name TYPE char40.",
  },
  {
    id: "llm-python-loop-pattern",
    severity: "warning",
    message: "Index-based loop pattern detected (SY-TABIX manipulation)",
    explanation:
      "LLMs often write index-based loops influenced by Python's for-in-range or C-style for loops. In ABAP, explicit SY-TABIX manipulation inside LOOP AT is rarely needed and error-prone. LOOP AT ... ASSIGNING is more idiomatic and performant.",
    suggestion: "Use LOOP AT lt_data ASSIGNING FIELD-SYMBOL(<ls>).",
  },
  {
    id: "llm-dynamic-typing",
    severity: "warning",
    message: "Declaration without explicit type",
    explanation:
      "LLMs trained on dynamic languages (Python, JavaScript) sometimes omit explicit types or use overly generic typing. ABAP is strictly typed — every DATA or FIELD-SYMBOLS declaration should specify an explicit TYPE or TYPE REF TO.",
    suggestion: "Add an explicit TYPE: DATA lv_value TYPE string.",
  },
  {
    id: "llm-hallucinated-class",
    severity: "error",
    message: "Possibly hallucinated class or interface name",
    explanation:
      "LLMs sometimes generate plausible-sounding but nonexistent SAP class or interface names. Names starting with CL_, IF_, ZCL_, or ZIF_ that cannot be resolved may be hallucinations.",
    suggestion:
      "Verify the class exists in the SAP system or open-abap documentation.",
  },
];

export function getRuleById(id: string): PitfallRule | undefined {
  return pitfallRules.find((r) => r.id === id);
}
