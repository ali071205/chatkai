import AsyncStorage from '@react-native-async-storage/async-storage';
import { streamChat, StreamCancelledError } from '../src/services/chatStream';

type HeaderMap = Record<string, string>;

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];
  static HEADERS_RECEIVED = 2;

  headers: HeaderMap = {};
  method = '';
  url = '';
  body: string | undefined;
  responseText = '';
  readyState = 0;
  status = 200;
  timeout = 0;
  aborted = false;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onloadend: (() => void) | null = null;

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: string) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onloadend?.();
  }

  receive(text: string) {
    this.responseText += text;
    this.onprogress?.();
  }

  finish() {
    this.onloadend?.();
  }
}

describe('streamChat', () => {
  const OriginalXHR = globalThis.XMLHttpRequest;

  const waitForRequest = async () => {
    await Promise.resolve();
    return MockXMLHttpRequest.instances[0];
  };

  beforeEach(async () => {
    MockXMLHttpRequest.instances = [];
    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
    await AsyncStorage.setItem('userToken', 'token-123');
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = OriginalXHR;
    jest.clearAllMocks();
  });

  it('includes authentication and JSON headers', async () => {
    const promise = streamChat({
      message: 'Hi',
      model: 'llama-3.1-8b-instant',
      onChunk: jest.fn(),
    });
    const xhr = await waitForRequest();

    xhr.receive('event: done\ndata: {"message_id":"1"}\n\n');
    xhr.finish();
    await promise;

    expect(xhr.method).toBe('POST');
    expect(xhr.headers.Authorization).toBe('Bearer token-123');
    expect(xhr.headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(xhr.body || '{}')).toEqual({
      message: 'Hi',
      model: 'llama-3.1-8b-instant',
    });
  });

  it('streams chunks and completes on done', async () => {
    const chunks: string[] = [];
    const onDone = jest.fn();
    const promise = streamChat({
      message: 'Hi',
      onChunk: chunk => chunks.push(chunk),
      onDone,
    });
    const xhr = await waitForRequest();

    xhr.receive('event: chunk\ndata: {"content":"Hel"}\n\n');
    xhr.receive('event: chunk\ndata: {"content":"lo"}\n\n');
    xhr.receive('event: done\ndata: {"message_id":"1"}\n\n');
    xhr.finish();
    await promise;

    expect(chunks.join('')).toBe('Hello');
    expect(onDone).toHaveBeenCalledWith({ message_id: '1' });
  });

  it('handles server error events', async () => {
    const onError = jest.fn();
    const promise = streamChat({
      message: 'Hi',
      onChunk: jest.fn(),
      onError,
    });
    const xhr = await waitForRequest();

    xhr.receive('event: error\ndata: {"message":"Unable to generate."}\n\n');
    xhr.finish();
    await expect(promise).rejects.toThrow('Stream server error');
    expect(onError.mock.calls[0][0].message).toBe('Unable to generate.');
  });

  it('cancellation stops future updates', async () => {
    const controller = new AbortController();
    const onChunk = jest.fn();
    const promise = streamChat({
      message: 'Hi',
      signal: controller.signal,
      onChunk,
    });
    const xhr = await waitForRequest();

    controller.abort();
    xhr.receive('event: chunk\ndata: {"content":"late"}\n\n');

    await expect(promise).rejects.toBeInstanceOf(StreamCancelledError);
    expect(xhr.aborted).toBe(true);
    expect(onChunk).not.toHaveBeenCalled();
  });
});
