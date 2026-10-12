/**
 * AppUpdateModal.tsx
 * ============================================================
 * WE DONATE branded in-app update dialog.
 *
 * Renders either:
 *  – Optional update  → "Update Now" + "Later" buttons
 *  – Mandatory update → "Update Now" only; Android Back button is blocked
 *
 * Design tokens are pulled from the existing app theme (COLORS, SHADOWS).
 * Existing Button component is reused.
 */

import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  BackHandler,
  Platform,
} from 'react-native';
import { useFocusEffect } from '../hooks/useFocusEffect';
import { COLORS, SHADOWS } from '../theme/colors';
import { Button } from './ui/Button';
import { UpdateCheckResult } from '../services/appUpdateService';

// ──────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────

interface AppUpdateModalProps {
  /** The update result returned by checkForUpdate(); null = modal is hidden */
  updateResult: UpdateCheckResult | null;
  /** Called when user taps "Update Now" */
  onUpdateNow: () => void;
  /** Called when user taps "Later" (only fired for optional updates) */
  onDismiss: () => void;
}

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  updateResult,
  onUpdateNow,
  onDismiss,
}) => {
  const isVisible =
    updateResult !== null &&
    (updateResult.status === 'optional' || updateResult.status === 'mandatory');

  const isMandatory = updateResult?.status === 'mandatory';

  // Block Android hardware back button for mandatory updates
  useFocusEffect(
    useCallback(() => {
      if (!isMandatory || !isVisible) return;

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          // Returning true prevents the default back action
          return true;
        }
      );

      return () => subscription.remove();
    }, [isMandatory, isVisible])
  );

  if (!isVisible || !updateResult) return null;

  const {
    installedVersion,
    latestVersion,
    releaseNotes,
  } = updateResult;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      // Prevent dismissal by tapping outside for mandatory updates
      onRequestClose={() => {
        if (!isMandatory) onDismiss();
      }}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <View style={styles.backdrop}>
        {/* Dialog card */}
        <View style={styles.card}>
          {/* Icon row */}
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, isMandatory && styles.iconCircleMandatory]}>
              <Text style={styles.iconText}>{isMandatory ? '⚠️' : '🔔'}</Text>
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isMandatory ? 'Update Required' : 'New Update Available'}
          </Text>

          {/* App name */}
          <Text style={styles.appName}>WE DONATE</Text>

          {/* Mandatory subtitle */}
          {isMandatory && (
            <Text style={styles.mandatorySubtitle}>
              Your version of WE DONATE is no longer supported.
              {'\n'}Please update to continue using the app.
            </Text>
          )}

          {/* Version row */}
          <View style={styles.versionRow}>
            <View style={styles.versionBadge}>
              <Text style={styles.versionLabel}>Current</Text>
              <Text style={styles.versionValue}>v{installedVersion}</Text>
            </View>
            <Text style={styles.versionArrow}>→</Text>
            <View style={[styles.versionBadge, styles.versionBadgeNew]}>
              <Text style={[styles.versionLabel, styles.versionLabelNew]}>New</Text>
              <Text style={[styles.versionValue, styles.versionValueNew]}>v{latestVersion}</Text>
            </View>
          </View>

          {/* Release notes */}
          {releaseNotes.length > 0 && (
            <View style={styles.releaseNotesContainer}>
              <Text style={styles.releaseNotesTitle}>What's new:</Text>
              <ScrollView
                style={styles.releaseNotesList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {releaseNotes.map((note, index) => (
                  <View key={index} style={styles.releaseNoteRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.releaseNoteText}>{note}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.buttonContainer}>
            <Button
              title="Update Now"
              onPress={onUpdateNow}
              variant="coral"
              style={styles.primaryButton}
            />

            {!isMandatory && (
              <Button
                title="Later"
                onPress={onDismiss}
                variant="outline"
                style={styles.secondaryButton}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  iconRow: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFA3A3',
  },
  iconCircleMandatory: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  iconText: {
    fontSize: 34,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textMain,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  appName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  mandatorySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  versionBadge: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
  },
  versionBadgeNew: {
    backgroundColor: COLORS.primaryLight,
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  versionLabelNew: {
    color: COLORS.primaryDark,
  },
  versionValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  versionValueNew: {
    color: COLORS.primary,
  },
  versionArrow: {
    fontSize: 18,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  releaseNotesContainer: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    maxHeight: 140,
  },
  releaseNotesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  releaseNotesList: {
    flexGrow: 0,
  },
  releaseNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '800',
    lineHeight: 20,
    marginRight: 6,
  },
  releaseNoteText: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
  },
  primaryButton: {
    width: '100%',
    marginBottom: 10,
  },
  secondaryButton: {
    width: '100%',
  },
});
