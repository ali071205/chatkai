import React, { useEffect } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setCredentials, setLoading } from '../store/authSlice';
import api from '../services/api';

const MyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
  },
};

const RootNavigator = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, isLoading } = useAppSelector((state) => state.auth);

  useEffect(() => {
    // Check if token exists in AsyncStorage to auto-login
    const bootstrapAsync = async () => {
      try {
        const userToken = await AsyncStorage.getItem('userToken');
        if (userToken) {
          const response = await api.get('/auth/me');
          await AsyncStorage.setItem('user', JSON.stringify(response.data));
          dispatch(
            setCredentials({
              user: response.data,
              token: userToken,
            })
          );
        }
      } catch {
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('user');
      } finally {
        dispatch(setLoading(false));
      }
    };

    bootstrapAsync();
  }, [dispatch]);

  if (isLoading) {
    // Show splash/loading screen while checking auth
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F5F5F5" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={MyDarkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      {isAuthenticated ? <AppNavigator /> : <AuthNavigator />}

    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
});

export default RootNavigator;
