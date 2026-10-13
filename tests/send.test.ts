import type { RunRecord } from 'telmoni';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Sender } from '../src/send';
import { FakeIngest, attributesOf } from './helpers';

let ingest: FakeIngest;
let endpoint: string;
let logged: string[];

beforeEach(async () => {
  ingest = new FakeIngest();
  endpoint = await ingest.start();
  logged = [];
});

afterEach(async () => {
  await ingest.stop();
});

const at = (seconds: number): number => Date.UTC(2026, 9, 12, 9, 0, seconds);

function turn(runId: string): RunRecord {
  return {
    runId,
    agent: 'cursor',
    sessionId: 'conversation-1',
    start: at(0),
    end: at(9),
    inside: [
      {
        type: 'model_call',
        model: 'claude-opus-4-7',
        provider: 'cursor',
        start: at(0),
        end: at(9),
        usage: { inputTokens: 1300, outputTokens: 40, cacheReadInputTokens: 1000, cacheWriteInputTokens: 200 },
      },
      { type: 'tool_call', name: 'Shell', start: at(4), end: at(9), errorType: 'ToolError' },
    ],
  };
}

describe('a sender', () => {
  it('sends each turn in an export of its own, through the SDK, to ingest', async () => {
    const sender = new Sender({ endpoint, apiKey: 'telmoni_test' }, (line) => void logged.push(line));
    try {
      expect(await sender.send(turn('3d6f8a1c-5b2e-4f7a-9c0d-8e1f2a3b4c5d'))).toBe(true);
      expect(await sender.send(turn('4e7f9b2d-6c3f-4a8b-8d1e-9f2a3b4c5d6e'))).toBe(true);
    } finally {
      await sender.close();
    }
    expect(ingest.received).toHaveLength(2);
    for (const request of ingest.received) {
      expect(request.url).toBe('/otlp/v1/traces');
      expect(request.headers['authorization']).toBe('Bearer telmoni_test');
    }
    const runs = ingest.spans().filter((span) => span.name === 'invoke_agent cursor');
    expect(runs.map((span) => attributesOf(span)['gen_ai.conversation.id'])).toEqual(['conversation-1', 'conversation-1']);
    const call = ingest.spans().find((span) => span.name === 'chat claude-opus-4-7')!;
    expect(attributesOf(call)['gen_ai.usage.input_tokens']).toBe(1300);
    expect(attributesOf(call)['gen_ai.provider.name']).toBe('cursor');
    expect(logged).toEqual([]);
  });

  it('reports a turn the platform refused as not sent, naming why', async () => {
    ingest.status = 403;
    const sender = new Sender({ endpoint, apiKey: 'telmoni_test' }, (line) => void logged.push(line));
    try {
      expect(await sender.send(turn('3d6f8a1c-5b2e-4f7a-9c0d-8e1f2a3b4c5d'))).toBe(false);
    } finally {
      await sender.close();
    }
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^not sent: .*403/);
  });

  it('takes a turn whole, however many calls it holds: a long cloud agent’s turn is past the SDK’s own queue', async () => {
    const tools = Array.from({ length: 3000 }, (_, index) => ({
      type: 'tool_call' as const,
      name: 'Read',
      start: at(0) + index,
      end: at(0) + index + 1,
    }));
    const sender = new Sender({ endpoint, apiKey: 'telmoni_test' }, (line) => void logged.push(line));
    try {
      expect(await sender.send({ ...turn('3d6f8a1c-5b2e-4f7a-9c0d-8e1f2a3b4c5d'), inside: tools })).toBe(true);
    } finally {
      await sender.close();
    }
    expect(logged).toEqual([]);
    // The run, its start and every call.
    expect(ingest.spans()).toHaveLength(3002);
    expect(ingest.stored.filter((span) => span.name === 'execute_tool Read')).toHaveLength(3000);
  }, 30_000);

  it('counts a turn ingest stored as sent, though it refused a span of it, rather than send it again at every hook', async () => {
    const sender = new Sender({ endpoint, apiKey: 'telmoni_test' }, (line) => void logged.push(line));
    const record = turn('3d6f8a1c-5b2e-4f7a-9c0d-8e1f2a3b4c5d');
    const refused = { type: 'tool_call' as const, name: `MCP:${'x'.repeat(140)}`, start: at(1), end: at(2) };
    try {
      expect(await sender.send({ ...record, inside: [...record.inside!, refused] })).toBe(true);
      expect(await sender.send(turn('4e7f9b2d-6c3f-4a8b-8d1e-9f2a3b4c5d6e'))).toBe(true);
    } finally {
      await sender.close();
    }
    expect(ingest.received).toHaveLength(2);
    expect(logged).toEqual(['sent, though ingest kept less than all of it: telmoni: the server refused a span: name over its cap']);
  });

  it('sends a turn sent again as the same bytes, which ingest stores once', async () => {
    for (let copy = 0; copy < 2; copy++) {
      const sender = new Sender({ endpoint, apiKey: 'telmoni_test' }, (line) => void logged.push(line));
      try {
        expect(await sender.send(turn('3d6f8a1c-5b2e-4f7a-9c0d-8e1f2a3b4c5d'))).toBe(true);
      } finally {
        await sender.close();
      }
    }
    const [first, second] = ingest.received;
    expect(second!.body).toBe(first!.body);
    expect(ingest.stored.filter((span) => span.name === 'invoke_agent cursor')).toHaveLength(1);
  });

  it('passes over a turn the SDK refuses, rather than hold the conversation up on it', async () => {
    const sender = new Sender({ endpoint, apiKey: 'telmoni_test' }, (line) => void logged.push(line));
    try {
      expect(await sender.send({ ...turn('3d6f8a1c-5b2e-4f7a-9c0d-8e1f2a3b4c5d'), end: at(-1) })).toBe(true);
    } finally {
      await sender.close();
    }
    expect(ingest.received).toEqual([]);
    expect(logged).toEqual(['turn refused by the SDK: RangeError']);
  });
});
