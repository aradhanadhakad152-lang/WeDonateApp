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
 * Mobile Notification Service — Client Integration Methods
 */

export const registerDeviceToken = async (fcmToken: string): Promise<void> => {
  try {
    await api.post('/notifications/device-token', { token: fcmToken });
  } catch (error) {
    console.error('Failed to register FCM device token:', error);
  }
};

export const removeDeviceToken = async (fcmToken?: string): Promise<void> => {
  try {
    await api.delete('/notifications/device-token', { data: { token: fcmToken } });
  } catch (error) {
    console.error('Failed to remove FCM device token:', error);
  }
};

export const getUserNotifications = async (): Promise<AppNotification[]> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ notifications: AppNotification[] }>>('/notifications');
    return response.data.data!.notifications;
  } catch (error) {
    console.error('Failed to fetch user notifications:', error);
    throw error;
  }
};

export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const response = await api.get<ApiSuccessResponse<{ unreadCount: number }>>('/notifications/unread-count');
    return response.data.data!.unreadCount;
  } catch (error) {
    console.error('Failed to fetch unread notification count:', error);
    return 0;
  }
};

export const markNotificationAsRead = async (id: string): Promise<AppNotification> => {
  try {
    const response = await api.post<ApiSuccessResponse<{ notification: AppNotification }>>(`/notifications/${id}/read`);
    return response.data.data!.notification;
  } catch (error) {
    console.error(`Failed to mark notification ${id} as read:`, error);
    throw error;
  }
};
