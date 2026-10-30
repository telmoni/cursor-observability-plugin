/**
 * Sends a conversation's finished turns through the TypeScript SDK, one export each: a turn sent again, after a copy
 * that died before saving that it had, is the same bytes, which ingest stores once within the hour.
 */

import { Telmoni } from 'telmoni';
import type { RunRecord } from 'telmoni';

/** The SDK's batch: a record's spans go 512 to an export, one export at a time. */
const BATCH_SPANS = 512;
/** The SDK's attempts at one export before it drops the batch. */
const ATTEMPTS = 3;
/** How long the SDK lets one attempt run. */
const ATTEMPT_SECONDS = 10;
/** The longest `Retry-After` the SDK waits out between two attempts. */
const RETRY_AFTER_MAX_SECONDS = 60;
/** One export at its worst, 150 s: every attempt run out, and the longest wait between each two. */
const EXPORT_WORST_SECONDS = ATTEMPTS * ATTEMPT_SECONDS + (ATTEMPTS - 1) * RETRY_AFTER_MAX_SECONDS;
/** Past its exports' worst case, so a turn the platform took late is never counted as not sent. */
const FLUSH_MARGIN_SECONDS = 30;

/**
 * The SDK's warnings of spans it could not deliver, which a later copy may yet get through: Telmoni out of reach or busy
 * past its retries, or a key or an endpoint it refused. Every other warning is of spans delivered, or dropped for good.
 */
const UNDELIVERED = /^telmoni: (?:export failed after |an export failed \(|the export queue was full|export refused with (?!400 |402 |413 |500 ))/;
/** Ingest's `500` for a fault of its database, which a later copy may find mended, as it would none of its other `500`s. */
const DATABASE_FAILED = /^telmoni: export refused with 500 \/errors\/internal\/database;/;
/** An export refused for good: for what it holds (`400`, `413`), a fault of ingest's own (any other `500`), an organization paused (`402`). */
const REFUSED = /^telmoni: export refused with (?:400|402|413|500) /;

export interface Destination {
  endpoint: string | undefined;
  apiKey: string;
  /** The editor that ran the turn, the run's release. */
  release?: string;
}

function spansOf(record: RunRecord): number {
  // The run and its start, then each item, a step with its calls.
  let spans = 2;
  for (const item of record.inside ?? []) spans += 1 + (item.type === 'step' ? (item.calls?.length ?? 0) : 0);
  return spans;
}

/** How long a turn's flush waits: the SDK's worst case for each of its exports, and a margin. */
export function flushSecondsOf(record: RunRecord): number {
  return FLUSH_MARGIN_SECONDS + EXPORT_WORST_SECONDS * Math.ceil(spansOf(record) / BATCH_SPANS);
}

export class Sender {
  readonly #telmoni: Telmoni;
  readonly #warnings: string[] = [];
  readonly #log: (line: string) => void;

  constructor(destination: Destination, log: (line: string) => void) {
    this.#log = log;
    this.#telmoni = new Telmoni(
      { endpoint: destination.endpoint, apiKey: destination.apiKey, ...(destination.release === undefined ? {} : { release: destination.release }) },
      {
        warn: (message) => void this.#warnings.push(message),
        // Unbounded: past the SDK's own 2,048 spans, recordRun throws QueueFullError and the turn is skipped whole.
        processor: { maxQueueSize: Number.POSITIVE_INFINITY },
      },
    );
  }

  /**
   * Whether the turn is done with: taken, whole or in part, or refused for good, which the same bytes would get from every
   * copy. The SDK's warnings, logged as they are, never carry anything of the conversation.
   */
  async send(record: RunRecord): Promise<boolean> {
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
      const warnings = this.#warnings.join('; ');
      if (this.#warnings.some((warning) => REFUSED.test(warning))) this.#log(`refused, not sent again: ${warnings}`);
      else if (warnings !== '') this.#log(`taken in part: ${warnings}`);
      return true;
    }
    this.#log(flushed ? `not sent: ${lost.join('; ')}` : 'not sent: the export did not finish in time');
    return false;
  }

  close(): Promise<void> {
    return this.#telmoni.shutdown();
  }
}
