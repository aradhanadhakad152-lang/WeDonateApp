import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { COLORS, SHADOWS } from '../../theme/colors';
import { searchBloodAvailability, BloodAvailabilityItem } from '../../services/hospitalService';
import { BloodGroupBadge } from '../../components/ui/BloodGroupBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';

interface BloodAvailabilityScreenProps {
  onBack: () => void;
  onRequestBlood: () => void;
  userLatitude?: number;
  userLongitude?: number;
}

const STATES_LIST = [
  'ALL',
  'Delhi',
  'Maharashtra',
  'Karnataka',
  'Tamil Nadu',
  'Uttar Pradesh',
  'West Bengal',
  'Gujarat',
  'Telangana',
  'Rajasthan',
];

const DISTRICTS_LIST = [
  'ALL',
  'New Delhi',
  'South Delhi',
  'Central Delhi',
  'North Delhi',
  'East Delhi',
  'West Delhi',
  'Mumbai City',
  'Bengaluru Urban',
  'Chennai',
  'Kolkata',
  'Hyderabad',
];

const COMPONENTS_LIST = [
  'ALL',
  'Whole Blood',
  'PRBC (Packed Red Cells)',
  'Platelets',
  'FFP (Fresh Frozen Plasma)',
  'Cryoprecipitate',
];

const BLOOD_GROUPS_LIST = ['ALL', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const BloodAvailabilityScreen: React.FC<BloodAvailabilityScreenProps> = ({
  onBack,
  onRequestBlood,
  userLatitude,
  userLongitude,
}) => {
  const [selectedState, setSelectedState] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [selectedComponent, setSelectedComponent] = useState('ALL');
  const [selectedBloodGroup, setSelectedBloodGroup] = useState('ALL');

  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BloodAvailabilityItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const data = await searchBloodAvailability({
        state: selectedState,
        district: selectedDistrict,
        component: selectedComponent,
        bloodGroup: selectedBloodGroup,
        latitude: userLatitude,
        longitude: userLongitude,
      });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleSearch();
  }, []);

  const handleCallPhone = (phone?: string) => {
    if (!phone) {
      Alert.alert('Contact Info', 'No phone number listed for this facility.');
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Alert.alert('Helpline', `Facility Phone: ${phone}`);
    });
  };

  return (
    <View style={styles.mainWrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Top Header & Back Button */}
        <View style={styles.headerBar}>
          <TouchableOpacity style={styles.btnBack} onPress={onBack} activeOpacity={0.7}>
            <Text style={styles.btnBackText}>← Back to Search Options</Text>
          </TouchableOpacity>

          <Text style={styles.title}>🩸 Blood Availability</Text>
          <Text style={styles.subtitle}>
            Filter by State, District, Blood Component, and Blood Group to check live available stock at hospitals and blood banks.
          </Text>
        </View>

        {/* Filter Controls Form */}
        <View style={styles.filterSection}>
          <Text style={styles.sectionHeading}>Search Filters</Text>

          {/* 1. STATE FILTER */}
          <Text style={styles.filterLabel}>1. Select State</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {STATES_LIST.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.chip, selectedState === st && styles.chipActive]}
                onPress={() => setSelectedState(st)}
              >
                <Text style={[styles.chipText, selectedState === st && styles.chipTextActive]}>
                  {st === 'ALL' ? '🌐 All States' : st}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 2. DISTRICT FILTER */}
          <Text style={styles.filterLabel}>2. Select District</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {DISTRICTS_LIST.map((dist) => (
              <TouchableOpacity
                key={dist}
                style={[styles.chip, selectedDistrict === dist && styles.chipActive]}
                onPress={() => setSelectedDistrict(dist)}
              >
                <Text style={[styles.chipText, selectedDistrict === dist && styles.chipTextActive]}>
                  {dist === 'ALL' ? '📍 All Districts' : dist}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 3. BLOOD COMPONENT FILTER */}
          <Text style={styles.filterLabel}>3. Blood Component</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {COMPONENTS_LIST.map((comp) => (
              <TouchableOpacity
                key={comp}
                style={[styles.chip, selectedComponent === comp && styles.chipActive]}
                onPress={() => setSelectedComponent(comp)}
              >
                <Text style={[styles.chipText, selectedComponent === comp && styles.chipTextActive]}>
                  {comp === 'ALL' ? '🩸 All Components' : comp}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* 4. BLOOD GROUP FILTER */}
          <Text style={styles.filterLabel}>4. Blood Group</Text>
          <View style={styles.gridRow}>
            {BLOOD_GROUPS_LIST.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[styles.gridChip, selectedBloodGroup === bg && styles.gridChipActive]}
                onPress={() => setSelectedBloodGroup(bg)}
              >
                <Text style={[styles.gridChipText, selectedBloodGroup === bg && styles.gridChipTextActive]}>
                  {bg === 'ALL' ? 'ALL' : bg}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Search Trigger Button */}
          <TouchableOpacity style={styles.btnSearch} onPress={handleSearch} activeOpacity={0.85}>
            <Text style={styles.btnSearchText}>🔍 Search Available Blood Units ➔</Text>
          </TouchableOpacity>
        </View>

        {/* Results Section */}
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeaderRow}>
            <Text style={styles.resultsTitle}>Available Blood Stock Results</Text>
            {hasSearched && !isLoading && (
              <Text style={styles.resultsCountBadge}>{results.length} Facilities</Text>
            )}
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Searching live blood bank inventory...</Text>
            </View>
          ) : results.length === 0 ? (
            <EmptyState
              icon="🩸"
              title="No Blood Units Available"
              description="No stock matched your selected State, District, Component, or Blood Group filters."
              actionLabel="Reset Filters ➔"
              onAction={() => {
                setSelectedState('ALL');
                setSelectedDistrict('ALL');
                setSelectedComponent('ALL');
                setSelectedBloodGroup('ALL');
                handleSearch();
              }}
            />
          ) : (
            <View style={styles.cardsList}>
              {results.map((item) => (
                <View key={item.id} style={styles.facilityCard}>
                  {/* Top Bar */}
                  <View style={styles.facilityTopRow}>
                    <View style={styles.facilityTypeBadge}>
                      <Text style={styles.facilityTypeText}>
                        {item.type === 'BLOOD_BANK' ? '🏦 BLOOD BANK' : '🏥 HOSPITAL'}
                      </Text>
                    </View>
                    {!!item.distanceKm && (
                      <Text style={styles.distanceBadge}>📍 {item.distanceKm} km away</Text>
                    )}
                  </View>

                  {/* Name & Address */}
                  <Text style={styles.facilityName}>{item.name}</Text>
                  <Text style={styles.facilityAddress}>
                    📍 {item.address} ({item.district}, {item.state})
                  </Text>

                  {/* Stock Breakdown */}
                  <Text style={styles.stockLabel}>Live Available Units:</Text>
                  <View style={styles.stockGrid}>
                    {item.stock.map((s, idx) => (
                      <View key={idx} style={styles.stockItemBadge}>
                        <BloodGroupBadge bloodGroup={s.bloodGroup} size="sm" />
                        <View style={styles.stockInfo}>
                          <Text style={styles.stockUnitsText}>{s.units} Unit(s)</Text>
                          <Text style={styles.stockCompText}>{s.component}</Text>
                        </View>
                        <StatusBadge status={s.status === 'AVAILABLE' ? 'ACCEPTED' : 'EXPIRED'} />
                      </View>
                    ))}
                  </View>

                  {/* Action Buttons Footer */}
                  <View style={styles.cardActionsRow}>
                    {!!item.phone && (
                      <TouchableOpacity
                        style={styles.btnCall}
                        onPress={() => handleCallPhone(item.phone)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.btnCallText}>📞 Call Facility</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.btnRequestHere}
                      onPress={onRequestBlood}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.btnRequestHereText}>📋 Request Blood ➔</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  headerBar: {
    marginBottom: 20,
  },
  btnBack: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    ...SHADOWS.sm,
  },
  btnBackText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  filterSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    marginBottom: 24,
    ...SHADOWS.sm,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 10,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  gridChip: {
    width: '22%',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
  },
  gridChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  gridChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  gridChipTextActive: {
    color: '#FFFFFF',
  },
  btnSearch: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    ...SHADOWS.sm,
  },
  btnSearchText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  resultsSection: {
    marginTop: 8,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  resultsCountBadge: {
    backgroundColor: COLORS.primaryLight,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  cardsList: {
    gap: 16,
  },
  facilityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  facilityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  facilityTypeBadge: {
    backgroundColor: COLORS.bgMain,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
  },
  facilityTypeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  distanceBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  facilityName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  facilityAddress: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  stockLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 6,
  },
  stockGrid: {
    gap: 8,
    marginBottom: 14,
  },
  stockItemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgMain,
    borderRadius: 10,
    padding: 8,
    paddingHorizontal: 10,
  },
  stockInfo: {
    flex: 1,
    marginLeft: 10,
  },
  stockUnitsText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  stockCompText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btnCall: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCallText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  btnRequestHere: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnRequestHereText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
