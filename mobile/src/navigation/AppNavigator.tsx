import React, { useState } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { DangerMapScreen } from '../screens/DangerMapScreen';
import { TrackerScreen } from '../screens/TrackerScreen';
import { SafeRoadsScreen } from '../screens/SafeRoadsScreen';
import { PathGuardScreen } from '../screens/PathGuardScreen';
import { AnimatedSplashScreen } from '../components/AnimatedSplashScreen';
import { Theme } from '../theme';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 10);
  const tabHeight = 56 + bottomPadding;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';

          if (route.name === 'Home') iconName = focused ? 'compass' : 'compass-outline';
          else if (route.name === 'Danger Map') iconName = focused ? 'map' : 'map-outline';
          else if (route.name === 'Tracker') iconName = focused ? 'radio' : 'radio-outline';
          else if (route.name === 'Path Guard') iconName = focused ? 'shield-half' : 'shield-half-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          return (
            <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
              <Ionicons name={iconName} size={focused ? 22 : 20} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: Theme.colors.primary,
        tabBarInactiveTintColor: '#8A9E96',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: -2,
          marginBottom: 2,
        },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2EBE5',
          borderTopWidth: 1,
          height: tabHeight,
          paddingTop: 6,
          paddingBottom: bottomPadding,
          ...Theme.shadows.medium,
        },
        headerStyle: {
          backgroundColor: '#0D2818',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(46, 125, 50, 0.3)',
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
          letterSpacing: 0.5,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
          tabBarLabel: 'Dashboard',
        }}
      />
      <Tab.Screen
        name="Danger Map"
        component={DangerMapScreen}
        options={{
          title: 'Risk Heatmap',
          tabBarLabel: 'Heatmap',
        }}
      />
      <Tab.Screen
        name="Tracker"
        component={TrackerScreen}
        options={{
          title: 'Tracker & Corridors',
          tabBarLabel: 'Tracker',
        }}
      />
      <Tab.Screen
        name="Path Guard"
        component={PathGuardScreen}
        options={{
          title: 'Path Guard AI',
          tabBarLabel: 'Path Guard',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'My Profile & Alerts',
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

export const AppNavigator = () => {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'fade',
          }}
          initialRouteName="Auth"
        >
          <Stack.Screen name="Auth" component={AuthStack} />
          <Stack.Screen name="MainApp" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>

      {showSplash && (
        <AnimatedSplashScreen
          minDuration={2200}
          onFinish={() => setShowSplash(false)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  tabIconContainer: {
    width: 36,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  tabIconContainerActive: {
    backgroundColor: '#E8F5E9',
  },
});
