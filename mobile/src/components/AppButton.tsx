import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  type?: 'primary' | 'secondary' | 'accent' | 'outline' | 'clear' | 'danger';
  size?: 'small' | 'medium' | 'large';
}

export const AppButton: React.FC<ButtonProps> = ({
  title,
  onPress,
  loading,
  disabled,
  style,
  textStyle,
  icon,
  iconPosition = 'left',
  type = 'primary',
  size = 'medium',
}) => {
  const getContainerStyle = () => {
    switch (type) {
      case 'secondary':
        return styles.secondaryContainer;
      case 'accent':
        return styles.accentContainer;
      case 'outline':
        return styles.outlineContainer;
      case 'clear':
        return styles.clearContainer;
      case 'danger':
        return styles.dangerContainer;
      default:
        return styles.primaryContainer;
    }
  };

  const getTextStyle = () => {
    switch (type) {
      case 'outline':
        return styles.outlineText;
      case 'clear':
        return styles.clearText;
      default:
        return styles.solidText;
    }
  };

  const getSizeStyle = () => {
    switch (size) {
      case 'small':
        return styles.sizeSmall;
      case 'large':
        return styles.sizeLarge;
      default:
        return styles.sizeMedium;
    }
  };

  const getIconColor = () => {
    if (type === 'outline' || type === 'clear') {
      return Theme.colors.primary;
    }
    return '#FFFFFF';
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.base,
        getSizeStyle(),
        getContainerStyle(),
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <View style={styles.contentRow}>
          <ActivityIndicator
            size="small"
            color={type === 'outline' || type === 'clear' ? Theme.colors.primary : '#FFFFFF'}
          />
          <Text style={[styles.text, getTextStyle(), { marginLeft: 8 }, textStyle]}>
            Processing...
          </Text>
        </View>
      ) : (
        <View style={styles.contentRow}>
          {icon && iconPosition === 'left' && (
            <Ionicons
              name={icon}
              size={size === 'small' ? 16 : 18}
              color={getIconColor()}
              style={{ marginRight: 8 }}
            />
          )}
          <Text style={[styles.text, getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Ionicons
              name={icon}
              size={size === 'small' ? 16 : 18}
              color={getIconColor()}
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: Theme.borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Theme.spacing.xs,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeSmall: {
    paddingVertical: 8,
    paddingHorizontal: Theme.spacing.m,
  },
  sizeMedium: {
    paddingVertical: 14,
    paddingHorizontal: Theme.spacing.l,
  },
  sizeLarge: {
    paddingVertical: 18,
    paddingHorizontal: Theme.spacing.xl,
  },
  primaryContainer: {
    backgroundColor: Theme.colors.primary,
    ...Theme.shadows.small,
  },
  secondaryContainer: {
    backgroundColor: Theme.colors.secondary,
    ...Theme.shadows.small,
  },
  accentContainer: {
    backgroundColor: Theme.colors.accent,
    ...Theme.shadows.small,
  },
  dangerContainer: {
    backgroundColor: Theme.colors.danger,
    ...Theme.shadows.small,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Theme.colors.primary,
  },
  clearContainer: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  solidText: {
    color: '#FFFFFF',
  },
  outlineText: {
    color: Theme.colors.primary,
  },
  clearText: {
    color: Theme.colors.primary,
  },
});
