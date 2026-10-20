import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { loginUser } from '../authApi';

export const LoginScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const handleLogin = async () => {
    if (!email.trim()) {
      setErrors({ email: 'Email address is required' });
      return;
    }
    if (!password) {
      setErrors({ password: 'Password is required' });
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      await loginUser({
        email: email.trim(),
        password: password,
      });

      navigation.replace('MainApp');
    } catch (err: any) {
      Alert.alert('Login Failed', err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/gajasaviya_logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.heroTitle}>GAJASAVIYA</Text>
            <Text style={styles.heroSubtitle}>
              Human-Elephant Coexistence & Early Warning System
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome Back</Text>
            <Text style={styles.cardSubtitle}>
              Sign in to view real-time elephant danger zones and alerts
            </Text>

            {/* Input Fields */}
            <AppInput
              label="Email Address or Phone"
              placeholder="e.g. user@gajasaviya.lk"
              leftIcon="mail-outline"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <AppInput
              label="Password"
              placeholder="Enter your password"
              leftIcon="lock-closed-outline"
              isPassword
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password)
                  setErrors((e) => ({ ...e, password: undefined }));
              }}
              error={errors.password}
            />

            {/* Options Row */}
            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.rememberMe}
                onPress={() => setRememberMe(!rememberMe)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={rememberMe ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={rememberMe ? Theme.colors.primary : Theme.colors.textLight}
                />
                <Text style={styles.rememberText}>Remember me</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <AppButton
              title="Sign In"
              icon="log-in-outline"
              onPress={handleLogin}
              loading={loading}
              size="large"
              style={{ marginTop: Theme.spacing.s }}
            />

            {/* Create Account Link */}
            <View style={styles.registerRow}>
              <Text style={styles.noAccountText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.registerHighlight}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Emergency Contact Footer */}
          <View style={styles.emergencyFooter}>
            <Ionicons name="call" size={14} color="#D32F2F" />
            <Text style={styles.emergencyText}>
              Emergency Elephant Encounter Hotline: <Text style={styles.boldRed}>1992</Text> (DWC)
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D2818',
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  heroSection: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 20,
    backgroundColor: '#0D2818',
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#2E7D32',
    ...Theme.shadows.medium,
    marginBottom: 14,
    padding: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 3,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A5D6A7',
    textAlign: 'center',
  },
  card: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 24,
    ...Theme.shadows.large,
    flex: 1,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Theme.colors.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: -4,
  },
  rememberMe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rememberText: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
  },
  forgotText: {
    fontSize: 13,
    color: Theme.colors.primary,
    fontWeight: '600',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  noAccountText: {
    fontSize: 14,
    color: Theme.colors.textSecondary,
  },
  registerHighlight: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.primary,
  },
  emergencyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFF0F0',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    gap: 8,
  },
  emergencyText: {
    fontSize: 12,
    color: '#B71C1C',
    fontWeight: '500',
  },
  boldRed: {
    fontWeight: '800',
    color: '#D32F2F',
  },
});
