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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  CaretDown,
  CaretLeft,
  CheckSquare,
  DotsThreeVertical,
  Microphone,
  PaperPlaneRight,
  Plus,
  SlidersHorizontal,
  Stop,
  Trash,
} from '../../components/icons';

type AppStackParamList = {
  Home: undefined;
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
const KEYBOARD_COMPOSER_GAP = 10;
const AUTO_SCROLL_THRESHOLD = 120;
const STREAM_SCROLL_THROTTLE_MS = 120;

type PaymentErrorPayload = {
  code?: string;
  message?: string;
  paymentUrl?: string;
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

type AiModel = {
  id: string;
  name: string;
  tag: string;
};

const AI_MODELS: AiModel[] = [
  { id: 'llama-3.1-8b-instant', name: 'Llama 8B', tag: 'Fast' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 70B', tag: 'Smart' },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', tag: 'Balanced' },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', tag: 'Deep' },
  { id: 'groq/compound-mini', name: 'Compound Mini', tag: 'Tools' },
  { id: 'groq/compound', name: 'Compound', tag: 'Advanced' },
  { id: 'qwen/qwen3.6-27b', name: 'Qwen 27B', tag: 'Reasoning' },
];



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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id);
  const [isStreaming, setStreaming] = useState(false);
  const [isWaitingForFirstChunk, setWaitingForFirstChunk] = useState(false);
  const [isClearModalVisible, setClearModalVisible] = useState(false);
  const [isModelPickerVisible, setModelPickerVisible] = useState(false);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const messages = useAppSelector(state => state.chat.messages);
  const keyboardBottomOffset = Platform.OS === 'android' && keyboardHeight > 0
    ? keyboardHeight + KEYBOARD_COMPOSER_GAP
    : 0;
  const composerBottomInset = composerHeight + keyboardBottomOffset + 28;
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

  useEffect(() => {
    const restoreSelectedModel = async () => {
      const storedModel = await AsyncStorage.getItem('selectedAiModel');
      if (storedModel && AI_MODELS.some(model => model.id === storedModel)) {
        setSelectedModel(storedModel);
      }
    };

    restoreSelectedModel();
  }, []);

  const handleSelectModel = React.useCallback(async (modelId: string) => {
    setSelectedModel(modelId);
    setModelPickerVisible(false);
    await AsyncStorage.setItem('selectedAiModel', modelId);
  }, []);

  const selectedModelInfo = React.useMemo(() => (
    AI_MODELS.find(model => model.id === selectedModel) || AI_MODELS[0]
  ), [selectedModel]);

  const handleOpenPayment = React.useCallback(() => {
    navigation.navigate('Billing');
  }, [navigation]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', event => {
      if (Platform.OS === 'android') {
        setKeyboardHeight(event.endCoordinates.height);
      }
      if (isComposerFocusedRef.current) {
        startFollowingLatestMessages(true);
      }
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [startFollowingLatestMessages]);

  const addUniqueMessage = React.useCallback((message: Message) => {
    if (messageIdsRef.current.has(message.id)) {
      return;
    }
    messageIdsRef.current.add(message.id);
    dispatch(addMessage(message));
  }, [dispatch]);

  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      try {
        const response = await api.get('/chat/history');
        if (isMounted && Array.isArray(response.data)) {
          messageIdsRef.current = new Set(response.data.map((message: Message) => message.id));
          dispatch(setMessages(response.data));
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
            const errorText = typeof errorPayload === 'string'
              ? errorPayload
              : isPaymentError
                ? errorPayload.message || 'AI quota limit reached. Please upgrade to continue.'
                : 'AI request failed. Please try again.';

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
  }, [addUniqueMessage, cancelPendingStreamScroll, discardPendingStreamText, dispatch]);

  const handleClearHistory = React.useCallback(() => {
    setClearModalVisible(true);
  }, []);

  const confirmClearHistory = React.useCallback(async () => {
    try {
      await api.delete('/chat/history');
    } catch (err) {
      console.log('Error clearing server history:', err);
    }
    messageIdsRef.current.clear();
    dispatch(clearChat());
    setClearModalVisible(false);
  }, [dispatch]);

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
    data?.message
    || error.message
    || 'Unable to generate the response. Please try again.'
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
        model: selectedModel,
        signal: controller.signal,
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
  }, [dispatch, finishActiveStream, flushPendingStreamText, queueStreamingText, scheduleStreamAutoScroll, selectedModel, startFollowingLatestMessages]);

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
    }
  }, [scrollToBottom]);

  const listContentStyle = React.useMemo(() => [
    styles.listContent,
    {
      paddingBottom: composerBottomInset,
    },
  ], [composerBottomInset]);

  const inputContainerStyle = React.useMemo(() => [
    styles.inputContainer,
    keyboardBottomOffset > 0 && { bottom: keyboardBottomOffset },
  ], [keyboardBottomOffset]);

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
  }, [composerHeight, keyboardBottomOffset, loadingHistory, scrollToBottom]);

  useEffect(() => () => {
    cancelPendingStreamScroll();
    discardPendingStreamText();
    if (programmaticScrollTimerRef.current) {
      clearTimeout(programmaticScrollTimerRef.current);
    }
  }, [cancelPendingStreamScroll, discardPendingStreamText]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.roundIconButton}
            activeOpacity={0.82}
            onPress={() => navigation.goBack()}
          >
            <CaretLeft size={25} color="#F5F5F5" weight="bold" />
          </TouchableOpacity>

          <View style={styles.brandPill}>
            <Text style={styles.brandText}>NOVA</Text>
            <View style={[styles.statusDot, isRealtimeConnected && styles.statusDotLive]} />
          </View>

          <View style={styles.actionPill}>
            <TouchableOpacity
              style={styles.actionIconButton}
              activeOpacity={0.82}
              onPress={handleClearHistory}
            >
              <Trash size={24} color="#F5F5F5" weight="regular" />
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <DotsThreeVertical size={27} color="#F5F5F5" weight="bold" />
          </View>
        </View>

        {loadingHistory ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F5F5F5" />
            <Text style={styles.loadingText}>Loading chat history...</Text>
          </View>
        ) : (
          <FlatList<Message>
            ref={flatListRef}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderMessageItem}
            contentContainerStyle={listContentStyle}
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

        <View
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
            placeholder="Ask NOVA anything"
            placeholderTextColor="#777"
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
            <TouchableOpacity
              style={styles.modelInInputButton}
              activeOpacity={0.82}
              onPress={() => {
                Keyboard.dismiss();
                setModelPickerVisible(true);
              }}
            >
              <SlidersHorizontal size={16} color="#F5F5F5" weight="bold" />
              <Text style={styles.modelInInputText}>{selectedModelInfo.name}</Text>
              <CaretDown size={13} color="#B8B8B8" weight="bold" />
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
                <PaperPlaneRight size={21} color="#0A0A0A" weight="fill" />
              )}
            </TouchableOpacity>
          </View>
        </View>
        <Modal
          visible={isModelPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setModelPickerVisible(false)}
        >
          <Pressable style={styles.modelModalBackdrop} onPress={() => setModelPickerVisible(false)}>
            <Pressable style={styles.modelMenuCard}>
              <View style={styles.modelMenuHeader}>
                <View>
                  <Text style={styles.modelMenuTitle}>Choose a model</Text>
                  <Text style={styles.modelMenuSubtitle}>Select the response style you need.</Text>
                </View>
                <TouchableOpacity
                  style={styles.modelMenuClose}
                  onPress={() => setModelPickerVisible(false)}
                >
                  <Text style={styles.modelMenuCloseText}>Done</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={AI_MODELS}
                keyExtractor={model => model.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modelMenuList}
                renderItem={({ item: model }) => {
                  const isSelected = selectedModel === model.id;
                  return (
                    <TouchableOpacity
                      style={[styles.modelMenuRow, isSelected && styles.modelMenuRowSelected]}
                      activeOpacity={0.78}
                      onPress={() => handleSelectModel(model.id)}
                    >
                      <View style={styles.modelMenuCopy}>
                        <Text style={[styles.modelMenuName, isSelected && styles.modelMenuNameSelected]}>
                          {model.name}
                        </Text>
                        <Text style={[styles.modelMenuTag, isSelected && styles.modelMenuTagSelected]}>
                          {model.tag}
                        </Text>
                      </View>
                      {isSelected && <CheckSquare size={22} color="#0A0A0A" weight="fill" />}
                    </TouchableOpacity>
                  );
                }}
              />
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
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    minHeight: 74,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 10,
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
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#343434',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1,
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
    borderWidth: 1,
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
    borderWidth: 1,
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
  clearHeaderBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#181818',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333333',
  },
  clearHeaderBtnText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 13,
  },
  listContent: {
    paddingTop: 36,
    paddingHorizontal: 0,
  },
  scrollToLatestButton: {
    position: 'absolute',
    right: 28,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
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
    borderWidth: 1,
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
  inputContainer: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 9,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#3A3A3A',
    backgroundColor: '#202020',
    shadowColor: '#000',
    shadowOpacity: 0.38,
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
    color: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 8,
    maxHeight: 124,
    minHeight: 34,
    fontSize: 16,
    lineHeight: 21,
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
  },
  modelInInputButton: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  modelInInputText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 12,
    marginHorizontal: 6,
  },
  composerSpacer: {
    flex: 1,
  },
  modelModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  modelMenuCard: {
    maxHeight: '68%',
    borderRadius: 28,
    backgroundColor: '#1B1B1B',
    borderWidth: 1,
    borderColor: '#393939',
    overflow: 'hidden',
  },
  modelMenuHeader: {
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#303030',
  },
  modelMenuTitle: {
    ...font.black,
    color: '#F5F5F5',
    fontSize: 17,
  },
  modelMenuSubtitle: {
    ...font.regular,
    color: '#9E9E9E',
    fontSize: 12,
    marginTop: 2,
  },
  modelMenuClose: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#292929',
  },
  modelMenuCloseText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 12,
  },
  modelMenuList: {
    padding: 10,
  },
  modelMenuRow: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelMenuRowSelected: {
    backgroundColor: '#F5F5F5',
  },
  modelMenuCopy: {
    flex: 1,
    paddingRight: 12,
  },
  modelMenuName: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 15,
  },
  modelMenuNameSelected: {
    color: '#0A0A0A',
  },
  modelMenuTag: {
    ...font.regular,
    color: '#969696',
    fontSize: 12,
    marginTop: 2,
  },
  modelMenuTagSelected: {
    color: '#4F4F4F',
  },
  sendButton: {
    width: 38,
    height: 38,
    backgroundColor: '#F5F5F5',
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#343434',
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
    borderWidth: 1,
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
