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
import { requestPasswordReset, resetPasswordWithOtp } from '../authApi';

export const ForgotPasswordScreen = ({ navigation }: any) => {
  const [resetMethod, setResetMethod] = useState<'email' | 'phone'>('email');
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSendCode = async () => {
    if (!emailOrPhone.trim()) {
      setError(
        resetMethod === 'email'
          ? 'Please enter your registered email'
          : 'Please enter your registered mobile number'
      );
      return;
    }
    setError(undefined);
    setLoading(true);

    try {
      const res = await requestPasswordReset(emailOrPhone.trim());
      setStep('verify');
      Alert.alert(
        'Verification Code Sent',
        res.message || `A 6-digit recovery code has been sent to ${emailOrPhone}. Check your inbox.`
      );
    } catch (err: any) {
      setError(err.message || 'Could not send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!otpCode.trim()) {
      setError('Please enter the 6-digit verification code');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(undefined);
    setLoading(true);

    try {
      await resetPasswordWithOtp({
        email: emailOrPhone.trim(),
        otp_code: otpCode.trim(),
        new_password: newPassword,
      });

      Alert.alert(
        'Password Reset Successful',
        'Your password has been updated in the database. You can now sign in with your new credentials.',
        [
          {
            text: 'Back to Sign In',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
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

            <Text style={styles.headerTitle}>Reset Password</Text>
            <Text style={styles.headerSubtitle}>
              {step === 'request'
                ? 'Recover access to your Gajasaviya alert account'
                : 'Enter your verification code and new password'}
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {step === 'request' ? (
              <>
                <Text style={styles.sectionLabel}>Select Recovery Method</Text>
                <View style={styles.methodToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.methodTab,
                      resetMethod === 'email' && styles.methodTabActive,
                    ]}
                    onPress={() => {
                      setResetMethod('email');
                      setError(undefined);
                    }}
                  >
                    <Ionicons
                      name="mail"
                      size={16}
                      color={resetMethod === 'email' ? '#FFFFFF' : Theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.methodTabText,
                        resetMethod === 'email' && styles.methodTabTextActive,
                      ]}
                    >
                      Email Address
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.methodTab,
                      resetMethod === 'phone' && styles.methodTabActive,
                    ]}
                    onPress={() => {
                      setResetMethod('phone');
                      setError(undefined);
                    }}
                  >
                    <Ionicons
                      name="call"
                      size={16}
                      color={resetMethod === 'phone' ? '#FFFFFF' : Theme.colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.methodTabText,
                        resetMethod === 'phone' && styles.methodTabTextActive,
                      ]}
                    >
                      SMS Mobile
                    </Text>
                  </TouchableOpacity>
                </View>

                <AppInput
                  label={
                    resetMethod === 'email'
                      ? 'Registered Email Address'
                      : 'Registered Mobile Phone'
                  }
                  placeholder={
                    resetMethod === 'email'
                      ? 'e.g. user@gajasaviya.lk'
                      : 'e.g. 077 123 4567'
                  }
                  leftIcon={resetMethod === 'email' ? 'mail-outline' : 'call-outline'}
                  value={emailOrPhone}
                  onChangeText={(t) => {
                    setEmailOrPhone(t);
                    if (error) setError(undefined);
                  }}
                  keyboardType={resetMethod === 'email' ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  error={error}
                  hint="We will send a 6-digit one-time passcode"
                />

                <AppButton
                  title="Send Verification Code"
                  icon="send-outline"
                  onPress={handleSendCode}
                  loading={loading}
                  size="large"
                  style={{ marginTop: Theme.spacing.s }}
                />
              </>
            ) : (
              <>
                <View style={styles.codeSentBanner}>
                  <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
                  <Text style={styles.codeSentText}>
                    Code sent to <Text style={{ fontWeight: '700' }}>{emailOrPhone}</Text>
                  </Text>
                </View>

                <AppInput
                  label="6-Digit Verification Code"
                  placeholder="Enter code (e.g. 123456)"
                  leftIcon="key-outline"
                  value={otpCode}
                  onChangeText={(t) => {
                    setOtpCode(t);
                    if (error) setError(undefined);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                />

                <AppInput
                  label="New Password"
                  placeholder="Minimum 6 characters"
                  leftIcon="lock-closed-outline"
                  isPassword
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    if (error) setError(undefined);
                  }}
                />

                <AppInput
                  label="Confirm New Password"
                  placeholder="Re-enter new password"
                  leftIcon="lock-closed-outline"
                  isPassword
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    if (error) setError(undefined);
                  }}
                  error={error}
                />

                <AppButton
                  title="Update Password"
                  icon="shield-checkmark-outline"
                  onPress={handleResetPassword}
                  loading={loading}
                  size="large"
                  style={{ marginTop: Theme.spacing.s }}
                />

                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={() => {
                    setStep('request');
                    setError(undefined);
                  }}
                >
                  <Text style={styles.resendText}>Change email / phone or resend code</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Back to Sign In Link */}
            <View style={styles.loginRow}>
              <Text style={styles.alreadyText}>Remember your password? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginHighlight}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Emergency Footer */}
          <View style={styles.emergencyFooter}>
            <Ionicons name="call" size={14} color="#D32F2F" />
            <Text style={styles.emergencyText}>
              DWC Emergency Encounter Hotline: <Text style={styles.boldRed}>1992</Text>
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
    paddingHorizontal: 12,
    lineHeight: 16,
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: 8,
  },
  methodToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.medium,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    gap: 6,
  },
  methodTabActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  methodTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  methodTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  codeSentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: Theme.borderRadius.medium,
    gap: 8,
    marginBottom: 14,
  },
  codeSentText: {
    fontSize: 12,
    color: '#1B5E20',
    flex: 1,
  },
  resendButton: {
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 6,
  },
  resendText: {
    fontSize: 12,
    color: Theme.colors.primary,
    fontWeight: '600',
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
