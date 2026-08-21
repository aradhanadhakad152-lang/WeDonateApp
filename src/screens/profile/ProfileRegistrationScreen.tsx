import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useUserStore } from '../../store/userStore';
import { BloodGroup, Gender } from '../../types/user.types';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];

interface ProfileRegistrationScreenProps {
  onComplete: () => void;
}

export const ProfileRegistrationScreen: React.FC<ProfileRegistrationScreenProps> = ({ onComplete }) => {
  const { profile, updateUserProfile, acquireLocation, isUpdating } = useUserStore();

  const [fullName, setFullName] = useState(profile?.name || profile?.fullName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | null>(profile?.bloodGroup || null);
  const [gender, setGender] = useState<Gender | null>(profile?.gender || null);
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  
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
        Alert.alert('GPS Location Detected', `City: ${loc.city || 'Detected'}, Lat: ${loc.latitude.toFixed(4)}, Lng: ${loc.longitude.toFixed(4)}`);
      } else {
        Alert.alert('Location Notice', 'Could not detect location automatically. Please enter your city manually.');
      }
    } catch (err) {
      setIsLocating(false);
      Alert.alert('Location Notice', 'Could not access GPS. Please enter your city manually.');
    }
  };

  const handleSubmit = async () => {
    setErrorMessage('');

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Please enter your full name');
      return;
    }

    if (!bloodGroup) {
      setErrorMessage('Please select your blood group');
      return;
    }

    if (!city.trim()) {
      setErrorMessage('Please enter your city or detect GPS location');
      return;
    }

    const payload: any = {
      fullName: fullName.trim(),
      name: fullName.trim(),
      bloodGroup,
      location: {
        coordinates,
        city: city.trim(),
        state: stateName.trim(),
        pincode: pincode.trim(),
      },
    };

    if (email.trim()) payload.email = email.trim();
    if (gender) payload.gender = gender;
    if (age.trim()) payload.age = parseInt(age.trim(), 10);

    try {
      await updateUserProfile(payload);
      onComplete();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save profile. Please check your inputs.';
      setErrorMessage(msg);
      Alert.alert('Profile Error', msg);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.iconText}>👤</Text>
          <Text style={styles.title}>Complete Your Profile</Text>
          <Text style={styles.subtitle}>Help nearby emergency patients locate eligible donors quickly.</Text>
        </View>

        {!!errorMessage && <Text style={styles.errorBanner}>{errorMessage}</Text>}

        {/* Full Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Full Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="John Doe"
            placeholderTextColor="#475569"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {/* Blood Group Selector */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Blood Group <Text style={styles.required}>*</Text></Text>
          <View style={styles.grid}>
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

        {/* Location Detection */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>City / Location <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity style={styles.gpsButton} onPress={handleDetectLocation} disabled={isLocating}>
            {isLocating ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <Text style={styles.gpsButtonText}>📍 Detect GPS Coordinates</Text>
            )}
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder="City (e.g. Mumbai, New Delhi)"
            placeholderTextColor="#475569"
            value={city}
            onChangeText={setCity}
          />
        </View>

        {/* Optional Fields Toggle */}
        <View style={styles.optionalSection}>
          <Text style={styles.sectionHeader}>Optional Details</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="user@example.com"
              placeholderTextColor="#475569"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Age (18 - 65)</Text>
            <TextInput
              style={styles.input}
              placeholder="25"
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              value={age}
              onChangeText={setAge}
              maxLength={2}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderPill, gender === g && styles.genderPillSelected]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderPillText, gender === g && styles.genderPillTextSelected]}>
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, isUpdating && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Save Profile & Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconText: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
    borderWidth: 1,
    color: '#FCA5A5',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
  },
  required: {
    color: '#DC2626',
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 15,
    color: '#F1F5F9',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bloodPill: {
    width: '22%',
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloodPillSelected: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  bloodPillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  bloodPillTextSelected: {
    color: '#FFFFFF',
  },
  gpsButton: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.4)',
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  optionalSection: {
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderPill: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderPillSelected: {
    backgroundColor: '#38BDF8',
    borderColor: '#38BDF8',
  },
  genderPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  genderPillTextSelected: {
    color: '#0F172A',
  },
  submitButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
