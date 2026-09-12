import React, { useState } from 'react';
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
  | 'RequestDetails'
  | 'NearbyDonorsMap'
  | 'DonationCamps'
  | 'Funding';

export const RootNavigator: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('Splash');
  const [phoneState, setPhoneState] = useState<{ phoneNumber: string; confirmation: any } | null>(null);
  const [activeRequest, setActiveRequest] = useState<BloodRequest | null>(null);

  // LEGACY FIREBASE OTP HANDLER (PRESERVED FOR RESTORATION)
  const handleOTPSent = (phoneNumber: string, confirmation: any) => {
    setPhoneState({ phoneNumber, confirmation });
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
          onOTPSent={handleOTPSent}
        />
      )}

      {/* LEGACY OTP SCREEN - PRESERVED SAFELY IN CODE FOR PRODUCTION RESTORATION */}
      {currentScreen === 'OTPVerification' && phoneState && (
        <OTPVerificationScreen
          phoneNumber={phoneState.phoneNumber}
          confirmation={phoneState.confirmation}
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
          onOpenMap={() => setCurrentScreen('NearbyDonorsMap')}
          onNavigateToCamps={() => setCurrentScreen('DonationCamps')}
          onNavigateToFunding={() => setCurrentScreen('Funding')}
          onLogout={() => setCurrentScreen('PhoneLogin')}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
});
