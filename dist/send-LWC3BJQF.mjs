import {
  Telmoni
} from "./chunk-FCY6IAVY.mjs";
import "./chunk-SWUHJDYO.mjs";

// src/send.ts
var BATCH_SPANS = 512;
var ATTEMPTS = 3;
var ATTEMPT_SECONDS = 10;
var RETRY_AFTER_MAX_SECONDS = 60;
var EXPORT_WORST_SECONDS = ATTEMPTS * ATTEMPT_SECONDS + (ATTEMPTS - 1) * RETRY_AFTER_MAX_SECONDS;
var FLUSH_MARGIN_SECONDS = 30;
var UNDELIVERED = /^telmoni: (?:export failed after |an export failed \(|the export queue was full|export refused with (?!400 |402 |413 |500 ))/;
var DATABASE_FAILED = /^telmoni: export refused with 500 \/errors\/internal\/database;/;
var REFUSED = /^telmoni: export refused with (?:400|402|413|500) /;
function spansOf(record) {
  let spans = 2;
  for (const item of record.inside ?? []) spans += 1 + (item.type === "step" ? item.calls?.length ?? 0 : 0);
  return spans;
}
function flushSecondsOf(record) {
  return FLUSH_MARGIN_SECONDS + EXPORT_WORST_SECONDS * Math.ceil(spansOf(record) / BATCH_SPANS);
}
var Sender = class {
  #telmoni;
  #warnings = [];
  #log;
  constructor(destination, log) {
    this.#log = log;
    this.#telmoni = new Telmoni(
      { endpoint: destination.endpoint, apiKey: destination.apiKey, ...destination.release === void 0 ? {} : { release: destination.release } },
      {
        warn: (message) => void this.#warnings.push(message),
        // Unbounded: past the SDK's own 2,048 spans, recordRun throws QueueFullError and the turn is skipped whole.
        processor: { maxQueueSize: Number.POSITIVE_INFINITY }
      }
    );
  }
  /**
   * Whether the turn is done with: taken, whole or in part, or refused for good, which the same bytes would get from every
   * copy. The SDK's warnings, logged as they are, never carry anything of the conversation.
   */
  async send(record) {
    this.#warnings.length = 0;
    try {
      this.#telmoni.recordRun(record);
    } catch (error) {
      this.#log(`turn refused by the SDK: ${error instanceof Error ? error.name : typeof error}`);
      return true;
    }
    const flushed = await this.#telmoni.flush(flushSecondsOf(record));
    const lost = this.#warnings.filter((warning) => UNDELIVERED.test(warning) || DATABASE_FAILED.test(warning));
    if (flushed && lost.length === 0) {
      const warnings = this.#warnings.join("; ");
      if (this.#warnings.some((warning) => REFUSED.test(warning))) this.#log(`refused, not sent again: ${warnings}`);
      else if (warnings !== "") this.#log(`taken in part: ${warnings}`);
      return true;
    }
    this.#log(flushed ? `not sent: ${lost.join("; ")}` : "not sent: the export did not finish in time");
    return false;
  }
  close() {
    return this.#telmoni.shutdown();
  }
};
export {
  Sender,
  flushSecondsOf
};
