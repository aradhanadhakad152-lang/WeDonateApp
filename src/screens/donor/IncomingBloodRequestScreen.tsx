import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { useMatchStore } from '../../store/matchStore';
import { DonorMatch } from '../../services/matchService';
import { COLORS, SHADOWS } from '../../theme/colors';

interface IncomingBloodRequestScreenProps {
  matchId?: string;
  match?: DonorMatch;
  onBack: () => void;
  onResponded?: () => void;
}

export const IncomingBloodRequestScreen: React.FC<IncomingBloodRequestScreenProps> = ({
  matchId,
  match: initialMatch,
  onBack,
  onResponded,
}) => {
  const { activeMatch, fetchMatchById, respondToDonorMatch, isLoading } = useMatchStore();
  const [currentMatch, setCurrentMatch] = useState<DonorMatch | null>(initialMatch || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (matchId && (!currentMatch || currentMatch.id !== matchId)) {
      fetchMatchById(matchId).then((fetched) => {
        if (fetched) setCurrentMatch(fetched);
      });
    }
  }, [matchId]);

  useEffect(() => {
    if (activeMatch && matchId && activeMatch.id === matchId) {
      setCurrentMatch(activeMatch);
    }
  }, [activeMatch]);

  const targetMatch = currentMatch || initialMatch;

  const handleRespond = async (action: 'ACCEPTED' | 'REJECTED') => {
    if (!targetMatch) return;
    const matchIdToUse = targetMatch.id || (targetMatch as any)._id;

    const actionTitle = action === 'ACCEPTED' ? 'Confirm Donation' : 'Decline Request';
    const actionMsg = action === 'ACCEPTED'
      ? 'Are you available to donate blood for this emergency request?'
      : 'Are you sure you cannot donate for this request?';

    Alert.alert(actionTitle, actionMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action === 'ACCEPTED' ? 'I Can Donate' : 'Not Available',
        style: action === 'ACCEPTED' ? 'default' : 'destructive',
        onPress: async () => {
          setIsSubmitting(true);
          try {
            const updated = await respondToDonorMatch(matchIdToUse, action);
            setCurrentMatch(updated);
            Alert.alert(
              action === 'ACCEPTED' ? 'Thank You! ❤️' : 'Request Declined',
              action === 'ACCEPTED'
                ? 'Your acceptance has been communicated to the requester.'
                : 'You have declined this donation opportunity.'
            );
            if (onResponded) onResponded();
          } catch (err: any) {
            const errorMsg = err?.response?.data?.message || 'Failed to submit response. Please try again.';
            Alert.alert('Action Failed', errorMsg);
          } finally {
            setIsSubmitting(false);
          }
        },
      },
    ]);
  };

  if (isLoading && !targetMatch) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Emergency Request Details...</Text>
      </View>
    );
  }

  if (!targetMatch) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Request Not Found</Text>
        <Text style={styles.errorSub}>The requested blood alert could not be loaded or may have expired.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const reqData: any = typeof targetMatch.bloodRequest === 'object' ? targetMatch.bloodRequest : null;
  const requesterData: any = typeof targetMatch.requester === 'object' ? targetMatch.requester : null;

  const bloodGroup = targetMatch.requestedBloodGroup || reqData?.bloodGroup || 'A+';
  const hospitalName = reqData?.hospitalName || 'Emergency Medical Center';
  const patientName = reqData?.patientName || 'Emergency Patient';
  const unitsRequired = reqData?.unitsRequired || 1;
  const urgency = reqData?.urgency || 'CRITICAL';
  const formattedDistance = targetMatch.formattedDistance || (targetMatch.distanceKm ? `${targetMatch.distanceKm.toFixed(1)} km` : 'Nearby');
  const status = targetMatch.status;

  const handleCallRequester = () => {
    if (requesterData?.phone) {
      Linking.openURL(`tel:${requesterData.phone}`);
    } else if (reqData?.contactPhone) {
      Linking.openURL(`tel:${reqData.contactPhone}`);
    } else {
      Alert.alert('Phone Unavailable', 'Contact number is not currently available.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Emergency Blood Request</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main Alert Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.bloodBadge}>
            <Text style={styles.bloodBadgeText}>{bloodGroup}</Text>
          </View>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.hospitalName}>{hospitalName}</Text>
            <Text style={styles.distanceText}>📍 {formattedDistance} away</Text>
          </View>
          <View style={[styles.urgencyBadge, urgency === 'CRITICAL' && { backgroundColor: COLORS.danger }]}>
            <Text style={styles.urgencyText}>{urgency}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Patient Name:</Text>
          <Text style={styles.infoValue}>{patientName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Units Required:</Text>
          <Text style={styles.infoValue}>{unitsRequired} Unit(s)</Text>
        </View>

        {!!reqData?.hospitalAddress && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hospital Address:</Text>
            <Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]}>{reqData.hospitalAddress}</Text>
          </View>
        )}

        {!!reqData?.reason && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Medical Notes / Details:</Text>
            <Text style={styles.notesText}>{reqData.reason}</Text>
          </View>
        )}

        {/* Response Status Banner */}
        <View style={styles.divider} />

        {status === 'ACCEPTED' && (
          <View style={styles.statusBannerSuccess}>
            <Text style={styles.statusBannerTitle}>✅ Request Accepted!</Text>
            <Text style={styles.statusBannerSub}>
              Thank you for agreeing to donate! Please coordinate with the requester or hospital.
            </Text>
            {(requesterData?.phone || reqData?.contactPhone) && (
              <TouchableOpacity style={styles.callBtn} onPress={handleCallRequester}>
                <Text style={styles.callBtnText}>📞 Call Requester ({requesterData?.phone || reqData?.contactPhone})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {status === 'REJECTED' && (
          <View style={styles.statusBannerMuted}>
            <Text style={styles.statusBannerMutedTitle}>❌ You Declined This Request</Text>
            <Text style={styles.statusBannerSub}>
              Thank you for responding promptly. We will match other nearby donors.
            </Text>
          </View>
        )}

        {['PENDING', 'NOTIFIED'].includes(status) && (
          <View style={styles.actionContainer}>
            <Text style={styles.actionPrompt}>Can you donate for this emergency request?</Text>

            <TouchableOpacity
              style={[styles.acceptBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={() => handleRespond('ACCEPTED')}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptBtnText}>🩸 I CAN DONATE</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rejectBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={() => handleRespond('REJECTED')}
              disabled={isSubmitting}
            >
              <Text style={styles.rejectBtnText}>Not Available</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgMain },
  content: { padding: 20, paddingTop: 45 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  errorTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary, marginBottom: 8 },
  errorSub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 20 },
  backBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  backBtnText: { color: '#FFF', fontWeight: '700' },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.borderColor, ...SHADOWS.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bloodBadge: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: '#FFA3A3', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginRight: 12 },
  bloodBadgeText: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  headerTitleContainer: { flex: 1 },
  hospitalName: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  distanceText: { fontSize: 13, color: COLORS.info, marginTop: 2, fontWeight: '600' },
  urgencyBadge: { backgroundColor: COLORS.warning, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  urgencyText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  divider: { height: 1, backgroundColor: COLORS.borderColor, marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoLabel: { fontSize: 13, color: COLORS.textMuted },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  notesBox: { backgroundColor: COLORS.bgMain, borderRadius: 10, padding: 12, marginTop: 6 },
  notesLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
  notesText: { fontSize: 13, color: COLORS.textMain },
  statusBannerSuccess: { backgroundColor: '#E8F5E9', borderRadius: 12, padding: 16, alignItems: 'center' },
  statusBannerTitle: { fontSize: 16, fontWeight: '800', color: '#2E7D32', marginBottom: 4 },
  statusBannerSub: { fontSize: 13, color: '#388E3C', textAlign: 'center', marginBottom: 12 },
  callBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  callBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  statusBannerMuted: { backgroundColor: COLORS.bgMain, borderRadius: 12, padding: 16, alignItems: 'center' },
  statusBannerMutedTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted, marginBottom: 4 },
  actionContainer: { alignItems: 'center', paddingTop: 6 },
  actionPrompt: { fontSize: 15, fontWeight: '700', color: COLORS.secondary, marginBottom: 16, textAlign: 'center' },
  acceptBtn: { backgroundColor: COLORS.success, borderRadius: 12, width: '100%', height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 12, ...SHADOWS.sm },
  acceptBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  rejectBtn: { backgroundColor: COLORS.bgMain, borderWidth: 1, borderColor: COLORS.borderColor, borderRadius: 12, width: '100%', height: 46, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});
