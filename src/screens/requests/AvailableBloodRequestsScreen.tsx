import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useUserStore } from '../../store/userStore';
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

export type DonorFeedFilter = 'NEARBY' | 'MATCHING' | 'URGENT' | 'EXPIRING';
const RADIUS_OPTIONS = [5, 10, 25, 50];

const COMPATIBILITY_MAP: Record<string, string[]> = {
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'O-': ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
  'A+': ['A+', 'AB+'],
  'A-': ['A+', 'A-', 'AB+', 'AB-'],
  'B+': ['B+', 'AB+'],
  'B-': ['B+', 'B-', 'AB+', 'AB-'],
  'AB+': ['AB+'],
  'AB-': ['AB+', 'AB-'],
};

const isBloodGroupCompatible = (donorGroup?: string, recipientGroup?: string): boolean => {
  if (!donorGroup || !recipientGroup) return true;
  const dNorm = donorGroup.trim().toUpperCase();
  const rNorm = recipientGroup.trim().toUpperCase();
  const compatibleRecipients = COMPATIBILITY_MAP[dNorm];
  if (!compatibleRecipients) return true;
  return compatibleRecipients.includes(rNorm);
};

export const AvailableBloodRequestsScreen: React.FC<AvailableBloodRequestsScreenProps> = ({
  onBack,
  onSelectRequest,
}) => {
  const { profile } = useUserStore();
  const [activeFilter, setActiveFilter] = useState<DonorFeedFilter>('NEARBY');
  const [selectedRadius, setSelectedRadius] = useState<number>(50);

  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState<boolean>(true);

  const [rawRequests, setRawRequests] = useState<BloodRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const donorBloodGroup = profile?.bloodGroup || 'B+';
  const isDonorEligible = profile?.isEligible !== false;

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
        setRawRequests(requests);
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

  // Apply Donor Feed Filters (Nearby, Matching, Urgent, Expiring)
  const filteredRequests = useMemo(() => {
    let list = [...rawRequests];

    switch (activeFilter) {
      case 'NEARBY':
        list.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
        break;
      case 'MATCHING':
        list = list.filter((r) => isBloodGroupCompatible(donorBloodGroup, r.bloodGroup));
        break;
      case 'URGENT':
        list = list.filter((r) => r.urgency === 'CRITICAL' || r.urgency === 'HIGH' || r.urgency === 'URGENT');
        break;
      case 'EXPIRING':
        list.sort((a, b) => new Date(a.requiredBy || a.createdAt).getTime() - new Date(b.requiredBy || b.createdAt).getTime());
        break;
    }

    return list;
  }, [rawRequests, activeFilter, donorBloodGroup]);

  const handleRadiusChange = (radius: number) => {
    if (radius === selectedRadius) return;
    setSelectedRadius(radius);
  };

  const handleRefresh = () => {
    fetchRequests(selectedRadius, true);
  };

  // Idempotent donor response handler: I_CAN_DONATE
  const handleAcceptRequest = async (item: BloodRequest) => {
    const requestId = item.id || item._id || '';

    if (!isDonorEligible) {
      Alert.alert(
        'Ineligible to Donate',
        'You are currently marked as ineligible to donate blood (e.g. recent donation or medical deferral).'
      );
      return;
    }

    const isCompatible = isBloodGroupCompatible(donorBloodGroup, item.bloodGroup);
    if (!isCompatible) {
      Alert.alert(
        'Incompatible Blood Group',
        `Your blood group (${donorBloodGroup}) is not compatible with this request (${item.bloodGroup}).`
      );
      return;
    }

    if (item.myMatchStatus === 'ACCEPTED') {
      Alert.alert('Already Responded', 'You have already offered to donate for this blood request.');
      return;
    }

    if (respondingId) return; // Prevent double taps

    setRespondingId(requestId);
    try {
      await respondToBloodRequest(requestId, 'I_CAN_DONATE');
      Alert.alert(
        '❤️ Donation Confirmed!',
        'Thank you! You have committed to donate blood for this emergency request. The requester has been notified immediately.'
      );

      // Optimistically update local item state
      setRawRequests((prev) =>
        prev.map((r) => {
          const rId = r.id || r._id;
          if (rId === requestId) {
            return {
              ...r,
              myMatchStatus: 'ACCEPTED',
              status: 'DONOR_RESPONDED',
            };
          }
          return r;
        })
      );

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
      setRawRequests((prev) =>
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
    const isUrgent = item.urgency === 'URGENT' || item.urgency === 'HIGH';
    const isResponding = respondingId === requestId;

    const myStatus = item.myMatchStatus;
    const isAccepted = myStatus === 'ACCEPTED';
    const isRejected = myStatus === 'REJECTED';

    const isCompatible = isBloodGroupCompatible(donorBloodGroup, item.bloodGroup);

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
            {isCompatible ? (
              <View style={styles.badgeCompat}>
                <Text style={styles.badgeCompatText}>✓ Compatible</Text>
              </View>
            ) : (
              <View style={styles.badgeIncompat}>
                <Text style={styles.badgeIncompatText}>✕ Not Compatible</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action / Response Status Footer */}
        {isAccepted ? (
          <View style={styles.acceptedBanner}>
            <Text style={styles.acceptedBannerText}>❤️ Donation Confirmed</Text>
            <Text style={styles.acceptedBannerSub}>You have already offered to donate for this request.</Text>
          </View>
        ) : isRejected ? (
          <View style={styles.declinedBanner}>
            <Text style={styles.declinedBannerText}>Not Available</Text>
          </View>
        ) : !isCompatible ? (
          <View style={styles.incompatBanner}>
            <Text style={styles.incompatBannerText}>
              Your blood group ({donorBloodGroup}) is not compatible with this request.
            </Text>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btnDonate, isResponding && styles.btnDisabled]}
              onPress={() => handleAcceptRequest(item)}
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
        <Text style={styles.navTitle}>Blood Request Feed</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Filter Tabs: Nearby, Matching, Urgent, Expiring */}
      <View style={styles.donorFilterRow}>
        {(['NEARBY', 'MATCHING', 'URGENT', 'EXPIRING'] as DonorFeedFilter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.donorFilterTab, activeFilter === f && styles.donorFilterTabActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.donorFilterTabText, activeFilter === f && styles.donorFilterTabTextActive]}>
              {f === 'NEARBY'
                ? '📍 Nearby'
                : f === 'MATCHING'
                ? `💉 Matching (${donorBloodGroup})`
                : f === 'URGENT'
                ? '⚡ Urgent'
                : '⏳ Expiring'}
            </Text>
          </TouchableOpacity>
        ))}
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

      {/* Location Warning Banner */}
      {!isLocationLoading && !userLocation && (
        <View style={styles.locationWarningBox}>
          <Text style={styles.locationWarningText}>
            📍 Location is required to find blood requests near you.
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
          data={filteredRequests}
          keyExtractor={(item) => item.id || item._id || String(Math.random())}
          renderItem={renderCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🩸"
              title={`No ${activeFilter.toLowerCase()} blood requests found within ${selectedRadius} km.`}
              description="There are currently no active emergency blood requests matching this filter criteria."
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 10,
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
  donorFilterRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  donorFilterTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  donorFilterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  donorFilterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  donorFilterTabTextActive: {
    color: '#FFFFFF',
  },
  radiusFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  radiusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginRight: 8,
  },
  radiusScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  radiusChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  radiusChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  radiusChipText: {
    fontSize: 12,
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
  badgeIncompat: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  badgeIncompatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
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
  incompatBanner: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  incompatBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    textAlign: 'center',
  },
});
