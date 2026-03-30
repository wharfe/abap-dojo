import pako from "pako";

export function encodeSource(source: string): string {
  const compressed = pako.deflate(new TextEncoder().encode(source));
  let binary = "";
  for (let i = 0; i < compressed.length; i++) {
    binary += String.fromCharCode(compressed[i]);
  }
  return btoa(binary);
}

export function decodeSource(encoded: string): string | null {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes);
    return new TextDecoder().decode(decompressed);
  } catch {
    return null;
  }
}
