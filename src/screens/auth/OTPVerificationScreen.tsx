import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { verifySMSOTP, sendSMSOTP } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { User } from '../../types/user.types';
import { COLORS, SHADOWS } from '../../theme/colors';

interface OTPVerificationScreenProps {
  phoneNumber: string;
  purpose?: 'LOGIN' | 'REGISTER';
  fullName?: string;
  confirmation?: any;
  onSuccess: (user: User) => void;
  onBack: () => void;
}

export const OTPVerificationScreen: React.FC<OTPVerificationScreenProps> = ({
  phoneNumber,
  purpose = 'LOGIN',
  fullName,
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
      const user = await verifySMSOTP(phoneNumber, code, purpose, fullName);
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

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      await sendSMSOTP(phoneNumber, purpose);
      setIsLoading(false);
      setResendTimer(30);
      Alert.alert('OTP Resent', `A new 6-digit OTP code has been sent to ${phoneNumber}`);
    } catch (error: any) {
      setIsLoading(false);
      const msg = error?.response?.data?.message || error?.message || 'Failed to resend OTP.';
      setErrorMessage(msg);
      Alert.alert('Resend Failed', msg);
    }
  };

  // Mask phone for display (e.g. +91 98765 XXXXX)
  const maskedPhone = phoneNumber.length >= 10
    ? `${phoneNumber.slice(0, 3)} ${phoneNumber.slice(3, 8)} XXXXX`
    : phoneNumber;

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
          Enter the 6-digit code sent to <Text style={styles.phoneHighlight}>{maskedPhone}</Text>
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

        <TouchableOpacity
          onPress={handleResendOTP}
          disabled={resendTimer > 0 || isLoading}
          style={styles.resendContainer}
        >
          <Text style={styles.timerText}>
            {resendTimer > 0 ? (
              <>Resend OTP in <Text style={styles.timerBold}>00:{resendTimer < 10 ? `0${resendTimer}` : resendTimer}</Text></>
            ) : (
              <Text style={styles.resendActive}>Didn't receive code? <Text style={styles.timerBold}>Resend OTP</Text></Text>
            )}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnCoralWide, (isLoading || otpCode.length < 6) && styles.btnDisabled]}
          onPress={handleVerifyOTP}
          disabled={isLoading || otpCode.length < 6}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnCoralWideText}>Verify OTP  ➔</Text>
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
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    flexGrow: 1,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
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
    fontSize: 30,
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
    fontWeight: '700',
    color: COLORS.secondary,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 6,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    height: 52,
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textMain,
    textAlign: 'center',
    letterSpacing: 8,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 6,
    textAlign: 'center',
  },
  resendContainer: {
    alignItems: 'center',
    marginVertical: 12,
  },
  timerText: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  timerBold: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  resendActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  btnCoralWide: {
    width: '100%',
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
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
