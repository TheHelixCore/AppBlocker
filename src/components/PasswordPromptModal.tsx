import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PasswordField from './PasswordField';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  submitLabel?: string;
  onCancel: () => void;
  /** Return true on success. Return false (optionally with an error message) to keep the modal open. */
  onSubmit: (password: string) => Promise<{ ok: boolean; error?: string }>;
}

export default function PasswordPromptModal({
  visible,
  title,
  message,
  submitLabel = 'Confirm',
  onCancel,
  onSubmit,
}: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPassword('');
    setError(null);
    setBusy(false);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const handleSubmit = async () => {
    if (!password) {
      setError('Enter a password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(password);
      if (result.ok) {
        reset();
      } else {
        setBusy(false);
        setError(result.error ?? 'Incorrect password');
      }
    } catch {
      setBusy(false);
      setError('Something went wrong, try again');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <PasswordField
            containerStyle={styles.input}
            placeholder="Password"
            placeholderTextColor="#8a8a8a"
            autoFocus
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            onSubmitEditing={handleSubmit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 20,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  message: { color: '#b0b0b5', fontSize: 13, marginBottom: 12 },
  input: {
    backgroundColor: '#2c2c2e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 8,
  },
  error: { color: '#ff6b6b', marginTop: 8, fontSize: 13 },
  row: { flexDirection: 'row', marginTop: 18, gap: 10 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#2c2c2e',
  },
  cancelText: { color: '#fff', fontWeight: '600' },
  submitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#e5484d',
  },
  submitText: { color: '#fff', fontWeight: '700' },
});
