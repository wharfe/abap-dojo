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
var FLUSH_LINES = 500;
var FLUSH_INTERVAL_MS = 50;

/**
 * Buffers WRITE output and flushes it in batches.
 *
 * Not one message per line, deliberately: 5000 individual postMessages starved
 * the supervising frame's own 20ms timer down to a single tick, which would
 * have re-created a weaker version of the freeze this whole change removes.
 *
 * `total` is what the program produced; `emitted` is what we sent. They part
 * ways at MAX_LINES, and the measurement reports `total` — counting sent lines
 * makes every runaway loop read as exactly MAX_LINES + 1.
 */
function OutputStreamer() {
  this.pending = [];
  this.partial = "";
  this.total = 0;
  this.emitted = 0;
  this.bytes = 0;
  this.empty = true;
  this.truncated = false;
  this.lastFlush = Date.now();
  // Whether `partial` is empty because the last thing written genuinely ended
  // in "\n" (matches `text.split("\n")`'s trailing "" element), as opposed to
  // being cleared by the time-based promotion below. Only the former should
  // count as an extra line in `finish()` — see the comment there.
  this.trailingNewline = false;
}
OutputStreamer.prototype.clear = function () {
  this.partial = "";
  // MemoryConsole treats clear() as "nothing has been written", and isEmpty()
  // is what WRITE ... NEW-LINE consults to decide whether to prepend a newline.
  // The old PostMessageConsole forgot this; do not copy that.
  this.empty = true;
};
OutputStreamer.prototype.add = function (text) {
  this.empty = false;
  if (this.bytes >= MAX_OUTPUT_BYTES) return;
  this.bytes += text.length;
  var combined = this.partial + text;
  var pieces = combined.split("\n");
  // The last piece has no newline yet; hold it until one arrives.
  this.partial = pieces.pop();
  this.trailingNewline = this.partial === "" && combined.slice(-1) === "\n";
  for (var i = 0; i < pieces.length; i++) this.push(pieces[i]);
  if (this.pending.length >= FLUSH_LINES) {
    this.flush();
  } else if (Date.now() - this.lastFlush >= FLUSH_INTERVAL_MS) {
    // WRITE only starts a new output line when the ABAP explicitly asks for
    // one (WRITE / ..., or an explicit NEW-LINE) — plain "WRITE 'x'." inside
    // a loop keeps appending to the same unterminated line forever. Without
    // this, that `partial` would grow without bound and never become a
    // flushable line, so a runaway loop of exactly that (very common) shape
    // would show nothing before the watchdog kills it — the failure #41
    // exists to fix. Promoting it here turns "time passed" into a line break
    // of its own: one logical line may render as several chunks, which is a
    // fair trade against showing nothing at all.
    if (this.partial !== "") {
      this.push(this.partial);
      this.partial = "";
      this.trailingNewline = false;
    }
    this.flush();
  }
};
OutputStreamer.prototype.push = function (line) {
  this.total++;
  if (this.emitted >= MAX_LINES) {
    if (!this.truncated) {
      this.truncated = true;
      this.pending.push("[output truncated]");
    }
    return;
  }
  this.emitted++;
  this.pending.push(line.replace(/\s+$/, ""));
};
OutputStreamer.prototype.flush = function () {
  this.lastFlush = Date.now();
  if (this.pending.length === 0) return;
  self.postMessage({ type: "output", lines: this.pending });
  this.pending = [];
};
/**
 * Emit any line that never got its trailing newline, then flush.
 *
 * A `text.split("\n")` over the whole run's output would produce a trailing ""
 * element whenever the output itself ends in a newline (the common case for
 * WRITE) — that element must still count toward `total` (matching what a
 * non-streaming split would have counted) but must never render as a spurious
 * blank line. `this.partial` being "" at finish time usually means exactly
 * that: the newline that produced it already resolved a real line via `push`
 * inside `add`, so here it only needs to be counted, not re-emitted. The one
 * exception is `trailingNewline` being false with an empty `partial` — that
 * combination only happens right after a time-based promotion (see `add`),
 * which cleared `partial` without a real "\n" ever appearing, so there is
 * nothing left to count.
 */
OutputStreamer.prototype.finish = function () {
  if (!this.empty) {
    if (this.partial !== "") {
      this.push(this.partial);
    } else if (this.trailingNewline) {
      this.total++;
    }
    this.partial = "";
  }
  this.flush();
};
OutputStreamer.prototype.get = function () {
  return this.partial;
};
OutputStreamer.prototype.isEmpty = function () {
  return this.empty;
};
OutputStreamer.prototype.getTrimmed = function () {
  return this.partial;
};

self.onmessage = async function (event) {
  var data = event.data;
  if (!data || data.type !== "run" || typeof data.js !== "string") return;

  var streamer = new OutputStreamer();
  try {
    var abap = new abaplintRuntime.ABAP({ console: streamer });
    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    var fn = new AsyncFunction("abap", data.js);
    await fn(abap);
    streamer.finish();
    self.postMessage({ type: "done", outputLines: streamer.total });
  } catch (e) {
    streamer.finish();
    self.postMessage({
      type: "error",
      message: (e && e.message) || String(e),
      outputLines: streamer.total,
    });
  }
};
