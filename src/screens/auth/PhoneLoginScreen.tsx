import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { requestSMSOTP } from '../../services/authService';
import { COLORS, SHADOWS } from '../../theme/colors';

interface PhoneLoginScreenProps {
  onOTPSent: (phoneNumber: string, confirmation: any) => void;
}

export const PhoneLoginScreen: React.FC<PhoneLoginScreenProps> = ({ onOTPSent }) => {
  const [phoneNumber, setPhoneNumber] = useState('9876512345');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const pressKey = (key: string) => {
    if (errorMessage) setErrorMessage('');
    if (key === 'c') {
      setPhoneNumber('');
    } else if (key === 'back') {
      setPhoneNumber((prev) => prev.slice(0, -1));
    } else {
      if (phoneNumber.length < 10) {
        setPhoneNumber((prev) => prev + key);
      }
    }
  };

  const handleSendOTP = async () => {
    setErrorMessage('');
    const trimmed = phoneNumber.trim();

    const formattedPhone = trimmed.startsWith('+') ? trimmed : `+91${trimmed}`;
    if (!/^\+[1-9]\d{9,14}$/.test(formattedPhone)) {
      setErrorMessage('Please enter a valid 10-digit mobile phone number');
      return;
    }

    setIsLoading(true);
    try {
      const confirmation = await requestSMSOTP(formattedPhone);
      setIsLoading(false);
      onOTPSent(formattedPhone, confirmation);
    } catch (error: any) {
      setIsLoading(false);
      const msg = error?.message || 'Failed to send SMS OTP. Please check your phone number.';
      setErrorMessage(msg);
      Alert.alert('Authentication Error', msg);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Circular Logo Badge Header */}
        <View style={styles.circularBadgeHeader}>
          <Text style={styles.badgeDropIcon}>🩸</Text>
          <Text style={styles.badgeText}>SAVE LIFE</Text>
        </View>

        <Text style={styles.title}>Enter Mobile Number</Text>
        <Text style={styles.subtitle}>We will send a real SMS verification code</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>MOBILE NUMBER</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.countryCode}>+91</Text>
            <TextInput
              style={styles.input}
              placeholder="98765 43210"
              placeholderTextColor="#94A3B8"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={(text) => {
                setPhoneNumber(text);
                if (errorMessage) setErrorMessage('');
              }}
              maxLength={15}
            />
          </View>
          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>

        {/* Custom 3x4 Keypad Grid */}
        <View style={styles.keypadGrid}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'c', '0', 'back'].map((k) => (
            <TouchableOpacity key={k} style={styles.keypadBtn} onPress={() => pressKey(k)} activeOpacity={0.7}>
              <Text style={styles.keypadBtnText}>
                {k === 'c' ? 'C' : k === 'back' ? '⌫' : k}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btnCoralWide, isLoading && styles.btnDisabled]}
          onPress={handleSendOTP}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnCoralWideText}>Send OTP Code  ➔</Text>
          )}
        </TouchableOpacity>
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
    paddingTop: 50,
    flexGrow: 1,
    justifyContent: 'space-between',
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
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
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
    height: 52,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 6,
    textAlign: 'center',
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  keypadBtn: {
    width: '30%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  keypadBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.secondary,
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
