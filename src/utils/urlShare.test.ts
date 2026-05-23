import { describe, it, expect } from "vitest";
import { encodeSource, decodeSource } from "./urlShare";

describe("urlShare", () => {
  it("round-trips simple ABAP code", () => {
    const source = "WRITE 'Hello World'.";
    const encoded = encodeSource(source);
    expect(decodeSource(encoded)).toBe(source);
  });

  it("round-trips multiline code", () => {
    const source = "DATA lv_name TYPE string.\nWRITE lv_name.";
    const encoded = encodeSource(source);
    expect(decodeSource(encoded)).toBe(source);
  });

  it("round-trips empty string", () => {
    expect(decodeSource(encodeSource(""))).toBe("");
  });

  it("returns null for invalid input", () => {
    expect(decodeSource("not-valid-base64%%%")).toBeNull();
  });

  it("returns null when encoded input exceeds length cap", () => {
    const oversize = "A".repeat(33 * 1024);
    expect(decodeSource(oversize)).toBeNull();
  });

  it("returns null when decompressed output exceeds size cap (decompression bomb)", () => {
    // 2 MB of zeros compresses to a few KB — small encoded payload, huge inflated size.
    const bomb = "0".repeat(2 * 1024 * 1024);
    const encoded = encodeSource(bomb);
    expect(encoded.length).toBeLessThan(32 * 1024);
    expect(decodeSource(encoded)).toBeNull();
  });
});

describe("urlShare with validator mode", () => {
  it("roundtrips code through encode/decode when used in mode=validator hash", () => {
    const code = `REPORT ztest.\nDATA lv_x TYPE string.`;
    const encoded = encodeSource(code);
    // Simulate what parseHash does: URLSearchParams extracts the code param
    const hash = `#mode=validator&code=${encoded}`;
    const params = new URLSearchParams(hash.slice(1));
    const decoded = decodeSource(params.get("code")!);
    expect(decoded).toBe(code);
  });
});
