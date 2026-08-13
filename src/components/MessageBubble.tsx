import React from 'react';
import { View, Text, StyleSheet, Platform, Animated, Easing, TouchableOpacity, Share, Alert } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Tts from 'react-native-tts';
import { ArrowUpRight, Copy, DotsThreeVertical, SpeakerHigh, ThumbsUp } from './icons';
import { containsIndicScript, font, fonts } from '../theme/typography';

interface MessageBubbleProps {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: number;
  status?: 'sending' | 'streaming' | 'completed' | 'error' | 'cancelled';
  error?: string;
  retryPrompt?: string;
  actionType?: 'payment';
  actionUrl?: string;
  onActionPress?: (url?: string) => void;
  onRetry?: (messageId: string, prompt?: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  id,
  text,
  sender,
  status,
  error,
  retryPrompt,
  actionType,
  actionUrl,
  onActionPress,
  onRetry,
}) => {
  const isUser = sender === 'user';
  const [isLiked, setLiked] = React.useState(false);
  const displayText = text;
  const messageFontStyle = containsIndicScript(displayText)
    ? { fontFamily: fonts.teko }
    : font.regular;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(12)).current;
  const scale = React.useRef(new Animated.Value(0.98)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, scale, translateY]);

  const animatedContainerStyle = React.useMemo(() => ({
    opacity,
    transform: [{ translateY }, { scale }],
  }), [opacity, scale, translateY]);

  const handleCopy = React.useCallback(() => {
    Clipboard.setString(displayText);
  }, [displayText]);

  const handleShare = React.useCallback(() => {
    if (displayText) {
      Share.share({ message: displayText }).catch(err => {
        console.log('Share failed:', err);
      });
    }
  }, [displayText]);

  const handleSpeak = React.useCallback(() => {
    if (!displayText) return;

    Tts.stop();
    Tts.setDefaultRate(0.48, true);
    Tts.speak(displayText.replace(/[`*_>#-]/g, ''));
  }, [displayText]);

  const handleMoreActions = React.useCallback(() => {
    Alert.alert('Message actions', 'Choose what you want to do with this response.', [
      { text: 'Copy', onPress: handleCopy },
      { text: 'Share', onPress: handleShare },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [handleCopy, handleShare]);

  const renderFormattedText = (rawText: string, key: string) => {
    const segments = rawText.split(/(\*\*[\s\S]*?\*\*)/g);

    return (
      <Text key={key} style={[styles.text, messageFontStyle, isUser ? styles.userText : styles.aiText]}>
        {segments.map((segment, index) => {
          if (segment.startsWith('**') && segment.endsWith('**') && segment.length >= 4) {
            return (
              <Text key={index} style={styles.boldText}>
                {segment.slice(2, -2)}
              </Text>
            );
          }
          return segment;
        })}
      </Text>
    );
  };

  const renderContent = () => {
    if (!displayText) return null;
    const contentText = status === 'streaming'
      ? displayText.replace(/\*\*/g, '')
      : displayText;

    const codeBlockRegex = /```([\s\S]*?)```/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(contentText)) !== null) {
      if (match.index > lastIndex) {
        elements.push(renderFormattedText(contentText.slice(lastIndex, match.index), `text-${lastIndex}`));
      }

      const rawCode = match[1];
      const lines = rawCode.split('\n');
      const firstLineHasLang = lines.length > 1 && /^[a-zA-Z0-9_-]+$/.test(lines[0].trim());
      const cleanCode = firstLineHasLang ? lines.slice(1).join('\n') : rawCode;

      elements.push(
        <View key={`code-${match.index}`} style={styles.codeBox}>
          {firstLineHasLang && (
            <Text style={styles.codeLangTag}>{lines[0].trim().toUpperCase()}</Text>
          )}
          <Text style={styles.codeText}>{cleanCode.trim()}</Text>
        </View>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < contentText.length) {
      elements.push(renderFormattedText(contentText.slice(lastIndex), `text-${lastIndex}`));
    }

    return elements;
  };

  return (
    <Animated.View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
        animatedContainerStyle,
      ]}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
        {renderContent()}
        {!isUser && status === 'streaming' && Boolean(displayText) && (
          <Text style={styles.streamingCursor}>▍</Text>
        )}
        {!isUser && status === 'cancelled' && (
          <Text style={styles.statusText}>Stopped</Text>
        )}
        {!isUser && status === 'error' && Boolean(error) && (
          <Text style={styles.errorText}>{error}</Text>
        )}
        {actionType === 'payment' && (
          <TouchableOpacity
            style={styles.paymentButton}
            activeOpacity={0.85}
            onPress={() => onActionPress?.(actionUrl)}
          >
            <Text style={styles.paymentButtonText}>Upgrade plan</Text>
          </TouchableOpacity>
        )}
        {!isUser && status === 'error' && retryPrompt && (
          <TouchableOpacity
            style={styles.retryButton}
            activeOpacity={0.85}
            onPress={() => onRetry?.(id, retryPrompt)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
        {!isUser && status !== 'streaming' && Boolean(displayText) && (
          <View style={styles.aiActions}>
            <TouchableOpacity style={styles.aiActionButton} onPress={handleCopy}>
              <Copy size={21} color="#B8B8B8" weight="regular" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.aiActionButton} onPress={() => setLiked(value => !value)}>
              <ThumbsUp size={21} color={isLiked ? '#F5F5F5' : '#B8B8B8'} weight={isLiked ? 'fill' : 'regular'} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.aiActionButton} onPress={handleSpeak}>
              <SpeakerHigh size={21} color="#B8B8B8" weight="regular" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.aiActionButton} onPress={handleShare}>
              <ArrowUpRight size={21} color="#B8B8B8" weight="regular" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.aiActionButton} onPress={handleMoreActions}>
              <DotsThreeVertical size={21} color="#B8B8B8" weight="bold" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 22,
    marginVertical: 10,
    flexDirection: 'row',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  aiContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  userBubble: {
    maxWidth: '72%',
    minHeight: 50,
    backgroundColor: '#3A3A3A',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBubble: {
    maxWidth: '100%',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  text: {
    ...font.regular,
    fontSize: 16.5,
    lineHeight: 26,
    letterSpacing: 0.1,
  },
  userText: {
    color: '#F5F5F5',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
  },
  aiText: {
    color: '#F5F5F5',
  },
  boldText: {
    ...font.bold,
    color: '#FFFFFF',
  },
  codeBox: {
    backgroundColor: '#151515',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  codeLangTag: {
    ...font.black,
    fontSize: 10,
    color: '#A3A3A3',
    marginBottom: 6,
    letterSpacing: 0.6,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : fonts.mono,
    fontSize: 13,
    color: '#E5E5E5',
    lineHeight: 19,
  },
  paymentButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
  },
  paymentButtonText: {
    ...font.black,
    color: '#0A0A0A',
    fontSize: 13,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4A4A4A',
    backgroundColor: '#181818',
  },
  retryButtonText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 13,
  },
  streamingCursor: {
    ...font.regular,
    color: '#F5F5F5',
    fontSize: 16,
    marginTop: 2,
  },
  statusText: {
    ...font.bold,
    color: '#9A9A9A',
    fontSize: 12,
    marginTop: 16,
  },
  errorText: {
    ...font.bold,
    color: '#FCA5A5',
    fontSize: 12,
    marginTop: 8,
  },
  aiActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  aiActionButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
});

export default React.memo(MessageBubble);
