import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { verifyOTPAndLogin } from '../../services/authService';
import { useAuthStore } from '../../store/authStore';
import { User } from '../../types/user.types';

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
      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.iconText}>📲</Text>
          <Text style={styles.title}>Verify OTP Code</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit verification code sent to{' '}
            <Text style={styles.phoneHighlight}>{phoneNumber}</Text>
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>6-Digit SMS Code</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor="#475569"
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
          style={[styles.button, (isLoading || otpCode.length < 6) && styles.buttonDisabled]}
          onPress={handleVerifyOTP}
          disabled={isLoading || otpCode.length < 6}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Verify & Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 24,
  },
  backText: {
    fontSize: 16,
    color: '#94A3B8',
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  iconText: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  phoneHighlight: {
    color: '#DC2626',
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 24,
    fontWeight: '700',
    color: '#F1F5F9',
    textAlign: 'center',
    letterSpacing: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 6,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
