import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/home/HomeScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import BillingScreen from '../screens/billing/BillingScreen';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  return (
    <Stack.Navigator 
      initialRouteName="Home"
      screenOptions={{
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#F8FAFC',
        headerShadowVisible: false,
        headerBackTitle: '',
        headerTitleAlign: 'left',
        headerTitleStyle: { fontWeight: '800' },
        headerLargeTitle: false,
      }}
    >
      <Stack.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{ title: 'NOVA' }} 
      />
      <Stack.Screen 
        name="Chat" 
        component={ChatScreen} 
        options={{ title: 'NOVA' }} 
      />
      <Stack.Screen
        name="Billing"
        component={BillingScreen}
        options={{ title: 'NOVA plans' }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
