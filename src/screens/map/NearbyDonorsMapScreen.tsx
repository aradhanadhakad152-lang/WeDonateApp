import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { getCurrentDeviceLocation, LocationData } from '../../services/locationService';
import { getNearbyDonors, NearbyDonor } from '../../services/userService';
import { getNearbyHospitals, RealHospital } from '../../services/hospitalService';
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
  const [viewMode, setViewMode] = useState<'DONORS' | 'HOSPITALS'>('DONORS');
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string | undefined>(undefined);

  // Data
  const [donors, setDonors] = useState<NearbyDonor[]>([]);
  const [hospitals, setHospitals] = useState<RealHospital[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Selected item card
  const [selectedItem, setSelectedItem] = useState<{ type: 'DONOR' | 'HOSPITAL'; data: any } | null>(null);

  // Acquire user GPS on mount
  useEffect(() => {
    let isMounted = true;
    const fetchLocation = async () => {
      setIsLocating(true);
      const loc = await getCurrentDeviceLocation();
      if (isMounted) {
        setIsLocating(false);
        if (loc) {
          setUserLocation(loc);
        } else {
          Alert.alert('GPS Location Required', 'Please enable location services and grant permission to view nearby donors on the map.');
          // Default fallback location for India
          setUserLocation({ latitude: 28.5672, longitude: 77.2100, accuracy: 10, city: 'New Delhi' });
        }
      }
    };
    fetchLocation();
    return () => { isMounted = false; };
  }, []);

  // Fetch real donors/hospitals when location or filters change
  const loadMapData = useCallback(async () => {
    if (!userLocation) return;
    setIsLoadingData(true);
    try {
      if (viewMode === 'DONORS') {
        const result = await getNearbyDonors(userLocation.latitude, userLocation.longitude, radiusKm, selectedBloodGroup);
        setDonors(result);
      } else {
        const result = await getNearbyHospitals(userLocation.latitude, userLocation.longitude, radiusKm);
        setHospitals(result);
      }
    } catch (err) {
      console.warn('Failed to load map data:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [userLocation, viewMode, radiusKm, selectedBloodGroup]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

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

  const initialRegion = {
    latitude: userLocation?.latitude || 28.5672,
    longitude: userLocation?.longitude || 77.2100,
    latitudeDelta: radiusKm > 10 ? 0.18 : 0.08,
    longitudeDelta: radiusKm > 10 ? 0.18 : 0.08,
  };

  return (
    <View style={styles.container}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nearby Radar Map</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadMapData}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Mode Filter Toggle: Donors vs Hospitals */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'DONORS' && styles.toggleBtnActive]}
          onPress={() => { setViewMode('DONORS'); setSelectedItem(null); }}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'DONORS' && styles.toggleBtnTextActive]}>
            💓 Registered Donors ({donors.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toggleBtn, viewMode === 'HOSPITALS' && styles.toggleBtnActive]}
          onPress={() => { setViewMode('HOSPITALS'); setSelectedItem(null); }}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'HOSPITALS' && styles.toggleBtnTextActive]}>
            🏥 Real Hospitals ({hospitals.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Radius Chips */}
      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Radius:</Text>
        {[2, 5, 10, 20].map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.radiusChip, radiusKm === r && styles.radiusChipActive]}
            onPress={() => setRadiusKm(r)}
          >
            <Text style={[styles.radiusChipText, radiusKm === r && styles.radiusChipTextActive]}>{r} km</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Google Map View */}
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
              title="Your Current Location"
              description={userLocation.city || 'GPS Position'}
              pinColor="#0284C7"
            />
          )}

          {/* Donor Markers */}
          {viewMode === 'DONORS' &&
            donors.map((d) => (
              <Marker
                key={d.id}
                coordinate={{
                  latitude: d.location?.coordinates[1] || userLocation!.latitude + 0.003,
                  longitude: d.location?.coordinates[0] || userLocation!.longitude + 0.003,
                }}
                title={`${d.fullName || d.name} (${d.bloodGroup})`}
                description={`📍 ${d.formattedDistance} away`}
                onPress={() => setSelectedItem({ type: 'DONOR', data: d })}
              >
                <View style={styles.donorMarkerPin}>
                  <Text style={styles.donorMarkerText}>{d.bloodGroup}</Text>
                </View>
              </Marker>
            ))}

          {/* Hospital Markers */}
          {viewMode === 'HOSPITALS' &&
            hospitals.map((h) => (
              <Marker
                key={h.id}
                coordinate={{ latitude: h.latitude, longitude: h.longitude }}
                title={h.name}
                description={`📍 ${h.formattedDistance} • ${h.address}`}
                pinColor="#FF4D4D"
                onPress={() => setSelectedItem({ type: 'HOSPITAL', data: h })}
              />
            ))}
        </MapView>

        {isLoadingData && (
          <View style={styles.mapOverlayLoading}>
            <ActivityIndicator size="medium" color={COLORS.primary} />
          </View>
        )}
      </View>

      {/* Empty State Banner if no results */}
      {viewMode === 'DONORS' && donors.length === 0 && !isLoadingData && (
        <View style={styles.emptyBanner}>
          <EmptyState
            icon="🩸"
            title={`No ${selectedBloodGroup || ''} Donors Within ${radiusKm} km`}
            description="Try expanding your search radius to 20 km to locate nearby registered donors."
            actionText="Expand Radius to 20 km"
            onAction={() => setRadiusKm(20)}
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
    padding: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
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
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },

  radiusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  radiusLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginRight: 4,
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
});
