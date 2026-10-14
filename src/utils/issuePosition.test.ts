import { describe, it, expect } from "vitest";
import { issuePosition } from "./issuePosition";

describe("issuePosition", () => {
  it("prints the line and column", () => {
    expect(issuePosition({ startLine: 3, startCol: 5 })).toBe("L3:5 ");
  });

  it("prints nothing when the position is not where the problem is", () => {
    expect(issuePosition({ startLine: 1, startCol: 1, positionUnknown: true })).toBe("");
  });
});
