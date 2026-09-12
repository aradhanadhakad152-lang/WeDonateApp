import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { api } from '../../services/api';
import { ApiSuccessResponse } from '../../types/api.types';
import { COLORS, SHADOWS } from '../../theme/colors';

export interface FundingCampaign {
  _id: string;
  id?: string;
  title: string;
  description: string;
  patientName?: string;
  hospitalName?: string;
  targetAmount: number;
  raisedAmount: number;
  remainingAmount?: number;
  progressPercentage?: number;
  category: string;
  donorCount: number;
  status: string;
}

export interface FinancialDonation {
  _id: string;
  receiptNumber: string;
  amount: number;
  donorName?: string;
  campaignId: { _id?: string; title?: string } | string;
  paymentStatus?: string;
  notes?: string;
  createdAt: string;
}

interface FundingScreenProps {
  onBack: () => void;
}

// Safe Currency Formatter
const formatCurrencyINR = (val: number | undefined | null): string => {
  if (typeof val !== 'number' || isNaN(val)) return '0';
  return val.toLocaleString('en-IN');
};

export const FundingScreen: React.FC<FundingScreenProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'MY_DONATIONS'>('CAMPAIGNS');
  const [campaigns, setCampaigns] = useState<FundingCampaign[]>([]);
  const [myDonations, setMyDonations] = useState<FinancialDonation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Contribution Modal State
  const [selectedCampaign, setSelectedCampaign] = useState<FundingCampaign | null>(null);
  const [donationAmount, setDonationAmount] = useState<string>('500');
  const [donorName, setDonorName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get<ApiSuccessResponse<{ campaigns: FundingCampaign[] }>>('/funding/campaigns');
      setCampaigns(res.data.data?.campaigns || []);
    } catch (err: any) {
      console.error('Failed to fetch funding campaigns:', err);
      const msg = err?.response?.data?.message || 'Failed to load funding campaigns from backend server.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchMyDonations = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get<ApiSuccessResponse<{ donations: FinancialDonation[] }>>('/funding/my-donations');
      setMyDonations(res.data.data?.donations || []);
    } catch (err: any) {
      console.error('Failed to fetch my donations:', err);
      const msg = err?.response?.data?.message || 'Failed to load contribution receipts.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'CAMPAIGNS') {
      fetchCampaigns();
    } else {
      fetchMyDonations();
    }
  }, [activeTab]);

  const handleDonateSubmit = async () => {
    if (!selectedCampaign || isSubmitting) return;

    const amountNum = parseFloat(donationAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid donation amount greater than ₹0.');
      return;
    }

    if (amountNum > 500000) {
      Alert.alert('Limit Exceeded', 'Single contribution request limit is ₹5,00,000.');
      return;
    }

    // DUPLICATE PREVENTION: Lock submit button immediately
    setIsSubmitting(true);

    // Client-side idempotency key generation
    const idempotencyKey = `IDEM_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    try {
      const res = await api.post<ApiSuccessResponse<{ donation: FinancialDonation; receiptNumber: string; paymentStatusMessage?: string }>>(
        '/funding/donate',
        {
          campaignId: selectedCampaign._id || selectedCampaign.id,
          amount: amountNum,
          donorName: donorName.trim() || undefined,
          notes: notes.trim() || undefined,
          idempotencyKey,
        }
      );

      const receipt = res.data.data?.receiptNumber || 'RCP_RECORDED';
      const statusNote = res.data.data?.paymentStatusMessage || 'Online payment gateway is not yet integrated. This record represents a submitted contribution request and is not confirmation of successful payment.';

      Alert.alert(
        'Contribution Request Recorded 📝',
        `Reference Receipt: ${receipt}\nAmount: ₹${formatCurrencyINR(amountNum)}\nStatus: Contribution Recorded\n\n${statusNote}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setSelectedCampaign(null);
              fetchCampaigns();
              if (activeTab === 'MY_DONATIONS') fetchMyDonations();
            },
          },
        ]
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to record contribution request.';
      Alert.alert('Contribution Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCampaignItem = ({ item }: { item: FundingCampaign }) => {
    // Safe Numeric Values
    const target = typeof item.targetAmount === 'number' && !isNaN(item.targetAmount) ? item.targetAmount : 0;
    const raised = typeof item.raisedAmount === 'number' && !isNaN(item.raisedAmount) ? item.raisedAmount : 0;
    const remaining = item.remainingAmount !== undefined ? item.remainingAmount : Math.max(0, target - raised);
    const percentage = item.progressPercentage !== undefined
      ? item.progressPercentage
      : target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.campaignTitle}>{item.title || 'Emergency Medical Relief'}</Text>
          <View style={[styles.statusBadge, item.status === 'COMPLETED' && styles.statusBadgeCompleted]}>
            <Text style={styles.statusBadgeText}>{item.status || 'ACTIVE'}</Text>
          </View>
        </View>

        <Text style={styles.description}>{item.description || 'Supporting emergency medical treatment and blood supplies.'}</Text>

        {(!!item.patientName || !!item.hospitalName) && (
          <Text style={styles.metaText}>
            👤 Beneficiary: {item.patientName || 'Emergency Patient'} {item.hospitalName ? `• ${item.hospitalName}` : ''}
          </Text>
        )}

        {/* Progress Bar & Financial Amounts */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.raisedText}>Raised: ₹{formatCurrencyINR(raised)}</Text>
            <Text style={styles.targetText}>Goal: ₹{formatCurrencyINR(target)} ({percentage}%)</Text>
          </View>
          <Text style={styles.remainingText}>Remaining Required: ₹{formatCurrencyINR(remaining)}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.donorCountText}>👥 {item.donorCount || 0} Supporters</Text>
          <TouchableOpacity
            style={styles.btnContribute}
            onPress={() => {
              setDonationAmount('500');
              setNotes('');
              setSelectedCampaign(item);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.btnContributeText}>Fund / Support 💚</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderReceiptItem = ({ item }: { item: FinancialDonation }) => {
    const campaignTitle = typeof item.campaignId === 'object' && item.campaignId?.title
      ? item.campaignId.title
      : 'Medical Relief Campaign';
    const formattedDate = item.createdAt
      ? new Date(item.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recently';

    return (
      <View style={styles.receiptCard}>
        <View style={styles.receiptHeader}>
          <Text style={styles.receiptNo}>Receipt: {item.receiptNumber || 'RCP_RECORDED'}</Text>
          <Text style={styles.receiptAmount}>₹{formatCurrencyINR(item.amount)}</Text>
        </View>
        <Text style={styles.receiptCampaign}>Campaign: {campaignTitle}</Text>
        <Text style={styles.receiptDonor}>Contributor: {item.donorName || 'Registered User'}</Text>
        {!!item.notes && <Text style={styles.receiptNotes}>Note: "{item.notes}"</Text>}
        
        <View style={styles.receiptFooter}>
          <Text style={styles.receiptDate}>📅 {formattedDate}</Text>
          <View style={styles.recordedStatusBadge}>
            <Text style={styles.recordedStatusText}>{item.paymentStatus || 'RECORDED'}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.btnBack} onPress={onBack}>
          <Text style={styles.btnBackText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Funding & Support</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Prominent Payment Disclaimer Banner */}
      <View style={styles.disclaimerBanner}>
        <Text style={styles.disclaimerText}>
          ⚠️ Online payment gateway is not yet integrated. This record represents a submitted contribution request and is not confirmation of successful payment.
        </Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'CAMPAIGNS' && styles.tabBtnActive]}
          onPress={() => setActiveTab('CAMPAIGNS')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'CAMPAIGNS' && styles.tabBtnTextActive]}>Active Campaigns</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'MY_DONATIONS' && styles.tabBtnActive]}
          onPress={() => setActiveTab('MY_DONATIONS')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'MY_DONATIONS' && styles.tabBtnTextActive]}>My Receipts</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading funding information...</Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Connection Issue</Text>
          <Text style={styles.errorSub}>{errorMessage}</Text>
          <TouchableOpacity style={styles.btnRetry} onPress={activeTab === 'CAMPAIGNS' ? fetchCampaigns : fetchMyDonations}>
            <Text style={styles.btnRetryText}>Retry Request 🔄</Text>
          </TouchableOpacity>
        </View>
      ) : activeTab === 'CAMPAIGNS' ? (
        campaigns.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>No Active Campaigns</Text>
            <Text style={styles.emptySub}>Check back soon for emergency medical funding drives.</Text>
          </View>
        ) : (
          <FlatList
            data={campaigns}
            keyExtractor={(item) => item._id || item.id || String(Math.random())}
            renderItem={renderCampaignItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); fetchCampaigns(); }} colors={[COLORS.primary]} />
            }
          />
        )
      ) : myDonations.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No Contribution Records</Text>
          <Text style={styles.emptySub}>Your submitted contribution requests will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={myDonations}
          keyExtractor={(item) => item._id || item.receiptNumber || String(Math.random())}
          renderItem={renderReceiptItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); fetchMyDonations(); }} colors={[COLORS.primary]} />
          }
        />
      )}

      {/* Contribution Modal */}
      <Modal visible={!!selectedCampaign} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Support Medical Relief</Text>
              <Text style={styles.modalSubtitle}>{selectedCampaign?.title}</Text>

              {/* Modal Disclaimer Note */}
              <View style={styles.modalDisclaimerBox}>
                <Text style={styles.modalDisclaimerText}>
                  ℹ️ Payment Integration Notice: Payment gateway is not yet active. Submitting will record your contribution request and issue a reference receipt.
                </Text>
              </View>

              <Text style={styles.inputLabel}>SELECT CONTRIBUTION AMOUNT (₹)</Text>
              <View style={styles.presetGrid}>
                {['250', '500', '1000', '2500'].map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.presetChip, donationAmount === amt && styles.presetChipActive]}
                    onPress={() => setDonationAmount(amt)}
                  >
                    <Text style={[styles.presetChipText, donationAmount === amt && styles.presetChipTextActive]}>₹{amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Or enter custom amount in ₹"
                placeholderTextColor="#94A3B8"
                keyboardType="number-pad"
                value={donationAmount}
                onChangeText={setDonationAmount}
              />

              <Text style={styles.inputLabel}>DONOR / CONTRIBUTOR NAME (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                placeholder="Anonymous or Your Name"
                placeholderTextColor="#94A3B8"
                value={donorName}
                onChangeText={setDonorName}
              />

              <Text style={styles.inputLabel}>SUPPORT MESSAGE / NOTE (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                placeholder="Get well soon wish or message"
                placeholderTextColor="#94A3B8"
                value={notes}
                onChangeText={setNotes}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.btnCancel} onPress={() => setSelectedCampaign(null)} disabled={isSubmitting}>
                  <Text style={styles.btnCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnSubmit, isSubmitting && styles.btnDisabled]}
                  disabled={isSubmitting}
                  onPress={handleDonateSubmit}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnSubmitText}>Record Contribution 💚</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  btnBack: { paddingVertical: 4 },
  btnBackText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },

  disclaimerBanner: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disclaimerText: { fontSize: 11, color: '#92400E', fontWeight: '700', lineHeight: 15 },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.bgMain,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.secondary },
  tabBtnTextActive: { color: '#FFFFFF' },

  listContent: { padding: 16, gap: 14 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  campaignTitle: { fontSize: 16, fontWeight: '800', color: COLORS.secondary, flex: 1, marginRight: 8 },
  statusBadge: { backgroundColor: COLORS.successLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusBadgeCompleted: { backgroundColor: '#CBD5E1' },
  statusBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.success },
  description: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  metaText: { fontSize: 12, color: COLORS.secondary, fontWeight: '600', marginBottom: 10 },

  progressSection: { marginBottom: 12 },
  progressBarBg: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressBarFill: { height: '100%', backgroundColor: COLORS.success, borderRadius: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  raisedText: { fontSize: 12, fontWeight: '800', color: COLORS.success },
  targetText: { fontSize: 12, color: COLORS.textMuted },
  remainingText: { fontSize: 11, color: COLORS.primary, fontWeight: '700', marginTop: 4 },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderColor,
    paddingTop: 12,
  },
  donorCountText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  btnContribute: { backgroundColor: COLORS.success, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnContributeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  receiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    ...SHADOWS.sm,
  },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  receiptNo: { fontSize: 14, fontWeight: '800', color: COLORS.secondary },
  receiptAmount: { fontSize: 16, fontWeight: '800', color: COLORS.success },
  receiptCampaign: { fontSize: 13, color: COLORS.textMuted },
  receiptDonor: { fontSize: 12, color: COLORS.secondary, fontWeight: '600', marginTop: 2 },
  receiptNotes: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },
  receiptFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.borderColor },
  receiptDate: { fontSize: 11, color: COLORS.textMuted },
  recordedStatusBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  recordedStatusText: { fontSize: 10, fontWeight: '800', color: '#92400E' },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, color: COLORS.textMuted, fontSize: 13 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.secondary },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: COLORS.danger },
  errorSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  btnRetry: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnRetryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.secondary },
  modalSubtitle: { fontSize: 14, color: COLORS.primary, fontWeight: '700', marginBottom: 12 },
  modalDisclaimerBox: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', padding: 10, borderRadius: 8, marginBottom: 12 },
  modalDisclaimerText: { fontSize: 11, color: '#1E40AF', fontWeight: '600' },
  inputLabel: { fontSize: 11, fontWeight: '700', color: COLORS.secondary, marginBottom: 6, marginTop: 10 },
  presetGrid: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  presetChip: { flex: 1, height: 38, borderRadius: 8, backgroundColor: COLORS.bgMain, borderWidth: 1, borderColor: COLORS.borderColor, alignItems: 'center', justifyContent: 'center' },
  presetChipActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  presetChipText: { fontSize: 13, fontWeight: '700', color: COLORS.secondary },
  presetChipTextActive: { color: '#FFFFFF' },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: COLORS.borderColor, borderRadius: 10, paddingHorizontal: 14, height: 44, fontSize: 14, color: COLORS.textMain, marginBottom: 4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnCancel: { flex: 1, height: 46, borderRadius: 10, backgroundColor: COLORS.bgMain, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.borderColor },
  btnCancelText: { fontWeight: '700', color: COLORS.secondary },
  btnSubmit: { flex: 1, height: 46, borderRadius: 10, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnSubmitText: { fontWeight: '700', color: '#FFFFFF' },
});
