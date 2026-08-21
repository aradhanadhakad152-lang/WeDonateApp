import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { useUserStore } from '../../store/userStore';
import { logoutUser } from '../../services/authService';

interface HomeScreenProps {
  onNavigateToProfile: () => void;
  onRequestBlood: () => void;
  onLogout: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigateToProfile, onRequestBlood, onLogout }) => {
  const { profile, fetchProfile, toggleAvailability, isLoading } = useUserStore();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleToggle = (value: boolean) => {
    toggleAvailability(value);
  };

  const handleLogoutPress = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of WE DONATE?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logoutUser();
          onLogout();
        },
      },
    ]);
  };

  if (isLoading && !profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DC2626" />
        <Text style={styles.loadingText}>Fetching User Profile...</Text>
      </View>
    );
  }

  const nameVal = profile?.name || profile?.fullName || 'Blood Donor';
  const isAvailable = profile?.isAvailable ?? profile?.donorStatus === 'AVAILABLE';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Text style={styles.brandDrop}>🩸</Text>
          <Text style={styles.brandTitle}>WE DONATE</Text>
        </View>
        <TouchableOpacity style={styles.logoutPill} onPress={handleLogoutPress}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* User Greeting & Status Card */}
      <View style={styles.userCard}>
        <View style={styles.userCardHeader}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{nameVal.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{nameVal}</Text>
            <Text style={styles.userPhone}>{profile?.phone || ''}</Text>
            <Text style={styles.userLocation}>📍 {profile?.location?.city || 'Location Configured'}</Text>
          </View>
          <View style={styles.bloodBadge}>
            <Text style={styles.bloodBadgeText}>{profile?.bloodGroup || 'A+'}</Text>
          </View>
        </View>

        {/* Availability Toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextContainer}>
            <Text style={styles.toggleTitle}>Donor Availability</Text>
            <Text style={styles.toggleSub}>
              {isAvailable ? 'Visible to nearby emergency requests' : 'Currently offline'}
            </Text>
          </View>
          <Switch
            trackColor={{ false: '#334155', true: 'rgba(34, 197, 94, 0.4)' }}
            thumbColor={isAvailable ? '#22C55E' : '#94A3B8'}
            onValueChange={handleToggle}
            value={isAvailable}
          />
        </View>
      </View>

      {/* Profile Edit Quick Button */}
      <TouchableOpacity style={styles.editProfileBtn} onPress={onNavigateToProfile}>
        <Text style={styles.editProfileBtnText}>✏️ Edit Donor Profile</Text>
      </TouchableOpacity>

      {/* Emergency Quick Actions */}
      <Text style={styles.sectionTitle}>Emergency Actions</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity style={[styles.actionCard, styles.actionCardRed]} onPress={onRequestBlood}>
          <Text style={styles.actionIcon}>🚨</Text>
          <Text style={styles.actionTitle}>Request Blood</Text>
          <Text style={styles.actionSub}>Create emergency blood request</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCard, styles.actionCardBlue]}>
          <Text style={styles.actionIcon}>🔍</Text>
          <Text style={styles.actionTitle}>Nearby Donors</Text>
          <Text style={styles.actionSub}>Search 10km radius donors</Text>
        </TouchableOpacity>
      </View>

      {/* Eligibility Status */}
      <View style={styles.eligibilityBox}>
        <Text style={styles.eligibilityTitle}>Donation Eligibility Status</Text>
        <Text style={styles.eligibilityStatus}>
          {profile?.isEligible ? '✅ You are currently eligible to donate blood!' : '⏳ Next donation date pending'}
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  content: {
    padding: 20,
    paddingTop: 50,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDrop: {
    fontSize: 24,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F1F5F9',
    letterSpacing: 1,
  },
  logoutPill: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  userCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  userPhone: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  userLocation: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 2,
  },
  bloodBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bloodBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#DC2626',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  toggleSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  editProfileBtn: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  editProfileBtnText: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  actionCardRed: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderColor: 'rgba(220, 38, 38, 0.3)',
  },
  actionCardBlue: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F1F5F9',
  },
  actionSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  eligibilityBox: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 30,
  },
  eligibilityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  eligibilityStatus: {
    fontSize: 13,
    color: '#22C55E',
    fontWeight: '500',
  },
});
