import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRequestStore } from '../../store/requestStore';
import { useUserStore } from '../../store/userStore';
import { useMatchStore } from '../../store/matchStore';
import { BloodRequest } from '../../types/request.types';
import { COLORS, SHADOWS } from '../../theme/colors';

interface RequestDetailsScreenProps {
  request: BloodRequest;
  onBack: () => void;
}

export const RequestDetailsScreen: React.FC<RequestDetailsScreenProps> = ({ request, onBack }) => {
  const { profile } = useUserStore();
  const { cancelUserRequest, isLoading } = useRequestStore();
  const { matches, fetchMatchesForRequest, runMatchingEngine, isMatching } = useMatchStore();

  useEffect(() => {
    fetchMatchesForRequest(request.id);
  }, [fetchMatchesForRequest, request.id]);

  const isCreator = profile?.id === (typeof request.createdBy === 'string' ? request.createdBy : (request as any).requesterId?._id || (request as any).requesterId);
  const canCancel = isCreator && ['OPEN', 'MATCHING'].includes(request.status);

  const handleRunMatching = async () => {
    try {
      const count = await runMatchingEngine(request.id, 10);
      Alert.alert('Donor Matching Engine', `Found and assigned ${count} new compatible donor(s) within 10 km.`);
    } catch (err: any) {
      Alert.alert('Matching Error', err?.response?.data?.message || 'Failed to find nearby donors.');
    }
  };

  const handleCancelPress = () => {
    Alert.alert('Cancel Blood Request', 'Are you sure you want to cancel this emergency blood request?', [
      { text: 'Keep Active', style: 'cancel' },
      {
        text: 'Cancel Request',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelUserRequest(request.id);
            Alert.alert('Request Cancelled', 'The blood request status has been updated to CANCELLED.');
            onBack();
          } catch (err: any) {
            Alert.alert('Cancellation Error', err?.response?.data?.message || 'Failed to cancel request.');
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return COLORS.success;
      case 'MATCHING': return COLORS.info;
      case 'ACCEPTED': return COLORS.purple;
      case 'FULFILLED': return COLORS.success;
      case 'CANCELLED': return COLORS.danger;
      case 'EXPIRED': return COLORS.textMuted;
      default: return COLORS.textMuted;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Navigation Header */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Request Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main Request Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.bloodBadge}>
            <Text style={styles.bloodBadgeText}>{request.bloodGroup}</Text>
          </View>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.patientName}>{request.patientName}</Text>
            <Text style={styles.unitsText}>{request.unitsRequired} Unit(s) Required</Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: getStatusColor(request.status) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(request.status) }]}>{request.status}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Urgency & Hospital Info */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Urgency Level:</Text>
          <Text style={[styles.infoValue, { color: request.urgency === 'CRITICAL' ? COLORS.danger : COLORS.warning }]}>
            {request.urgency}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Hospital:</Text>
          <Text style={styles.infoValue}>{request.hospitalName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Address:</Text>
          <Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]}>{request.hospitalAddress}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Contact Phone:</Text>
          <Text style={[styles.infoValue, { color: COLORS.info }]}>{request.contactPhone}</Text>
        </View>

        {!!request.reason && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Reason / Medical Notes:</Text>
            <Text style={styles.notesText}>{request.reason}</Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.timestampText}>
          Created on: {new Date(request.createdAt).toLocaleString()}
        </Text>
      </View>

      {/* Trigger Donor Matching Engine */}
      {isCreator && ['OPEN', 'MATCHING'].includes(request.status) && (
        <TouchableOpacity style={styles.matchingBtn} onPress={handleRunMatching} disabled={isMatching}>
          {isMatching ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.matchingBtnText}>🔍 Find Nearby Compatible Donors (10km)</Text>}
        </TouchableOpacity>
      )}

      {/* Matched Donors Section */}
      {matches.length > 0 && (
        <View style={styles.matchedSection}>
          <Text style={styles.sectionHeader}>Matched Donors ({matches.length})</Text>
          {matches.map((m) => (
            <View key={m.id} style={styles.matchItem}>
              <View style={styles.matchAvatar}>
                <Text style={styles.matchAvatarText}>{(m.donor?.fullName || m.donor?.name || 'D').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.matchDonorName}>{m.donor?.fullName || m.donor?.name || 'Donor'}</Text>
                <Text style={styles.matchDistance}>📍 {m.formattedDistance} ({m.donorBloodGroup})</Text>
              </View>
              <View style={[styles.matchStatusBadge, m.status === 'ACCEPTED' && { backgroundColor: COLORS.success }]}>
                <Text style={styles.matchStatusText}>{m.status}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Cancel Action Button */}
      {canCancel && (
        <TouchableOpacity style={styles.cancelButton} onPress={handleCancelPress} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.cancelButtonText}>❌ Cancel Blood Request</Text>}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgMain },
  content: { padding: 20, paddingTop: 45 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.borderColor, marginBottom: 20, ...SHADOWS.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bloodBadge: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: '#FFA3A3', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 14 },
  bloodBadgeText: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  headerTitleContainer: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  unitsText: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: COLORS.borderColor, marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoLabel: { fontSize: 13, color: COLORS.textMuted },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  notesBox: { backgroundColor: COLORS.bgMain, borderRadius: 10, padding: 12, marginTop: 10 },
  notesLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
  notesText: { fontSize: 13, color: COLORS.textMain },
  timestampText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },
  matchingBtn: { backgroundColor: COLORS.info, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  matchingBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  matchedSection: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: COLORS.borderColor, marginBottom: 20, ...SHADOWS.sm },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, marginBottom: 12, textTransform: 'uppercase' },
  matchItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgMain, padding: 12, borderRadius: 10, marginBottom: 8 },
  matchAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  matchAvatarText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  matchDonorName: { color: COLORS.secondary, fontWeight: '700', fontSize: 14 },
  matchDistance: { color: COLORS.info, fontSize: 12, marginTop: 2 },
  matchStatusBadge: { backgroundColor: COLORS.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  matchStatusText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  cancelButton: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.danger, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  cancelButtonText: { color: COLORS.danger, fontSize: 15, fontWeight: '700' },
});
