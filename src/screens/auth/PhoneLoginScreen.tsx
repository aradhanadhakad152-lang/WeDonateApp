import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { sendSMSOTP } from '../../services/authService';
import { User } from '../../types/user.types';
import { COLORS, SHADOWS } from '../../theme/colors';

interface PhoneLoginScreenProps {
  onSuccess: (user: User) => void;
  onSendOTP?: (phoneNumber: string, purpose: 'LOGIN' | 'REGISTER', fullName?: string) => void;
}

export const PhoneLoginScreen: React.FC<PhoneLoginScreenProps> = ({ onSendOTP }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleRequestOTP = async () => {
    setErrorMessage('');
    const trimmedPhone = phoneNumber.trim();
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      setErrorMessage('Please enter your full name');
      return;
    }

    const digitsOnly = trimmedPhone.replace(/[^\d]/g, '');
    if (digitsOnly.length < 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number');
      return;
    }

    const formattedPhone = trimmedPhone.startsWith('+') ? trimmedPhone : `+91${digitsOnly.slice(-10)}`;

    setIsLoading(true);
    try {
      await sendSMSOTP(formattedPhone, 'LOGIN', trimmedName);
      setIsLoading(false);
      if (onSendOTP) {
        onSendOTP(formattedPhone, 'LOGIN', trimmedName);
      }
    } catch (error: any) {
      setIsLoading(false);
      const msg =
        error?.response?.data?.message ||
        error?.message ||
        'Failed to dispatch WhatsApp OTP. Please verify your phone number and try again.';
      setErrorMessage(msg);
      Alert.alert('OTP Request Failed', msg);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.topSection}>
          {/* Circular Logo Badge Header */}
          <View style={styles.circularBadgeHeader}>
            <Text style={styles.badgeDropIcon}>🩸</Text>
            <Text style={styles.badgeText}>WE DONATE</Text>
          </View>

          <Text style={styles.title}>Citizen Authentication</Text>
          <Text style={styles.subtitle}>Enter mobile number & full name to receive a 6-digit WhatsApp OTP</Text>

          {/* Full Name Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>FULL NAME</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputName}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#94A3B8"
                value={fullName}
                onChangeText={(text) => {
                  setFullName(text);
                  if (errorMessage) setErrorMessage('');
                }}
              />
            </View>
          </View>

          {/* Mobile Number Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>MOBILE NUMBER</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.countryCode}>+91</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 10-digit mobile number"
                placeholderTextColor="#94A3B8"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={(text) => {
                  setPhoneNumber(text);
                  if (errorMessage) setErrorMessage('');
                }}
                maxLength={10}
              />
            </View>
            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          </View>
        </View>

        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.btnCoralWide, (isLoading || !phoneNumber || !fullName) && styles.btnDisabled]}
            onPress={handleRequestOTP}
            disabled={isLoading || !phoneNumber || !fullName}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.btnCoralWideText}>SEND OTP ➔</Text>
            )}
          </TouchableOpacity>
        </View>
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
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 50 : 35,
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  topSection: {
    width: '100%',
  },
  bottomSection: {
    width: '100%',
    marginBottom: 20,
  },
  circularBadgeHeader: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 3,
    borderColor: COLORS.primaryLight,
    ...SHADOWS.md,
  },
  badgeDropIcon: {
    fontSize: 28,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.secondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  inputName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 6,
    textAlign: 'center',
  },
  btnCoralWide: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnCoralWideText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
