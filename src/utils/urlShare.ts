import pako from "pako";

// Defensive caps for hash-encoded source. The hash is attacker-controllable
// (anyone can craft a share URL), so reject oversized base64 input and abort
// any inflate that would expand beyond MAX_DECOMPRESSED_BYTES (decompression
// bomb defense).
const MAX_ENCODED_LEN = 32 * 1024;
const MAX_DECOMPRESSED_BYTES = 1024 * 1024;

/**
 * Encode as base64url, not standard base64.
 *
 * The payload rides in the URL fragment as `#code=...` and is read back with
 * `URLSearchParams`, which decodes "+" as a space. Standard base64 emits "+"
 * often enough that every one of the six sample presets lost its code on
 * share, falling back to the default snippet with no error shown.
 */
export function encodeSource(source: string): string {
  const compressed = pako.deflate(new TextEncoder().encode(source));
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeSource(encoded: string): string | null {
  if (encoded.length > MAX_ENCODED_LEN) return null;
  try {
    // Accept base64url and the standard base64 that links shared before the
    // base64url switch still carry. A space can only be a "+" that
    // URLSearchParams already mangled, so restoring it repairs those links
    // rather than dropping them.
    const normalized = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .replace(/ /g, "+");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const inflator = new pako.Inflate();
    // Wrap pako's default onData (which accumulates chunks into .result) so we
    // can enforce a size cap. Throwing unwinds pako's sync push loop.
    const originalOnData = inflator.onData.bind(inflator);
    let totalOut = 0;
    inflator.onData = (chunk: Uint8Array) => {
      totalOut += chunk.length;
      if (totalOut > MAX_DECOMPRESSED_BYTES) {
        throw new Error("decompression limit exceeded");
      }
      originalOnData(chunk);
    };
    inflator.push(bytes, true);
    if (inflator.err) return null;

    return new TextDecoder().decode(inflator.result as Uint8Array);
  } catch {
    return null;
  }
}
