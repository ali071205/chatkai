import { parseSseBuffer } from '../src/services/sseParser';

describe('parseSseBuffer', () => {
  it('combines multiple chunks into one assistant answer', () => {
    const result = parseSseBuffer(
      'event: chunk\ndata: {"content":"Hello"}\n\n' +
      'event: chunk\ndata: {"content":" world"}\n\n' +
      'event: done\ndata: {"message_id":"1"}\n\n'
    );

    const answer = result.events
      .filter(event => event.event === 'chunk')
      .map(event => (event.data as { content: string }).content)
      .join('');

    expect(answer).toBe('Hello world');
    expect(result.events[2].event).toBe('done');
  });

  it('keeps split SSE events buffered until complete', () => {
    const first = parseSseBuffer('event: chunk\ndata: {"content":"Hel');
    expect(first.events).toHaveLength(0);
    expect(first.remainingBuffer).toBe('event: chunk\ndata: {"content":"Hel');

    const second = parseSseBuffer(`${first.remainingBuffer}lo"}\n\n`);
    expect(second.events).toHaveLength(1);
    expect((second.events[0].data as { content: string }).content).toBe('Hello');
  });

  it('parses multiple SSE events in one network chunk', () => {
    const result = parseSseBuffer(
      'event: start\ndata: {"message_id":"a"}\r\n\r\n' +
      'event: chunk\ndata: {"content":"Hi"}\r\n\r\n'
    );

    expect(result.events.map(event => event.event)).toEqual(['start', 'chunk']);
  });

  it('streams unicode and Hindi text correctly', () => {
    const result = parseSseBuffer('event: chunk\ndata: {"content":"नमस्ते भाई 👋"}\n\n');

    expect((result.events[0].data as { content: string }).content).toBe('नमस्ते भाई 👋');
  });

  it('joins JSON data lines containing newline characters', () => {
    const result = parseSseBuffer('event: chunk\ndata: {"content":"line 1\\nline 2"}\n\n');

    expect((result.events[0].data as { content: string }).content).toBe('line 1\nline 2');
  });

  it('ignores malformed events without crashing', () => {
    const result = parseSseBuffer(
      'event: chunk\ndata: nope\n\n' +
      'event: chunk\ndata: {"content":"safe"}\n\n'
    );

    expect(result.events).toHaveLength(1);
    expect((result.events[0].data as { content: string }).content).toBe('safe');
  });
});
