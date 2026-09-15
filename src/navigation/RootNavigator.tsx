import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
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

  useEffect(() => {
    initializeNotifications();

    const unsubscribe = setupNotificationListeners(
      (matchId) => {
        setActiveMatchId(matchId);
        setCurrentScreen('IncomingBloodRequest');
      },
      (requestId) => {
        // Option to handle direct blood request navigation
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
