import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { getRefreshToken } from '../../utils/tokenStorage';
import { useUserStore } from '../../store/userStore';
import { useAuthStore } from '../../store/authStore';

interface SplashScreenProps {
  onNavigate: (screen: 'Home' | 'ProfileRegistration' | 'PhoneLogin') => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onNavigate }) => {
  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
          if (isMounted) onNavigate('PhoneLogin');
          return;
        }

        const user = await useUserStore.getState().fetchProfile();

        if (!user) {
          if (isMounted) onNavigate('PhoneLogin');
          return;
        }

        useAuthStore.getState().setUser(user);

        if (!user.isProfileComplete) {
          if (isMounted) onNavigate('ProfileRegistration');
        } else {
          if (isMounted) onNavigate('Home');
        }
      } catch (error) {
        console.error('Splash screen initialization error:', error);
        if (isMounted) onNavigate('PhoneLogin');
      }
    };

    const timer = setTimeout(initializeSession, 1000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [onNavigate]);

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoDrop}>🩸</Text>
        </View>
        <Text style={styles.title}>WE DONATE</Text>
        <Text style={styles.subtitle}>Emergency Blood Donor Platform</Text>
      </View>

      <ActivityIndicator size="large" color="#DC2626" style={styles.spinner} />
      <Text style={styles.footerText}>Connecting Donors • Saving Lives</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  logoDrop: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F1F5F9',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  spinner: {
    marginVertical: 24,
  },
  footerText: {
    position: 'absolute',
    bottom: 40,
    fontSize: 12,
    color: '#64748B',
    letterSpacing: 1,
  },
});
