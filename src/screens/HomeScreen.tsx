import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBlockerModule, { BlockingState } from '../native/AppBlockerModule';
import PasswordPromptModal from '../components/PasswordPromptModal';

interface Props {
  onOpenAppPicker: () => void;
  onOpenChangePasswords: () => void;
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function HomeScreen({ onOpenAppPicker, onOpenChangePasswords }: Props) {
  const [state, setState] = useState<BlockingState | null>(null);
  const [blockedCount, setBlockedCount] = useState(0);
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);
  const [adminActive, setAdminActive] = useState(false);
  const [shizukuInstalled, setShizukuInstalled] = useState(false);
  const [shizukuGranted, setShizukuGranted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);
  const [showMasterPrompt, setShowMasterPrompt] = useState(false);

  const refresh = useCallback(async () => {
    const [blockingState, blocked, accessibility, admin, shizukuOk, shizukuPerm] = await Promise.all([
      AppBlockerModule.getBlockingState(),
      AppBlockerModule.getBlockedApps(),
      AppBlockerModule.isAccessibilityServiceEnabled(),
      AppBlockerModule.isDeviceAdminActive(),
      AppBlockerModule.isShizukuInstalled(),
      AppBlockerModule.isShizukuPermissionGranted(),
    ]);
    setState(blockingState);
    setBlockedCount(blocked.length);
    setAccessibilityEnabled(accessibility);
    setAdminActive(admin);
    setShizukuInstalled(shizukuOk);
    setShizukuGranted(shizukuPerm);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (state?.tempDisabledUntil && state.tempDisabledUntil > 0 && now >= state.tempDisabledUntil) {
      refresh();
    }
  }, [now, state, refresh]);

  const requestTurnOff = () => setShowUnlockPrompt(true);

  const turnOnDirectly = async () => {
    await AppBlockerModule.enableBlocking();
    refresh();
  };

  const statusLabel = (() => {
    if (!state) return 'Loading…';
    if (state.indefinitelyDisabled) return 'Disabled indefinitely (master override)';
    if (state.tempDisabledUntil > now) {
      return `Paused — resumes in ${formatCountdown(state.tempDisabledUntil - now)}`;
    }
    return 'Protection active';
  })();

  const switchValue = state ? state.active : false;

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>AppBlocker</Text>

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Blocking</Text>
              <Text style={styles.cardStatus}>{statusLabel}</Text>
            </View>
            <Switch
              value={switchValue}
              onValueChange={v => (v ? turnOnDirectly() : requestTurnOff())}
            />
          </View>
        </View>

        {state?.indefinitelyDisabled ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={turnOnDirectly}>
            <Text style={styles.secondaryButtonText}>Turn protection back on</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.linkButton} onPress={() => setShowMasterPrompt(true)}>
            <Text style={styles.linkButtonText}>Master override (disable indefinitely)</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.row} onPress={onOpenAppPicker}>
          <Text style={styles.rowTitle}>Blocked apps</Text>
          <Text style={styles.rowValue}>{blockedCount} selected ›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={onOpenChangePasswords}>
          <Text style={styles.rowTitle}>Change passwords</Text>
          <Text style={styles.rowValue}>›</Text>
        </TouchableOpacity>

        <Text style={styles.sectionHeading}>Required permissions</Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Accessibility service</Text>
            <Text style={styles.rowSubtitle}>
              {accessibilityEnabled ? 'Enabled' : 'Not enabled — blocking will not work yet'}
            </Text>
          </View>
          {!accessibilityEnabled && (
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => AppBlockerModule.openAccessibilitySettings()}>
              <Text style={styles.smallButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Device admin</Text>
            <Text style={styles.rowSubtitle}>
              {adminActive ? 'Active' : 'Not active — uninstall has no friction yet'}
            </Text>
          </View>
          {!adminActive && (
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => AppBlockerModule.requestDeviceAdmin()}>
              <Text style={styles.smallButtonText}>Activate</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionHeading}>Optional</Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Force-stop via Shizuku</Text>
            <Text style={styles.rowSubtitle}>
              {!shizukuInstalled
                ? 'Shizuku app not detected'
                : shizukuGranted
                ? 'Granted — blocked apps get force-stopped'
                : 'Not granted — blocking still works, just without force-stop'}
            </Text>
          </View>
          {shizukuInstalled && !shizukuGranted && (
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => AppBlockerModule.requestShizukuPermission()}>
              <Text style={styles.smallButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <PasswordPromptModal
        visible={showUnlockPrompt}
        title="Pause blocking"
        message="Blocking will automatically resume in 5 minutes."
        submitLabel="Pause 5 min"
        onCancel={() => setShowUnlockPrompt(false)}
        onSubmit={async pw => {
          try {
            await AppBlockerModule.disableBlockingTemporarily(pw);
            setShowUnlockPrompt(false);
            refresh();
            return { ok: true };
          } catch {
            return { ok: false, error: 'Incorrect unlock password' };
          }
        }}
      />

      <PasswordPromptModal
        visible={showMasterPrompt}
        title="Master override"
        message="Disables blocking indefinitely, until you switch it back on yourself."
        submitLabel="Disable"
        onCancel={() => setShowMasterPrompt(false)}
        onSubmit={async pw => {
          try {
            await AppBlockerModule.disableBlockingWithMasterPassword(pw);
            setShowMasterPrompt(false);
            refresh();
            return { ok: true };
          } catch {
            return { ok: false, error: 'Incorrect master password' };
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: { padding: 16, paddingBottom: 48 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginVertical: 12 },
  card: { backgroundColor: '#1c1c1e', borderRadius: 14, padding: 16, marginBottom: 8 },
  cardRow: { flexDirection: 'row', alignItems: 'center' },
  cardLabel: { color: '#8a8a8a', fontSize: 12, marginBottom: 4 },
  cardStatus: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkButton: { paddingVertical: 12, alignItems: 'center' },
  linkButtonText: { color: '#e5484d', fontSize: 13, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#e5484d',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  secondaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  sectionHeading: {
    color: '#8a8a8a',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowSubtitle: { color: '#8a8a8a', fontSize: 12, marginTop: 2 },
  rowValue: { color: '#8a8a8a', fontSize: 14 },
  smallButton: {
    backgroundColor: '#e5484d',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
