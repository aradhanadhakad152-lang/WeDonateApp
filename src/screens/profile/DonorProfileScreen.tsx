import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useUserStore } from '../../store/userStore';
import { BloodGroup, Gender } from '../../types/user.types';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];

interface DonorProfileScreenProps {
  onBack: () => void;
}

export const DonorProfileScreen: React.FC<DonorProfileScreenProps> = ({ onBack }) => {
  const { profile, updateUserProfile, acquireLocation, isUpdating } = useUserStore();

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

        {/* Form Fields */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full Name" placeholderTextColor="#475569" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor="#475569" keyboardType="email-address" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Blood Group</Text>
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
          <Text style={styles.label}>Last Donation Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={lastDonationDate} onChangeText={setLastDonationDate} placeholder="2026-05-15" placeholderTextColor="#475569" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>City & GPS Location</Text>
          <TouchableOpacity style={styles.gpsButton} onPress={handleDetectLocation} disabled={isLocating}>
            {isLocating ? <ActivityIndicator color="#DC2626" /> : <Text style={styles.gpsButtonText}>📍 Update GPS Coordinates</Text>}
          </TouchableOpacity>
          <TextInput style={[styles.input, { marginTop: 10 }]} value={city} onChangeText={setCity} placeholder="City Name" placeholderTextColor="#475569" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Age</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="Age" placeholderTextColor="#475569" keyboardType="number-pad" maxLength={2} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              <TouchableOpacity key={g} style={[styles.genderPill, gender === g && styles.genderPillSelected]} onPress={() => setGender(g)}>
                <Text style={[styles.genderPillText, gender === g && styles.genderPillTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, isUpdating && styles.buttonDisabled]} onPress={handleSave} disabled={isUpdating}>
          {isUpdating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  scrollContent: { padding: 20, paddingTop: 50 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  backText: { fontSize: 16, color: '#94A3B8', fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '700', color: '#F1F5F9' },
  errorBanner: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: '#EF4444', borderWidth: 1, color: '#FCA5A5', padding: 12, borderRadius: 8, fontSize: 13, marginBottom: 16, textAlign: 'center' },
  readOnlyCard: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 16, marginBottom: 20 },
  readOnlyLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  readOnlyValue: { fontSize: 16, fontWeight: '700', color: '#22C55E', marginTop: 4 },
  readOnlySub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#CBD5E1', marginBottom: 8 },
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 16, height: 48, fontSize: 15, color: '#F1F5F9' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bloodPill: { width: '22%', height: 44, borderRadius: 10, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  bloodPillSelected: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  bloodPillText: { fontSize: 15, fontWeight: '700', color: '#CBD5E1' },
  bloodPillTextSelected: { color: '#FFFFFF' },
  gpsButton: { backgroundColor: 'rgba(220, 38, 38, 0.1)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.4)', borderRadius: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  gpsButtonText: { fontSize: 14, fontWeight: '600', color: '#DC2626' },
  genderRow: { flexDirection: 'row', gap: 12 },
  genderPill: { flex: 1, height: 42, borderRadius: 8, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  genderPillSelected: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  genderPillText: { fontSize: 13, fontWeight: '600', color: '#CBD5E1' },
  genderPillTextSelected: { color: '#0F172A' },
  saveButton: { backgroundColor: '#DC2626', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 40 },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
