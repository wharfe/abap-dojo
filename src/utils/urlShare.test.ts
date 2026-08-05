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

describe("urlShare survives the URL hash", () => {
  // The bug this guards: encodeSource used to return standard base64, whose
  // "+" is decoded as a space by URLSearchParams. Every share link whose
  // payload happened to contain a "+" silently lost the code and fell back to
  // the default snippet. All six sample presets were affected.
  function throughHash(encoded: string): string | null {
    const params = new URLSearchParams(`code=${encoded}`);
    return decodeSource(params.get("code")!);
  }

  it("never emits characters the hash reinterprets", () => {
    for (let i = 0; i < 200; i++) {
      const source = `REPORT ztest_${i}.\nDATA lv_x TYPE i VALUE ${i}.\nWRITE lv_x.\n* ${"pad".repeat(i)}\n`;
      expect(encodeSource(source)).not.toMatch(/[+/]/);
    }
  });

  it("round-trips every payload through a URLSearchParams hash", () => {
    for (let i = 0; i < 200; i++) {
      const source = `REPORT ztest_${i}.\nDATA lv_x TYPE i VALUE ${i}.\nWRITE lv_x.\n* ${"pad".repeat(i)}\n`;
      expect(throughHash(encodeSource(source))).toBe(source);
    }
  });

  /**
   * A payload whose standard base64 really does contain "+" (i.e. whose
   * base64url form contains "-"). Without this, the legacy fixtures below would
   * pass vacuously: the +/- substitution would be a no-op on a payload that
   * never had one.
   */
  function sourceWithPlusInStandardBase64(): string {
    for (let i = 0; i < 500; i++) {
      const source = `REPORT zlegacy_${i}.\nWRITE 'x'.\n* ${"pad".repeat(i)}\n`;
      if (encodeSource(source).includes("-")) return source;
    }
    throw new Error("no payload produced a '+' in standard base64");
  }

  const toStandardBase64 = (s: string) =>
    s.replace(/-/g, "+").replace(/_/g, "/");

  it("still decodes standard-base64 links shared before the fix", () => {
    const source = sourceWithPlusInStandardBase64();
    const legacy = toStandardBase64(encodeSource(source));
    expect(legacy).toMatch(/\+/);
    expect(decodeSource(legacy)).toBe(source);
  });

  it("repairs a pre-fix link whose + was already mangled into a space", () => {
    const source = sourceWithPlusInStandardBase64();
    // What the browser hands us for an old link: standard base64 with every
    // "+" already turned into a space by URLSearchParams.
    const mangled = toStandardBase64(encodeSource(source)).replace(/\+/g, " ");
    expect(mangled).toMatch(/ /);
    expect(decodeSource(mangled)).toBe(source);
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
