// Runs inside the sandbox="allow-scripts" iframe (opaque origin, no DOM access
// to the parent). It executes nothing itself: it builds the worker that does,
// and relays messages in both directions.
//
// Keeping this thread empty is the entire fix for #28. The iframe shares the
// parent's main thread, so anything CPU-bound here freezes the whole tab.

(function () {
  var worker = null;
  var requestId = null;

  function toParent(message) {
    message.requestId = requestId;
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

    // "stop" and its "stopped" reply are a later task (#28 plan, Task 4) —
    // deliberately absent here.
    if (data.type !== "execute") return;
    if (typeof data.js !== "string" || typeof data.requestId !== "string") return;

    requestId = data.requestId;
    try {
      var blob = new Blob([self.__executorSource], { type: "text/javascript" });
      worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = function (m) {
        var payload = m.data;
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
        });
      };
      worker.postMessage({ type: "run", js: data.js });
    } catch (err) {
      disposeWorker();
      toParent({
        type: "error",
        message: (err && err.message) || String(err),
        fatal: true,
      });
    }
  });
})();
