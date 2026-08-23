import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { COLORS, SHADOWS } from '../../theme/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'coral' | 'dark' | 'outline' | 'secondary';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  isLoading = false,
  disabled = false,
  variant = 'coral',
  style,
  textStyle,
  icon,
}) => {
  const getButtonStyle = () => {
    switch (variant) {
      case 'dark':
        return styles.btnDark;
      case 'outline':
        return styles.btnOutline;
      case 'secondary':
        return styles.btnSecondary;
      default:
        return styles.btnCoral;
    }
  };

  const getTextStyle = () => {
    switch (variant) {
      case 'outline':
        return styles.textOutline;
      case 'secondary':
        return styles.textSecondary;
      default:
        return styles.textCoral;
    }
  };

  return (
    <TouchableOpacity
      style={[styles.btnBase, getButtonStyle(), (disabled || isLoading) && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.85}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === 'outline' ? COLORS.primary : '#FFFFFF'} />
      ) : (
        <Text style={[styles.textBase, getTextStyle(), textStyle]}>
          {title} {icon ? icon : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btnBase: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnCoral: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.md,
  },
  btnDark: {
    backgroundColor: COLORS.secondary,
  },
  btnSecondary: {
    backgroundColor: COLORS.primaryLight,
  },
  btnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  disabled: {
    opacity: 0.6,
  },
  textBase: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  textCoral: {
    color: '#FFFFFF',
  },
  textOutline: {
    color: COLORS.primary,
  },
  textSecondary: {
    color: COLORS.primary,
  },
});
