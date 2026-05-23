import pako from "pako";

// Defensive caps for hash-encoded source. The hash is attacker-controllable
// (anyone can craft a share URL), so reject oversized base64 input and abort
// any inflate that would expand beyond MAX_DECOMPRESSED_BYTES (decompression
// bomb defense).
const MAX_ENCODED_LEN = 32 * 1024;
const MAX_DECOMPRESSED_BYTES = 1024 * 1024;

export function encodeSource(source: string): string {
  const compressed = pako.deflate(new TextEncoder().encode(source));
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

export function decodeSource(encoded: string): string | null {
  if (encoded.length > MAX_ENCODED_LEN) return null;
  try {
    const binary = atob(encoded);
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
