import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBlockerModule from '../native/AppBlockerModule';
import PasswordField from '../components/PasswordField';

interface Props {
  onUnlocked: () => void;
}

/**
 * Gates the whole settings UI behind the Unlock Password every time the app is opened or
 * brought back to the foreground. This is separate from - and doesn't affect - the actual
 * blocking mechanism, which runs entirely in the background service/accessibility service
 * regardless of whether this screen is showing.
 */
export default function LockScreen({ onUnlocked }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!password) {
      setError('Enter your unlock password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await AppBlockerModule.verifyLongPassword(password);
      if (ok) {
        setPassword('');
        onUnlocked();
      } else {
        setError('Incorrect password');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.container}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.heading}>AppBlocker Locked</Text>
        <Text style={styles.subheading}>
          Enter your unlock password to view or change settings.
        </Text>
        <PasswordField
          containerStyle={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Unlock password"
          placeholderTextColor="#8a8a8a"
          autoFocus
          editable={!busy}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Unlock</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  icon: { fontSize: 40, textAlign: 'center', marginBottom: 12 },
  heading: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subheading: {
    color: '#a0a0a5',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: '#ff6b6b', marginBottom: 12, fontSize: 13, textAlign: 'center' },
  button: {
    backgroundColor: '#e5484d',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
