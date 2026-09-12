import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { api } from '../../services/api';
import { ApiSuccessResponse } from '../../types/api.types';
import { COLORS, SHADOWS } from '../../theme/colors';

export interface DonationCamp {
  _id: string;
  id?: string;
  title: string;
  description: string;
  organizationId?: {
    name: string;
    contactPhone: string;
    officialEmail: string;
    address?: { city: string; state: string };
  };
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  city: string;
  state: string;
  contactPhone: string;
  supportedBloodGroups: string[];
  registrationLimit: number;
  registeredCount: number;
  status: string;
}

interface DonationCampsScreenProps {
  onBack: () => void;
}

export const DonationCampsScreen: React.FC<DonationCampsScreenProps> = ({ onBack }) => {
  const [camps, setCamps] = useState<DonationCamp[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [registeringCampId, setRegisteringCampId] = useState<string | null>(null);

  const fetchCamps = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<ApiSuccessResponse<{ camps: DonationCamp[] }>>('/camps');
      setCamps(res.data.data?.camps || []);
    } catch (err) {
      console.error('Failed to fetch donation camps:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCamps();
  }, []);

  const handleRegister = async (campId: string, campTitle: string) => {
    setRegisteringCampId(campId);
    try {
      const res = await api.post<ApiSuccessResponse<{ message: string }>>(`/camps/${campId}/register`);
      Alert.alert('Registration Successful', `You are registered for "${campTitle}". Thank you for donating blood!`);
      fetchCamps();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to register for camp';
      Alert.alert('Registration Status', msg);
    } finally {
      setRegisteringCampId(null);
    }
  };

  const renderItem = ({ item }: { item: DonationCamp }) => {
    const isFull = item.registeredCount >= item.registrationLimit;
    const formattedDate = new Date(item.date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.campTitle}>{item.title}</Text>
          <Text style={styles.orgName}>🏥 {item.organizationId?.name || 'Medical Center'}</Text>
        </View>

        <Text style={styles.campDescription}>{item.description}</Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>📅 {formattedDate}</Text>
          <Text style={styles.metaText}>⏰ {item.startTime} - {item.endTime}</Text>
        </View>
        <Text style={styles.addressText}>📍 {item.address}, {item.city}</Text>

        <View style={styles.bloodGroupsRow}>
          {item.supportedBloodGroups?.map((bg) => (
            <View key={bg} style={styles.bgBadge}>
              <Text style={styles.bgBadgeText}>{bg}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.regCountText}>
            👥 Registered: {item.registeredCount} / {item.registrationLimit}
          </Text>

          <TouchableOpacity
            style={[styles.btnRegister, isFull && styles.btnRegisterDisabled]}
            disabled={isFull || registeringCampId === (item._id || item.id)}
            onPress={() => handleRegister(item._id || item.id!, item.title)}
            activeOpacity={0.85}
          >
            {registeringCampId === (item._id || item.id) ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.btnRegisterText}>{isFull ? 'Camp Full' : 'Register Now'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.btnBack} onPress={onBack}>
          <Text style={styles.btnBackText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blood Donation Camps</Text>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching blood donation drives...</Text>
        </View>
      ) : camps.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Active Camps Available</Text>
          <Text style={styles.emptySub}>Check back soon for upcoming hospital blood donation drives.</Text>
        </View>
      ) : (
        <FlatList
          data={camps}
          keyExtractor={(item) => item._id || item.id!}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); fetchCamps(); }} colors={[COLORS.primary]} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  btnBack: {
    paddingRight: 16,
  },
  btnBackText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  cardHeader: {
    marginBottom: 8,
  },
  campTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  orgName: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  campDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  addressText: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  bloodGroupsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  bgBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bgBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderColor,
    paddingTop: 12,
  },
  regCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  btnRegister: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnRegisterDisabled: {
    backgroundColor: '#CBD5E1',
  },
  btnRegisterText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 13,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
});
