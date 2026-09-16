import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, SHADOWS } from '../../theme/colors';

export type SearchCategory = 'BLOOD_AVAILABILITY' | 'FIND_DONORS' | 'FIND_HOSPITALS';

interface SearchOptionsScreenProps {
  onSelectOption: (option: SearchCategory) => void;
}

export const SearchOptionsScreen: React.FC<SearchOptionsScreenProps> = ({ onSelectOption }) => {
  const options = [
    {
      key: 'BLOOD_AVAILABILITY' as SearchCategory,
      icon: '🩸',
      title: 'Blood Availability',
      subtitle: 'Check available blood units at hospitals and blood banks.',
      badgeText: 'LIVE STOCK',
      badgeColor: COLORS.primaryLight,
      iconBg: COLORS.primaryLight,
      iconColor: COLORS.primary,
    },
    {
      key: 'FIND_DONORS' as SearchCategory,
      icon: '👤',
      title: 'Find Donors',
      subtitle: 'Find compatible nearby blood donors.',
      badgeText: 'NEARBY DONORS',
      badgeColor: COLORS.infoLight,
      iconBg: COLORS.infoLight,
      iconColor: COLORS.info,
    },
    {
      key: 'FIND_HOSPITALS' as SearchCategory,
      icon: '🏥',
      title: 'Find Hospitals / Blood Banks',
      subtitle: 'Find nearby hospitals and blood banks.',
      badgeText: 'FACILITIES',
      badgeColor: COLORS.successLight,
      iconBg: COLORS.successLight,
      iconColor: COLORS.success,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🔍 Search</Text>
        <Text style={styles.headerSubtitle}>
          Choose search category to find blood units, nearby donors, or medical facilities.
        </Text>
      </View>

      {/* Options Cards List */}
      <View style={styles.optionsList}>
        {options.map((opt, index) => (
          <TouchableOpacity
            key={opt.key}
            style={styles.optionCard}
            onPress={() => onSelectOption(opt.key)}
            activeOpacity={0.85}
          >
            <View style={styles.cardHeaderRow}>
              <View style={[styles.iconBox, { backgroundColor: opt.iconBg }]}>
                <Text style={styles.iconText}>{opt.icon}</Text>
              </View>

              <View style={styles.cardTextContainer}>
                <View style={styles.titleRow}>
                  <Text style={styles.optionTitle}>{`${index + 1}. ${opt.title}`}</Text>
                </View>
                <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
              </View>

              <Text style={styles.arrowIcon}>➔</Text>
            </View>

            <View style={styles.cardFooter}>
              <View style={[styles.badgePill, { backgroundColor: opt.badgeColor }]}>
                <Text style={styles.badgeText}>{opt.badgeText}</Text>
              </View>
              <Text style={styles.tapToOpen}>Tap to Explore</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Helper Info Note */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoIcon}>💡</Text>
        <Text style={styles.infoText}>
          Select <Text style={{ fontWeight: '700' }}>Blood Availability</Text> to filter by State, District, Component, and Blood Group.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  content: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.secondary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 6,
    lineHeight: 20,
  },
  optionsList: {
    gap: 16,
  },
  optionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: COLORS.borderColor,
    ...SHADOWS.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 24,
  },
  cardTextContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  optionSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  arrowIcon: {
    fontSize: 18,
    color: COLORS.primary,
    fontWeight: '800',
    marginLeft: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgMain,
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.secondary,
  },
  tapToOpen: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    borderRadius: 12,
    padding: 14,
    marginTop: 24,
  },
  infoIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 18,
  },
});
