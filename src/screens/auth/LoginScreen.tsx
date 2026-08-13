import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Input from '../../components/Input';
import Button from '../../components/Button';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setCredentials, setError } from '../../store/authSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analytics } from '../../services/firebase';
import api from '../../services/api';
import { font } from '../../theme/typography';

type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'>;
};

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();
  const error = useAppSelector(state => state.auth.error);

  const handleLogin = async () => {
    if (!email || !password) {
      dispatch(setError('Please fill in both email and password'));
      return;
    }

    dispatch(setError(null));
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { token, user } = response.data;

      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      dispatch(setCredentials({ user, token }));
      analytics.logEvent('login_success', { method: 'email' });
    } catch (err: any) {
      dispatch(setError(err.response?.data?.detail || 'Login failed. Check server.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.orbOne} />
        <View style={styles.orbTwo} />

        <View style={styles.logoMark}>
          <Text style={styles.logoText}>NOVA</Text>
          <View style={styles.logoDot} />
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>Welcome back</Text>
          <Text style={styles.title}>Sign in to NOVA</Text>
          <Text style={styles.subtitle}>Continue your AI workspace with live Groq-powered replies.</Text>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <View style={styles.buttonContainer}>
            <Button
              title="Login"
              onPress={handleLogin}
              loading={loading}
            />
            <Button
              title="Create an account"
              variant="secondary"
              onPress={() => navigation.navigate('Register')}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#010907',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  orbOne: {
    position: 'absolute',
    top: 80,
    right: -72,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(0, 117, 75, 0.16)',
  },
  orbTwo: {
    position: 'absolute',
    bottom: 80,
    left: -90,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(0, 117, 75, 0.12)',
  },
  logoMark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  logoText: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 27,
    letterSpacing: 5,
  },
  logoDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: 10,
    backgroundColor: '#34D399',
  },
  card: {
    padding: 22,
    borderRadius: 30,
    backgroundColor: 'rgba(3, 24, 18, 0.92)',
    borderWidth: 0,
    borderColor: '#39D996',
    shadowColor: '#34D399',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  eyebrow: {
    ...font.black,
    color: '#4ADEA2',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  title: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 31,
    lineHeight: 37,
    marginBottom: 8,
  },
  subtitle: {
    ...font.regular,
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 22,
  },
  errorBanner: {
    ...font.bold,
    color: '#F5F5F5',
    backgroundColor: '#181818',
    borderWidth: 0,
    borderColor: '#3A3A3A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 16,
  },
  buttonContainer: {
    marginTop: 8,
    gap: 12,
  },
});

export default LoginScreen;
