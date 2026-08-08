// Runs inside the sandbox="allow-scripts" iframe (opaque origin, no DOM access
// to the parent). It executes nothing itself: it builds the worker that does,
// and relays messages in both directions.
//
// Keeping this thread empty is the entire fix for #28. The iframe shares the
// parent's main thread, so anything CPU-bound here freezes the whole tab.

(function () {
  var worker = null;
  var requestId = null;
  // The worker cannot report anything once it is terminated, so the count of
  // what it managed to emit before that has to live out here.
  var linesRelayed = 0;

  // `explicitRequestId` lets a caller stamp a reply with an id it just
  // received on the incoming message, rather than the module-level
  // `requestId` this frame is currently tracking. Needed for "stop": it can
  // arrive before "execute" ever has (the parent's watchdog posts "stop" as
  // soon as the iframe's contentWindow exists, which can be before "onload"
  // fires on a slow bundle fetch), and at that point `requestId` here is
  // still `null` — stamping the reply with it would produce
  // `{requestId: null}`, which the parent's `null === null` check on an idle
  // validationRequestIdRef could misroute to the wrong caller.
  function toParent(message, explicitRequestId) {
    message.requestId =
      explicitRequestId !== undefined ? explicitRequestId : requestId;
    window.parent.postMessage(message, "*");
  }

  function disposeWorker() {
    if (worker === null) return;
    worker.terminate();
    worker = null;
  }

  window.addEventListener("message", function (event) {
    // Only our parent may drive this frame.
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data) return;

    if (data.type === "stop") {
      // The worker cannot report anything once terminated, so `linesRelayed`
      // (tallied below as batches come through) is the only count left.
      disposeWorker();
      // Echo the requestId the caller sent on THIS message, not the
      // module-level `requestId` — a "stop" can arrive before any "execute"
      // has, in which case that module-level value is still `null`. See
      // `toParent`'s comment above.
      toParent(
        {
          type: "stopped",
          outputLines: linesRelayed,
          reason: data.reason,
        },
        data.requestId,
      );
      return;
    }

    if (data.type !== "execute") return;
    if (typeof data.js !== "string" || typeof data.requestId !== "string") return;

    requestId = data.requestId;
    linesRelayed = 0;
    // A run that is still active when a new "execute" arrives would otherwise
    // leak a worker burning CPU with nothing left listening to it. Unreachable
    // today (the parent tears down and rebuilds the iframe per run), but cheap
    // to make correct on its own.
    disposeWorker();
    // Whether the worker has produced anything yet. `onerror` firing before
    // this is true means the worker never ran the user's code at all (e.g. the
    // runtime bundle itself is broken) — our failure, not the user's. Once
    // it's true, an `onerror` is far more likely to be an async error surfaced
    // from the user's own ABAP, which must not be reported as ours.
    //
    // Streaming makes this flip to true earlier and more often than it used to
    // (the first flushed output batch, rather than only "done"/"error") — that
    // is correct: any batch that made it out already proves the worker ran.
    var producedOutput = false;
    try {
      var blob = new Blob([self.__executorSource], { type: "text/javascript" });
      var blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      // The worker has the source it needs once it starts; holding the blob
      // alive for the rest of the run only wastes the (multi-MB) bundle's
      // memory.
      URL.revokeObjectURL(blobUrl);
      worker.onmessage = function (m) {
        var payload = m.data;
        if (payload.type === "output") {
          producedOutput = true;
          linesRelayed += payload.lines.length;
        } else if (payload.type === "done") {
          producedOutput = true;
        }
        if (payload.type === "done" || payload.type === "error") {
          disposeWorker();
        }
        toParent(payload);
      };
      worker.onerror = function (err) {
        disposeWorker();
        toParent({
          type: "error",
          message: (err && err.message) || "Execution worker failed",
          fatal: !producedOutput,
          outputLines: linesRelayed,
        });
      };
      worker.postMessage({ type: "run", js: data.js });
    } catch (err) {
      disposeWorker();
      toParent({
        type: "error",
        message: (err && err.message) || String(err),
        fatal: true,
        outputLines: 0,
      });
    }
  });
})();
