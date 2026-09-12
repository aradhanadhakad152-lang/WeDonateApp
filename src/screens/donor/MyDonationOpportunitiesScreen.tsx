import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useMatchStore } from '../../store/matchStore';
import { DonorMatch } from '../../services/matchService';
import { COLORS, SHADOWS } from '../../theme/colors';

interface MyDonationOpportunitiesScreenProps {
  onSelectMatch: (match: DonorMatch) => void;
  onBack: () => void;
}

type TabType = 'all' | 'pending' | 'accepted' | 'rejected';

export const MyDonationOpportunitiesScreen: React.FC<MyDonationOpportunitiesScreenProps> = ({
  onSelectMatch,
  onBack,
}) => {
  const { myMatches, fetchMyDonorMatches, isLoading } = useMatchStore();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchMyDonorMatches();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMyDonorMatches();
    setRefreshing(false);
  };

  const filteredMatches = myMatches.filter((m) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return ['PENDING', 'NOTIFIED'].includes(m.status);
    if (activeTab === 'accepted') return m.status === 'ACCEPTED';
    if (activeTab === 'rejected') return m.status === 'REJECTED';
    return true;
  });

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'ACCEPTED':
        return { bg: '#E8F5E9', text: '#2E7D32', label: 'ACCEPTED' };
      case 'REJECTED':
        return { bg: '#FFEBEE', text: COLORS.danger, label: 'DECLINED' };
      case 'PENDING':
      case 'NOTIFIED':
        return { bg: '#FFF3E0', text: '#E65100', label: 'PENDING ACTION' };
      default:
        return { bg: COLORS.bgMain, text: COLORS.textMuted, label: status };
    }
  };

  const renderMatchCard = ({ item }: { item: DonorMatch }) => {
    const reqData: any = typeof item.bloodRequest === 'object' ? item.bloodRequest : null;
    const bloodGroup = item.requestedBloodGroup || reqData?.bloodGroup || 'A+';
    const hospitalName = reqData?.hospitalName || 'Emergency Request';
    const urgency = reqData?.urgency || 'CRITICAL';
    const formattedDistance = item.formattedDistance || (item.distanceKm ? `${item.distanceKm.toFixed(1)} km` : 'Nearby');
    const badge = getStatusBadgeStyle(item.status);

    return (
      <TouchableOpacity style={styles.card} onPress={() => onSelectMatch(item)} activeOpacity={0.7}>
        <View style={styles.cardHeader}>
          <View style={styles.bloodBadge}>
            <Text style={styles.bloodBadgeText}>{bloodGroup}</Text>
          </View>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.hospitalName} numberOfLines={1}>
              {hospitalName}
            </Text>
            <Text style={styles.distanceText}>📍 {formattedDistance} away</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <Text style={styles.urgencyText}>Urgency: {urgency}</Text>
          <Text style={styles.tapText}>Tap to view details →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Donation Opportunities</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        {(['pending', 'accepted', 'rejected', 'all'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'pending' ? 'Pending' : tab === 'accepted' ? 'Accepted' : tab === 'rejected' ? 'Declined' : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List / Loading / Empty */}
      {isLoading && !refreshing && myMatches.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching donation opportunities...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMatches}
          keyExtractor={(item) => item.id || (item as any)._id}
          renderItem={renderMatchCard}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>No Opportunities Found</Text>
              <Text style={styles.emptySub}>
                {activeTab === 'pending'
                  ? 'You have no pending blood request alerts matching your profile right now.'
                  : 'No donation opportunities found for this filter.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgMain, paddingTop: 45 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  backText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  navTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  tabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 2, borderWidth: 1, borderColor: COLORS.borderColor },
  tabBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  tabTextActive: { color: '#FFFFFF' },
  listContent: { paddingHorizontal: 20, paddingBottom: 30 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.borderColor, ...SHADOWS.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  bloodBadge: { backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: '#FFA3A3', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginRight: 12 },
  bloodBadgeText: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  headerTitleContainer: { flex: 1 },
  hospitalName: { fontSize: 16, fontWeight: '800', color: COLORS.secondary },
  distanceText: { fontSize: 12, color: COLORS.info, marginTop: 2, fontWeight: '600' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  divider: { height: 1, backgroundColor: COLORS.borderColor, marginVertical: 10 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  urgencyText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  tapText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, fontSize: 14, color: COLORS.textMuted },
  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.secondary, marginBottom: 6 },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },
});
