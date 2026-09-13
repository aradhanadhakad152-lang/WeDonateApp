import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { api } from '../../services/api';
import { useUserStore } from '../../store/userStore';
import { getNearbyHospitals, getHospitalAutocomplete, RealHospital, HospitalSuggestion } from '../../services/hospitalService';
import { BloodGroup } from '../../types/user.types';
import { BloodRequest } from '../../types/request.types';
import { COLORS, SHADOWS } from '../../theme/colors';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

interface RequestBloodScreenProps {
  onBack: () => void;
  onRequestCreated: (request: BloodRequest) => void;
}

export const RequestBloodScreen: React.FC<RequestBloodScreenProps> = ({ onBack, onRequestCreated }) => {
  const { profile, acquireLocation } = useUserStore();

  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>('B+');
  const [unitsRequired, setUnitsRequired] = useState(2);
  const [hospitalName, setHospitalName] = useState('AIIMS Trauma Centre');
  const [hospitalAddress, setHospitalAddress] = useState('Ansari Nagar, New Delhi');
  const [urgency, setUrgency] = useState<'CRITICAL' | 'HIGH' | 'URGENT'>('CRITICAL');
  const [contactPhone, setContactPhone] = useState(profile?.phone || '+91 98765 12345');
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Location
  const [latitude, setLatitude] = useState<number>(profile?.location?.coordinates[1] || 28.5672);
  const [longitude, setLongitude] = useState<number>(profile?.location?.coordinates[0] || 77.2100);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [existingActiveRequest, setExistingActiveRequest] = useState<BloodRequest | null>(null);

  // Real Hospital Picker Modal & Autocomplete
  const [realHospitals, setRealHospitals] = useState<RealHospital[]>([]);
  const [systemHospitals, setSystemHospitals] = useState<Array<{ _id: string; name: string; address?: { city?: string; street?: string } }>>([]);
  const [targetOrganizationId, setTargetOrganizationId] = useState<string | undefined>(undefined);
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [isLoadingHospitals, setIsLoadingHospitals] = useState(false);

  // Live Autocomplete Suggestions
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<HospitalSuggestion[]>([]);
  const [googleAttribution, setGoogleAttribution] = useState('');
  const [isSearchingAutocomplete, setIsSearchingAutocomplete] = useState(false);

  useEffect(() => {
    fetchHospitals(latitude, longitude);
    fetchSystemHospitals();
  }, [latitude, longitude]);

  const fetchSystemHospitals = async () => {
    try {
      const res = await api.get<{ success: boolean; data: { organizations: Array<any> } }>('/organizations/list?type=HOSPITAL');
      if (res.data?.data?.organizations) {
        setSystemHospitals(res.data.data.organizations);
      }
    } catch {
      // Ignore
    }
  };

  const fetchHospitals = async (lat: number, lng: number) => {
    setIsLoadingHospitals(true);
    try {
      const list = await getNearbyHospitals(lat, lng, 15);
      setRealHospitals(list);
    } catch {
      // Ignore
    } finally {
      setIsLoadingHospitals(false);
    }
  };

  const handleHospitalInputChange = async (text: string) => {
    setHospitalName(text);
    setTargetOrganizationId(undefined);
    if (text.trim().length >= 2) {
      setIsSearchingAutocomplete(true);
      try {
        const res = await getHospitalAutocomplete(text, latitude, longitude);
        setAutocompleteSuggestions(res.suggestions || []);
        setGoogleAttribution(res.attribution || '');
      } catch {
        setAutocompleteSuggestions([]);
      } finally {
        setIsSearchingAutocomplete(false);
      }
    } else {
      setAutocompleteSuggestions([]);
    }
  };

  const selectSuggestion = (s: HospitalSuggestion) => {
    setHospitalName(s.name);
    if (s.address) setHospitalAddress(s.address);
    setTargetOrganizationId(undefined);
    setAutocompleteSuggestions([]);
  };

  const changeUnits = (delta: number) => {
    setUnitsRequired((prev) => Math.max(1, Math.min(10, prev + delta)));
  };

  const handleDetectGPS = async () => {
    setIsLocating(true);
    try {
      const loc = await acquireLocation();
      setIsLocating(false);
      if (loc) {
        setLatitude(loc.latitude);
        setLongitude(loc.longitude);
        if (loc.city) setHospitalAddress(`${loc.city}, Detected GPS`);
        fetchHospitals(loc.latitude, loc.longitude);
        Alert.alert('GPS Location Detected', `Lat: ${loc.latitude.toFixed(4)}, Lng: ${loc.longitude.toFixed(4)}`);
      }
    } catch (err) {
      setIsLocating(false);
      Alert.alert('Location Error', 'Using current hospital coordinates.');
    }
  };

  const selectHospital = (h: RealHospital) => {
    setHospitalName(h.name);
    setHospitalAddress(h.address);
    setLatitude(h.latitude);
    setLongitude(h.longitude);
    setTargetOrganizationId(undefined);
    setShowHospitalPicker(false);
  };

  const selectRegisteredOrg = (org: { _id: string; name: string; address?: { city?: string; street?: string } }) => {
    setHospitalName(org.name);
    if (org.address?.city) setHospitalAddress(`${org.address.street || ''}, ${org.address.city}`);
    setTargetOrganizationId(org._id);
    setShowHospitalPicker(false);
  };

  const handleSubmit = async () => {
    setErrorMessage('');
    setExistingActiveRequest(null);

    if (!patientName.trim()) {
      setErrorMessage('Please enter the patient full name');
      return;
    }
    if (!hospitalName.trim()) {
      setErrorMessage('Please select or enter the hospital name');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await api.post<{ success: boolean; data: { request: BloodRequest } }>('/blood-requests', {
        patientName: patientName.trim(),
        bloodGroup,
        unitsRequired,
        hospitalName: hospitalName.trim(),
        hospitalAddress: hospitalAddress.trim(),
        hospitalLatitude: latitude,
        hospitalLongitude: longitude,
        urgency,
        contactPhone: contactPhone.trim(),
        additionalNotes: additionalNotes.trim(),
        ...(targetOrganizationId ? { targetOrganizationId } : {}),
      });

      setIsSubmitting(false);
      onRequestCreated(response.data.data.request);
    } catch (err: any) {
      setIsSubmitting(false);
      const resData = err?.response?.data;
      const msg = resData?.message || 'Failed to submit blood request. Please try again.';
      const existing = resData?.existingRequest || resData?.data?.existingRequest || resData?.data?.request;

      setErrorMessage(msg);
      if (existing) {
        setExistingActiveRequest(existing);
      } else {
        Alert.alert('Request Error', msg);
      }
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Request Blood</Text>
          <View style={{ width: 60 }} />
        </View>

        {!!errorMessage && <Text style={styles.errorBanner}>{errorMessage}</Text>}

        {existingActiveRequest && (
          <View style={styles.existingCard}>
            <Text style={styles.existingCardTitle}>🚨 Active Blood Request Exists</Text>
            <Text style={styles.existingCardBody}>
              You already have an active request for patient{' '}
              <Text style={{ fontWeight: '700', color: COLORS.secondary }}>{existingActiveRequest.patientName}</Text> ({' '}
              <Text style={{ fontWeight: '700', color: COLORS.primary }}>{existingActiveRequest.bloodGroup}</Text>) at{' '}
              <Text style={{ fontWeight: '700', color: COLORS.secondary }}>{existingActiveRequest.hospitalName}</Text>.
            </Text>
            <TouchableOpacity
              style={styles.existingCardBtn}
              onPress={() => onRequestCreated(existingActiveRequest)}
            >
              <Text style={styles.existingCardBtnText}>View Existing Request ➔</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Blood Group Selector */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>BLOOD GROUP REQUIRED</Text>
          <View style={styles.bloodGrid}>
            {BLOOD_GROUPS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[styles.bloodPill, bloodGroup === bg && styles.bloodPillSelected]}
                onPress={() => setBloodGroup(bg)}
              >
                <Text style={[styles.bloodPillText, bloodGroup === bg && styles.bloodPillTextSelected]}>
                  {bg}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Units Counter */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>UNITS REQUIRED</Text>
          <View style={styles.unitsCounterWrapper}>
            <TouchableOpacity style={styles.btnCounter} onPress={() => changeUnits(-1)}>
              <Text style={styles.btnCounterText}>-</Text>
            </TouchableOpacity>
            <View style={styles.unitsDisplay}>
              <Text style={styles.unitsDisplayText}>{unitsRequired} Units</Text>
            </View>
            <TouchableOpacity style={styles.btnCounter} onPress={() => changeUnits(1)}>
              <Text style={styles.btnCounterText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Patient Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>PATIENT FULL NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ramesh Kumar"
            placeholderTextColor="#94A3B8"
            value={patientName}
            onChangeText={setPatientName}
          />
        </View>

        {/* Real Hospital Select & Autocomplete */}
        <View style={styles.formGroup}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.label}>HOSPITAL NAME & LOCATION</Text>
            <TouchableOpacity onPress={() => setShowHospitalPicker(true)}>
              <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>🏥 Nearby Hospitals</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Type hospital name (e.g. AIIMS, Fortis, Max)..."
            placeholderTextColor="#94A3B8"
            value={hospitalName}
            onChangeText={handleHospitalInputChange}
          />

          {/* Inline Autocomplete Dropdown */}
          {autocompleteSuggestions.length > 0 && (
            <View style={styles.autocompleteDropdown}>
              {autocompleteSuggestions.map((s, idx) => (
                <TouchableOpacity
                  key={s.placeId || idx}
                  style={styles.autocompleteItem}
                  onPress={() => selectSuggestion(s)}
                >
                  <Text style={styles.autocompleteItemName}>🏥 {s.name}</Text>
                  {!!s.address && <Text style={styles.autocompleteItemAddress}>{s.address}</Text>}
                </TouchableOpacity>
              ))}
              {!!googleAttribution && (
                <Text style={styles.attributionText}>{googleAttribution}</Text>
              )}
            </View>
          )}
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>HOSPITAL ADDRESS / AREA</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Ansari Nagar, New Delhi"
            placeholderTextColor="#94A3B8"
            value={hospitalAddress}
            onChangeText={setHospitalAddress}
          />
        </View>

        {/* GPS Location Button */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>CURRENT GPS LOCATION</Text>
          <TouchableOpacity style={styles.gpsButton} onPress={handleDetectGPS} disabled={isLocating}>
            {isLocating ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.gpsButtonText}>📍 Detect GPS Location Coordinates</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Urgency Level */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>URGENCY LEVEL</Text>
          <View style={styles.urgencyRow}>
            {(['CRITICAL', 'HIGH', 'URGENT'] as const).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.urgencyPill, urgency === u && styles.urgencyPillSelected]}
                onPress={() => setUrgency(u)}
              >
                <Text style={[styles.urgencyPillText, urgency === u && styles.urgencyPillTextSelected]}>
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Contact Phone */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>CONTACT PHONE NUMBER</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 98765 12345"
            placeholderTextColor="#94A3B8"
            keyboardType="phone-pad"
            value={contactPhone}
            onChangeText={setContactPhone}
          />
        </View>

        <TouchableOpacity
          style={[styles.btnCoralWide, isSubmitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnCoralWideText}>Submit Emergency Request  🚨</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Real Hospital Picker Modal */}
      <Modal visible={showHospitalPicker} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🏥 Select Hospital</Text>
            {isLoadingHospitals ? (
              <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView style={{ maxHeight: 320, width: '100%' }}>
                {systemHospitals.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary, marginBottom: 6 }}>VERIFIED PARTNER HOSPITALS</Text>
                    {systemHospitals.map((org) => (
                      <TouchableOpacity
                        key={org._id}
                        style={[styles.hospitalItem, { backgroundColor: '#FFF1F2' }]}
                        onPress={() => selectRegisteredOrg(org)}
                      >
                        <Text style={styles.hospitalItemName}>🏥 {org.name}</Text>
                        <Text style={styles.hospitalItemAddress}>📍 Verified Partner Hospital {org.address?.city ? `• ${org.address.city}` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.secondary, marginBottom: 6 }}>NEARBY HOSPITALS</Text>
                {realHospitals.map((h) => (
                  <TouchableOpacity
                    key={h.id}
                    style={styles.hospitalItem}
                    onPress={() => selectHospital(h)}
                  >
                    <Text style={styles.hospitalItemName}>{h.name}</Text>
                    <Text style={styles.hospitalItemAddress}>📍 {h.formattedDistance} • {h.address}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowHospitalPicker(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 45,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    paddingVertical: 6,
  },
  backText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  errorBanner: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#FFA3A3',
    color: COLORS.danger,
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  existingCard: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    ...SHADOWS.sm,
  },
  existingCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.danger,
    marginBottom: 6,
  },
  existingCardBody: {
    fontSize: 13,
    color: COLORS.textMain,
    lineHeight: 19,
    marginBottom: 12,
  },
  existingCardBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  existingCardBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 15,
    color: COLORS.textMain,
  },
  autocompleteDropdown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 180,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  autocompleteItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  autocompleteItemAddress: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  attributionText: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'right',
    padding: 6,
    fontStyle: 'italic',
  },
  bloodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  bloodPill: {
    width: '23%',
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloodPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  bloodPillText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  bloodPillTextSelected: {
    color: '#FFFFFF',
  },
  unitsCounterWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  btnCounter: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCounterText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
  },
  unitsDisplay: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitsDisplayText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  gpsButton: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#FFA3A3',
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  gpsButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  urgencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  urgencyPill: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgencyPillSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  urgencyPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  urgencyPillTextSelected: {
    color: '#FFFFFF',
  },
  btnCoralWide: {
    width: '100%',
    height: 54,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 30,
    ...SHADOWS.md,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnCoralWideText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.secondary,
    marginBottom: 14,
  },
  hospitalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  hospitalItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  hospitalItemAddress: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  modalCloseBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 16,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
