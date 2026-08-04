import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANDROID_HOST = '10.249.229.29';

export const API_BASE_URL = Platform.OS === 'android'
  ? `http://${ANDROID_HOST}:8010`
  : 'http://localhost:8010';

let inMemoryToken: string | null = null;

export const setAuthTokenCache = (token: string | null) => {
  inMemoryToken = token;
};

export const getWebSocketUrl = (token: string) => {
  const websocketBaseUrl = API_BASE_URL.replace(/^http/, 'ws');
  return `${websocketBaseUrl}/ws/chat?token=${encodeURIComponent(token)}`;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    if (!inMemoryToken) {
      inMemoryToken = await AsyncStorage.getItem('userToken');
    }
    if (inMemoryToken && config.headers) {
      config.headers.Authorization = `Bearer ${inMemoryToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response && error.response.status === 401) {
      inMemoryToken = null;
      await AsyncStorage.removeItem('userToken');
      await AsyncStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export default api;
