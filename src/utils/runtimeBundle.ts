/**
 * Fetches the @abaplint/runtime bundle that gets inlined into the execution
 * sandbox, and caches it for the rest of the session.
 *
 * The cache is deliberately success-only. An earlier version stored the pending
 * promise unconditionally, so a single failed fetch (offline, 404, CSP block)
 * poisoned every later execution in that tab: each one awaited the same rejected
 * promise and the run never produced a terminal event.
 */

let bundleCache: string | null = null;
let bundlePromise: Promise<string> | null = null;

/** Injectable for tests; production always uses the global fetch. */
type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

export async function getRuntimeBundle(
  url: string,
  fetchImpl: FetchLike = (u) => fetch(u),
): Promise<string> {
  if (bundleCache !== null) return bundleCache;
  if (bundlePromise === null) {
    bundlePromise = fetchImpl(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load the ABAP runtime (HTTP error)`);
        }
        return response.text();
      })
      .then((text) => {
        bundleCache = text;
        return text;
      })
      .catch((cause) => {
        // Drop the rejected promise so the next run gets a fresh attempt
        // instead of inheriting this failure forever.
        bundlePromise = null;
        throw cause;
      });
  }
  return bundlePromise;
}

/** Test-only: forget both the cached bundle and any in-flight request. */
export function resetRuntimeBundleCache(): void {
  bundleCache = null;
  bundlePromise = null;
}
