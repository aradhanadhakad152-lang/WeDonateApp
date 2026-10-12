import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { PhoneLoginScreen } from '../screens/auth/PhoneLoginScreen';
import { OTPVerificationScreen } from '../screens/auth/OTPVerificationScreen';
import { ProfileRegistrationScreen } from '../screens/profile/ProfileRegistrationScreen';
import { HomeScreen } from '../screens/home/HomeScreen';
import { DonorProfileScreen } from '../screens/profile/DonorProfileScreen';
import { RequestBloodScreen } from '../screens/requests/RequestBloodScreen';
import { RequestDetailsScreen } from '../screens/requests/RequestDetailsScreen';
import { NearbyDonorsMapScreen } from '../screens/map/NearbyDonorsMapScreen';
import { DonationCampsScreen } from '../screens/camps/DonationCampsScreen';
import { FundingScreen } from '../screens/funding/FundingScreen';
import { IncomingBloodRequestScreen } from '../screens/donor/IncomingBloodRequestScreen';
import { AvailableBloodRequestsScreen } from '../screens/requests/AvailableBloodRequestsScreen';
import { initializeNotifications, setupNotificationListeners } from '../services/notificationService';
import { DonorMatch } from '../services/matchService';
import { User } from '../types/user.types';
import { BloodRequest } from '../types/request.types';
import { AppUpdateModal } from '../components/AppUpdateModal';
import {
  checkForUpdate,
  openApkDownload,
  UpdateCheckResult,
} from '../services/appUpdateService';

type ScreenState =
  | 'Splash'
  | 'PhoneLogin'
  | 'OTPVerification'
  | 'ProfileRegistration'
  | 'Home'
  | 'DonorProfile'
  | 'RequestBlood'
  | 'AvailableBloodRequests'
  | 'RequestDetails'
  | 'NearbyDonorsMap'
  | 'DonationCamps'
  | 'Funding'
  | 'IncomingBloodRequest';

export const RootNavigator: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('Splash');
  const [phoneState, setPhoneState] = useState<{
    phoneNumber: string;
    purpose: 'LOGIN' | 'REGISTER';
    fullName?: string;
  } | null>(null);
  const [activeRequest, setActiveRequest] = useState<BloodRequest | null>(null);
  const [activeMatch, setActiveMatch] = useState<DonorMatch | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  // ── Update check state ──────────────────────────────────────
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  /**
   * Runs a version check and stores the result only when an update
   * (optional or mandatory) is detected. Silently ignores failures.
   */
  const runUpdateCheck = async (force = false) => {
    try {
      const result = await checkForUpdate(force);
      if (result && result.status !== 'no_update') {
        setUpdateResult(result);
      }
    } catch {
      // Never crash the app due to an update check failure
    }
  };

  useEffect(() => {
    initializeNotifications();

    const unsubscribe = setupNotificationListeners(
      (matchId) => {
        setActiveMatchId(matchId);
        setCurrentScreen('IncomingBloodRequest');
      },
      (_requestId) => {
        // Option to handle direct blood request navigation
      }
    );

    // Initial update check on app start
    runUpdateCheck();

    // Re-check when app comes back to foreground
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          // App returned to foreground — reset cooldown so we check again
          // after the configured cooldown window (30 min) since last check.
          // We do NOT force here so the cooldown is respected.
          runUpdateCheck();
        }
        appStateRef.current = nextState;
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  const handleSendOTP = (
    phoneNumber: string,
    purpose: 'LOGIN' | 'REGISTER',
    fullName?: string
  ) => {
    setPhoneState({ phoneNumber, purpose, fullName });
    setCurrentScreen('OTPVerification');
  };

  // AUTH SUCCESS HANDLER (DIRECT MONGODB & BACKEND AUTH)
  const handleAuthSuccess = (user: User) => {
    if (!user.isProfileComplete) {
      setCurrentScreen('ProfileRegistration');
    } else {
      setCurrentScreen('Home');
    }
  };

  return (
    <View style={styles.container}>
      {currentScreen === 'Splash' && (
        <SplashScreen
          onNavigate={(screen) => setCurrentScreen(screen)}
        />
      )}

      {currentScreen === 'PhoneLogin' && (
        <PhoneLoginScreen
          onSuccess={handleAuthSuccess}
          onSendOTP={handleSendOTP}
        />
      )}

      {currentScreen === 'OTPVerification' && phoneState && (
        <OTPVerificationScreen
          phoneNumber={phoneState.phoneNumber}
          purpose={phoneState.purpose}
          fullName={phoneState.fullName}
          onSuccess={handleAuthSuccess}
          onBack={() => setCurrentScreen('PhoneLogin')}
        />
      )}

      {currentScreen === 'ProfileRegistration' && (
        <ProfileRegistrationScreen
          onComplete={() => setCurrentScreen('Home')}
        />
      )}

      {currentScreen === 'Home' && (
        <HomeScreen
          onNavigateToProfile={() => setCurrentScreen('DonorProfile')}
          onRequestBlood={() => setCurrentScreen('RequestBlood')}
          onNavigateToAvailableRequests={() => setCurrentScreen('AvailableBloodRequests')}
          onOpenMap={() => setCurrentScreen('NearbyDonorsMap')}
          onNavigateToCamps={() => setCurrentScreen('DonationCamps')}
          onNavigateToFunding={() => setCurrentScreen('Funding')}
          onLogout={() => setCurrentScreen('PhoneLogin')}
        />
      )}

      {currentScreen === 'AvailableBloodRequests' && (
        <AvailableBloodRequestsScreen
          onBack={() => setCurrentScreen('Home')}
          onSelectRequest={(req) => {
            setActiveRequest(req);
            setCurrentScreen('RequestDetails');
          }}
        />
      )}

      {currentScreen === 'DonorProfile' && (
        <DonorProfileScreen
          onBack={() => setCurrentScreen('Home')}
        />
      )}

      {currentScreen === 'RequestBlood' && (
        <RequestBloodScreen
          onBack={() => setCurrentScreen('Home')}
          onRequestCreated={(req) => {
            setActiveRequest(req);
            setCurrentScreen('RequestDetails');
          }}
        />
      )}

      {currentScreen === 'RequestDetails' && activeRequest && (
        <RequestDetailsScreen
          request={activeRequest}
          onBack={() => setCurrentScreen('Home')}
        />
      )}

      {currentScreen === 'NearbyDonorsMap' && (
        <NearbyDonorsMapScreen
          onBack={() => setCurrentScreen('Home')}
          onRequestBlood={() => setCurrentScreen('RequestBlood')}
        />
      )}

      {currentScreen === 'DonationCamps' && (
        <DonationCampsScreen
          onBack={() => setCurrentScreen('Home')}
        />
      )}

      {currentScreen === 'Funding' && (
        <FundingScreen
          onBack={() => setCurrentScreen('Home')}
        />
      )}

      {currentScreen === 'IncomingBloodRequest' && (
        <IncomingBloodRequestScreen
          matchId={activeMatchId || undefined}
          match={activeMatch || undefined}
          onBack={() => setCurrentScreen('Home')}
          onResponded={() => {
            setCurrentScreen('Home');
          }}
        />
      )}

      {/* ── In-App Update Modal ──────────────────────────────────
          Rendered on top of all screens.
          – Optional update: shows "Later" button; dismisses on tap.
          – Mandatory update: no "Later" button; back button is blocked.
      ────────────────────────────────────────────────────────── */}
      <AppUpdateModal
        updateResult={updateResult}
        onUpdateNow={async () => {
          if (updateResult?.apkUrl) {
            await openApkDownload(updateResult.apkUrl);
          }
          // For mandatory updates, keep the modal visible after opening the URL
          // so the user cannot bypass the update screen.
          if (updateResult?.status === 'optional') {
            setUpdateResult(null);
          }
        }}
        onDismiss={() => {
          // Only reachable for optional updates (mandatory has no dismiss button)
          setUpdateResult(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
