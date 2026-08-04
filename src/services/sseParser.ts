export type ParsedSseEvent = {
  event: string;
  data: unknown;
  rawData: string;
};

export type SseParseResult = {
  events: ParsedSseEvent[];
  remainingBuffer: string;
};

const EVENT_BOUNDARY_REGEX = /\r?\n\r?\n/;

export const parseSseBuffer = (buffer: string): SseParseResult => {
  const events: ParsedSseEvent[] = [];
  let remainingBuffer = buffer;
  let boundaryMatch = EVENT_BOUNDARY_REGEX.exec(remainingBuffer);

  while (boundaryMatch) {
    const rawEvent = remainingBuffer.slice(0, boundaryMatch.index);
    remainingBuffer = remainingBuffer.slice(boundaryMatch.index + boundaryMatch[0].length);
    boundaryMatch = EVENT_BOUNDARY_REGEX.exec(remainingBuffer);

    const parsedEvent = parseSseEvent(rawEvent);
    if (parsedEvent) {
      events.push(parsedEvent);
    }
  }

  return { events, remainingBuffer };
};

const parseSseEvent = (rawEvent: string): ParsedSseEvent | null => {
  const lines = rawEvent.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const value = separatorIndex === -1
      ? ''
      : line.slice(separatorIndex + 1).replace(/^ /, '');

    if (field === 'event') {
      event = value || 'message';
    }

    if (field === 'data') {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  const rawData = dataLines.join('\n');
  try {
    return {
      event,
      data: JSON.parse(rawData),
      rawData,
    };
  } catch {
    return null;
  }
};
