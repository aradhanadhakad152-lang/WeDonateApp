import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { BloodRequest } from '../../types/request.types';
import {
  getAvailableBloodRequests,
  respondToBloodRequest,
  FetchAvailableRequestsParams,
} from '../../services/bloodRequestService';
import { getCurrentDeviceLocation, LocationData } from '../../services/locationService';
import { BloodGroupBadge } from '../../components/ui/BloodGroupBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { COLORS, SHADOWS } from '../../theme/colors';

interface AvailableBloodRequestsScreenProps {
  onBack: () => void;
  onSelectRequest?: (request: BloodRequest) => void;
}

const RADIUS_OPTIONS = [5, 10, 25, 50];

export const AvailableBloodRequestsScreen: React.FC<AvailableBloodRequestsScreenProps> = ({
  onBack,
  onSelectRequest,
}) => {
  const [selectedRadius, setSelectedRadius] = useState<number>(50);
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState<boolean>(true);

  const [availableRequests, setAvailableRequests] = useState<BloodRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Acquire location on mount
  useEffect(() => {
    let isMounted = true;
    setIsLocationLoading(true);
    getCurrentDeviceLocation()
      .then((loc) => {
        if (isMounted) {
          if (loc) setUserLocation(loc);
          setIsLocationLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLocationLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch available requests from backend based on selected radius & user coordinates
  const fetchRequests = useCallback(
    async (radiusKm: number, isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const params: FetchAvailableRequestsParams = {
        radius: radiusKm,
        radiusKm: radiusKm,
      };

      if (userLocation) {
        params.latitude = userLocation.latitude;
        params.longitude = userLocation.longitude;
      }

      try {
        const requests = await getAvailableBloodRequests(params);
        setAvailableRequests(requests);
      } catch (err: any) {
        console.error('Failed to load available blood requests:', err);
        Alert.alert(
          'Error',
          err?.response?.data?.message || 'Could not load nearby blood requests. Please try again.'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [userLocation]
  );

  useEffect(() => {
    fetchRequests(selectedRadius);
  }, [fetchRequests, selectedRadius]);

  const handleRadiusChange = (radius: number) => {
    if (radius === selectedRadius) return;
    setSelectedRadius(radius);
  };

  const handleRefresh = () => {
    fetchRequests(selectedRadius, true);
  };

  // Idempotent donor response handler: I_CAN_DONATE
  const handleAcceptRequest = async (requestId: string) => {
    if (respondingId) return; // Prevent double taps

    setRespondingId(requestId);
    try {
      const res = await respondToBloodRequest(requestId, 'I_CAN_DONATE');
      Alert.alert(
        '❤️ Donation Confirmed!',
        'Thank you! You have committed to donate blood for this request. The requester has been notified immediately.',
        [{ text: 'OK' }]
      );

      // Optimistically update local item state
      setAvailableRequests((prev) =>
        prev.map((item) => {
          const itemId = item.id || item._id;
          if (itemId === requestId) {
            return {
              ...item,
              myMatchStatus: 'ACCEPTED',
              status: 'DONOR_RESPONDED',
            };
          }
          return item;
        })
      );

      // Refresh list from backend source of truth
      fetchRequests(selectedRadius, true);
    } catch (err: any) {
      console.error('Error responding I CAN DONATE:', err);
      const errorMsg =
        err?.response?.data?.message || 'Failed to process donation commitment. Please try again.';
      Alert.alert('Action Failed', errorMsg);
    } finally {
      setRespondingId(null);
    }
  };

  // Idempotent donor response handler: NOT_AVAILABLE
  const handleDeclineRequest = async (requestId: string) => {
    if (respondingId) return; // Prevent double taps

    setRespondingId(requestId);
    try {
      await respondToBloodRequest(requestId, 'NOT_AVAILABLE');

      // Optimistically mark as rejected locally
      setAvailableRequests((prev) =>
        prev.map((item) => {
          const itemId = item.id || item._id;
          if (itemId === requestId) {
            return {
              ...item,
              myMatchStatus: 'REJECTED',
            };
          }
          return item;
        })
      );
    } catch (err: any) {
      console.error('Error responding NOT AVAILABLE:', err);
      const errorMsg =
        err?.response?.data?.message || 'Failed to update response status. Please try again.';
      Alert.alert('Action Failed', errorMsg);
    } finally {
      setRespondingId(null);
    }
  };

  const renderCard = ({ item }: { item: BloodRequest }) => {
    const requestId = item.id || item._id || '';
    const isCritical = item.urgency === 'CRITICAL';
    const isUrgent = item.urgency === 'URGENT';
    const isResponding = respondingId === requestId;

    const myStatus = item.myMatchStatus;
    const isAccepted = myStatus === 'ACCEPTED';
    const isRejected = myStatus === 'REJECTED';

    return (
      <TouchableOpacity
        style={[styles.card, isCritical && styles.cardCritical, isAccepted && styles.cardAccepted]}
        onPress={() => onSelectRequest && onSelectRequest(item)}
        activeOpacity={0.9}
      >
        {/* Card Top Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <BloodGroupBadge bloodGroup={item.bloodGroup} size="md" />
            <View style={styles.patientInfoBox}>
              <Text style={styles.patientName}>{item.patientName}</Text>
              <Text style={styles.unitText}>{item.unitsRequired} Unit(s) Required</Text>
            </View>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <View style={styles.divider} />

        {/* Hospital & Location Details */}
        <View style={styles.detailsBox}>
          <Text style={styles.hospitalTitle} numberOfLines={1}>
            🏥 {item.hospitalName}
          </Text>
          <Text style={styles.hospitalAddr} numberOfLines={1}>
            📍 {item.hospitalAddress}
          </Text>

          {/* Badges Row */}
          <View style={styles.badgesRow}>
            {/* Distance Badge */}
            <View style={styles.badgeDistance}>
              <Text style={styles.badgeDistanceText}>
                📍 {item.formattedDistance || (item.distanceKm ? `${item.distanceKm.toFixed(1)} km away` : 'Nearby')}
              </Text>
            </View>

            {/* Urgency Badge */}
            <View
              style={[
                styles.badgeUrgency,
                isCritical
                  ? { backgroundColor: '#FEE2E2' }
                  : isUrgent
                  ? { backgroundColor: '#FFEDD5' }
                  : { backgroundColor: '#F1F5F9' },
              ]}
            >
              <Text
                style={[
                  styles.badgeUrgencyText,
                  isCritical
                    ? { color: '#DC2626' }
                    : isUrgent
                    ? { color: '#C2410C' }
                    : { color: '#475569' },
                ]}
              >
                {isCritical ? '🔴 CRITICAL' : isUrgent ? '⚡ URGENT' : 'NORMAL'}
              </Text>
            </View>

            {/* RBC Compatibility Indicator */}
            <View style={styles.badgeCompat}>
              <Text style={styles.badgeCompatText}>✓ Compatible</Text>
            </View>
          </View>
        </View>

        {/* Action / Response Status Footer */}
        {isAccepted ? (
          <View style={styles.acceptedBanner}>
            <Text style={styles.acceptedBannerText}>❤️ Donation Confirmed</Text>
            <Text style={styles.acceptedBannerSub}>Thank you for committing to save a life!</Text>
          </View>
        ) : isRejected ? (
          <View style={styles.declinedBanner}>
            <Text style={styles.declinedBannerText}>Not Available</Text>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btnDonate, isResponding && styles.btnDisabled]}
              onPress={() => handleAcceptRequest(requestId)}
              disabled={isResponding}
              activeOpacity={0.8}
            >
              {isResponding ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.btnDonateText}>I CAN DONATE ❤️</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnDecline, isResponding && styles.btnDisabled]}
              onPress={() => handleDeclineRequest(requestId)}
              disabled={isResponding}
              activeOpacity={0.8}
            >
              <Text style={styles.btnDeclineText}>Not Available</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Available Blood Requests</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Radius Filter Bar */}
      <View style={styles.radiusFilterBar}>
        <Text style={styles.radiusLabel}>Search Radius:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.radiusScroll}>
          {RADIUS_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusChip, selectedRadius === r && styles.radiusChipActive]}
              onPress={() => handleRadiusChange(r)}
              activeOpacity={0.8}
            >
              <Text style={[styles.radiusChipText, selectedRadius === r && styles.radiusChipTextActive]}>
                {r} km
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Location Unavailable Warning Banner */}
      {!isLocationLoading && !userLocation && (
        <View style={styles.locationWarningBox}>
          <Text style={styles.locationWarningText}>
            📍 Location is required to find blood requests near you. Showing default radius results.
          </Text>
        </View>
      )}

      {/* Main List / Loading / Empty State */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Finding compatible blood requests within {selectedRadius} km...</Text>
        </View>
      ) : (
        <FlatList
          data={availableRequests}
          keyExtractor={(item) => item.id || item._id || String(Math.random())}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🩸"
              title={`No compatible blood requests found within ${selectedRadius} km.`}
              description="There are currently no active emergency blood requests matching your blood group in this search radius."
              actionLabel="Expand Radius to 50 km"
              onAction={() => handleRadiusChange(50)}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    paddingTop: 45,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  backBtnText: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '700',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  radiusFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  radiusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginRight: 10,
  },
  radiusScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radiusChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  radiusChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  radiusChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  radiusChipTextActive: {
    color: '#FFFFFF',
  },
  locationWarningBox: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: 10,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
  },
  locationWarningText: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  cardCritical: {
    borderColor: '#F87171',
    backgroundColor: '#FFFAFA',
  },
  cardAccepted: {
    borderColor: '#4ADE80',
    backgroundColor: '#F0FDF4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  patientInfoBox: {
    marginLeft: 12,
    flex: 1,
  },
  patientName: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  unitText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderColor,
    marginVertical: 12,
  },
  detailsBox: {
    marginBottom: 12,
  },
  hospitalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 2,
  },
  hospitalAddr: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  badgeDistance: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeDistanceText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  badgeUrgency: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeUrgencyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badgeCompat: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeCompatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btnDonate: {
    flex: 2,
    backgroundColor: COLORS.primary,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  btnDonateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  btnDecline: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDeclineText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  acceptedBanner: {
    backgroundColor: '#DCFCE7',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  acceptedBannerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
  },
  acceptedBannerSub: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2,
  },
  declinedBanner: {
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  declinedBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
});
