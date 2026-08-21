import { User } from '../types/user.types';

export type AuthStackParamList = {
  Splash: undefined;
  PhoneLogin: undefined;
  OTPVerification: { phoneNumber: string; confirmation: any };
  ProfileRegistration: { isFirstTime?: boolean };
};

export type AppStackParamList = {
  Home: undefined;
  DonorProfile: undefined;
  ProfileRegistration: { isFirstTime?: boolean };
  RequestBlood: undefined;
  EmergencyRequest: undefined;
  NearbyDonors: undefined;
  Notifications: undefined;
};
