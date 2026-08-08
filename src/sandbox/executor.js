// Execution worker. Concatenated with the @abaplint/runtime bundle and turned
// into a blob: Worker by ExecutionSandbox.tsx, so this file must be plain ES5-
// compatible script with no imports — it is never processed as a module.
//
// This is the thread that runs the user's ABAP. It exists so that a runaway
// loop occupies a thread nobody else needs: the iframe that supervises it stays
// responsive and can terminate() this worker, which is precisely what the
// old design could not do (#28).

var MAX_OUTPUT_BYTES = 1024 * 1024;
var MAX_LINES = 10000;

/**
 * Collects WRITE output. `total` is what the program produced; `emitted` is
 * what we sent. They differ once MAX_LINES is hit, and the measurement must
 * report the first — counting sent lines makes every runaway loop read as
 * exactly MAX_LINES + 1.
 */
function OutputCollector() {
  this.data = "";
  this.total = 0;
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
