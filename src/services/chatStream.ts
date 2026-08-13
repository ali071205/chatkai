import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './api';
import { parseSseBuffer, ParsedSseEvent } from './sseParser';

export type StreamStartData = {
  message_id?: string;
  user_message_id?: string;
  conversation_id?: string;
  conversation_title?: string;
};

export type StreamDoneData = {
  message_id?: string;
  message?: {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: number;
  };
};

export type StreamErrorData = {
  code?: string;
  message?: string;
  paymentUrl?: string;
};

export type StreamChatParams = {
  message: string;
  conversationId?: string | null;
  model?: string;
  signal?: AbortSignal;
  onStart?: (data: StreamStartData) => void;
  onChunk: (content: string) => void;
  onDone?: (data: StreamDoneData) => void;
  onError?: (error: Error, data?: StreamErrorData) => void;
  onMetadata?: (data: unknown) => void;
};

export class StreamCancelledError extends Error {
  constructor() {
    super('Stream cancelled');
    this.name = 'StreamCancelledError';
  }
}

export class StreamServerError extends Error {
  constructor() {
    super('Stream server error');
    this.name = 'StreamServerError';
  }
}

const getStreamError = (data: unknown): { error: Error; payload?: StreamErrorData } => {
  if (typeof data === 'object' && data !== null) {
    const payload = data as StreamErrorData;
    return {
      error: new Error(payload.message || 'Unable to generate the response.'),
      payload,
    };
  }

  return { error: new Error('Unable to generate the response.') };
};

export const handleParsedSseEvent = (
  parsedEvent: ParsedSseEvent,
  handlers: Pick<StreamChatParams, 'onStart' | 'onChunk' | 'onDone' | 'onError' | 'onMetadata'>,
) => {
  if (parsedEvent.event === 'start') {
    handlers.onStart?.(parsedEvent.data as StreamStartData);
    return;
  }

  if (parsedEvent.event === 'chunk') {
    const data = parsedEvent.data as { content?: string };
    if (typeof data.content === 'string') {
      handlers.onChunk(data.content);
    }
    return;
  }

  if (parsedEvent.event === 'done') {
    handlers.onDone?.(parsedEvent.data as StreamDoneData);
    return;
  }

  if (parsedEvent.event === 'metadata') {
    handlers.onMetadata?.(parsedEvent.data);
    return;
  }

  if (parsedEvent.event === 'error') {
    const { error, payload } = getStreamError(parsedEvent.data);
    handlers.onError?.(error, payload);
  }
};

export const streamChat = async ({
  message,
  conversationId,
  model,
  signal,
  onStart,
  onChunk,
  onDone,
  onError,
  onMetadata,
}: StreamChatParams): Promise<void> => {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) {
    throw new Error('You are not logged in. Please login again.');
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let processedLength = 0;
    let buffer = '';
    let receivedDone = false;
    let receivedError = false;
    let settled = false;
    let cancelled = false;

    const cleanup = () => {
      signal?.removeEventListener?.('abort', abortRequest);
      xhr.onreadystatechange = null;
      xhr.onprogress = null;
      xhr.onerror = null;
      xhr.ontimeout = null;
      xhr.onloadend = null;
    };

    const finishWithError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      onError?.(error);
      reject(error);
    };

    const processResponseText = () => {
      const nextText = xhr.responseText.slice(processedLength);
      processedLength = xhr.responseText.length;
      if (!nextText) {
        return;
      }

      const result = parseSseBuffer(buffer + nextText);
      buffer = result.remainingBuffer;
      for (const parsedEvent of result.events) {
        if (parsedEvent.event === 'error') {
          receivedError = true;
        }
        handleParsedSseEvent(parsedEvent, {
          onStart,
          onChunk,
          onDone: (data) => {
            receivedDone = true;
            onDone?.(data);
          },
          onError,
          onMetadata,
        });
      }
    };

    function abortRequest() {
      cancelled = true;
      xhr.abort();
    }

    xhr.open('POST', `${API_BASE_URL}/chat/stream`);
    xhr.setRequestHeader('Accept', 'text/event-stream');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.timeout = 90000;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && xhr.status >= 400) {
        finishWithError(new Error(`Chat stream failed with HTTP ${xhr.status}`));
      }
    };

    xhr.onprogress = processResponseText;

    xhr.onerror = () => {
      if (!cancelled && !settled) {
        finishWithError(new Error('Network error while streaming the response.'));
      }
    };

    xhr.ontimeout = () => {
      if (!cancelled && !settled) {
        finishWithError(new Error('The AI response timed out. Please try again.'));
      }
    };

    xhr.onloadend = () => {
      if (settled) {
        return;
      }
      cleanup();
      if (cancelled) {
        settled = true;
        reject(new StreamCancelledError());
        return;
      }

      processResponseText();
      if (receivedError) {
        settled = true;
        reject(new StreamServerError());
        return;
      }
      if (receivedDone) {
        settled = true;
        resolve();
        return;
      }

      const error = new Error('AI response stopped before it completed.');
      settled = true;
      onError?.(error);
      reject(error);
    };

    signal?.addEventListener?.('abort', abortRequest);
    xhr.send(JSON.stringify({ message, model, conversation_id: conversationId }));
  });
};
