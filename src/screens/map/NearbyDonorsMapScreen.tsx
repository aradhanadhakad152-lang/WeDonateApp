import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform, ScrollView, RefreshControl } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { getCurrentDeviceLocation, LocationData } from '../../services/locationService';
import { getNearbyDonors, NearbyDonor, updateLocation } from '../../services/userService';
import { getNearbyHospitals, getNearbyBloodBanks, RealHospital } from '../../services/hospitalService';
import { BloodGroupBadge } from '../../components/ui/BloodGroupBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { COLORS, SHADOWS } from '../../theme/colors';

interface NearbyDonorsMapScreenProps {
  onBack: () => void;
  onRequestBlood?: () => void;
}

export const NearbyDonorsMapScreen: React.FC<NearbyDonorsMapScreenProps> = ({ onBack, onRequestBlood }) => {
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [viewMode, setViewMode] = useState<'DONORS' | 'HOSPITALS' | 'BLOOD_BANKS'>('DONORS');
  const [displayMode, setDisplayMode] = useState<'MAP' | 'LIST'>('LIST'); // DEFAULT = LIST VIEW
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string | undefined>(undefined);

  // Real Data Lists
  const [donors, setDonors] = useState<NearbyDonor[]>([]);
  const [hospitals, setHospitals] = useState<RealHospital[]>([]);
  const [bloodBanks, setBloodBanks] = useState<RealHospital[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // API Deduplication Cache (Prevents repeated requests for identical params)
  const apiCacheRef = useRef<Record<string, any>>({});

  // Selected Card Detail
  const [selectedItem, setSelectedItem] = useState<{ type: 'DONOR' | 'HOSPITAL' | 'BLOOD_BANK'; data: any } | null>(null);

  const fetchLocation = async () => {
    setIsLocating(true);
    setPermissionError(false);
    const loc = await getCurrentDeviceLocation();
    setIsLocating(false);
    if (loc) {
      setUserLocation(loc);
      // Update authenticated user's GPS in backend [longitude, latitude]
      try {
        await updateLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          city: loc.city,
          state: loc.state,
          address: loc.address,
        });
      } catch (err) {
        console.warn('Backend location sync error:', err);
      }
    } else {
      setPermissionError(true);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Fetch real map/list data with cache-deduplication to avoid duplicate API requests
  const loadMapData = useCallback(async (forceRefresh = false) => {
    if (!userLocation) return;

    const cacheKey = `${viewMode}_${radiusKm}_${selectedBloodGroup || 'ALL'}_${userLocation.latitude.toFixed(3)}_${userLocation.longitude.toFixed(3)}`;

    // Return cached response if parameter hasn't changed and forceRefresh is false
    if (!forceRefresh && apiCacheRef.current[cacheKey]) {
      const cached = apiCacheRef.current[cacheKey];
      if (viewMode === 'DONORS') setDonors(cached);
      else if (viewMode === 'HOSPITALS') setHospitals(cached);
      else if (viewMode === 'BLOOD_BANKS') setBloodBanks(cached);
      return;
    }

    if (forceRefresh) setIsRefreshing(true);
    else setIsLoadingData(true);

    try {
      if (viewMode === 'DONORS') {
        const result = await getNearbyDonors(userLocation.latitude, userLocation.longitude, radiusKm, selectedBloodGroup);
        const sliced = result.slice(0, 100);
        apiCacheRef.current[cacheKey] = sliced;
        setDonors(sliced);
      } else if (viewMode === 'HOSPITALS') {
        const result = await getNearbyHospitals(userLocation.latitude, userLocation.longitude, radiusKm);
        apiCacheRef.current[cacheKey] = result;
        setHospitals(result);
      } else if (viewMode === 'BLOOD_BANKS') {
        const result = await getNearbyBloodBanks(userLocation.latitude, userLocation.longitude, radiusKm);
        apiCacheRef.current[cacheKey] = result;
        setBloodBanks(result);
      }
    } catch (err) {
      console.warn('Failed to load nearby data:', err);
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, [userLocation, viewMode, radiusKm, selectedBloodGroup]);

  useEffect(() => {
    loadMapData(false);
  }, [loadMapData]);

  const handleRefresh = () => {
    loadMapData(true);
  };

  const handleOpenDirections = (lat: number, lng: number, name: string) => {
    if (!userLocation) return;
    const origin = `${userLocation.latitude},${userLocation.longitude}`;
    const destination = `${lat},${lng}`;
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(name)}@${destination}`,
      android: `google.navigation:q=${destination}`,
    }) || `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;

    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`);
    });
  };

  if (isLocating) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Acquiring GPS Satellite Position...</Text>
      </View>
    );
  }

  if (permissionError || !userLocation) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>GPS Location Required</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon="📍"
          title="GPS Permission Required"
          description="WE DONATE requires location access to find nearby blood donors, hospitals, and emergency requests."
          actionLabel="Grant GPS Permission & Retry"
          onAction={fetchLocation}
        />
      </View>
    );
  }

  const initialRegion = {
    latitude: userLocation.latitude,
    longitude: userLocation.longitude,
    latitudeDelta: radiusKm > 20 ? 0.35 : radiusKm > 10 ? 0.18 : 0.08,
    longitudeDelta: radiusKm > 20 ? 0.35 : radiusKm > 10 ? 0.18 : 0.08,
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nearby Radar Map</Text>
        
        {/* MAP vs LIST View Switcher */}
        <View style={styles.viewSwitchContainer}>
          <TouchableOpacity
            style={[styles.viewSwitchBtn, displayMode === 'MAP' && styles.viewSwitchBtnActive]}
            onPress={() => setDisplayMode('MAP')}
          >
            <Text style={[styles.viewSwitchText, displayMode === 'MAP' && styles.viewSwitchTextActive]}>🗺️ Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewSwitchBtn, displayMode === 'LIST' && styles.viewSwitchBtnActive]}
            onPress={() => setDisplayMode('LIST')}
          >
            <Text style={[styles.viewSwitchText, displayMode === 'LIST' && styles.viewSwitchTextActive]}>📜 List</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mode Filter Toggle: Donors vs Hospitals vs Blood Banks */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'DONORS' && styles.toggleBtnActive]}
          onPress={() => { setViewMode('DONORS'); setSelectedItem(null); }}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'DONORS' && styles.toggleBtnTextActive]}>
            💓 Donors ({donors.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'HOSPITALS' && styles.toggleBtnActive]}
          onPress={() => { setViewMode('HOSPITALS'); setSelectedItem(null); }}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'HOSPITALS' && styles.toggleBtnTextActive]}>
            🏥 Hospitals ({hospitals.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'BLOOD_BANKS' && styles.toggleBtnActive]}
          onPress={() => { setViewMode('BLOOD_BANKS'); setSelectedItem(null); }}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'BLOOD_BANKS' && styles.toggleBtnTextActive]}>
            🏦 Banks ({bloodBanks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Radius Chips & Blood Group Filter */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Text style={styles.radiusLabel}>Radius:</Text>
          {[2, 5, 10, 20, 50].map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.radiusChip, radiusKm === r && styles.radiusChipActive]}
              onPress={() => setRadiusKm(r)}
            >
              <Text style={[styles.radiusChipText, radiusKm === r && styles.radiusChipTextActive]}>{r} km</Text>
            </TouchableOpacity>
          ))}

          {viewMode === 'DONORS' && (
            <>
              <Text style={[styles.radiusLabel, { marginLeft: 12 }]}>Blood:</Text>
              <TouchableOpacity
                style={[styles.radiusChip, !selectedBloodGroup && styles.radiusChipActive]}
                onPress={() => setSelectedBloodGroup(undefined)}
              >
                <Text style={[styles.radiusChipText, !selectedBloodGroup && styles.radiusChipTextActive]}>All</Text>
              </TouchableOpacity>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                <TouchableOpacity
                  key={bg}
                  style={[styles.radiusChip, selectedBloodGroup === bg && styles.radiusChipActive]}
                  onPress={() => setSelectedBloodGroup(bg)}
                >
                  <Text style={[styles.radiusChipText, selectedBloodGroup === bg && styles.radiusChipTextActive]}>{bg}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </View>

      {/* DISPLAY MODE: MAP VIEW vs LIST VIEW */}
      {displayMode === 'MAP' ? (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            showsUserLocation
            showsMyLocationButton
          >
            {/* User Location Marker */}
            {userLocation && (
              <Marker
                coordinate={{ latitude: userLocation.latitude, longitude: userLocation.longitude }}
                title="Your Current Position"
                description={userLocation.city || 'GPS Position'}
                pinColor="#0284C7"
              />
            )}

            {/* Real Donor Markers from MongoDB */}
            {viewMode === 'DONORS' &&
              donors.map((d) => {
                const coords = d.location?.coordinates;
                if (!coords || (coords[0] === 0 && coords[1] === 0)) return null;
                return (
                  <Marker
                    key={d.id}
                    coordinate={{
                      latitude: coords[1],
                      longitude: coords[0],
                    }}
                    title={`${d.fullName || d.name} (${d.bloodGroup})`}
                    description={`📍 ${d.formattedDistance} away • ${d.location?.city || 'Locality'}`}
                    onPress={() => setSelectedItem({ type: 'DONOR', data: d })}
                  >
                    <View style={styles.donorMarkerPin}>
                      <Text style={styles.donorMarkerText}>🩸 {d.bloodGroup}</Text>
                    </View>
                  </Marker>
                );
              })}

            {/* Real Hospital Markers from Google Places */}
            {viewMode === 'HOSPITALS' &&
              hospitals.map((h) => {
                if (!h.latitude || !h.longitude) return null;
                return (
                  <Marker
                    key={h.id}
                    coordinate={{ latitude: h.latitude, longitude: h.longitude }}
                    title={h.name}
                    description={`📍 ${h.formattedDistance} • ${h.address}`}
                    pinColor="#FF4D4D"
                    onPress={() => setSelectedItem({ type: 'HOSPITAL', data: h })}
                  />
                );
              })}

            {/* Real Blood Bank Markers from Google Places */}
            {viewMode === 'BLOOD_BANKS' &&
              bloodBanks.map((b) => {
                if (!b.latitude || !b.longitude) return null;
                return (
                  <Marker
                    key={b.id}
                    coordinate={{ latitude: b.latitude, longitude: b.longitude }}
                    title={b.name}
                    description={`📍 ${b.formattedDistance} • ${b.address}`}
                    pinColor="#8B5CF6"
                    onPress={() => setSelectedItem({ type: 'BLOOD_BANK', data: b })}
                  />
                );
              })}
          </MapView>

          {isLoadingData && (
            <View style={styles.mapOverlayLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}

          {/* Google Places Required Attribution */}
          {(viewMode === 'HOSPITALS' || viewMode === 'BLOOD_BANKS') && (
            <View style={styles.googleAttributionBadge}>
              <Text style={styles.googleAttributionText}>Powered by Google</Text>
            </View>
          )}
        </View>
      ) : (
        /* LIST VIEW */
        <ScrollView
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />}
        >
          {isLoadingData ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : viewMode === 'DONORS' ? (
            donors.length === 0 ? (
              <EmptyState
                icon="🩸"
                title={`No Donors Within ${radiusKm} km`}
                description="Try expanding your search radius to find available donors."
                actionLabel="Expand Radius to 50 km"
                onAction={() => setRadiusKm(50)}
              />
            ) : (
              donors.map((d) => (
                <View key={d.id} style={styles.listItemCard}>
                  <View style={styles.listItemHeader}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.listItemTitle}>{d.fullName || d.name || 'Registered Donor'}</Text>
                        {d.isVerified && <Text style={styles.verifiedBadgeText}>✓ Verified</Text>}
                      </View>
                      <Text style={styles.listItemSub}>📍 {d.formattedDistance} away • {d.location?.city || 'Area / City'}</Text>
                    </View>
                    <BloodGroupBadge bloodGroup={d.bloodGroup} />
                  </View>

                  {/* Donor Status & Eligibility Row */}
                  <View style={styles.donorInfoRow}>
                    <View style={styles.donorMetaTag}>
                      <Text style={styles.donorMetaText}>
                        {d.isAvailable !== false && d.donorStatus === 'AVAILABLE' ? '🟢 Available' : '⚪ Unavailable'}
                      </Text>
                    </View>
                    <View style={styles.donorMetaTag}>
                      <Text style={styles.donorMetaText}>
                        {d.isEligible ? '🟢 Eligible' : '⏳ Ineligible'}
                      </Text>
                    </View>
                    <View style={styles.donorMetaTag}>
                      <Text style={styles.donorMetaText}>
                        {d.isVerified ? '🛡️ Verified' : '👤 Active'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.btnListItemAction}
                    onPress={() => {
                      if (onRequestBlood) onRequestBlood();
                    }}
                  >
                    <Text style={styles.btnListItemActionText}>Request Emergency Blood 🚨</Text>
                  </TouchableOpacity>
                </View>
              ))
            )
          ) : viewMode === 'HOSPITALS' ? (
            hospitals.length === 0 ? (
              <EmptyState icon="🏥" title="No Hospitals Found" description="Try expanding your search radius." />
            ) : (
              hospitals.map((h) => (
                <View key={h.id} style={styles.listItemCard}>
                  <View style={styles.listItemHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemTitle}>🏥 {h.name}</Text>
                      <Text style={styles.listItemSub}>📍 {h.formattedDistance} • {h.address}</Text>
                    </View>
                    <StatusBadge status="OPEN NOW" />
                  </View>
                  <TouchableOpacity
                    style={styles.btnListItemAction}
                    onPress={() => handleOpenDirections(h.latitude, h.longitude, h.name)}
                  >
                    <Text style={styles.btnListItemActionText}>Get Navigation Directions 🗺️</Text>
                  </TouchableOpacity>
                </View>
              ))
            )
          ) : (
            bloodBanks.length === 0 ? (
              <EmptyState icon="🏦" title="No Blood Banks Found" description="Try expanding your search radius." />
            ) : (
              bloodBanks.map((b) => (
                <View key={b.id} style={styles.listItemCard}>
                  <View style={styles.listItemHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItemTitle}>🏦 {b.name}</Text>
                      <Text style={styles.listItemSub}>📍 {b.formattedDistance} • {b.address}</Text>
                    </View>
                    <StatusBadge status="OPEN NOW" />
                  </View>
                  <TouchableOpacity
                    style={styles.btnListItemAction}
                    onPress={() => handleOpenDirections(b.latitude, b.longitude, b.name)}
                  >
                    <Text style={styles.btnListItemActionText}>Get Navigation Directions 🗺️</Text>
                  </TouchableOpacity>
                </View>
              ))
            )
          )}
        </ScrollView>
      )}

      {/* Empty State Banner if no results */}
      {viewMode === 'DONORS' && donors.length === 0 && !isLoadingData && (
        <View style={styles.emptyBanner}>
          <EmptyState
            icon="🩸"
            title={`No ${selectedBloodGroup || ''} Donors Within ${radiusKm} km`}
            description="Try expanding your search radius to 20 km or 50 km to locate nearby registered donors."
            actionLabel="Expand Radius to 50 km"
            onAction={() => setRadiusKm(50)}
          />
        </View>
      )}

      {/* Selected Item Bottom Card */}
      {selectedItem && (
        <View style={styles.bottomCard}>
          <View style={styles.bottomCardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>
                {selectedItem.type === 'DONOR'
                  ? selectedItem.data.fullName || selectedItem.data.name
                  : selectedItem.data.name}
              </Text>
              <Text style={styles.cardSub}>
                📍 {selectedItem.data.formattedDistance} away • {selectedItem.data.location?.city || selectedItem.data.address}
              </Text>
            </View>
            {selectedItem.type === 'DONOR' ? (
              <BloodGroupBadge bloodGroup={selectedItem.data.bloodGroup} />
            ) : (
              <StatusBadge status="OPEN NOW" />
            )}
          </View>

          <View style={styles.cardActions}>
            {selectedItem.type === 'DONOR' ? (
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={() => {
                  setSelectedItem(null);
                  if (onRequestBlood) onRequestBlood();
                }}
              >
                <Text style={styles.cardActionBtnText}>Request Emergency Blood  🚨</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.cardActionBtn}
                onPress={() =>
                  handleOpenDirections(
                    selectedItem.data.latitude,
                    selectedItem.data.longitude,
                    selectedItem.data.name
                  )
                }
              >
                <Text style={styles.cardActionBtnText}>Get GPS Navigation Directions  🗺️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 45,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  refreshBtn: { padding: 4 },
  refreshText: { fontSize: 18 },

  filterRow: {
    flexDirection: 'row',
    padding: 10,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  toggleBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },

  filterBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
    paddingVertical: 8,
  },
  filterScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  radiusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginRight: 2,
  },
  radiusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  radiusChipActive: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  radiusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  radiusChipTextActive: {
    color: '#FFFFFF',
  },

  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapOverlayLoading: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 8,
    elevation: 4,
  },
  googleAttributionBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  googleAttributionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  donorMarkerPin: {
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    ...SHADOWS.sm,
  },
  donorMarkerText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

  emptyBanner: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },

  bottomCard: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.lg,
  },
  bottomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  cardActions: {
    marginTop: 4,
  },
  cardActionBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  /* View Switcher */
  viewSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgMain,
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  viewSwitchBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewSwitchBtnActive: {
    backgroundColor: COLORS.secondary,
  },
  viewSwitchText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  viewSwitchTextActive: {
    color: '#FFFFFF',
  },

  /* List Container */
  listContainer: {
    padding: 16,
    gap: 12,
  },
  listItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  listItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  listItemSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  btnListItemAction: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnListItemActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  donorInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  donorMetaTag: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  donorMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
});
