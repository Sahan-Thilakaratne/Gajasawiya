import React, { useState, forwardRef, memo } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  isPassword?: boolean;
  hint?: string;
}

export const AppInput = memo(
  forwardRef<TextInput, InputProps>(
    (
      {
        label,
        error,
        leftIcon,
        isPassword,
        secureTextEntry,
        hint,
        style,
        onFocus,
        onBlur,
        autoCapitalize = 'none',
        autoCorrect = false,
        ...props
      },
      ref
    ) => {
      const [isFocused, setIsFocused] = useState(false);
      const [showPassword, setShowPassword] = useState(false);

      const isSecured = isPassword ? !showPassword : (secureTextEntry ?? false);

      return (
        <View style={styles.container}>
          {label && <Text style={styles.label}>{label}</Text>}

          <View
            style={[
              styles.inputWrapper,
              isFocused ? styles.inputWrapperFocused : null,
              error ? styles.inputWrapperError : null,
            ]}
          >
            {leftIcon && (
              <Ionicons
                name={leftIcon}
                size={20}
                color={
                  error
                    ? Theme.colors.error
                    : isFocused
                    ? Theme.colors.primary
                    : Theme.colors.textLight
                }
                style={styles.leftIcon}
              />
            )}

            <TextInput
              ref={ref}
              style={[styles.input, style]}
              placeholderTextColor={Theme.colors.textLight}
              secureTextEntry={isSecured}
              autoCapitalize={autoCapitalize}
              autoCorrect={autoCorrect}
              spellCheck={false}
              onFocus={(e) => {
                setIsFocused(true);
                onFocus && onFocus(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                onBlur && onBlur(e);
              }}
              {...props}
            />

            {isPassword && (
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.rightIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Theme.colors.textLight}
                />
              </TouchableOpacity>
            )}
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={Theme.colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : hint ? (
            <Text style={styles.hintText}>{hint}</Text>
          ) : null}
        </View>
      );
    }
  )
);

AppInput.displayName = 'AppInput';

const styles = StyleSheet.create({
  container: {
    marginBottom: Theme.spacing.m,
    width: '100%',
  },
  label: {
    fontSize: 13,
    color: Theme.colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.medium,
    paddingHorizontal: Theme.spacing.m,
    minHeight: 52,
  },
  inputWrapperFocused: {
    borderColor: Theme.colors.primary,
    backgroundColor: '#FFFFFF',
  },
  inputWrapperError: {
    borderColor: Theme.colors.error,
    backgroundColor: '#FFF8F8',
  },
  leftIcon: {
    marginRight: 10,
  },
  rightIcon: {
    padding: 4,
    marginLeft: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Theme.colors.text,
    paddingVertical: Theme.spacing.s,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 4,
  },
  errorText: {
    color: Theme.colors.error,
    fontSize: 12,
    fontWeight: '500',
  },
  hintText: {
    color: Theme.colors.textLight,
    fontSize: 11,
    marginTop: 4,
  },
});
