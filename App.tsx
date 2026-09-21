import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppBlockerModule from './src/native/AppBlockerModule';
import SetupScreen from './src/screens/SetupScreen';
import LockScreen from './src/screens/LockScreen';
import HomeScreen from './src/screens/HomeScreen';
import AppPickerScreen from './src/screens/AppPickerScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';

type Screen = 'loading' | 'setup' | 'locked' | 'home' | 'appPicker' | 'changePasswords';

// A genuine backgrounding (pressing Home, switching apps, screen off) always takes at least
// this long before the user returns. Below this, treat it as a spurious focus blip - RN's
// Android AppState briefly reports non-'active' when a native Modal (e.g. the master-password
// confirmation dialog) opens, even though the app never actually left the foreground.
// Re-locking on those blips was a real bug: it made confirming a master-password prompt
// re-lock the whole app out from under itself, confirmed live on a real device.
const SPURIOUS_BACKGROUND_THRESHOLD_MS = 1000;

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
        } catch {
          // Non-fatal: the foreground service just won't show a visible notification.
        }
      }
      const hasPasswords = await AppBlockerModule.hasPasswordsSet();
      setScreen(hasPasswords ? 'locked' : 'setup');
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') {
        if (backgroundedAt.current === null) {
          backgroundedAt.current = Date.now();
        }
        return;
      }
      const wentBackgroundAt = backgroundedAt.current;
      backgroundedAt.current = null;
      if (wentBackgroundAt === null) return;
      if (Date.now() - wentBackgroundAt < SPURIOUS_BACKGROUND_THRESHOLD_MS) return;
      // Re-lock on every genuine return from the background, regardless of which screen was
      // open - opening AppBlocker (or switching back to it) always demands the unlock password
      // again, otherwise anyone with the phone unlocked could freely edit the blocked-apps list.
      setScreen(current => (current === 'setup' || current === 'loading' ? current : 'locked'));
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.flex}>
        <StatusBar barStyle="light-content" />
        {screen === 'loading' && (
          <View style={styles.loading}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {screen === 'setup' && <SetupScreen onDone={() => setScreen('home')} />}
        {screen === 'locked' && <LockScreen onUnlocked={() => setScreen('home')} />}
        {screen === 'appPicker' && <AppPickerScreen onBack={() => setScreen('home')} />}
        {screen === 'changePasswords' && (
          <ChangePasswordScreen onBack={() => setScreen('home')} />
        )}
        {screen === 'home' && (
          <HomeScreen
            onOpenAppPicker={() => setScreen('appPicker')}
            onOpenChangePasswords={() => setScreen('changePasswords')}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
});
