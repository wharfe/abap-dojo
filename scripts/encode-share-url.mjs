#!/usr/bin/env node
/**
 * Produce and repair the "#code=" share hashes embedded in the static pages
 * under public/.
 *
 *   node scripts/encode-share-url.mjs <file.abap>   print the hash for a snippet
 *   node scripts/encode-share-url.mjs --fix         rewrite public/**\/*.html so
 *                                                   every CTA is base64url
 *
 * The encoding must match src/utils/urlShare.ts exactly: pako deflate, then
 * base64url. Standard base64 is not interchangeable — the hash is read back
 * with URLSearchParams, which decodes "+" as a space, so a "+" in the payload
 * silently loads the default snippet instead of the example the page promises.
 * --fix decodes each existing hash and re-encodes it, asserting the source text
 * round-trips unchanged, so it repairs the alphabet without touching content.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pako from "pako";

const PUBLIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

export function encodeSource(source) {
  const compressed = pako.deflate(new TextEncoder().encode(source));
  let binary = "";
  for (const byte of compressed) binary += String.fromCharCode(byte);
  return Buffer.from(binary, "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function decodeSource(encoded) {
  // Accept standard base64 too: that is what the pages carried before the
  // base64url switch, and repairing them is the point of --fix.
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").replace(/ /g, "+");
  const bytes = Buffer.from(normalized, "base64");
  return new TextDecoder().decode(pako.inflate(bytes));
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return path.endsWith(".html") ? [path] : [];
  });
}

const CODE_HASH = /(#(?:mode=[a-z]+&)?code=)([A-Za-z0-9+/_=-]+)/g;

function fix() {
  let rewritten = 0;
  for (const file of htmlFiles(PUBLIC_DIR)) {
    const before = readFileSync(file, "utf8");
    const after = before.replace(CODE_HASH, (whole, prefix, hash) => {
      const source = decodeSource(hash);
      const reencoded = encodeSource(source);
      if (decodeSource(reencoded) !== source) {
        throw new Error(`round-trip changed the source in ${file}`);
      }
      return prefix + reencoded;
    });
    if (after !== before) {
      writeFileSync(file, after);
      rewritten++;
      console.log(`rewrote ${file.replace(`${PUBLIC_DIR}/`, "public/")}`);
    }
  }
  console.log(rewritten ? `\n${rewritten} file(s) rewritten` : "nothing to fix");
}

const [arg] = process.argv.slice(2);
if (arg === "--fix") {
  fix();
} else if (arg) {
  console.log(encodeSource(readFileSync(arg, "utf8")));
} else {
  console.error("usage: encode-share-url.mjs <file.abap> | --fix");
  process.exit(1);
}
