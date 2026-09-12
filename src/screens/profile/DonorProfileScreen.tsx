import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useUserStore } from '../../store/userStore';
import { BloodGroup, Gender } from '../../types/user.types';
import { COLORS, SHADOWS } from '../../theme/colors';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];

interface DonorProfileScreenProps {
  onBack: () => void;
}

export const DonorProfileScreen: React.FC<DonorProfileScreenProps> = ({ onBack }) => {
  const { profile, updateUserProfile, toggleAvailability, acquireLocation, isUpdating } = useUserStore();

  const [fullName, setFullName] = useState(profile?.name || profile?.fullName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(profile?.bloodGroup || 'A+');
  const [gender, setGender] = useState<Gender | null>(profile?.gender || null);
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [lastDonationDate, setLastDonationDate] = useState(
    profile?.lastDonationDate ? new Date(profile.lastDonationDate).toISOString().split('T')[0] : ''
  );

  // Location
  const [city, setCity] = useState(profile?.location?.city || '');
  const [stateName, setStateName] = useState(profile?.location?.state || '');
  const [pincode, setPincode] = useState(profile?.location?.pincode || '');
  const [coordinates, setCoordinates] = useState<[number, number]>(profile?.location?.coordinates || [0, 0]);
  const [isLocating, setIsLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDetectLocation = async () => {
    setIsLocating(true);
    try {
      const loc = await acquireLocation();
      setIsLocating(false);
      if (loc) {
        setCoordinates([loc.longitude, loc.latitude]);
        if (loc.city) setCity(loc.city);
        if (loc.state) setStateName(loc.state);
        if (loc.pincode) setPincode(loc.pincode);
        Alert.alert('GPS Location Updated', `City: ${loc.city || 'Detected'}, Lat: ${loc.latitude.toFixed(4)}, Lng: ${loc.longitude.toFixed(4)}`);
      }
    } catch {
      setIsLocating(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage('');

    if (!fullName.trim()) {
      setErrorMessage('Full name is required');
      return;
    }

    const payload: any = {
      fullName: fullName.trim(),
      name: fullName.trim(),
      email: email.trim() || undefined,
      bloodGroup,
      gender: gender || undefined,
      age: age.trim() ? parseInt(age.trim(), 10) : undefined,
      lastDonationDate: lastDonationDate.trim() || undefined,
      location: {
        coordinates,
        city: city.trim(),
        state: stateName.trim(),
        pincode: pincode.trim(),
      },
    };

    try {
      await updateUserProfile(payload);
      Alert.alert('Profile Saved', 'Your donor profile has been updated in MongoDB Atlas.');
      onBack();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to update profile.';
      setErrorMessage(msg);
      Alert.alert('Save Error', msg);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>Edit Donor Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        {!!errorMessage && <Text style={styles.errorBanner}>{errorMessage}</Text>}

        {/* Read-Only Identity Card */}
        <View style={styles.readOnlyCard}>
          <Text style={styles.readOnlyLabel}>Phone Number (Firebase Verified)</Text>
          <Text style={styles.readOnlyValue}>{profile?.phone}</Text>
          <Text style={styles.readOnlySub}>Firebase UID: {profile?.firebaseUid}</Text>
        </View>

        {/* Donor Availability Switch Card */}
        <View style={styles.availCard}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.availTitle}>🟢 Emergency Donor Availability</Text>
            <Text style={styles.availSub}>
              {profile?.isAvailable ?? profile?.donorStatus === 'AVAILABLE'
                ? 'Visible on Radar Map to nearby emergency requests'
                : 'Offline from emergency donor matching'}
            </Text>
          </View>
          <Switch
            trackColor={{ false: '#CBD5E1', true: COLORS.primaryLight }}
            thumbColor={(profile?.isAvailable ?? profile?.donorStatus === 'AVAILABLE') ? COLORS.primary : '#94A3B8'}
            onValueChange={(val) => toggleAvailability(val)}
            value={profile?.isAvailable ?? profile?.donorStatus === 'AVAILABLE'}
          />
        </View>

        {/* Form Fields */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full Name" placeholderTextColor="#94A3B8" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#94A3B8" keyboardType="email-address" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>BLOOD GROUP</Text>
          <View style={styles.grid}>
            {BLOOD_GROUPS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[styles.bloodPill, bloodGroup === bg && styles.bloodPillSelected]}
                onPress={() => setBloodGroup(bg)}
              >
                <Text style={[styles.bloodPillText, bloodGroup === bg && styles.bloodPillTextSelected]}>{bg}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>LAST DONATION DATE (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={lastDonationDate} onChangeText={setLastDonationDate} placeholder="2026-05-15" placeholderTextColor="#94A3B8" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>CITY & GPS LOCATION</Text>
          <TouchableOpacity style={styles.gpsButton} onPress={handleDetectLocation} disabled={isLocating}>
            {isLocating ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.gpsButtonText}>📍 Update GPS Coordinates</Text>}
          </TouchableOpacity>
          <TextInput style={[styles.input, { marginTop: 8 }]} value={city} onChangeText={setCity} placeholder="City Name" placeholderTextColor="#94A3B8" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>AGE</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="Age" placeholderTextColor="#94A3B8" keyboardType="number-pad" maxLength={2} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>GENDER</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              <TouchableOpacity key={g} style={[styles.genderPill, gender === g && styles.genderPillSelected]} onPress={() => setGender(g)}>
                <Text style={[styles.genderPillText, gender === g && styles.genderPillTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, isUpdating && styles.buttonDisabled]} onPress={handleSave} disabled={isUpdating} activeOpacity={0.85}>
          {isUpdating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Profile Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgMain },
  scrollContent: { padding: 20, paddingTop: 45 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  errorBanner: { backgroundColor: COLORS.primaryLight, borderColor: '#FFA3A3', borderWidth: 1, color: COLORS.danger, padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 16, textAlign: 'center', fontWeight: '600' },
  readOnlyCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.borderColor, borderRadius: 14, padding: 16, marginBottom: 14, ...SHADOWS.sm },
  readOnlyLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  readOnlyValue: { fontSize: 16, fontWeight: '800', color: COLORS.success, marginTop: 4 },
  readOnlySub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  availCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: COLORS.borderColor, borderRadius: 14, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...SHADOWS.sm },
  availTitle: { fontSize: 14, fontWeight: '800', color: COLORS.secondary },
  availSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.secondary, marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.borderColor, borderRadius: 12, paddingHorizontal: 16, height: 48, fontSize: 15, color: COLORS.textMain },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloodPill: { width: '23%', height: 42, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.borderColor, alignItems: 'center', justifyContent: 'center' },
  bloodPillSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  bloodPillText: { fontSize: 15, fontWeight: '800', color: COLORS.secondary },
  bloodPillTextSelected: { color: '#FFFFFF' },
  gpsButton: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: '#FFA3A3', borderRadius: 10, height: 42, alignItems: 'center', justifyContent: 'center' },
  gpsButtonText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderPill: { flex: 1, height: 42, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.borderColor, alignItems: 'center', justifyContent: 'center' },
  genderPillSelected: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  genderPillText: { fontSize: 13, fontWeight: '700', color: COLORS.secondary },
  genderPillTextSelected: { color: '#FFFFFF' },
  saveButton: { backgroundColor: COLORS.primary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 30, ...SHADOWS.md },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
