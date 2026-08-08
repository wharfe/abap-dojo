// Execution worker. Concatenated with the @abaplint/runtime bundle and turned
// into a blob: Worker by ExecutionSandbox.tsx, so this file must contain no
// imports and receive no bundler transforms — it is inlined as raw text via
// `?raw` and never parsed as a module or run through Babel/TS.
//
// This is the thread that runs the user's ABAP. It exists so that a runaway
// loop occupies a thread nobody else needs: the iframe that supervises it stays
// responsive and can terminate() this worker, which is precisely what the
// old design could not do (#28).

var MAX_OUTPUT_BYTES = 1024 * 1024;
var MAX_LINES = 10000;

/**
 * Collects WRITE output as a single string. The executor below splits this
 * into lines and separately tracks how many it actually emits vs. `total`,
 * the number the program produced — those differ once MAX_LINES is hit, and
 * the line-count measurement must report `total`, not the emitted count, or
 * every runaway loop would read as exactly MAX_LINES + 1.
 */
function OutputCollector() {
  this.data = "";
  this.empty = true;
}
OutputCollector.prototype.clear = function () {
  this.data = "";
};
OutputCollector.prototype.add = function (text) {
  this.empty = false;
  if (this.data.length >= MAX_OUTPUT_BYTES) return;
  var remaining = MAX_OUTPUT_BYTES - this.data.length;
  if (text.length > remaining) {
    this.data = this.data + text.slice(0, remaining) + "\n[output truncated]";
  } else {
    this.data = this.data + text;
  }
};
OutputCollector.prototype.get = function () {
  return this.data;
};
OutputCollector.prototype.isEmpty = function () {
  return this.empty;
};
OutputCollector.prototype.getTrimmed = function () {
  return this.data
    .split("\n")
    .map(function (a) {
      return a.replace(/\s+$/, "");
    })
    .join("\n");
};

self.onmessage = async function (event) {
  var data = event.data;
  if (!data || data.type !== "run" || typeof data.js !== "string") return;

  var collector = new OutputCollector();
  try {
    var abap = new abaplintRuntime.ABAP({ console: collector });
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    var fn = new AsyncFunction("abap", data.js);
    await fn(abap);

    var text = collector.get();
    var total = 0;
    if (text) {
      var lines = text.split("\n");
      total = lines.length;
      var emit = total > MAX_LINES ? MAX_LINES : total;
      var slice = lines.slice(0, emit);
      // text.split("\n") produces a trailing "" whenever the collected output
      // itself ends in a newline (the common case for WRITE), which would
      // otherwise render as a spurious blank line. Only drop it when nothing
      // was truncated — `total` still counts it either way.
      if (emit === total && slice.length > 0 && slice[slice.length - 1] === "") {
        slice.pop();
      }
      if (total > MAX_LINES) {
        slice.push("[output truncated: " + (total - MAX_LINES) + " more lines]");
      }
      self.postMessage({ type: "output", lines: slice });
    }
    self.postMessage({ type: "done", outputLines: total });
  } catch (e) {
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  }
};
