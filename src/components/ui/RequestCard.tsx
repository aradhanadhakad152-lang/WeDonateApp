import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { BloodRequest } from '../../types/request.types';
import { BloodGroupBadge } from './BloodGroupBadge';
import { StatusBadge } from './StatusBadge';
import { COLORS, SHADOWS } from '../../theme/colors';

interface RequestCardProps {
  request: BloodRequest;
  onPress?: () => void;
  style?: ViewStyle;
}

export const RequestCard: React.FC<RequestCardProps> = ({ request, onPress, style }) => {
  return (
    <TouchableOpacity
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <BloodGroupBadge bloodGroup={request.bloodGroup} size="md" />
        <View style={styles.titleBox}>
          <Text style={styles.patientName}>{request.patientName}</Text>
          <Text style={styles.hospitalText}>{request.hospitalName}</Text>
        </View>
        <StatusBadge status={request.status} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.infoText}>📍 {request.hospitalAddress || 'New Delhi'}</Text>
        <Text style={styles.unitsText}>🩸 {request.unitsRequired} Unit(s)</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleBox: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  hospitalText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderColor,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  unitsText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
