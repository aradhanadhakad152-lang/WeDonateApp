import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { verifyOTPAndLogin } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { User } from '../../types/user.types';
import { COLORS, SHADOWS } from '../../theme/colors';

interface OTPVerificationScreenProps {
  phoneNumber: string;
  confirmation: any;
  onSuccess: (user: User) => void;
  onBack: () => void;
}

export const OTPVerificationScreen: React.FC<OTPVerificationScreenProps> = ({
  phoneNumber,
  confirmation,
  onSuccess,
  onBack,
}) => {
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    if (resendTimer > 0) {
      const interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [resendTimer]);

  const handleVerifyOTP = async () => {
    setErrorMessage('');
    const code = otpCode.trim();
    if (code.length < 6) {
      setErrorMessage('Please enter the 6-digit SMS verification code');
      return;
    }

    setIsLoading(true);
    try {
      const user = await verifyOTPAndLogin(confirmation, code);
      useAuthStore.getState().setUser(user);
      setIsLoading(false);
      onSuccess(user);
    } catch (error: any) {
      setIsLoading(false);
      const msg = error?.response?.data?.message || error?.message || 'Invalid OTP code. Please check your SMS and try again.';
      setErrorMessage(msg);
      Alert.alert('Verification Failed', msg);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Circular Logo Header */}
        <View style={styles.circularBadgeHeader}>
          <Text style={styles.badgeShieldIcon}>🛡️</Text>
          <Text style={styles.badgeText}>VERIFY</Text>
        </View>

        <Text style={styles.title}>OTP Verification</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to <Text style={styles.phoneHighlight}>{phoneNumber}</Text>
        </Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>ENTER 6-DIGIT CODE</Text>
          <TextInput
            style={styles.input}
            placeholder="1 2 3 4 5 6"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            value={otpCode}
            onChangeText={(text) => {
              setOtpCode(text);
              if (errorMessage) setErrorMessage('');
            }}
            maxLength={6}
            autoFocus
          />
          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>

        <Text style={styles.timerText}>
          Resend OTP in <Text style={styles.timerBold}>00:{resendTimer < 10 ? `0${resendTimer}` : resendTimer}</Text>
        </Text>

        <TouchableOpacity
          style={[styles.btnCoralWide, (isLoading || otpCode.length < 6) && styles.btnDisabled]}
          onPress={handleVerifyOTP}
          disabled={isLoading || otpCode.length < 6}
          activeOpacity={0.85}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnCoralWideText}>Confirm & Continue  ➔</Text>
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
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  backText: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '600',
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
  badgeShieldIcon: {
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
  phoneHighlight: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 14,
    height: 56,
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textMain,
    textAlign: 'center',
    letterSpacing: 10,
    ...SHADOWS.sm,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 8,
    textAlign: 'center',
  },
  timerText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textMuted,
    marginVertical: 14,
  },
  timerBold: {
    color: COLORS.primary,
    fontWeight: '700',
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
    opacity: 0.5,
  },
  btnCoralWideText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
