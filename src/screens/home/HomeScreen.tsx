import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { logout } from '../../store/authSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowRight, ChatCircleText, CheckSquare, Code, Lightbulb, SignOut } from '../../components/icons';
import { font } from '../../theme/typography';

type RootStackParamList = {
  Home: undefined;
  Chat: undefined;
  Billing: undefined;
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);
  const firstName = user?.name?.split(' ')[0] || 'there';

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('user');
    dispatch(logout());
  };

  return (
    <View style={styles.container}>
      <View style={styles.orbOne} />
      <View style={styles.orbTwo} />

      <View style={styles.heroCard}>
        <View style={styles.markRow}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>N</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Groq live</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>Personal AI workspace</Text>
        <Text style={styles.title}>Ready when you are, {firstName}.</Text>
        <Text style={styles.subtitle}>
          Ask, plan, debug, write, or brainstorm with NOVA in a focused chat built for fast answers.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          activeOpacity={0.88}
          onPress={() => navigation.navigate('Chat')}
        >
          <Text style={styles.primaryButtonText}>Start a new chat</Text>
          <ArrowRight size={22} color="#0A0A0A" weight="bold" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.billingButton}
          activeOpacity={0.82}
          onPress={() => navigation.navigate('Billing')}
        >
          <Text style={styles.billingButtonText}>View NOVA plans</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickPanel}>
        <Text style={styles.panelTitle}>What NOVA can help with</Text>
        <View style={styles.chipGrid}>
          <View style={styles.chip}>
            <ChatCircleText size={18} color="#F5F5F5" weight="regular" />
            <Text style={styles.chipText}>Quick answers</Text>
          </View>
          <View style={styles.chip}>
            <Code size={18} color="#F5F5F5" weight="regular" />
            <Text style={styles.chipText}>Code help</Text>
          </View>
          <View style={styles.chip}>
            <Lightbulb size={18} color="#F5F5F5" weight="regular" />
            <Text style={styles.chipText}>Ideas</Text>
          </View>
          <View style={styles.chip}>
            <CheckSquare size={18} color="#F5F5F5" weight="regular" />
            <Text style={styles.chipText}>Tasks</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        activeOpacity={0.75}
        onPress={handleLogout}
      >
        <SignOut size={18} color="#D4D4D4" weight="regular" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
  },
  orbOne: {
    position: 'absolute',
    top: 92,
    right: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  orbTwo: {
    position: 'absolute',
    bottom: 120,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.035)',
  },
  heroCard: {
    marginTop: 34,
    padding: 22,
    borderRadius: 30,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  markRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    ...font.black,
    color: '#061018',
    fontSize: 24,
    fontWeight: '900',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#333333',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#F5F5F5',
    marginRight: 7,
  },
  liveText: {
    ...font.bold,
    color: '#E5E5E5',
    fontSize: 12,
    fontWeight: '800',
  },
  eyebrow: {
    ...font.black,
    color: '#F5F5F5',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 34,
    lineHeight: 40,
    marginBottom: 12,
  },
  subtitle: {
    ...font.regular,
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 26,
  },
  primaryButton: {
    height: 58,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  primaryButtonText: {
    ...font.black,
    color: '#061018',
    fontSize: 17,
  },
  billingButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 7,
  },
  billingButtonText: {
    ...font.bold,
    color: '#B8B8B8',
    fontSize: 13,
  },
  quickPanel: {
    marginTop: 18,
    padding: 18,
    borderRadius: 26,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  panelTitle: {
    ...font.bold,
    color: '#E5EDF8',
    fontSize: 15,
    marginBottom: 14,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#333333',
  },
  chipText: {
    ...font.bold,
    color: '#CBD5E1',
    fontSize: 13,
    marginLeft: 7,
  },
  logoutButton: {
    marginTop: 'auto',
    height: 52,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#111111',
  },
  logoutText: {
    ...font.bold,
    color: '#94A3B8',
    fontSize: 15,
  },
});

export default HomeScreen;
