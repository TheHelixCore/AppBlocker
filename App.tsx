import React, { useEffect, useState } from 'react';
import { ActivityIndicator, PermissionsAndroid, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppBlockerModule from './src/native/AppBlockerModule';
import SetupScreen from './src/screens/SetupScreen';
import HomeScreen from './src/screens/HomeScreen';
import AppPickerScreen from './src/screens/AppPickerScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';

type Screen = 'loading' | 'setup' | 'home' | 'appPicker' | 'changePasswords';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');

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
      setScreen(hasPasswords ? 'home' : 'setup');
    })();
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
