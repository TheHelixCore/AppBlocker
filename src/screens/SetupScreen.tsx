import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBlockerModule from '../native/AppBlockerModule';

interface Props {
  onDone: () => void;
}

export default function SetupScreen({ onDone }: Props) {
  const [longPw, setLongPw] = useState('');
  const [longPwConfirm, setLongPwConfirm] = useState('');
  const [masterPw, setMasterPw] = useState('');
  const [masterPwConfirm, setMasterPwConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (longPw.length < 8 || masterPw.length < 8) {
      setError('Both passwords must be at least 8 characters');
      return;
    }
    if (longPw !== longPwConfirm) {
      setError("The unlock password fields don't match");
      return;
    }
    if (masterPw !== masterPwConfirm) {
      setError("The master password fields don't match");
      return;
    }
    if (longPw === masterPw) {
      setError('Use two different passwords, not the same one twice');
      return;
    }
    setBusy(true);
    try {
      await AppBlockerModule.setupPasswords(longPw, masterPw);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save passwords');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Set up AppBlocker</Text>
        <Text style={styles.subheading}>
          You'll set two passwords. The Unlock Password temporarily pauses blocking (it
          auto-resumes after 5 minutes) and is also needed to uninstall the app. The Master
          Password turns blocking off indefinitely, until you switch it back on yourself.
        </Text>

        <Text style={styles.label}>Unlock Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={longPw}
          onChangeText={setLongPw}
          placeholder="At least 8 characters"
          placeholderTextColor="#8a8a8a"
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          value={longPwConfirm}
          onChangeText={setLongPwConfirm}
          placeholder="Confirm unlock password"
          placeholderTextColor="#8a8a8a"
        />

        <Text style={[styles.label, styles.labelSpaced]}>Master Password</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={masterPw}
          onChangeText={setMasterPw}
          placeholder="Different from the unlock password"
          placeholderTextColor="#8a8a8a"
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          value={masterPwConfirm}
          onChangeText={setMasterPwConfirm}
          placeholder="Confirm master password"
          placeholderTextColor="#8a8a8a"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save & continue</Text>}
        </TouchableOpacity>

        <Text style={styles.warning}>
          Write these down somewhere safe. There's no recovery flow — losing both passwords
          means the only way off is uninstalling through the OS's own Device Admin removal, which
          this app deliberately makes inconvenient.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  container: { padding: 24, paddingTop: 24 },
  heading: { color: '#fff', fontSize: 26, fontWeight: '800', marginBottom: 8 },
  subheading: { color: '#a0a0a5', fontSize: 14, lineHeight: 20, marginBottom: 28 },
  label: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  labelSpaced: { marginTop: 20 },
  input: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: '#ff6b6b', marginTop: 8, marginBottom: 4, fontSize: 13 },
  button: {
    backgroundColor: '#e5484d',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  warning: { color: '#7a7a80', fontSize: 12, lineHeight: 17, marginTop: 24 },
});
