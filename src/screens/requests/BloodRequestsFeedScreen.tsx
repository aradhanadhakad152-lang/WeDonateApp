import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
} from 'react-native';
import { BloodRequest } from '../../types/request.types';
import { getBloodRequestsWithMeta, FetchRequestsParams } from '../../services/bloodRequestService';
import { getCurrentDeviceLocation, LocationData } from '../../services/locationService';
import { BloodGroupBadge } from '../../components/ui/BloodGroupBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { COLORS, SHADOWS } from '../../theme/colors';

interface BloodRequestsFeedScreenProps {
  onRequestBlood: () => void;
  onSelectRequest?: (request: BloodRequest) => void;
}

export type QuickMode = 'ALL' | 'NEARBY' | 'MATCHING' | 'URGENT' | 'MY_REQUESTS';
export type SortOption = 'newest' | 'nearest' | 'urgency' | 'expiring';

const BLOOD_GROUPS = ['ALL', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const STATUSES = ['ALL', 'OPEN', 'MATCHING', 'ACCEPTED'];
const URGENCIES = ['ALL', 'CRITICAL', 'URGENT', 'NORMAL'];
const DISTANCES = ['ALL', '5', '10', '25', '50'];
const DATES = [
  { label: 'All', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: 'last7days' },
  { label: 'Last 30 days', value: 'last30days' },
];

export const BloodRequestsFeedScreen: React.FC<BloodRequestsFeedScreenProps> = ({
  onRequestBlood,
  onSelectRequest,
}) => {
  const [quickMode, setQuickMode] = useState<QuickMode>('ALL');
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('ALL');
  const [selectedDistance, setSelectedDistance] = useState<string>('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);

  const [feedRequests, setFeedRequests] = useState<BloodRequest[]>([]);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Acquire device location once on mount
  useEffect(() => {
    getCurrentDeviceLocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, []);

  const loadFeed = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (pageNum === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const params: FetchRequestsParams = {
        page: pageNum,
        limit: 15,
        mode: quickMode,
        sort: sortBy,
      };

      if (selectedBloodGroup !== 'ALL') params.bloodGroup = selectedBloodGroup;
      if (selectedStatus !== 'ALL') params.status = selectedStatus;
      if (selectedUrgency !== 'ALL') params.urgency = selectedUrgency;
      if (selectedDateRange !== 'all') params.dateRange = selectedDateRange;

      if (userLocation) {
        params.latitude = userLocation.latitude;
        params.longitude = userLocation.longitude;
      }

      if (selectedDistance !== 'ALL') {
        params.radius = parseInt(selectedDistance, 10);
      }

      try {
        const res = await getBloodRequestsWithMeta(params);
        if (pageNum === 1) {
          setFeedRequests(res.requests);
        } else {
          setFeedRequests((prev) => [...prev, ...res.requests]);
        }
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        setPage(pageNum);
      } catch (err) {
        console.error('Error loading blood requests feed:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setIsLoadingMore(false);
      }
    },
    [quickMode, selectedBloodGroup, selectedStatus, selectedUrgency, selectedDistance, selectedDateRange, sortBy, userLocation]
  );

  useEffect(() => {
    loadFeed(1);
  }, [loadFeed]);

  const handleRefresh = () => {
    loadFeed(1, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore && !isLoading) {
      loadFeed(page + 1);
    }
  };

  const formatRelativeTime = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    const now = new Date();
    const created = new Date(dateStr);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const activeFilterCount =
    (selectedBloodGroup !== 'ALL' ? 1 : 0) +
    (selectedStatus !== 'ALL' ? 1 : 0) +
    (selectedUrgency !== 'ALL' ? 1 : 0) +
    (selectedDistance !== 'ALL' ? 1 : 0) +
    (selectedDateRange !== 'all' ? 1 : 0);

  const renderItem = ({ item }: { item: BloodRequest }) => {
    const isCritical = item.urgency === 'CRITICAL';
    const isUrgent = item.urgency === 'URGENT';

    return (
      <TouchableOpacity
        style={[styles.card, isCritical && styles.cardCritical]}
        onPress={() => onSelectRequest && onSelectRequest(item)}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <BloodGroupBadge bloodGroup={item.bloodGroup} size="sm" />
            <View>
              <Text style={styles.patientName}>{item.patientName}</Text>
              <Text style={styles.unitText}>{item.unitsRequired} Unit(s) Required</Text>
            </View>
          </View>
          <StatusBadge status={item.status} />
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.hospitalName}>🏥 {item.hospitalName}</Text>
          <Text style={styles.hospitalAddress} numberOfLines={1}>📍 {item.hospitalAddress}</Text>

          <View style={styles.cardMetaRow}>
            {!!item.formattedDistance && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>📍 {item.formattedDistance}</Text>
              </View>
            )}

            <View
              style={[
                styles.metaBadge,
                isCritical
                  ? { backgroundColor: '#FEE2E2' }
                  : isUrgent
                  ? { backgroundColor: '#FFEDD5' }
                  : { backgroundColor: '#F1F5F9' },
              ]}
            >
              <Text
                style={[
                  styles.metaBadgeText,
                  isCritical
                    ? { color: '#DC2626' }
                    : isUrgent
                    ? { color: '#C2410C' }
                    : { color: '#475569' },
                ]}
              >
                {isCritical ? '🚨 CRITICAL' : isUrgent ? '⚡ URGENT' : 'NORMAL'}
              </Text>
            </View>

            <Text style={styles.timeAgoText}>{formatRelativeTime(item.createdAt)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Blood Requests Feed</Text>
            <Text style={styles.headerSub}>
              {totalCount} active emergency {totalCount === 1 ? 'request' : 'requests'}
            </Text>
          </View>

          <TouchableOpacity style={styles.btnCreateRequest} onPress={onRequestBlood} activeOpacity={0.85}>
            <Text style={styles.btnCreateRequestText}>+ Request Blood</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickTabsScroll}>
          {(
            [
              { key: 'ALL', label: 'ALL' },
              { key: 'NEARBY', label: 'NEARBY' },
              { key: 'MATCHING', label: 'MATCHING' },
              { key: 'URGENT', label: 'URGENT' },
              { key: 'MY_REQUESTS', label: 'MY REQUESTS' },
            ] as { key: QuickMode; label: string }[]
          ).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.quickTabChip, quickMode === tab.key && styles.quickTabChipActive]}
              onPress={() => setQuickMode(tab.key)}
            >
              <Text style={[styles.quickTabText, quickMode === tab.key && styles.quickTabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filter & Sort Action Bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, activeFilterCount > 0 && styles.actionBtnActive]}
            onPress={() => setShowFilterDrawer(!showFilterDrawer)}
          >
            <Text style={[styles.actionBtnText, activeFilterCount > 0 && styles.actionBtnTextActive]}>
              ⚙️ Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>

          <View style={styles.sortContainer}>
            <Text style={styles.sortLabel}>Sort:</Text>
            {(
              [
                { key: 'newest', label: 'Newest' },
                { key: 'nearest', label: 'Nearest' },
                { key: 'urgency', label: 'Urgent' },
                { key: 'expiring', label: 'Expiring' },
              ] as { key: SortOption; label: string }[]
            ).map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.sortChip, sortBy === s.key && styles.sortChipActive]}
                onPress={() => setSortBy(s.key)}
              >
                <Text style={[styles.sortChipText, sortBy === s.key && styles.sortChipTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Expandable Filter Drawer */}
      {showFilterDrawer && (
        <ScrollView style={styles.drawerContainer} contentContainerStyle={styles.drawerContent}>
          {/* Blood Group Filter */}
          <Text style={styles.drawerSectionTitle}>Blood Group</Text>
          <View style={styles.chipGrid}>
            {BLOOD_GROUPS.map((bg) => (
              <TouchableOpacity
                key={bg}
                style={[styles.filterChip, selectedBloodGroup === bg && styles.filterChipActive]}
                onPress={() => setSelectedBloodGroup(bg)}
              >
                <Text style={[styles.filterChipText, selectedBloodGroup === bg && styles.filterChipTextActive]}>
                  {bg}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Urgency Filter */}
          <Text style={styles.drawerSectionTitle}>Urgency</Text>
          <View style={styles.chipGrid}>
            {URGENCIES.map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.filterChip, selectedUrgency === u && styles.filterChipActive]}
                onPress={() => setSelectedUrgency(u)}
              >
                <Text style={[styles.filterChipText, selectedUrgency === u && styles.filterChipTextActive]}>
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Status Filter */}
          <Text style={styles.drawerSectionTitle}>Status</Text>
          <View style={styles.chipGrid}>
            {STATUSES.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.filterChip, selectedStatus === st && styles.filterChipActive]}
                onPress={() => setSelectedStatus(st)}
              >
                <Text style={[styles.filterChipText, selectedStatus === st && styles.filterChipTextActive]}>
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Distance Filter */}
          <Text style={styles.drawerSectionTitle}>Distance Radius</Text>
          <View style={styles.chipGrid}>
            {DISTANCES.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.filterChip, selectedDistance === d && styles.filterChipActive]}
                onPress={() => setSelectedDistance(d)}
              >
                <Text style={[styles.filterChipText, selectedDistance === d && styles.filterChipTextActive]}>
                  {d === 'ALL' ? 'All Distance' : `${d} km`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date Filter */}
          <Text style={styles.drawerSectionTitle}>Date Posted</Text>
          <View style={styles.chipGrid}>
            {DATES.map((dt) => (
              <TouchableOpacity
                key={dt.value}
                style={[styles.filterChip, selectedDateRange === dt.value && styles.filterChipActive]}
                onPress={() => setSelectedDateRange(dt.value)}
              >
                <Text style={[styles.filterChipText, selectedDateRange === dt.value && styles.filterChipTextActive]}>
                  {dt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.btnClearFilters}
            onPress={() => {
              setSelectedBloodGroup('ALL');
              setSelectedStatus('ALL');
              setSelectedUrgency('ALL');
              setSelectedDistance('ALL');
              setSelectedDateRange('all');
            }}
          >
            <Text style={styles.btnClearFiltersText}>Reset All Filters</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Main Feed List */}
      {isLoading ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching live blood requests...</Text>
        </View>
      ) : feedRequests.length === 0 ? (
        <EmptyState
          icon="🩸"
          title={activeFilterCount > 0 ? 'No requests match your filters' : 'No active blood requests found'}
          description={
            activeFilterCount > 0
              ? 'Try adjusting your blood group, distance, or status filters.'
              : 'There are currently no active blood requests in the network.'
          }
          actionLabel="Request Emergency Blood Now"
          onAction={onRequestBlood}
        />
      ) : (
        <FlatList
          data={feedRequests}
          keyExtractor={(item) => item.id || item._id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
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
    backgroundColor: '#FFFFFF',
    paddingTop: 46,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  btnCreateRequest: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnCreateRequestText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  quickTabsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 10,
  },
  quickTabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickTabChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  quickTabTextActive: {
    color: '#FFFFFF',
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderColor,
  },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
  },
  actionBtnActive: {
    backgroundColor: COLORS.primaryLight,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  actionBtnTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginRight: 2,
  },
  sortChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sortChipActive: {
    backgroundColor: COLORS.secondary,
  },
  sortChipText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  sortChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  drawerContainer: {
    maxHeight: 280,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  drawerContent: {
    padding: 16,
  },
  drawerSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
    marginBottom: 6,
    marginTop: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  btnClearFilters: {
    marginTop: 14,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  btnClearFiltersText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  cardCritical: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  unitText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  cardBody: {
    gap: 4,
  },
  hospitalName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  hospitalAddress: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  metaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  metaBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  timeAgoText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 'auto',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  footerLoader: {
    paddingVertical: 12,
    alignItems: 'center',
  },
});
