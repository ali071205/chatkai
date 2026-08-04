import reducer, {
  addMessage,
  appendMessageText,
  resetAssistantMessage,
  updateMessage,
} from '../src/store/chatSlice';

describe('chat streaming reducer', () => {
  it('appends chunks to the same assistant message', () => {
    let state = reducer(undefined, addMessage({
      id: 'assistant-1',
      sender: 'ai',
      text: '',
      timestamp: 1,
      status: 'streaming',
      retryPrompt: 'hello',
    }));

    state = reducer(state, appendMessageText({ id: 'assistant-1', text: 'Hello' }));
    state = reducer(state, appendMessageText({ id: 'assistant-1', text: ' world' }));

    const assistantMessages = state.messages.filter(message => message.id === 'assistant-1');
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0].text).toBe('Hello world');
    expect(assistantMessages[0].status).toBe('streaming');
  });

  it('marks done as completed', () => {
    const state = reducer(undefined, updateMessage({
      id: 'welcome',
      status: 'completed',
    }));

    expect(state.messages[0].status).toBe('completed');
  });

  it('marks server error as failed', () => {
    const state = reducer(undefined, updateMessage({
      id: 'welcome',
      status: 'error',
      error: 'Unable to generate the response.',
    }));

    expect(state.messages[0].status).toBe('error');
    expect(state.messages[0].error).toBe('Unable to generate the response.');
  });

  it('marks cancellation without removing streamed content', () => {
    let state = reducer(undefined, appendMessageText({ id: 'welcome', text: ' partial' }));
    state = reducer(state, updateMessage({ id: 'welcome', status: 'cancelled' }));

    expect(state.messages[0].text).toContain('partial');
    expect(state.messages[0].status).toBe('cancelled');
  });

  it('retry resets the assistant without duplicating the user message', () => {
    let state = reducer(undefined, addMessage({
      id: 'user-1',
      sender: 'user',
      text: 'Tell me',
      timestamp: 1,
      status: 'completed',
    }));
    state = reducer(state, addMessage({
      id: 'assistant-1',
      sender: 'ai',
      text: 'Broken',
      timestamp: 2,
      status: 'error',
      retryPrompt: 'Tell me',
    }));

    state = reducer(state, resetAssistantMessage({ id: 'assistant-1', retryPrompt: 'Tell me' }));

    expect(state.messages.filter(message => message.id === 'user-1')).toHaveLength(1);
    expect(state.messages.filter(message => message.id === 'assistant-1')).toHaveLength(1);
    expect(state.messages.find(message => message.id === 'assistant-1')?.text).toBe('');
  });
});
