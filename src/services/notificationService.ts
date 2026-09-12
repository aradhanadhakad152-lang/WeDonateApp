import messaging from '@react-native-firebase/messaging';
import { api } from './api';
import { ApiSuccessResponse } from '../types/api.types';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  bloodRequest?: {
    id: string;
    patientName: string;
    bloodGroup: string;
    hospitalName: string;
    status: string;
  };
}

/**
 * Initialize Firebase Cloud Messaging
 *
 * 1. Ask notification permission
 * 2. Get FCM device token
 * 3. Register token with WE DONATE backend
 */
export const initializeNotifications = async (): Promise<void> => {
  try {
    const permission = await messaging().requestPermission();

    const enabled =
      permission === messaging.AuthorizationStatus.AUTHORIZED ||
      permission === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('Notification permission not granted');
      return;
    }

    const fcmToken = await messaging().getToken();

    if (!fcmToken) {
      console.log('FCM token not available');
      return;
    }

    console.log('FCM token obtained');

    await registerDeviceToken(fcmToken);
  } catch (error) {
    console.error('Failed to initialize notifications:', error);
  }
};

/**
 * Register FCM device token with backend
 */
export const registerDeviceToken = async (
  fcmToken: string
): Promise<void> => {
  try {
    await api.post('/notifications/device-token', {
      token: fcmToken,
    });

    console.log('FCM device token registered with backend');
  } catch (error) {
    console.error('Failed to register FCM device token:', error);
  }
};

/**
 * Remove FCM device token on logout
 */
export const removeDeviceToken = async (
  fcmToken?: string
): Promise<void> => {
  try {
    await api.delete('/notifications/device-token', {
      data: {
        token: fcmToken,
      },
    });
  } catch (error) {
    console.error('Failed to remove FCM device token:', error);
  }
};

/**
 * Get authenticated user's notifications
 */
export const getUserNotifications = async (): Promise<AppNotification[]> => {
  try {
    const response = await api.get<
      ApiSuccessResponse<{
        notifications: AppNotification[];
      }>
    >('/notifications');

    return response.data.data!.notifications;
  } catch (error) {
    console.error('Failed to fetch user notifications:', error);
    throw error;
  }
};

/**
 * Get unread notification count
 */
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const response = await api.get<
      ApiSuccessResponse<{
        unreadCount: number;
      }>
    >('/notifications/unread-count');

    return response.data.data!.unreadCount;
  } catch (error) {
    console.error('Failed to fetch unread notification count:', error);
    return 0;
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (
  id: string
): Promise<AppNotification> => {
  try {
    const response = await api.post<
      ApiSuccessResponse<{
        notification: AppNotification;
      }>
    >(`/notifications/${id}/read`);

    return response.data.data!.notification;
  } catch (error) {
    console.error(
      `Failed to mark notification ${id} as read:`,
      error
    );
    throw error;
  }
};