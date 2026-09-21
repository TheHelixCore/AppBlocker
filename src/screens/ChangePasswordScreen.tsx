import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBlockerModule from '../native/AppBlockerModule';
import PasswordField from '../components/PasswordField';

interface Props {
  onBack: () => void;
}

export default function ChangePasswordScreen({ onBack }: Props) {
  const [masterPw, setMasterPw] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newLongPw, setNewLongPw] = useState('');
  const [newMasterPw, setNewMasterPw] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const unlock = async () => {
    setGateError(null);
    setBusy(true);
    try {
      const ok = await AppBlockerModule.verifyMasterPassword(masterPw);
      if (ok) {
        setUnlocked(true);
      } else {
        setGateError('Master password incorrect');
      }
    } finally {
      setBusy(false);
    }
  };

  const saveLongPw = async () => {
    if (newLongPw.length < 8) {
      setStatusMsg('New unlock password must be at least 8 characters');
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      await AppBlockerModule.changeLongPassword(masterPw, newLongPw);
      setNewLongPw('');
      setStatusMsg('Unlock password updated');
    } catch (e: any) {
      setStatusMsg(e?.message ?? 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  const saveMasterPw = async () => {
    if (newMasterPw.length < 8) {
      setStatusMsg('New master password must be at least 8 characters');
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    try {
      await AppBlockerModule.changeMasterPassword(masterPw, newMasterPw);
      setMasterPw(newMasterPw);
      setNewMasterPw('');
      setStatusMsg('Master password updated');
    } catch (e: any) {
      setStatusMsg(e?.message ?? 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <SafeAreaView style={styles.flex}>
        <View style={styles.gate}>
          <Text style={styles.heading}>Enter Master Password</Text>
          <Text style={styles.subheading}>Required to change either password.</Text>
          <PasswordField
            containerStyle={styles.input}
            value={masterPw}
            onChangeText={setMasterPw}
            placeholder="Master password"
            placeholderTextColor="#8a8a8a"
            autoFocus
          />
          {gateError ? <Text style={styles.error}>{gateError}</Text> : null}
          <TouchableOpacity style={styles.button} onPress={unlock} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Unlock</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={onBack} style={styles.cancelLink}>
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.headerAction}>Done</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change passwords</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>New Unlock Password</Text>
        <PasswordField
          containerStyle={styles.input}
          value={newLongPw}
          onChangeText={setNewLongPw}
          placeholder="At least 8 characters"
          placeholderTextColor="#8a8a8a"
        />
        <TouchableOpacity style={styles.button} onPress={saveLongPw} disabled={busy}>
          <Text style={styles.buttonText}>Update unlock password</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>New Master Password</Text>
        <PasswordField
          containerStyle={styles.input}
          value={newMasterPw}
          onChangeText={setNewMasterPw}
          placeholder="At least 8 characters"
          placeholderTextColor="#8a8a8a"
        />
        <TouchableOpacity style={styles.button} onPress={saveMasterPw} disabled={busy}>
          <Text style={styles.buttonText}>Update master password</Text>
        </TouchableOpacity>
      </View>

      {statusMsg ? <Text style={styles.status}>{statusMsg}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  gate: { flex: 1, padding: 24, paddingTop: 80 },
  heading: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  subheading: { color: '#a0a0a5', fontSize: 13, marginBottom: 20 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerAction: { color: '#e5484d', fontSize: 16, fontWeight: '700', width: 40 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  label: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  error: { color: '#ff6b6b', marginBottom: 8, fontSize: 13 },
  button: {
    backgroundColor: '#e5484d',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelLink: { marginTop: 16, alignItems: 'center' },
  cancelLinkText: { color: '#8a8a8a', fontSize: 14 },
  status: { color: '#8a8a8a', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
