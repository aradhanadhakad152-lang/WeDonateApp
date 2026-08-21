import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRequestStore } from '../../store/requestStore';
import { useUserStore } from '../../store/userStore';
import { useMatchStore } from '../../store/matchStore';
import { BloodRequest } from '../../types/request.types';

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
      case 'OPEN': return '#22C55E';
      case 'MATCHING': return '#38BDF8';
      case 'ACCEPTED': return '#8B5CF6';
      case 'FULFILLED': return '#10B981';
      case 'CANCELLED': return '#EF4444';
      case 'EXPIRED': return '#64748B';
      default: return '#94A3B8';
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
          <Text style={styles.infoLabel}>Urgency:</Text>
          <Text style={[styles.infoValue, { color: request.urgency === 'CRITICAL' ? '#EF4444' : '#F59E0B' }]}>
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
          <Text style={[styles.infoValue, { color: '#38BDF8' }]}>{request.contactPhone}</Text>
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
              <View style={[styles.matchStatusBadge, m.status === 'ACCEPTED' && { backgroundColor: '#22C55E' }]}>
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
  container: { flex: 1, backgroundColor: '#0F172A' },
  content: { padding: 20, paddingTop: 50 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backText: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9' },
  card: { backgroundColor: '#1E293B', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bloodBadge: { backgroundColor: 'rgba(220, 38, 38, 0.15)', borderWidth: 1, borderColor: '#DC2626', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 14 },
  bloodBadgeText: { fontSize: 20, fontWeight: '800', color: '#DC2626' },
  headerTitleContainer: { flex: 1 },
  patientName: { fontSize: 18, fontWeight: '700', color: '#F1F5F9' },
  unitsText: { fontSize: 13, color: '#94A3B8', marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoLabel: { fontSize: 14, color: '#94A3B8' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#F1F5F9' },
  notesBox: { backgroundColor: '#0F172A', borderRadius: 10, padding: 12, marginTop: 10 },
  notesLabel: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  notesText: { fontSize: 13, color: '#CBD5E1' },
  timestampText: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 4 },
  matchingBtn: { backgroundColor: '#38BDF8', borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  matchingBtnText: { color: '#0F172A', fontSize: 14, fontWeight: '700' },
  matchedSection: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginBottom: 12, textTransform: 'uppercase' },
  matchItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0F172A', padding: 12, borderRadius: 10, marginBottom: 8 },
  matchAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  matchAvatarText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  matchDonorName: { color: '#F1F5F9', fontWeight: '600', fontSize: 14 },
  matchDistance: { color: '#38BDF8', fontSize: 12, marginTop: 2 },
  matchStatusBadge: { backgroundColor: '#334155', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  matchStatusText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  cancelButton: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: '#EF4444', borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  cancelButtonText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
});
