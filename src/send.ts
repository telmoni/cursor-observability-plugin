/**
 * Sends a conversation's finished turns through the TypeScript SDK, one
 * export each: a turn sent again — after a copy that died before saving that
 * it had sent it — is then the same bytes, which ingest answers once.
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
 * The SDK's warnings of an answer ingest gave with the turn stored, less a
 * span it refused or an attribute it dropped: sent again, the turn would be
 * answered the same, and would hold up every turn after it.
 */
const STORED = /^telmoni: the server (?:refused a span|dropped|said)\b/;

export interface Destination {
  endpoint: string | undefined;
  apiKey: string;
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
      { endpoint: destination.endpoint, apiKey: destination.apiKey },
      {
        warn: (message) => void this.#warnings.push(message),
        // Unbounded: past the SDK's own 2,048 spans, recordRun throws QueueFullError and the turn is skipped whole.
        processor: { maxQueueSize: Number.POSITIVE_INFINITY },
      },
    );
  }

  /**
   * Whether the platform took the turn. The SDK warns of every export it
   * could not deliver and of what ingest kept less of, and its warnings never
   * carry a conversation's content, so a turn counts as taken when its flush
   * settles with every export delivered. A record the SDK refuses counts as
   * done: it would be refused again on every hook, and must not hold up the
   * turns after it.
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
    const lost = this.#warnings.filter((warning) => !STORED.test(warning));
    if (flushed && lost.length === 0) {
      if (this.#warnings.length > 0) this.#log(`sent, though ingest kept less than all of it: ${this.#warnings.join('; ')}`);
      return true;
    }
    this.#log(flushed ? `not sent: ${lost.join('; ')}` : 'not sent: the export did not finish in time');
    return false;
  }

  close(): Promise<void> {
    return this.#telmoni.shutdown();
  }
}
