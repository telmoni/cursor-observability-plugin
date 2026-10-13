/**
 * Sends a conversation's finished turns through the TypeScript SDK, one
 * export each: a turn sent again — after a copy that died before saving that
 * it had sent it — is then the same bytes, which ingest answers once.
 */

import { Telmoni } from 'telmoni';
import type { RunRecord } from 'telmoni';

/** How long one turn's export may take, its retries included. */
const FLUSH_SECONDS = 45;
/** And how much longer for each further batch a long turn fills: the SDK sends 512 spans a request. */
const BATCH_SPANS = 512;
const BATCH_SECONDS = 10;

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
        // A turn at a time, each flushed before the next, so the queue takes a
        // turn whole: past the SDK's own bound, 2,048 spans, a long cloud
        // agent's turn would lose calls, and be refused at every hook.
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
    const batches = Math.ceil(spansOf(record) / BATCH_SPANS);
    const flushed = await this.#telmoni.flush(FLUSH_SECONDS + BATCH_SECONDS * (batches - 1));
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
