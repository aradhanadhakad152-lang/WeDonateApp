import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, TextInput, Modal, Platform } from 'react-native';
import { useUserStore } from '../../store/userStore';
import { useRequestStore } from '../../store/requestStore';
import { logoutUser } from '../../services/authService';
import { getCurrentDeviceLocation, LocationData } from '../../services/locationService';
import { updateLocation } from '../../services/userService';
import { getNearbyHospitals, getHospitalAutocomplete, RealHospital, HospitalSuggestion } from '../../services/hospitalService';
import { BottomNav, TabName } from '../../components/ui/BottomNav';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { BloodGroupBadge } from '../../components/ui/BloodGroupBadge';
import { BloodRequestsFeedScreen } from '../requests/BloodRequestsFeedScreen';
import { COLORS, SHADOWS } from '../../theme/colors';

interface HomeScreenProps {
  onNavigateToProfile: () => void;
  onRequestBlood: () => void;
  onNavigateToAvailableRequests?: () => void;
  onOpenMap?: () => void;
  onNavigateToCamps?: () => void;
  onNavigateToFunding?: () => void;
  onLogout: () => void;
}

type HistoryFilter = 'ALL' | 'OPEN' | 'EXPIRED';

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateToProfile,
  onRequestBlood,
  onNavigateToAvailableRequests,
  onOpenMap,
  onNavigateToCamps,
  onNavigateToFunding,
  onLogout,
}) => {
  const { profile, fetchProfile, toggleAvailability, isLoading: isProfileLoading } = useUserStore();
  const { requests, myRequests, fetchRequests, fetchMyRequests, isLoading: isRequestsLoading } = useRequestStore();

  const [activeTab, setActiveTab] = useState<TabName>('Home');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSOSModal, setShowSOSModal] = useState(false);

  // User GPS Location
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);

  // Live Hospital Search Autocomplete
  const [hospitalSuggestions, setHospitalSuggestions] = useState<HospitalSuggestion[]>([]);
  const [nearbyHospitalsList, setNearbyHospitalsList] = useState<RealHospital[]>([]);
  const [isSearchingHospitals, setIsSearchingHospitals] = useState(false);
  const [googleAttribution, setGoogleAttribution] = useState('');

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Acquire real GPS position and sync profile
  useEffect(() => {
    fetchProfile();
    fetchRequests({ status: 'OPEN' });
    fetchMyRequests();

    const acquireGPS = async () => {
      const loc = await getCurrentDeviceLocation();
      if (loc) {
        setUserLocation(loc);
        try {
          await updateLocation({
            latitude: loc.latitude,
            longitude: loc.longitude,
            city: loc.city,
            state: loc.state,
            address: loc.address,
          });
        } catch {
          // Ignore location sync errors
        }
      }
    };
    acquireGPS();
  }, [fetchProfile, fetchRequests, fetchMyRequests]);

  useEffect(() => {
    if (activeTab === 'History') {
      fetchMyRequests();
    } else if (activeTab === 'Search') {
      loadNearbyHospitals();
    }
  }, [activeTab]);

  const loadNearbyHospitals = async () => {
    setIsSearchingHospitals(true);
    const lat = userLocation?.latitude || profile?.location?.coordinates[1] || 28.5672;
    const lng = userLocation?.longitude || profile?.location?.coordinates[0] || 77.2100;
    try {
      const list = await getNearbyHospitals(lat, lng, 15);
      setNearbyHospitalsList(list);
    } catch {
      setNearbyHospitalsList([]);
    } finally {
      setIsSearchingHospitals(false);
    }
  };

  // Live Google Places Autocomplete with 400ms debounce
  const handleSearchInputChange = (text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (text.trim().length >= 2) {
      setIsSearchingHospitals(true);
      searchDebounceRef.current = setTimeout(async () => {
        const lat = userLocation?.latitude || profile?.location?.coordinates[1];
        const lng = userLocation?.longitude || profile?.location?.coordinates[0];
        try {
          const res = await getHospitalAutocomplete(text.trim(), lat, lng);
          setHospitalSuggestions(res.suggestions || []);
          setGoogleAttribution(res.attribution || '');
        } catch {
          setHospitalSuggestions([]);
        } finally {
          setIsSearchingHospitals(false);
        }
      }, 400);
    } else {
      setHospitalSuggestions([]);
      setIsSearchingHospitals(false);
    }
  };

  const handleToggle = (value: boolean) => {
    toggleAvailability(value);
  };

  const handleLogoutPress = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of WE DONATE?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logoutUser();
          onLogout();
        },
      },
    ]);
  };

  if (isProfileLoading && !profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Connecting to WE DONATE Network...</Text>
      </View>
    );
  }

  const nameVal = profile?.name || profile?.fullName || 'WeDonate Member';
  const bloodGroupVal = profile?.bloodGroup || 'B+';
  const isAvailable = profile?.isAvailable ?? profile?.donorStatus === 'AVAILABLE';
  const initials = nameVal.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'WD';

  // Filter History Requests: ALL, OPEN, EXPIRED
  const filteredHistory = myRequests.filter((r) => {
    const isPastRequired = r.requiredBy && new Date() > new Date(r.requiredBy);
    const isOpenStatus = ['OPEN', 'MATCHING', 'ACCEPTED'].includes(r.status);

    if (historyFilter === 'OPEN') {
      return isOpenStatus && !isPastRequired;
    }
    if (historyFilter === 'EXPIRED') {
      return isPastRequired || ['EXPIRED', 'CANCELLED', 'FULFILLED'].includes(r.status);
    }
    return true; // ALL
  });

  const activeEmergencyRequest = requests.length > 0 ? requests[0] : null;

  return (
    <View style={styles.mainWrapper}>
      {activeTab === 'Requests' ? (
        <BloodRequestsFeedScreen onRequestBlood={onRequestBlood} />
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ================= TAB 1: HOME DASHBOARD ================= */}
          {activeTab === 'Home' && (
            <>
              {/* Top Coral Header Bar */}
              <View style={styles.dashHeaderBg}>
                <View style={styles.dashTopBar}>
                  <View style={styles.userAvatarBadge}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View>
                      <Text style={styles.dashUserName}>{nameVal}</Text>
                      <Text style={styles.dashUserLocation}>
                        📍 {userLocation?.city || profile?.location?.city || 'GPS Position'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.bellBadge} onPress={() => setActiveTab('History')}>
                    <Text style={styles.bellIcon}>🔔</Text>
                    {myRequests.length > 0 && <View style={styles.bellDot} />}
                  </TouchableOpacity>
                </View>

                {/* Stats Pills Row */}
                <View style={styles.dashStatsRow}>
                  <View style={styles.statPillBadge}>
                    <Text style={styles.statPillText}>BLOOD GROUP: {bloodGroupVal}</Text>
                  </View>
                  <View style={[styles.statPillBadge, styles.statPillGreen]}>
                    <Text style={styles.statPillText}>🛡️ VERIFIED DONOR</Text>
                  </View>
                </View>
              </View>

              {/* Live Emergency Alert Banner Card */}
              <View style={styles.emergencyCardWrapper}>
                {activeEmergencyRequest ? (
                  <View style={styles.emergencyBannerCard}>
                    <View style={styles.emergencyBannerTop}>
                      <Text style={styles.emergencyBadge}>LIVE EMERGENCY</Text>
                      <StatusBadge status={activeEmergencyRequest.status} />
                    </View>
                    <Text style={styles.emergencyTitle}>
                      {activeEmergencyRequest.bloodGroup} BLOOD REQUIRED FOR {activeEmergencyRequest.patientName.toUpperCase()}
                    </Text>
                    <Text style={styles.emergencySub}>
                      🏥 {activeEmergencyRequest.hospitalName} • {activeEmergencyRequest.unitsRequired} Unit(s) Needed
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.btnRespondDonor, { flex: 1 }]}
                        onPress={onRequestBlood}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.btnRespondDonorText}>Create Request  🚨</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnRespondDonor, { flex: 1, backgroundColor: COLORS.secondary }]}
                        onPress={() => setActiveTab('Requests')}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.btnRespondDonorText}>View Feed ➔</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.emergencyBannerCard, { backgroundColor: COLORS.bgMain, borderColor: COLORS.borderColor }]}>
                    <Text style={[styles.emergencyTitle, { color: COLORS.secondary }]}>No Active Emergency Requests</Text>
                    <Text style={styles.availabilitySub}>
                      Create an emergency blood request whenever blood is urgently required.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[styles.btnRespondDonor, { flex: 1, backgroundColor: COLORS.primary }]}
                        onPress={onRequestBlood}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.btnRespondDonorText}>Request Blood 📋</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnRespondDonor, { flex: 1, backgroundColor: COLORS.secondary }]}
                        onPress={() => setActiveTab('Requests')}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.btnRespondDonorText}>View Feed ➔</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

            {/* Core Action Grid */}
            <View style={styles.coreActionGrid}>
              <TouchableOpacity style={styles.actionCardBtn} onPress={onRequestBlood} activeOpacity={0.85}>
                <View style={[styles.actionIconBox, styles.iconRed]}>
                  <Text style={styles.actionIconText}>🩸</Text>
                </View>
                <Text style={styles.actionLabel}>Request Blood</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCardBtn} onPress={onNavigateToAvailableRequests || (() => setActiveTab('Requests'))} activeOpacity={0.85}>
                <View style={[styles.actionIconBox, styles.iconRed]}>
                  <Text style={styles.actionIconText}>❤️</Text>
                </View>
                <Text style={[styles.actionLabel, { color: COLORS.primary, fontWeight: '800' }]}>I CAN DONATE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCardBtn} onPress={onOpenMap || (() => setActiveTab('Search'))} activeOpacity={0.85}>
                <View style={[styles.actionIconBox, styles.iconBlue]}>
                  <Text style={styles.actionIconText}>📍</Text>
                </View>
                <Text style={styles.actionLabel}>Find Donors</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCardBtn} onPress={onNavigateToCamps || (() => Alert.alert('Blood Camps', 'Opening Camps Drive...'))} activeOpacity={0.85}>
                <View style={[styles.actionIconBox, styles.iconPurple]}>
                  <Text style={styles.actionIconText}>⛺</Text>
                </View>
                <Text style={styles.actionLabel}>Donation Camps</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.actionCardBtn} onPress={onNavigateToFunding || (() => Alert.alert('Fund & Support', 'Opening Funding Campaigns...'))} activeOpacity={0.85}>
                <View style={[styles.actionIconBox, styles.iconGreen]}>
                  <Text style={styles.actionIconText}>💚</Text>
                </View>
                <Text style={styles.actionLabel}>Fund / Support</Text>
              </TouchableOpacity>

              {/* 24x7 Emergency Helplines */}
              <TouchableOpacity
                style={[styles.actionCardBtn, styles.actionCardSOS]}
                onPress={() => setShowSOSModal(true)}
                activeOpacity={0.85}
              >
                <View style={[styles.actionIconBox, styles.iconOrange]}>
                  <Text style={styles.actionIconText}>📞</Text>
                </View>
                <Text style={[styles.actionLabel, { color: COLORS.primary }]}>
                  Emergency Helplines & SOS
                </Text>
              </TouchableOpacity>
            </View>

            {/* Donor Availability Card */}
            <View style={styles.availabilityCard}>
              <View style={styles.availabilityTextContainer}>
                <Text style={styles.availabilityTitle}>Donor Availability Status</Text>
                <Text style={styles.availabilitySub}>
                  {isAvailable ? 'Visible to nearby emergency requests' : 'Currently offline'}
                </Text>
              </View>
              <Switch
                trackColor={{ false: '#CBD5E1', true: COLORS.primaryLight }}
                thumbColor={isAvailable ? COLORS.primary : '#94A3B8'}
                onValueChange={handleToggle}
                value={isAvailable}
              />
            </View>
          </>
        )}

        {/* ================= TAB 2: SEARCH HOSPITALS & BLOOD BANKS ================= */}
        {activeTab === 'Search' && (
          <View style={styles.tabSection}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.tabSectionTitle}>Hospitals & Blood Banks</Text>
              {onOpenMap && (
                <TouchableOpacity style={styles.btnOpenMapHead} onPress={onOpenMap}>
                  <Text style={styles.btnOpenMapHeadText}>🗺️ Open Map Radar</Text>
                </TouchableOpacity>
              )}
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Search hospital (e.g. AIIMS, Fortis, Max)..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={handleSearchInputChange}
            />

            {/* Live Autocomplete Suggestions */}
            {hospitalSuggestions.length > 0 ? (
              <View style={styles.cardList}>
                {hospitalSuggestions.map((s, idx) => (
                  <TouchableOpacity
                    key={s.placeId || idx}
                    style={styles.itemCard}
                    onPress={() => {
                      Alert.alert(s.name, s.address || 'Medical Facility');
                    }}
                  >
                    <Text style={styles.itemCardName}>🏥 {s.name}</Text>
                    {!!s.address && <Text style={styles.itemCardSub}>{s.address}</Text>}
                  </TouchableOpacity>
                ))}
                {!!googleAttribution && (
                  <Text style={styles.attributionText}>{googleAttribution}</Text>
                )}
              </View>
            ) : isSearchingHospitals ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
            ) : nearbyHospitalsList.length === 0 ? (
              <EmptyState
                icon="🏥"
                title="No Nearby Hospitals Found"
                description="Make sure GPS location is enabled to discover nearby hospitals and blood banks."
                actionLabel="Open Map Radar"
                onAction={onOpenMap}
              />
            ) : (
              <View style={styles.cardList}>
                {nearbyHospitalsList.map((h) => (
                  <View key={h.id} style={styles.itemCard}>
                    <View style={styles.itemCardHeader}>
                      <Text style={styles.itemCardName}>{h.name}</Text>
                      <Text style={styles.itemCardDistance}>📍 {h.formattedDistance}</Text>
                    </View>
                    <Text style={styles.itemCardSub}>{h.address || 'Medical Zone'}</Text>
                    {!!h.phone && <Text style={styles.itemCardStock}>📞 {h.phone}</Text>}
                  </View>
                ))}
                <Text style={styles.attributionText}>Powered by Google</Text>
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 3: REQUEST HISTORY WITH FILTERS ================= */}
        {activeTab === 'History' && (
          <View style={styles.tabSection}>
            <Text style={styles.tabSectionTitle}>Request History</Text>

            {/* Filter Chips: ALL, OPEN, EXPIRED */}
            <View style={styles.filterChipRow}>
              {(['ALL', 'OPEN', 'EXPIRED'] as HistoryFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.historyFilterChip, historyFilter === f && styles.historyFilterChipActive]}
                  onPress={() => setHistoryFilter(f)}
                >
                  <Text style={[styles.historyFilterText, historyFilter === f && styles.historyFilterTextActive]}>
                    {f}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {isRequestsLoading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
            ) : filteredHistory.length === 0 ? (
              <EmptyState
                icon="📋"
                title={`No ${historyFilter === 'ALL' ? '' : historyFilter} Blood Requests`}
                description="Your emergency blood request history will be displayed here."
                actionLabel="Request Blood Now ➔"
                onAction={onRequestBlood}
              />
            ) : (
              <View style={styles.cardList}>
                {filteredHistory.map((r) => (
                  <View key={r.id || r._id} style={styles.itemCard}>
                    <View style={styles.itemCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <BloodGroupBadge bloodGroup={r.bloodGroup} size="sm" />
                        <Text style={styles.itemCardName}>{r.patientName}</Text>
                      </View>
                      <StatusBadge status={r.status} />
                    </View>
                    <Text style={styles.itemCardSub}>🏥 {r.hospitalName}</Text>
                    <Text style={styles.itemCardSub}>📍 {r.hospitalAddress}</Text>
                    <Text style={styles.itemCardSub}>🩸 {r.unitsRequired} Unit(s) • Urgency: {r.urgency}</Text>
                    <Text style={styles.itemCardId}>ID: {r.id || r._id}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ================= TAB 4: PROFILE & SETTINGS ================= */}
        {activeTab === 'Profile' && (
          <View style={styles.tabSection}>
            <Text style={styles.tabSectionTitle}>Profile & Settings</Text>
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{initials}</Text>
              </View>
              <Text style={styles.profileName}>{nameVal}</Text>
              <Text style={styles.profilePhone}>{profile?.phone || 'Connected Member'}</Text>
              <Text style={styles.profileBlood}>Blood Group: {bloodGroupVal}</Text>

              <TouchableOpacity style={styles.btnEditProfile} onPress={onNavigateToProfile}>
                <Text style={styles.btnEditProfileText}>✏️ Edit Profile Details</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.btnSignOut} onPress={handleLogoutPress}>
              <Text style={styles.btnSignOutText}>Sign Out of Account</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      )}

      {/* Emergency SOS Modal */}
      <Modal visible={showSOSModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📞 Emergency Helplines</Text>
            <Text style={styles.modalSub}>National Blood Helpline: 104</Text>
            <Text style={styles.modalSub}>Ambulance Service: 102 / 108</Text>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSOSModal(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fixed 4-Tab Bottom Navigation Bar */}
      <BottomNav activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
};

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },

  /* Header Bar */
  dashHeaderBg: {
    backgroundColor: COLORS.primary,
    padding: 24,
    paddingTop: 50,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  dashTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userAvatarBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    ...SHADOWS.sm,
  },
  avatarText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 18,
  },
  dashUserName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  dashUserLocation: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    marginTop: 2,
  },
  bellBadge: {
    position: 'relative',
    padding: 6,
  },
  bellIcon: {
    fontSize: 22,
  },
  bellDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  dashStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  statPillBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statPillGreen: {
    backgroundColor: 'rgba(16, 185, 129, 0.35)',
  },
  statPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Emergency Banner Card */
  emergencyCardWrapper: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  emergencyBannerCard: {
    backgroundColor: COLORS.secondary,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FFA3A3',
    ...SHADOWS.md,
  },
  emergencyBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emergencyBadge: {
    backgroundColor: COLORS.primary,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  emergencyTitle: {
    color: '#FF4D4D',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  emergencySub: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 2,
  },
  btnRespondDonor: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  btnRespondDonorText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* Core Action Grid */
  coreActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  actionCardBtn: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
    ...SHADOWS.sm,
  },
  actionCardSOS: {
    width: '100%',
    backgroundColor: COLORS.primaryLight,
    borderColor: '#FFA3A3',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconRed: { backgroundColor: COLORS.primaryLight },
  iconGreen: { backgroundColor: COLORS.successLight },
  iconBlue: { backgroundColor: COLORS.infoLight },
  iconPurple: { backgroundColor: COLORS.purpleLight },
  iconOrange: { backgroundColor: COLORS.orangeLight },
  actionIconText: { fontSize: 20 },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.secondary,
  },

  /* Availability Toggle Card */
  availabilityCard: {
    marginHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.sm,
  },
  availabilityTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  availabilityTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  availabilitySub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  /* Tab Sections */
  tabSection: {
    padding: 20,
    paddingTop: 50,
  },
  tabSectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.secondary,
    marginBottom: 16,
  },
  btnOpenMapHead: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFA3A3',
  },
  btnOpenMapHeadText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 14,
    color: COLORS.textMain,
    marginBottom: 16,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  historyFilterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  historyFilterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  historyFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  historyFilterTextActive: {
    color: '#FFFFFF',
  },
  cardList: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 14,
    padding: 16,
    ...SHADOWS.sm,
  },
  itemCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  itemCardDistance: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  itemCardSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  itemCardId: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  itemCardStock: {
    fontSize: 13,
    color: COLORS.success,
    fontWeight: '600',
    marginTop: 6,
  },
  attributionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 6,
    fontStyle: 'italic',
  },

  /* Profile Tab */
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    ...SHADOWS.sm,
  },
  profileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  profilePhone: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  profileBlood: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 6,
  },
  btnEditProfile: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
  },
  btnEditProfileText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  btnSignOut: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSignOutText: {
    color: COLORS.danger,
    fontSize: 15,
    fontWeight: '700',
  },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 14,
  },
  modalSub: {
    fontSize: 14,
    color: COLORS.secondary,
    fontWeight: '600',
    marginVertical: 4,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 20,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
