import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { getRefreshToken } from '../../utils/tokenStorage';
import { useUserStore } from '../../store/userStore';
import { useAuthStore } from '../../store/authStore';
import { COLORS, SHADOWS } from '../../theme/colors';

interface SplashScreenProps {
  onNavigate: (screen: 'Home' | 'ProfileRegistration' | 'PhoneLogin') => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onNavigate }) => {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const refreshToken = await getRefreshToken();

        if (!refreshToken) {
          if (isMounted) setIsInitializing(false);
          return;
        }

        const user = await useUserStore.getState().fetchProfile();

        if (!user) {
          if (isMounted) setIsInitializing(false);
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
        if (isMounted) setIsInitializing(false);
      }
    };

    const timer = setTimeout(initializeSession, 1200);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [onNavigate]);

  return (
    <View style={styles.container}>
      {/* Decorative Curves */}
      <View style={styles.curvedTop} />
      <View style={styles.curvedBottom} />

      <View style={styles.content}>
        <View style={styles.illustrationBox}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconDrop}>🩸</Text>
          </View>
        </View>

        <Text style={styles.appTitle}>WE DONATE</Text>
        <Text style={styles.appTagline}>Save Lives, Give Blood</Text>

        {isInitializing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Initializing Network...</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.btnGetStarted}
            onPress={() => onNavigate('PhoneLogin')}
            activeOpacity={0.85}
          >
            <Text style={styles.btnGetStartedText}>Get Started  ➔</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  curvedTop: {
    position: 'absolute',
    top: -60,
    left: -40,
    width: 180,
    height: 180,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 90,
  },
  curvedBottom: {
    position: 'absolute',
    bottom: -60,
    right: -40,
    width: 200,
    height: 200,
    backgroundColor: COLORS.primary,
    opacity: 0.12,
    borderRadius: 100,
  },
  content: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationBox: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFA3A3',
    ...SHADOWS.lg,
  },
  iconDrop: {
    fontSize: 54,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: -1,
    marginBottom: 6,
  },
  appTagline: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginBottom: 40,
  },
  loadingBox: {
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  btnGetStarted: {
    width: '100%',
    height: 54,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    ...SHADOWS.md,
  },
  btnGetStartedText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
