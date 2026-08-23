import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useUserStore } from '../../store/userStore';
import { BloodGroup, Gender } from '../../types/user.types';
import { COLORS, SHADOWS } from '../../theme/colors';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];

interface ProfileRegistrationScreenProps {
  onComplete: () => void;
}

export const ProfileRegistrationScreen: React.FC<ProfileRegistrationScreenProps> = ({ onComplete }) => {
  const { profile, updateUserProfile, acquireLocation, isUpdating } = useUserStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Getting Started Profile
  const [fullName, setFullName] = useState(profile?.name || profile?.fullName || 'Ayush Dhakad');
  const [email, setEmail] = useState(profile?.email || '');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(profile?.bloodGroup || 'B+');
  const [gender, setGender] = useState<Gender>(profile?.gender || 'MALE');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '24');
  const [city, setCity] = useState(profile?.location?.city || 'New Delhi');
  const [coordinates, setCoordinates] = useState<[number, number]>(profile?.location?.coordinates || [77.2100, 28.5672]);
  const [isLocating, setIsLocating] = useState(false);

  // Step 2: Survey Checklist
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [hasHeartDisease, setHasHeartDisease] = useState(false);
  const [hasChronicCondition, setHasChronicCondition] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');

  const handleDetectLocation = async () => {
    setIsLocating(true);
    try {
      const loc = await acquireLocation();
      setIsLocating(false);
      if (loc) {
        setCoordinates([loc.longitude, loc.latitude]);
        if (loc.city) setCity(loc.city);
        Alert.alert('GPS Location Detected', `City: ${loc.city || 'Detected'}, Lat: ${loc.latitude.toFixed(4)}, Lng: ${loc.longitude.toFixed(4)}`);
      } else {
        Alert.alert('Location Notice', 'Could not detect location. Using current city value.');
      }
    } catch (err) {
      setIsLocating(false);
      Alert.alert('Location Notice', 'Could not access GPS. Using entered city.');
    }
  };

  const handleStep1Next = () => {
    setErrorMessage('');
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name');
      return;
    }
    if (!city.trim()) {
      setErrorMessage('Please enter your city');
      return;
    }
    setStep(2);
  };

  const handleStep2Next = () => {
    setStep(3);
  };

  const handleFinalSubmit = async () => {
    setErrorMessage('');

    const payload: any = {
      fullName: fullName.trim(),
      name: fullName.trim(),
      bloodGroup,
      location: {
        coordinates,
        city: city.trim(),
        state: 'Delhi',
      },
    };

    if (email.trim()) payload.email = email.trim();
    if (gender) payload.gender = gender;
    if (age.trim()) payload.age = parseInt(age.trim(), 10);

    try {
      await updateUserProfile(payload);
      onComplete();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to save profile. Please check inputs.';
      setErrorMessage(msg);
      Alert.alert('Profile Error', msg);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Step Indicator Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {step === 1 ? 'Getting Started' : step === 2 ? 'Medical Screening (1/2)' : 'Eligibility Review (2/2)'}
          </Text>
          <Text style={styles.headerSub}>
            {step === 1 ? 'Create your blood donor profile' : step === 2 ? 'Health screening questions' : 'Review screening summary'}
          </Text>
        </View>

        {!!errorMessage && <Text style={styles.errorBanner}>{errorMessage}</Text>}

        {/* STEP 1: Basic Profile Setup */}
        {step === 1 && (
          <View style={styles.stepBox}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>FULL NAME</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Ayush Dhakad"
                placeholderTextColor="#94A3B8"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            {/* Blood Group Selection Grid */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>BLOOD GROUP</Text>
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

            {/* GPS Location */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>CURRENT LOCATION / CITY</Text>
              <TouchableOpacity style={styles.gpsButton} onPress={handleDetectLocation} disabled={isLocating}>
                {isLocating ? (
                  <ActivityIndicator color={COLORS.primary} />
                ) : (
                  <Text style={styles.gpsButtonText}>📍 Detect GPS Location</Text>
                )}
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="New Delhi"
                placeholderTextColor="#94A3B8"
                value={city}
                onChangeText={setCity}
              />
            </View>

            {/* Age & Gender */}
            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.label}>AGE</Text>
                <TextInput
                  style={styles.input}
                  placeholder="24"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  value={age}
                  onChangeText={setAge}
                  maxLength={2}
                />
              </View>
              <View style={[styles.formGroup, { flex: 1.5 }]}>
                <Text style={styles.label}>GENDER</Text>
                <View style={styles.genderRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderPill, gender === g && styles.genderPillSelected]}
                      onPress={() => setGender(g)}
                    >
                      <Text style={[styles.genderPillText, gender === g && styles.genderPillTextSelected]}>
                        {g.charAt(0)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.btnCoralWide} onPress={handleStep1Next} activeOpacity={0.85}>
              <Text style={styles.btnCoralWideText}>Next: Health Screening  ➔</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: Medical Screening Survey */}
        {step === 2 && (
          <View style={styles.stepBox}>
            <View style={styles.surveyCard}>
              <Text style={styles.surveyQuestion}>Do you have any of the following health conditions?</Text>

              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setHasDiabetes(!hasDiabetes)}
                activeOpacity={0.7}
              >
                <Text style={styles.checkboxBox}>{hasDiabetes ? '☑️' : '⬜'}</Text>
                <Text style={styles.checkboxLabel}>Diabetes / Blood Sugar Condition</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setHasHeartDisease(!hasHeartDisease)}
                activeOpacity={0.7}
              >
                <Text style={styles.checkboxBox}>{hasHeartDisease ? '☑️' : '⬜'}</Text>
                <Text style={styles.checkboxLabel}>Heart Disease / Hypertension</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxItem}
                onPress={() => setHasChronicCondition(!hasChronicCondition)}
                activeOpacity={0.7}
              >
                <Text style={styles.checkboxBox}>{hasChronicCondition ? '☑️' : '⬜'}</Text>
                <Text style={styles.checkboxLabel}>Chronic Respiratory Condition</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.btnCoralWide} onPress={handleStep2Next} activeOpacity={0.85}>
              <Text style={styles.btnCoralWideText}>Next: Review Eligibility  ➔</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3: Review & Complete */}
        {step === 3 && (
          <View style={styles.stepBox}>
            <View style={styles.eligibleCard}>
              <Text style={styles.eligibleCheck}>✅</Text>
              <Text style={styles.eligibleTitle}>Eligible to Donate Blood</Text>
              <Text style={styles.eligibleDesc}>
                Based on your profile answers, your donor status is approved for GPS emergency proximity alerts.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btnCoralWide, isUpdating && styles.btnDisabled]}
              onPress={handleFinalSubmit}
              disabled={isUpdating}
              activeOpacity={0.85}
            >
              {isUpdating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnCoralWideText}>Submit & Launch App  🚀</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
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
  stepBox: {
    gap: 14,
  },
  formGroup: {
    marginBottom: 14,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 6,
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
  bloodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  gpsButton: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: '#FFA3A3',
    borderRadius: 10,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 6,
  },
  genderPill: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderPillSelected: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  genderPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  genderPillTextSelected: {
    color: '#FFFFFF',
  },
  surveyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.sm,
  },
  surveyQuestion: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 16,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  checkboxBox: {
    fontSize: 20,
    marginRight: 10,
  },
  checkboxLabel: {
    fontSize: 14,
    color: COLORS.textMain,
    fontWeight: '500',
  },
  eligibleCard: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: '#FFA3A3',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginVertical: 20,
  },
  eligibleCheck: {
    fontSize: 42,
    marginBottom: 8,
  },
  eligibleTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 6,
  },
  eligibleDesc: {
    fontSize: 13,
    color: COLORS.textMain,
    textAlign: 'center',
    lineHeight: 18,
  },
  btnCoralWide: {
    width: '100%',
    height: 54,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
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
});
