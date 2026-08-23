import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../../theme/colors';

interface BloodGroupBadgeProps {
  bloodGroup: string;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

export const BloodGroupBadge: React.FC<BloodGroupBadgeProps> = ({ bloodGroup, size = 'md', style }) => {
  return (
    <View style={[styles.badge, size === 'sm' && styles.sm, size === 'lg' && styles.lg, style]}>
      <Text style={[styles.text, size === 'sm' && styles.textSm, size === 'lg' && styles.textLg]}>
        {bloodGroup}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: '#FFA3A3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lg: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  text: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.primary,
  },
  textSm: {
    fontSize: 12,
  },
  textLg: {
    fontSize: 22,
  },
});
