import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../../theme/colors';

interface StatusBadgeProps {
  status: string;
  style?: ViewStyle;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, style }) => {
  const getColors = () => {
    switch (status.toUpperCase()) {
      case 'OPEN':
      case 'AVAILABLE':
        return { bg: COLORS.successLight, text: COLORS.success };
      case 'MATCHING':
      case 'HIGH':
        return { bg: COLORS.infoLight, text: COLORS.info };
      case 'ACCEPTED':
        return { bg: COLORS.purpleLight, text: COLORS.purple };
      case 'FULFILLED':
        return { bg: COLORS.successLight, text: COLORS.success };
      case 'CANCELLED':
      case 'CRITICAL':
        return { bg: COLORS.primaryLight, text: COLORS.danger };
      default:
        return { bg: '#F1F5F9', text: COLORS.textMuted };
    }
  };

  const { bg, text } = getColors();

  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: text }]}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
