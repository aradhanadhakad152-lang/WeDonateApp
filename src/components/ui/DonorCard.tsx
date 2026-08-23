import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { User } from '../../types/user.types';
import { BloodGroupBadge } from './BloodGroupBadge';
import { StatusBadge } from './StatusBadge';
import { COLORS, SHADOWS } from '../../theme/colors';

interface DonorCardProps {
  donor: Partial<User>;
  distance?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export const DonorCard: React.FC<DonorCardProps> = ({ donor, distance, onPress, style }) => {
  const name = donor.fullName || donor.name || 'Blood Donor';
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'BD';
  const bloodGroup = donor.bloodGroup || 'A+';
  const city = donor.location?.city || 'New Delhi';
  const isAvailable = donor.isAvailable ?? donor.donorStatus === 'AVAILABLE';

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>

      <View style={styles.infoBox}>
        <View style={styles.nameRow}>
          <Text style={styles.nameText}>{name}</Text>
          <StatusBadge status={isAvailable ? 'AVAILABLE' : 'OFFLINE'} />
        </View>
        <Text style={styles.cityText}>📍 {city} {distance ? `• ${distance}` : ''}</Text>
      </View>

      <BloodGroupBadge bloodGroup={bloodGroup} size="sm" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    marginBottom: 10,
    ...SHADOWS.sm,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  infoBox: {
    flex: 1,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  cityText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
