import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  status?: 'sending' | 'streaming' | 'completed' | 'error' | 'cancelled';
  error?: string;
  retryPrompt?: string;
  actionType?: 'payment';
  actionUrl?: string;
}

interface ChatState {
  messages: Message[];
  isTyping: boolean;
}

const defaultWelcomeMessage: Message = {
  id: 'welcome',
  text: 'Hi there! I am NOVA, your AI Personal Assistant. How can I help you today?',
  sender: 'ai',
  timestamp: Date.now(),
};

const initialState: ChatState = {
  messages: [defaultWelcomeMessage],
  isTyping: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setMessages: (state, action: PayloadAction<Message[]>) => {
      if (action.payload && action.payload.length > 0) {
        state.messages = action.payload;
      } else {
        state.messages = [defaultWelcomeMessage];
      }
    },
    addMessage: (state, action: PayloadAction<Message>) => {
      state.messages.push(action.payload);
    },
    appendMessageText: (state, action: PayloadAction<{ id: string; text: string }>) => {
      const message = state.messages.find(item => item.id === action.payload.id);
      if (message) {
        message.text += action.payload.text;
        message.status = 'streaming';
      }
    },
    updateMessage: (state, action: PayloadAction<Partial<Message> & { id: string }>) => {
      const message = state.messages.find(item => item.id === action.payload.id);
      if (message) {
        Object.entries(action.payload).forEach(([key, value]) => {
          if (value !== undefined) {
            Object.assign(message, { [key]: value });
          }
        });
      }
    },
    resetAssistantMessage: (state, action: PayloadAction<{ id: string; retryPrompt: string }>) => {
      const message = state.messages.find(item => item.id === action.payload.id);
      if (message) {
        message.text = '';
        message.sender = 'ai';
        message.status = 'streaming';
        message.error = undefined;
        message.retryPrompt = action.payload.retryPrompt;
        message.actionType = undefined;
        message.actionUrl = undefined;
        message.timestamp = Date.now();
      }
    },
    updateLastAiMessage: (state, action: PayloadAction<string>) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage && lastMessage.sender === 'ai') {
        lastMessage.text = action.payload;
      }
    },
    setTyping: (state, action: PayloadAction<boolean>) => {
      state.isTyping = action.payload;
    },
    clearChat: (state) => {
      state.messages = [defaultWelcomeMessage];
    }
  },
});

export const {
  setMessages,
  addMessage,
  appendMessageText,
  updateMessage,
  resetAssistantMessage,
  updateLastAiMessage,
  setTyping,
  clearChat,
} = chatSlice.actions;
export default chatSlice.reducer;
