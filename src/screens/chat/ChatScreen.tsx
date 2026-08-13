import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addMessage,
  appendMessageText,
  resetAssistantMessage,
  setTyping,
  setMessages,
  clearChat,
  updateMessage,
  Message,
} from '../../store/chatSlice';
import MessageBubble from '../../components/MessageBubble';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { analytics } from '../../services/firebase';
import api, { getWebSocketUrl } from '../../services/api';
import { streamChat, StreamCancelledError, StreamErrorData, StreamServerError } from '../../services/chatStream';
import { font } from '../../theme/typography';
import {
  ArrowDown,
  ArrowUp,
  ChatCircleText,
  List,
  Microphone,
  NotePencil,
  Plus,
  SignOut,
  Stop,
  Trash,
  UserCircle,
} from '../../components/icons';
import { logout } from '../../store/authSlice';

type AppStackParamList = {
  Chat: undefined;
  Billing: undefined;
};

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'Chat'>;
};

type RealtimePayload = {
  type: 'connected' | 'message' | 'error';
  message?: Message | string | PaymentErrorPayload;
};

const DEFAULT_COMPOSER_HEIGHT = 118;
const AUTO_SCROLL_THRESHOLD = 120;
const STREAM_SCROLL_THROTTLE_MS = 120;
const QUOTA_EXCEEDED_MESSAGE = 'Aapke tokens khatam ho gaye hain. Ab hum baat nahi kar sakte. Continue karne ke liye Pro plan lena hoga.';
const NOVA_UNAVAILABLE_MESSAGE = 'NOVA abhi connect nahi ho pa rahi. Thodi der baad retry karo.';

const hideTechnicalError = (message?: string) => {
  if (!message) {
    return NOVA_UNAVAILABLE_MESSAGE;
  }
  if (/groq|gemini|api[_ ]?key|backend\/?\.env|authentication failed/i.test(message)) {
    return NOVA_UNAVAILABLE_MESSAGE;
  }
  return message;
};

type PaymentErrorPayload = {
  code?: string;
  message?: string;
  paymentUrl?: string;
};

type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

const isChatMessage = (message: RealtimePayload['message']): message is Message => (
  typeof message === 'object' &&
  message !== null &&
  'sender' in message &&
  (message.sender === 'user' || message.sender === 'ai') &&
  'text' in message
);

const isPaymentErrorPayload = (message: RealtimePayload['message']): message is PaymentErrorPayload => (
  typeof message === 'object' &&
  message !== null &&
  'code' in message &&
  message.code === 'quota_exceeded'
);

const NovaBackground = React.memo(() => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient
      colors={['rgba(52,199,122,0.10)', 'rgba(2,10,8,0.02)', 'rgba(2,10,8,0)']}
      locations={[0, 0.48, 1]}
      style={styles.backgroundTopGradient}
    />
    <LinearGradient
      colors={['rgba(24,92,61,0)', 'rgba(24,92,61,0.16)']}
      style={styles.backgroundBottomGradient}
    />
    <Svg width="100%" height="100%" viewBox="0 0 420 840" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <Path d="M-150 360 Q70 205 255 390 T590 310" stroke="#34C77A" strokeOpacity={0.07} strokeWidth={54} fill="none" />
      <Path d="M-90 610 Q125 405 305 535 T585 455" stroke="#185C3D" strokeOpacity={0.12} strokeWidth={38} fill="none" />
      <Path d="M120 860 Q250 560 470 430" stroke="#34C77A" strokeOpacity={0.16} strokeWidth={1} fill="none" />
    </Svg>
  </View>
));



const TypingDots = () => {
  const dotAnimations = React.useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]).current;

  React.useEffect(() => {
    const animations = dotAnimations.map((value, index) => (
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 130),
          Animated.timing(value, {
            toValue: 1,
            duration: 260,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 260,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(260),
        ])
      )
    ));

    animations.forEach(animation => animation.start());
    return () => animations.forEach(animation => animation.stop());
  }, [dotAnimations]);

  return (
    <View style={styles.typingBubble}>
      <View style={styles.typingAvatar}>
        <Text style={styles.typingAvatarText}>N</Text>
      </View>
      <View style={styles.typingDotsContainer}>
        {dotAnimations.map((value, index) => {
          const dotStyle = {
            opacity: value,
            transform: [
              {
                translateY: value.interpolate({
                  inputRange: [0.35, 1],
                  outputRange: [2, -2],
                }),
              },
            ],
          };

          return (
            <Animated.View
              key={index}
              style={[styles.typingDot, dotStyle]}
            />
          );
        })}
      </View>
    </View>
  );
};

const ChatScreen: React.FC<Props> = ({ navigation }) => {
  const [inputText, setInputText] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isRealtimeConnected, setRealtimeConnected] = useState(false);
  const [isStreaming, setStreaming] = useState(false);
  const [isWaitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [isClearModalVisible, setClearModalVisible] = useState(false);
  const [isDrawerVisible, setDrawerVisible] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const messages = useAppSelector(state => state.chat.messages);
  const currentUser = useAppSelector(state => state.auth.user);
  // Android's adjustResize already reduces the available window when the
  // keyboard opens. Adding the keyboard height again pushes the composer over
  // the conversation and hides messages behind it.
  const composerBottomInset = composerHeight + 28;
  const dispatch = useAppDispatch();
  const flatListRef = useRef<FlatList<Message>>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const activeStreamControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const activeStreamCancelledRef = useRef(false);
  const activeAssistantHasContentRef = useRef(false);
  const isWaitingForFirstChunkRef = useRef(false);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const isUserNearBottomRef = useRef(true);
  const isFollowingLatestRef = useRef(true);
  const isUserDraggingRef = useRef(false);
  const didInitialScrollRef = useRef(false);
  const isComposerFocusedRef = useRef(false);
  const streamScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStreamScrollAtRef = useRef(0);
  const programmaticScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const streamChunkFrameRef = useRef<number | null>(null);
  const pendingStreamTextRef = useRef<{ id: string; text: string } | null>(null);

  const scrollToBottom = React.useCallback((animated = true) => {
    if (animated) {
      isProgrammaticScrollRef.current = true;
      if (programmaticScrollTimerRef.current) {
        clearTimeout(programmaticScrollTimerRef.current);
      }
      programmaticScrollTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
        programmaticScrollTimerRef.current = null;
      }, 500);
    }

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const updateNearBottom = React.useCallback((isNearBottom: boolean) => {
    if (isUserNearBottomRef.current === isNearBottom) {
      return;
    }

    isUserNearBottomRef.current = isNearBottom;
    setShowScrollToLatest(!isNearBottom);
  }, []);

  const startFollowingLatestMessages = React.useCallback((animated = true) => {
    isUserNearBottomRef.current = true;
    isFollowingLatestRef.current = true;
    setShowScrollToLatest(false);
    scrollToBottom(animated);
  }, [scrollToBottom]);

  const scheduleStreamAutoScroll = React.useCallback(() => {
    if (
      !isFollowingLatestRef.current
      || isProgrammaticScrollRef.current
      || streamScrollTimerRef.current
    ) {
      return;
    }

    const elapsed = Date.now() - lastStreamScrollAtRef.current;
    const delay = Math.max(0, STREAM_SCROLL_THROTTLE_MS - elapsed);
    streamScrollTimerRef.current = setTimeout(() => {
      streamScrollTimerRef.current = null;
      if (!isFollowingLatestRef.current) {
        return;
      }

      lastStreamScrollAtRef.current = Date.now();
      scrollToBottom(false);
    }, delay);
  }, [scrollToBottom]);

  const cancelPendingStreamScroll = React.useCallback(() => {
    if (streamScrollTimerRef.current) {
      clearTimeout(streamScrollTimerRef.current);
      streamScrollTimerRef.current = null;
    }
  }, []);

  const flushPendingStreamText = React.useCallback(() => {
    streamChunkFrameRef.current = null;
    const pendingChunk = pendingStreamTextRef.current;
    pendingStreamTextRef.current = null;

    if (!pendingChunk || activeAssistantMessageIdRef.current !== pendingChunk.id) {
      return;
    }

    dispatch(appendMessageText({ id: pendingChunk.id, text: pendingChunk.text }));
  }, [dispatch]);

  const queueStreamingText = React.useCallback((messageId: string, text: string) => {
    const pendingChunk = pendingStreamTextRef.current;
    pendingStreamTextRef.current = pendingChunk?.id === messageId
      ? { id: messageId, text: pendingChunk.text + text }
      : { id: messageId, text };

    if (streamChunkFrameRef.current === null) {
      streamChunkFrameRef.current = requestAnimationFrame(flushPendingStreamText);
    }
  }, [flushPendingStreamText]);

  const discardPendingStreamText = React.useCallback(() => {
    if (streamChunkFrameRef.current !== null) {
      cancelAnimationFrame(streamChunkFrameRef.current);
      streamChunkFrameRef.current = null;
    }
    pendingStreamTextRef.current = null;
  }, []);

  const focusCurrentConversation = React.useCallback(() => {
    isComposerFocusedRef.current = true;
    startFollowingLatestMessages(true);
    setTimeout(() => {
      if (isComposerFocusedRef.current) {
        startFollowingLatestMessages(true);
      }
    }, 260);
  }, [startFollowingLatestMessages]);

  const handleChatScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
    const isNearBottom = distanceFromBottom <= AUTO_SCROLL_THRESHOLD;
    if (isProgrammaticScrollRef.current && !isNearBottom) {
      return;
    }

    if (isNearBottom) {
      isProgrammaticScrollRef.current = false;
      isFollowingLatestRef.current = true;
    } else if (isUserDraggingRef.current) {
      isFollowingLatestRef.current = false;
    } else if (isFollowingLatestRef.current) {
      // Keyboard/layout changes can temporarily report an old scroll offset.
      // Keep following the conversation unless the user actually dragged it.
      return;
    }
    updateNearBottom(isNearBottom);
  }, [updateNearBottom]);

  const handleContentSizeChange = React.useCallback(() => {
    scheduleStreamAutoScroll();
  }, [scheduleStreamAutoScroll]);

  const handleScrollBeginDrag = React.useCallback(() => {
    isUserDraggingRef.current = true;
    isProgrammaticScrollRef.current = false;
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
      programmaticScrollTimerRef.current = null;
    }
    cancelPendingStreamScroll();
  }, [cancelPendingStreamScroll]);

  const handleScrollEndDrag = React.useCallback(() => {
    isUserDraggingRef.current = false;
  }, []);

  const handleMomentumScrollEnd = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserDraggingRef.current = false;
    handleChatScroll(event);
  }, [handleChatScroll]);

  const recentChats = React.useMemo(() => conversations.slice(0, 50), [conversations]);

  const handleOpenPayment = React.useCallback(() => {
    navigation.navigate('Billing');
  }, [navigation]);

  useEffect(() => {
    let keyboardSettleTimers: Array<ReturnType<typeof setTimeout>> = [];
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      if (isComposerFocusedRef.current) {
        keyboardSettleTimers.forEach(clearTimeout);
        keyboardSettleTimers = [60, 220, 420].map(delay => setTimeout(() => {
          if (isComposerFocusedRef.current) {
            startFollowingLatestMessages(false);
          }
        }, delay));
      }
    });

    return () => {
      keyboardSettleTimers.forEach(clearTimeout);
      showSubscription.remove();
    };
  }, [startFollowingLatestMessages]);

  const addUniqueMessage = React.useCallback((message: Message) => {
    if (messageIdsRef.current.has(message.id)) {
      return;
    }
    messageIdsRef.current.add(message.id);
    dispatch(addMessage(message));
  }, [dispatch]);

  const loadConversation = React.useCallback(async (conversationId: string) => {
    setLoadingHistory(true);
    try {
      const response = await api.get(`/chat/conversations/${conversationId}/messages`);
      const nextMessages: Message[] = Array.isArray(response.data) ? response.data : [];
      messageIdsRef.current = new Set(nextMessages.map(message => message.id));
      dispatch(setMessages(nextMessages));
      setActiveConversationId(conversationId);
      setDrawerVisible(false);
      didInitialScrollRef.current = false;
    } finally {
      setLoadingHistory(false);
    }
  }, [dispatch]);

  const refreshConversations = React.useCallback(async () => {
    const response = await api.get('/chat/conversations');
    const nextConversations: Conversation[] = Array.isArray(response.data) ? response.data : [];
    setConversations(nextConversations);
    return nextConversations;
  }, []);

  const openDrawer = React.useCallback(() => {
    setDrawerVisible(true);
    refreshConversations().catch(() => undefined);
  }, [refreshConversations]);

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        const nextConversations = await refreshConversations();
        if (isMounted && nextConversations.length) {
          const latestConversation = nextConversations[0];
          const response = await api.get(`/chat/conversations/${latestConversation.id}/messages`);
          if (isMounted) {
            const nextMessages: Message[] = Array.isArray(response.data) ? response.data : [];
            messageIdsRef.current = new Set(nextMessages.map(message => message.id));
            dispatch(setMessages(nextMessages));
            setActiveConversationId(latestConversation.id);
          }
        }
      } catch (err) {
        console.log('Failed to load chat history:', err);
      } finally {
        if (isMounted) {
          setLoadingHistory(false);
        }
      }
    };

    const connectRealtime = async () => {
      const token = await AsyncStorage.getItem('userToken');
      if (!token || !isMounted) {
        return;
      }

      const socket = new WebSocket(getWebSocketUrl(token));
      websocketRef.current = socket;

      socket.onopen = () => {
        if (isMounted) {
          setRealtimeConnected(true);
        }
      };

      socket.onmessage = (event) => {
        try {
          const payload: RealtimePayload = JSON.parse(event.data);
          if (payload.type === 'message' && isChatMessage(payload.message)) {
            if (payload.message.sender === 'ai') {
              addUniqueMessage(payload.message);
              dispatch(setTyping(false));
            }
          }
          if (payload.type === 'error') {
            const errorPayload = payload.message;
            const isPaymentError = isPaymentErrorPayload(errorPayload);
            const serverErrorMessage = typeof errorPayload === 'object'
              && errorPayload !== null
              && 'message' in errorPayload
              && typeof errorPayload.message === 'string'
              ? errorPayload.message
              : undefined;
            const errorText = typeof errorPayload === 'string'
              ? hideTechnicalError(errorPayload)
              : isPaymentError
                ? errorPayload.message || QUOTA_EXCEEDED_MESSAGE
                : hideTechnicalError(serverErrorMessage);

            dispatch(setTyping(false));
            addUniqueMessage({
              id: `error-${Date.now()}`,
              text: errorText,
              sender: 'ai',
              timestamp: Date.now(),
              actionType: isPaymentError ? 'payment' : undefined,
              actionUrl: isPaymentError ? errorPayload.paymentUrl : undefined,
            });
          }
        } catch (err) {
          console.log('Invalid realtime payload:', err);
        }
      };

      socket.onerror = () => {
        if (isMounted) {
          setRealtimeConnected(false);
        }
      };

      socket.onclose = () => {
        if (isMounted) {
          setRealtimeConnected(false);
        }
      };
    };

    fetchHistory();
    connectRealtime();

    return () => {
      isMounted = false;
      activeStreamCancelledRef.current = true;
      activeStreamControllerRef.current?.abort();
      cancelPendingStreamScroll();
      discardPendingStreamText();
      activeStreamControllerRef.current = null;
      websocketRef.current?.close();
      websocketRef.current = null;
    };
  }, [addUniqueMessage, cancelPendingStreamScroll, discardPendingStreamText, dispatch, refreshConversations]);

  const startNewChat = React.useCallback(() => {
    setDrawerVisible(false);
    activeStreamControllerRef.current?.abort();
    setActiveConversationId(null);
    messageIdsRef.current.clear();
    dispatch(clearChat());
    setInputText('');
  }, [dispatch]);

  const handleDrawerPlans = React.useCallback(() => {
    setDrawerVisible(false);
    navigation.navigate('Billing');
  }, [navigation]);

  const handleLogout = React.useCallback(async () => {
    setDrawerVisible(false);
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('user');
    dispatch(logout());
  }, [dispatch]);

  const confirmClearHistory = React.useCallback(async () => {
    try {
      if (activeConversationId) {
        await api.delete(`/chat/conversations/${activeConversationId}`);
      }
    } catch (err) {
      console.log('Error clearing server history:', err);
    }
    messageIdsRef.current.clear();
    dispatch(clearChat());
    setActiveConversationId(null);
    await refreshConversations().catch(() => undefined);
    setClearModalVisible(false);
  }, [activeConversationId, dispatch, refreshConversations]);

  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const finishActiveStream = React.useCallback(() => {
    activeStreamControllerRef.current = null;
    activeAssistantMessageIdRef.current = null;
    activeAssistantHasContentRef.current = false;
    activeStreamCancelledRef.current = false;
    isWaitingForFirstChunkRef.current = false;
    setStreaming(false);
    setWaitingForFirstChunk(false);
    dispatch(setTyping(false));
  }, [dispatch]);

  const getStreamErrorText = (error: Error, data?: StreamErrorData) => (
    data?.code === 'quota_exceeded'
      ? data.message || QUOTA_EXCEEDED_MESSAGE
      : hideTechnicalError(data?.message || error.message)
  );

  const startStreamingResponse = React.useCallback(async ({
    prompt,
    assistantMessageId,
    resetExistingAssistant = false,
  }: {
    prompt: string;
    assistantMessageId: string;
    resetExistingAssistant?: boolean;
  }) => {
    if (activeStreamControllerRef.current) {
      activeStreamCancelledRef.current = true;
      activeStreamControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeStreamCancelledRef.current = false;
    activeAssistantHasContentRef.current = false;
    activeAssistantMessageIdRef.current = assistantMessageId;
    activeStreamControllerRef.current = controller;
    isWaitingForFirstChunkRef.current = true;
    startFollowingLatestMessages(true);

    if (resetExistingAssistant) {
      dispatch(resetAssistantMessage({ id: assistantMessageId, retryPrompt: prompt }));
    }

    setStreaming(true);
    setWaitingForFirstChunk(true);
    dispatch(setTyping(true));

    try {
      await streamChat({
        message: prompt,
        conversationId: activeConversationId,
        signal: controller.signal,
        onStart: (data) => {
          if (data.conversation_id) {
            setActiveConversationId(data.conversation_id);
            setConversations(current => {
              const existing = current.find(item => item.id === data.conversation_id);
              const now = Date.now();
              const conversation: Conversation = existing || {
                id: data.conversation_id as string,
                title: data.conversation_title || prompt.slice(0, 60),
                createdAt: now,
                updatedAt: now,
              };
              return [
                { ...conversation, updatedAt: now },
                ...current.filter(item => item.id !== data.conversation_id),
              ];
            });
          }
        },
        onChunk: (content) => {
          if (activeAssistantMessageIdRef.current !== assistantMessageId) {
            return;
          }
          activeAssistantHasContentRef.current = true;
          if (isWaitingForFirstChunkRef.current) {
            isWaitingForFirstChunkRef.current = false;
            setWaitingForFirstChunk(false);
          }
          queueStreamingText(assistantMessageId, content);
          scheduleStreamAutoScroll();
        },
        onDone: () => {
          if (activeAssistantMessageIdRef.current === assistantMessageId) {
            flushPendingStreamText();
            dispatch(updateMessage({ id: assistantMessageId, status: 'completed' }));
          }
        },
        onError: (error, data) => {
          if (activeAssistantMessageIdRef.current !== assistantMessageId || activeStreamCancelledRef.current) {
            return;
          }
          const errorText = getStreamErrorText(error, data);
          flushPendingStreamText();
          dispatch(updateMessage({
            id: assistantMessageId,
            status: 'error',
            error: errorText,
            actionType: data?.code === 'quota_exceeded' ? 'payment' : undefined,
            actionUrl: data?.paymentUrl,
          }));
          if (isWaitingForFirstChunkRef.current) {
            isWaitingForFirstChunkRef.current = false;
            setWaitingForFirstChunk(false);
          }
        },
      });
    } catch (error) {
      if (
        error instanceof StreamCancelledError ||
        error instanceof StreamServerError ||
        activeStreamCancelledRef.current
      ) {
        return;
      }
      if (activeAssistantMessageIdRef.current === assistantMessageId) {
        flushPendingStreamText();
        const errorMessage = error instanceof Error
          ? error.message
          : 'Unable to generate the response. Please try again.';
        dispatch(updateMessage({
          id: assistantMessageId,
          status: 'error',
          error: errorMessage,
        }));
      }
    } finally {
      if (activeAssistantMessageIdRef.current === assistantMessageId) {
        finishActiveStream();
      }
      scheduleStreamAutoScroll();
    }
  }, [activeConversationId, dispatch, finishActiveStream, flushPendingStreamText, queueStreamingText, scheduleStreamAutoScroll, startFollowingLatestMessages]);

  const handleStopGenerating = React.useCallback(() => {
    const assistantMessageId = activeAssistantMessageIdRef.current;
    if (!assistantMessageId) {
      return;
    }
    activeStreamCancelledRef.current = true;
    isWaitingForFirstChunkRef.current = false;
    activeStreamControllerRef.current?.abort();
    flushPendingStreamText();
    dispatch(updateMessage({ id: assistantMessageId, status: 'cancelled' }));
    finishActiveStream();
  }, [dispatch, finishActiveStream, flushPendingStreamText]);

  const handleRetryMessage = React.useCallback((assistantMessageId: string, prompt?: string) => {
    const retryPrompt = prompt?.trim();
    if (!retryPrompt || isStreaming) {
      return;
    }
    startStreamingResponse({
      prompt: retryPrompt,
      assistantMessageId,
      resetExistingAssistant: true,
    });
  }, [isStreaming, startStreamingResponse]);

  const handleSend = React.useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || isStreaming) {
      return;
    }
    const timestamp = Date.now();

    const optimisticUserMessage: Message = {
      id: `local-user-${timestamp}`,
      text: trimmed,
      sender: 'user',
      timestamp,
      status: 'completed',
    };

    const assistantMessage: Message = {
      id: `local-ai-${timestamp}`,
      text: '',
      sender: 'ai',
      timestamp: timestamp + 1,
      status: 'streaming',
      retryPrompt: trimmed,
    };

    setInputText('');
    addUniqueMessage(optimisticUserMessage);
    addUniqueMessage(assistantMessage);
    analytics.logEvent('message_sent', { messageLength: trimmed.length });

    startFollowingLatestMessages(true);
    startStreamingResponse({ prompt: trimmed, assistantMessageId: assistantMessage.id });
  }, [addUniqueMessage, inputText, isStreaming, startFollowingLatestMessages, startStreamingResponse]);

  const renderMessageItem = React.useCallback(({ item }: { item: Message }) => (
    <MessageBubble
      id={item.id}
      text={item.text}
      sender={item.sender}
      timestamp={item.timestamp}
      status={item.status}
      error={item.error}
      retryPrompt={item.retryPrompt}
      actionType={item.actionType}
      actionUrl={item.actionUrl}
      onActionPress={handleOpenPayment}
      onRetry={handleRetryMessage}
    />
  ), [handleOpenPayment, handleRetryMessage]);

  const keyExtractor = React.useCallback((item: Message) => item.id, []);

  const handleListLayout = React.useCallback(() => {
    if (!didInitialScrollRef.current) {
      scrollToBottom(false);
      return;
    }
    if (isComposerFocusedRef.current && isFollowingLatestRef.current) {
      scrollToBottom(false);
    }
  }, [scrollToBottom]);

  const listFooter = React.useMemo(() => (
    <View style={{ height: composerBottomInset }} />
  ), [composerBottomInset]);

  const inputContainerStyle = styles.inputContainer;

  useEffect(() => {
    if (!loadingHistory && !didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scrollToBottom(false);
    }
  }, [loadingHistory, scrollToBottom]);

  useEffect(() => {
    if (!loadingHistory) {
      if (isUserNearBottomRef.current) {
        scrollToBottom(false);
      }
    }
  }, [composerHeight, loadingHistory, scrollToBottom]);

  useEffect(() => () => {
    cancelPendingStreamScroll();
    discardPendingStreamText();
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
  }, [cancelPendingStreamScroll, discardPendingStreamText]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <NovaBackground />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.roundIconButton}
            activeOpacity={0.82}
            onPress={openDrawer}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
          >
            <List size={21} color="#F5F5F5" weight="bold" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={styles.headerNameRowNew}>
              <Text style={styles.headerName}>Nova</Text>
              <View style={styles.headerOnlineDot} />
            </View>
            <Text style={styles.headerSubtitle}>Always here to help</Text>
          </View>

          <TouchableOpacity
            style={styles.connectionButton}
            activeOpacity={0.82}
            onPress={startNewChat}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
          >
            <NotePencil size={20} color="#ECFDF5" weight="regular" />
          </TouchableOpacity>
        </View>

        {loadingHistory ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F5F5F5" />
            <Text style={styles.loadingText}>Loading chat history...</Text>
          </View>
        ) : (
          <FlatList<Message>
            ref={flatListRef}
            style={styles.messageList}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={listFooter}
            onContentSizeChange={handleContentSizeChange}
            onLayout={handleListLayout}
            onScroll={handleChatScroll}
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={handleScrollEndDrag}
            onMomentumScrollEnd={handleMomentumScrollEnd}
            scrollEventThrottle={16}
            decelerationRate="normal"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
            initialNumToRender={14}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={40}
            windowSize={9}
            removeClippedSubviews={Platform.OS === 'android'}
          />
        )}

        {showScrollToLatest && !loadingHistory && (
          <TouchableOpacity
            style={[styles.scrollToLatestButton, { bottom: composerBottomInset + 12 }]}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityLabel="Scroll to latest message"
            onPress={() => startFollowingLatestMessages(true)}
          >
            <ArrowDown size={20} color="#0A0A0A" weight="bold" />
            <Text style={styles.scrollToLatestText}>Latest</Text>
          </TouchableOpacity>
        )}

        {isWaitingForFirstChunk && (
          <View style={styles.typingIndicator}>
            <TypingDots />
          </View>
        )}

        <LinearGradient
          colors={['rgba(18,58,42,0.97)', 'rgba(5,27,21,0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={inputContainerStyle}
          onLayout={(event) => {
            const nextHeight = Math.ceil(event.nativeEvent.layout.height);
            setComposerHeight(currentHeight => (
              currentHeight === nextHeight ? currentHeight : nextHeight
            ));
          }}
        >
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask anything"
            placeholderTextColor="#72A38C"
            multiline
            maxLength={1000}
            onFocus={focusCurrentConversation}
            onBlur={() => {
              isComposerFocusedRef.current = false;
            }}
          />
          <View style={styles.composerToolbar}>
            <TouchableOpacity style={styles.composerIconButton} activeOpacity={0.82}>
              <Plus size={24} color="#F5F5F5" weight="regular" />
            </TouchableOpacity>
            <View style={styles.composerSpacer} />
            <TouchableOpacity style={styles.composerIconButton} activeOpacity={0.82}>
              <Microphone size={23} color="#F5F5F5" weight="regular" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() && !isStreaming) && styles.sendButtonDisabled]}
              onPress={isStreaming ? handleStopGenerating : handleSend}
              disabled={!inputText.trim() && !isStreaming}
              activeOpacity={0.7}
            >
              {isStreaming ? (
                <Stop size={19} color="#0A0A0A" weight="fill" />
              ) : (
                <ArrowUp size={24} color="#0A0A0A" weight="bold" />
              )}
            </TouchableOpacity>
          </View>
        </LinearGradient>
        <Modal
          visible={isDrawerVisible}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setDrawerVisible(false)}
        >
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerVisible(false)}>
            <Pressable style={styles.drawerPanel} onPress={() => undefined}>
              <View style={styles.drawerBrandRow}>
                <Text style={styles.drawerBrand}>NOVA</Text>
                <View style={[styles.drawerLiveDot, isRealtimeConnected && styles.drawerLiveDotConnected]} />
              </View>

              <ScrollView
                style={styles.drawerMenu}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.drawerMenuContent}
              >
                <TouchableOpacity style={styles.drawerMenuItemActive} onPress={startNewChat}>
                  <Plus size={20} color="#F4F4F4" weight="regular" />
                  <View style={styles.drawerMenuCopyNew}>
                    <Text style={styles.drawerMenuTextActive}>New chat</Text>
                    <Text style={styles.drawerMenuSubtitle}>Start a fresh conversation</Text>
                  </View>
                </TouchableOpacity>
                <Text style={styles.drawerSectionLabel}>RECENT CHATS</Text>
                {recentChats.length ? recentChats.map(conversation => (
                  <TouchableOpacity
                    key={conversation.id}
                    style={[
                      styles.drawerMenuItem,
                      activeConversationId === conversation.id && styles.drawerMenuItemActive,
                    ]}
                    onPress={() => loadConversation(conversation.id)}
                  >
                    <ChatCircleText size={19} color="#83CFA9" weight="regular" />
                    <Text style={styles.drawerMenuText} numberOfLines={1}>{conversation.title}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={styles.drawerEmptyText}>No conversations yet</Text>
                )}
                <TouchableOpacity style={styles.drawerPlansLink} onPress={handleDrawerPlans}>
                  <Text style={styles.drawerMenuGlyph}>N</Text>
                  <Text style={styles.drawerMenuText}>NOVA plans</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.drawerAccountArea}>
                <View style={styles.drawerAccountRow}>
                  <UserCircle size={34} color="#E8E8E8" weight="regular" />
                  <View style={styles.drawerAccountCopy}>
                    <Text style={styles.drawerAccountName} numberOfLines={1}>
                      {currentUser?.name || 'NOVA user'}
                    </Text>
                    <Text style={styles.drawerAccountEmail} numberOfLines={1}>
                      {currentUser?.email || ''}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.drawerLogout} onPress={handleLogout} activeOpacity={0.8}>
                    <SignOut size={18} color="#D5D5D5" weight="regular" />
                    <Text style={styles.drawerLogoutText}>Logout</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal
          visible={isClearModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setClearModalVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setClearModalVisible(false)}>
            <Pressable style={styles.clearModalCard}>
              <View style={styles.clearModalIcon}>
                <Trash size={24} color="#FCA5A5" weight="bold" />
              </View>
              <Text style={styles.clearModalTitle}>Clear chat?</Text>
              <Text style={styles.clearModalText}>
                This will remove all messages from this conversation.
              </Text>
              <View style={styles.clearModalActions}>
                <TouchableOpacity
                  style={styles.clearModalCancel}
                  onPress={() => setClearModalVisible(false)}
                >
                  <Text style={styles.clearModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.clearModalConfirm}
                  onPress={confirmClearHistory}
                >
                  <Text style={styles.clearModalConfirmText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020A08',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backgroundTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
  },
  backgroundBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '70%',
  },
  ambientTopGlow: {
    position: 'absolute',
    top: -100,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0, 91, 62, 0.12)',
  },
  ambientBottomGlow: {
    position: 'absolute',
    right: -150,
    bottom: 160,
    width: 460,
    height: 460,
    borderRadius: 230,
    backgroundColor: 'rgba(0, 105, 67, 0.09)',
  },
  ambientArc: {
    position: 'absolute',
    right: -190,
    top: '32%',
    width: 480,
    height: 480,
    borderRadius: 240,
    borderWidth: 0,
    borderColor: 'rgba(52, 211, 153, 0.12)',
  },
  topBar: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  headerBackButton: {
    width: 32,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginRight: 5,
  },
  roundIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 38, 28, 0.78)',
    borderWidth: 0,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    minWidth: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNameRowNew: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerName: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 20,
    letterSpacing: 0.2,
  },
  headerOnlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginLeft: 8,
    backgroundColor: '#F5F5F5',
  },
  headerSubtitle: {
    ...font.regular,
    color: '#86BFA8',
    fontSize: 13,
    marginTop: 1,
  },
  connectionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(6, 38, 28, 0.78)',
    borderWidth: 0,
    borderColor: 'rgba(52, 211, 153, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionDot: {
    position: 'absolute',
    right: 9,
    bottom: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#777777',
    borderWidth: 0,
    borderColor: '#1F1F1F',
  },
  connectionDotLive: {
    backgroundColor: '#F5F5F5',
  },
  roundIconText: {
    ...font.regular,
    color: '#F5F5F5',
    fontSize: 34,
    fontWeight: '300',
    marginTop: -3,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  brandText: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 13,
    letterSpacing: 1.1,
    marginRight: 8,
  },
  actionPill: {
    height: 50,
    minWidth: 110,
    paddingHorizontal: 15,
    borderRadius: 27,
    backgroundColor: '#1F1F1F',
    borderWidth: 0,
    borderColor: '#343434',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionIconButton: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 25,
    lineHeight: 32,
  },
  actionDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderWidth: 0,
    borderColor: '#F5F5F5',
    marginRight: 10,
  },
  headerAvatarText: {
    ...font.black,
    color: '#061018',
    fontSize: 15,
  },
  headerTitle: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 17,
    lineHeight: 21,
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerStatusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  headerStatusText: {
    ...font.bold,
    color: '#94A3B8',
    fontSize: 11,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
  },
  statusDotLive: {
    backgroundColor: '#F5F5F5',
  },
  headerActions: {
    minWidth: 68,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerActionButton: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    ...font.medium,
    color: '#94A3B8',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...font.regular,
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  messageList: {
    flex: 1,
  },
  clearHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#181818',
    borderRadius: 999,
    borderWidth: 0,
    borderColor: '#333333',
  },
  clearHeaderBtnText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 13,
  },
  listContent: {
    paddingTop: 20,
    paddingHorizontal: 0,
  },
  scrollToLatestButton: {
    position: 'absolute',
    right: 28,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#A7F3D0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  scrollToLatestText: {
    ...font.bold,
    color: '#0A0A0A',
    fontSize: 13,
    marginLeft: 6,
  },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  typingBubble: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151515',
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    borderWidth: 0,
    borderColor: '#333333',
    paddingHorizontal: 13,
    paddingVertical: 11,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  typingAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  typingAvatarText: {
    ...font.black,
    color: '#061018',
    fontSize: 11,
  },
  typingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F5F5F5',
    marginHorizontal: 3,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    flexDirection: 'row',
  },
  drawerPanel: {
    width: '80%',
    maxWidth: 340,
    height: '100%',
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 22,
    backgroundColor: '#020D0A',
    borderRightWidth: 0,
    borderRightColor: '#1E8D63',
    justifyContent: 'space-between',
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  drawerBrand: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 22,
    letterSpacing: 0.5,
  },
  drawerLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 10,
    backgroundColor: '#666666',
  },
  drawerLiveDotConnected: {
    backgroundColor: '#F5F5F5',
  },
  drawerMenu: {
    flex: 1,
    paddingTop: 34,
  },
  drawerMenuContent: {
    paddingBottom: 20,
  },
  drawerMenuItem: {
    minHeight: 46,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'rgba(52, 211, 153, 0.18)',
    backgroundColor: 'rgba(5, 35, 26, 0.72)',
  },
  drawerMenuItemActive: {
    minHeight: 60,
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(8, 69, 47, 0.72)',
    borderWidth: 0,
    borderColor: '#34D399',
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerMenuText: {
    ...font.medium,
    color: '#D2D2D2',
    fontSize: 15,
    marginLeft: 13,
  },
  drawerMenuTextActive: {
    ...font.bold,
    color: '#F4F4F4',
    fontSize: 15,
    marginLeft: 13,
  },
  drawerMenuCopyNew: {
    marginLeft: 13,
  },
  drawerMenuSubtitle: {
    ...font.regular,
    color: '#82BFA5',
    fontSize: 10,
    marginTop: 1,
  },
  drawerSectionLabel: {
    ...font.bold,
    color: '#65A88C',
    fontSize: 10,
    letterSpacing: 1.6,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 8,
  },
  drawerMenuGlyph: {
    ...font.black,
    width: 24,
    color: '#D2D2D2',
    fontSize: 15,
    textAlign: 'center',
  },
  drawerEmptyText: {
    ...font.regular,
    color: '#668778',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  drawerPlansLink: {
    minHeight: 46,
    paddingHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0,
    borderColor: 'rgba(52,211,153,0.18)',
  },
  drawerAccountArea: {
    paddingTop: 18,
    borderTopWidth: 0,
    borderTopColor: '#174C38',
  },
  drawerAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 0,
    borderColor: 'rgba(52, 211, 153, 0.38)',
    backgroundColor: 'rgba(5, 35, 26, 0.72)',
  },
  drawerAccountCopy: {
    flex: 1,
    marginLeft: 12,
  },
  drawerAccountName: {
    ...font.bold,
    color: '#F2F2F2',
    fontSize: 14,
  },
  drawerAccountEmail: {
    ...font.regular,
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  drawerLogout: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  drawerLogoutText: {
    ...font.medium,
    color: '#B8B8B8',
    fontSize: 12,
    marginLeft: 6,
  },
  inputContainer: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 9,
    borderRadius: 28,
    borderWidth: 0,
    borderColor: '#34D399',
    backgroundColor: 'rgba(5, 35, 26, 0.94)',
    shadowColor: '#34D399',
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  inputContainerResting: {
    bottom: 18,
  },
  input: {
    width: '100%',
    backgroundColor: 'transparent',
    color: '#ECFDF5',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 8,
    maxHeight: 124,
    minHeight: 34,
    fontSize: 16,
    lineHeight: 24,
    ...font.regular,
  },
  composerToolbar: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    backgroundColor: 'rgba(16, 92, 63, 0.28)',
  },
  composerSpacer: {
    flex: 1,
  },
  sendButton: {
    width: 38,
    height: 38,
    backgroundColor: '#34D399',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#174C38',
  },
  sendButtonText: {
    ...font.black,
    color: '#0A0A0A',
    fontSize: 11,
    lineHeight: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  clearModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: '#181818',
    borderWidth: 0,
    borderColor: '#323232',
    padding: 22,
  },
  clearModalIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#2A1515',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  clearModalTitle: {
    ...font.black,
    color: '#F5F5F5',
    fontSize: 22,
    marginBottom: 8,
  },
  clearModalText: {
    ...font.regular,
    color: '#B8B8B8',
    fontSize: 15,
    lineHeight: 22,
  },
  clearModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 22,
  },
  clearModalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#242424',
  },
  clearModalConfirm: {
    paddingHorizontal: 17,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
  },
  clearModalCancelText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 14,
  },
  clearModalConfirmText: {
    ...font.black,
    color: '#0A0A0A',
    fontSize: 14,
  },
});

export default ChatScreen;
