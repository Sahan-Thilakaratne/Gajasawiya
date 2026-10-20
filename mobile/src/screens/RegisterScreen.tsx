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
import { registerUser } from '../authApi';

export const RegisterScreen = ({ navigation }: any) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const clearError = (field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleRegister = async () => {
    if (!fullName.trim()) {
      setErrors({ fullName: 'Full name is required' });
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrors({ email: 'Valid email address is required' });
      return;
    }
    if (!password || password.length < 6) {
      setErrors({ password: 'Password must be at least 6 characters' });
      return;
    }
    if (password !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    try {
      await registerUser({
        name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password: password,
      });

      Alert.alert(
        'Registration Successful',
        `Welcome to Gajasaviya! A confirmation email has been dispatched to ${email}.`,
        [
          {
            text: 'Go to Dashboard',
            onPress: () => navigation.replace('MainApp'),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || 'Could not register account');
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.logoBadge}>
              <Image
                source={require('../../assets/gajasaviya_logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.headerTitle}>Create Account</Text>
            <Text style={styles.headerSubtitle}>
              Join the Gajasaviya Early Warning Network
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <AppInput
              label="Full Name"
              placeholder="e.g. Kasun Bandara"
              leftIcon="person-outline"
              value={fullName}
              onChangeText={(t) => {
                setFullName(t);
                if (errors.fullName) clearError('fullName');
              }}
              error={errors.fullName}
            />

            <AppInput
              label="Email Address"
              placeholder="e.g. kasun@gmail.com"
              leftIcon="mail-outline"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (errors.email) clearError('email');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            <AppInput
              label="Mobile Number"
              placeholder="e.g. 077 123 4567"
              leftIcon="call-outline"
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                if (errors.phone) clearError('phone');
              }}
              keyboardType="phone-pad"
              error={errors.phone}
            />

            <AppInput
              label="Password"
              placeholder="Min. 6 characters"
              leftIcon="lock-closed-outline"
              isPassword
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                if (errors.password) clearError('password');
              }}
              error={errors.password}
            />

            <AppInput
              label="Confirm Password"
              placeholder="Re-enter password"
              leftIcon="lock-closed-outline"
              isPassword
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                if (errors.confirmPassword) clearError('confirmPassword');
              }}
              error={errors.confirmPassword}
            />

            {/* Register CTA */}
            <AppButton
              title="Create Account"
              icon="checkmark-circle-outline"
              onPress={handleRegister}
              loading={loading}
              size="large"
              style={{ marginTop: Theme.spacing.s }}
            />

            {/* Already have an account */}
            <View style={styles.loginRow}>
              <Text style={styles.alreadyText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.goBack()}>
                <Text style={styles.loginHighlight}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Emergency Footer */}
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
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    backgroundColor: '#0D2818',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#2E7D32',
    marginBottom: 10,
    padding: 6,
    ...Theme.shadows.medium,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12,
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
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  alreadyText: {
    fontSize: 14,
    color: Theme.colors.textSecondary,
  },
  loginHighlight: {
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
