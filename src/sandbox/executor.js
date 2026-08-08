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
  // Set when a promotion (see `add`) force-flushed a line that had not
  // actually been terminated by "\n" yet. The abaplint runtime writes a line
  // as TWO calls — `add("\n")` then `add(text)` (write.js) — so the real
  // terminator for the promoted line can still arrive later, on its own,
  // as a lone `add("\n")`. Without this flag that call's `combined` is just
  // "\n": split gives `["", ""]`, and the LEADING "" (not the trailing one
  // `add` already knows to drop) would be pushed as a spurious blank line —
  // "a"/"b" written 50ms+ apart rendering as "a", "", "b" instead of "a", "b".
  // `continuation` tells the next `add` to swallow exactly that one leading
  // empty piece instead of treating it as real content.
  this.continuation = false;
  // Once the byte cap has tripped, `add` stops buffering/sending content but
  // must keep `total` honest (CLAUDE.md documents `done`/`error` as reporting
  // the executor's own *uncapped* total). These two mirror `partial` and
  // `trailingNewline` above, but track line boundaries in text that is never
  // pushed to `pending` at all.
  this.partialAfterCap = "";
  this.trailingNewlineAfterCap = false;
}
OutputStreamer.prototype.clear = function () {
  this.partial = "";
  // MemoryConsole treats clear() as "nothing has been written" for the
  // purposes of these flags — it does NOT retract lines already flushed to
  // the parent via `push`/`flush`, which is fine here since `isEmpty()` is
  // only ever consulted about the current (unflushed) line.
  // isEmpty() is what WRITE ... NEW-LINE consults to decide whether to
  // prepend a newline. The old PostMessageConsole forgot this; do not copy
  // that.
  this.empty = true;
  this.trailingNewline = false;
  this.continuation = false;
};
OutputStreamer.prototype.add = function (text) {
  this.empty = false;
  if (this.bytes < MAX_OUTPUT_BYTES) {
    var remaining = MAX_OUTPUT_BYTES - this.bytes;
    if (text.length > remaining) {
      // Keep only what fits, plus a notice. The notice is plain content fed
      // through the same split/push logic as everything else below, so it is
      // displayed and counted exactly as Task 2's non-streaming collector
      // treated its own truncation notice — baked into the same output text,
      // not a separately-tracked system message.
      text = text.slice(0, remaining) + "\n[output truncated: output too large]";
    }
    this.bytes += text.length;
    var combined = this.partial + text;
    var pieces = combined.split("\n");
    // The last piece has no newline yet; hold it until one arrives.
    this.partial = pieces.pop();
    this.trailingNewline = this.partial === "" && combined.slice(-1) === "\n";
    if (this.continuation) {
      // The leading piece here is the other half of a line a promotion
      // already pushed; drop it so it is not double-counted or re-rendered
      // as a blank line. Only ever the first piece: a genuine embedded blank
      // line arriving right after would be `pieces[1]`, untouched.
      if (pieces.length > 0 && pieces[0] === "") pieces.shift();
      this.continuation = false;
    }
    for (var i = 0; i < pieces.length; i++) this.push(pieces[i]);
  } else {
    // The byte cap has already tripped: nothing more is buffered or emitted,
    // but the program is still running and every line it produces from here
    // on must still count toward `total`. Mirror the split/pop above without
    // touching `bytes`, `pending`, or `push()` (which would resurrect display
    // and MAX_LINES bookkeeping this text must never reach).
    if (this.continuation) {
      // The byte cap has already tripped, so the split/push block above (the
      // only place that otherwise consumes `continuation`) is skipped
      // entirely. A promotion set this flag just before the cap tripped;
      // with nothing left to consume it, leave it set and the next real
      // `add` after `clear()` could misinterpret its own first blank piece
      // as this stale continuation. Not reachable today — once the cap
      // trips, `add` never sees the promotion path fire again in the same
      // run — but clear it rather than leave it dangling.
      this.continuation = false;
    }
    var combinedAfterCap = this.partialAfterCap + text;
    var afterCapPieces = combinedAfterCap.split("\n");
    this.partialAfterCap = afterCapPieces.pop();
    this.trailingNewlineAfterCap =
      this.partialAfterCap === "" && combinedAfterCap.slice(-1) === "\n";
    this.total += afterCapPieces.length;
  }
  // The byte cap must not also cap flushing: whatever was already buffered —
  // including the truncation notice above — still has to reach the parent,
  // especially if the watchdog kills this worker before `finish()` ever
  // runs. Unconditional so a run that keeps calling WRITE after the cap
  // (silently dropped above) still gets periodic delivery of what came
  // before it, rather than being stranded in `pending`/`partial` forever.
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
    // fair trade against showing nothing at all. `output_lines` counts every
    // such chunk as its own line — for a run that never writes a real "\n"
    // at all, that makes the reported count track elapsed time (roughly one
    // "line" per FLUSH_INTERVAL_MS) rather than anything the ABAP source
    // itself delimited; see the analytics note in CLAUDE.md.
    if (this.partial !== "") {
      this.push(this.partial);
      this.partial = "";
      this.trailingNewline = false;
      this.continuation = true;
    }
    this.flush();
  }
};
OutputStreamer.prototype.push = function (line) {
  this.total++;
  if (this.emitted >= MAX_LINES) {
    this.truncated = true;
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
 *
 * The MAX_LINES truncation notice is appended here, not at the moment the
 * cap was first hit, because only here do we know the final count of lines
 * it hid — the same "N more lines" wording Task 2's collector used, now
 * computed from `total` instead of a single upfront split.
 */
OutputStreamer.prototype.finish = function () {
  if (!this.empty) {
    if (this.partial !== "") {
      this.push(this.partial);
    } else if (this.trailingNewline) {
      this.total++;
    }
    this.partial = "";
    // Whatever the program produced after the byte cap tripped was never
    // routed through `push()` above (see `add`), so its last, possibly
    // unterminated line has to be counted here the same way `partial`/
    // `trailingNewline` are — just without ever reaching `pending`. A no-op
    // whenever the cap never tripped: both fields stay at their initial "no
    // content yet" values for the whole run.
    if (this.partialAfterCap !== "") {
      this.total++;
    } else if (this.trailingNewlineAfterCap) {
      this.total++;
    }
  }
  if (this.truncated) {
    this.pending.push(
      "[output truncated: " + (this.total - MAX_LINES) + " more lines]",
    );
  }
  this.flush();
};
// Returns only the buffered, not-yet-terminated tail of the current line —
// NOT the whole run's output. Nothing in this file calls it (the runtime
// only ever calls `add` and `isEmpty`); it exists for tests to assert what
// survives a `clear()`. `getTrimmed` used to exist as a byte-for-byte
// duplicate of this method under a different name, which read as though it
// applied some extra trimming — it did not.
OutputStreamer.prototype.getPendingTail = function () {
  return this.partial;
};
OutputStreamer.prototype.isEmpty = function () {
  return this.empty;
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
