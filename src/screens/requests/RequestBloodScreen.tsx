import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRequestStore } from '../../store/requestStore';
import { useUserStore } from '../../store/userStore';
import { BloodGroup } from '../../types/user.types';
import { BloodRequest } from '../../types/request.types';

const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const URGENCY_OPTIONS = [
  { label: 'CRITICAL (Immediate)', value: 'CRITICAL', color: '#EF4444' },
  { label: 'URGENT (Within 12h)', value: 'URGENT', color: '#F59E0B' },
  { label: 'NORMAL (Within 24h)', value: 'NORMAL', color: '#3B82F6' },
];

interface RequestBloodScreenProps {
  onBack: () => void;
  onRequestCreated: (request: BloodRequest) => void;
}

export const RequestBloodScreen: React.FC<RequestBloodScreenProps> = ({ onBack, onRequestCreated }) => {
  const { profile, acquireLocation } = useUserStore();
  const { submitNewRequest, isCreating } = useRequestStore();

  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup>(profile?.bloodGroup || 'A+');
  const [unitsRequired, setUnitsRequired] = useState('1');
  const [urgency, setUrgency] = useState<'CRITICAL' | 'URGENT' | 'NORMAL'>('CRITICAL');
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [hospitalLat, setHospitalLat] = useState<number>(profile?.location?.coordinates?.[1] || 19.0760);
  const [hospitalLng, setHospitalLng] = useState<number>(profile?.location?.coordinates?.[0] || 72.8777);
  const [contactPhone, setContactPhone] = useState(profile?.phone || '');
  const [reason, setReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [isLocating, setIsLocating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleDetectHospitalGPS = async () => {
    setIsLocating(true);
    try {
      const loc = await acquireLocation();
      setIsLocating(false);
      if (loc) {
        setHospitalLat(loc.latitude);
        setHospitalLng(loc.longitude);
        if (loc.address) setHospitalAddress(loc.address);
        Alert.alert('GPS Location Set', `Latitude: ${loc.latitude.toFixed(4)}, Longitude: ${loc.longitude.toFixed(4)}`);
      } else {
        Alert.alert('Location Notice', 'Could not detect GPS coordinates. Defaulting to configured city coordinates.');
      }
    } catch {
      setIsLocating(false);
    }
  };

  const handleSubmit = async () => {
    setErrorMessage('');

    if (!patientName.trim()) {
      setErrorMessage('Patient name is required');
      return;
    }
    if (!hospitalName.trim()) {
      setErrorMessage('Hospital name is required');
      return;
    }
    if (!hospitalAddress.trim()) {
      setErrorMessage('Hospital address is required');
      return;
    }

    const units = parseInt(unitsRequired, 10);
    if (isNaN(units) || units < 1 || units > 10) {
      setErrorMessage('Units required must be between 1 and 10');
      return;
    }

    const formattedPhone = contactPhone.trim().startsWith('+') ? contactPhone.trim() : `+91${contactPhone.trim()}`;
    if (!/^\+[1-9]\d{7,14}$/.test(formattedPhone)) {
      setErrorMessage('Please enter a valid contact phone number in format +91XXXXXXXXXX');
      return;
    }

    try {
      const newRequest = await submitNewRequest({
        patientName: patientName.trim(),
        bloodGroup,
        unitsRequired: units,
        urgency,
        hospitalName: hospitalName.trim(),
        hospitalAddress: hospitalAddress.trim(),
        hospitalLatitude: hospitalLat,
        hospitalLongitude: hospitalLng,
        contactPhone: formattedPhone,
        reason: reason.trim() || undefined,
        additionalNotes: additionalNotes.trim() || undefined,
      });

      Alert.alert('Request Created', 'Your emergency blood request has been published to MongoDB Atlas.');
      onRequestCreated(newRequest);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to submit blood request';
      setErrorMessage(msg);
      Alert.alert('Request Failed', msg);
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
          <Text style={styles.navTitle}>Request Emergency Blood</Text>
          <View style={{ width: 40 }} />
        </View>

        {!!errorMessage && <Text style={styles.errorBanner}>{errorMessage}</Text>}

        {/* Patient Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Patient Full Name <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} placeholder="Jane Doe" placeholderTextColor="#475569" value={patientName} onChangeText={setPatientName} />
        </View>

        {/* Blood Group Picker */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Blood Group Needed <Text style={styles.required}>*</Text></Text>
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

        {/* Units Required & Urgency */}
        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1 }]}>
            <Text style={styles.label}>Units Needed (1 - 10) <Text style={styles.required}>*</Text></Text>
            <TextInput style={styles.input} keyboardType="number-pad" value={unitsRequired} onChangeText={setUnitsRequired} maxLength={2} />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Urgency Level <Text style={styles.required}>*</Text></Text>
          <View style={styles.urgencyCol}>
            {URGENCY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.urgencyOption, urgency === opt.value && { borderColor: opt.color, backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}
                onPress={() => setUrgency(opt.value as any)}
              >
                <View style={[styles.urgencyDot, { backgroundColor: opt.color }]} />
                <Text style={[styles.urgencyText, urgency === opt.value && { color: opt.color, fontWeight: '700' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Hospital Information */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Hospital Name <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} placeholder="City General Hospital" placeholderTextColor="#475569" value={hospitalName} onChangeText={setHospitalName} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Hospital Address <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} placeholder="123 Health Ave, Ward 4" placeholderTextColor="#475569" value={hospitalAddress} onChangeText={setHospitalAddress} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Hospital GPS Location</Text>
          <TouchableOpacity style={styles.gpsButton} onPress={handleDetectHospitalGPS} disabled={isLocating}>
            {isLocating ? <ActivityIndicator color="#DC2626" /> : <Text style={styles.gpsButtonText}>📍 Detect Current Hospital GPS</Text>}
          </TouchableOpacity>
          <Text style={styles.gpsCoordText}>Selected: Lat {hospitalLat.toFixed(4)}, Lng {hospitalLng.toFixed(4)}</Text>
        </View>

        {/* Contact & Notes */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Contact Phone <Text style={styles.required}>*</Text></Text>
          <TextInput style={styles.input} keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} placeholder="+919876543210" placeholderTextColor="#475569" />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Medical Reason / Additional Notes</Text>
          <TextInput style={[styles.input, { height: 80 }]} multiline placeholder="Emergency surgery, accident, etc." placeholderTextColor="#475569" value={reason} onChangeText={setReason} />
        </View>

        <TouchableOpacity style={[styles.submitButton, isCreating && styles.buttonDisabled]} onPress={handleSubmit} disabled={isCreating}>
          {isCreating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitButtonText}>🚨 Publish Emergency Request</Text>}
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
  formGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#CBD5E1', marginBottom: 8 },
  required: { color: '#DC2626' },
  input: { backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 16, height: 48, fontSize: 15, color: '#F1F5F9' },
  row: { flexDirection: 'row', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bloodPill: { width: '22%', height: 44, borderRadius: 10, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  bloodPillSelected: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  bloodPillText: { fontSize: 15, fontWeight: '700', color: '#CBD5E1' },
  bloodPillTextSelected: { color: '#FFFFFF' },
  urgencyCol: { gap: 10 },
  urgencyOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
  urgencyDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  urgencyText: { fontSize: 14, color: '#CBD5E1' },
  gpsButton: { backgroundColor: 'rgba(220, 38, 38, 0.1)', borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.4)', borderRadius: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  gpsButtonText: { fontSize: 14, fontWeight: '600', color: '#DC2626' },
  gpsCoordText: { fontSize: 12, color: '#64748B', marginTop: 6, textAlign: 'center' },
  submitButton: { backgroundColor: '#DC2626', borderRadius: 12, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 40 },
  buttonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
