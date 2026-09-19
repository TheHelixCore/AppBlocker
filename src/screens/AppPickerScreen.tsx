import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBlockerModule, { InstalledApp } from '../native/AppBlockerModule';

interface Props {
  onBack: () => void;
}

export default function AppPickerScreen({ onBack }: Props) {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const [installed, blocked] = await Promise.all([
        AppBlockerModule.getInstalledApps(),
        AppBlockerModule.getBlockedApps(),
      ]);
      installed.sort((a, b) => a.appName.localeCompare(b.appName));
      setApps(installed);
      setSelected(new Set(blocked));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return apps;
    const q = query.trim().toLowerCase();
    return apps.filter(
      a => a.appName.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q),
    );
  }, [apps, query]);

  const toggle = (packageName: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(packageName)) {
        next.delete(packageName);
      } else {
        next.add(packageName);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await AppBlockerModule.setBlockedApps(Array.from(selected));
      onBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.headerAction}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked apps</Text>
        <TouchableOpacity onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator />
          ) : (
            <Text style={[styles.headerAction, styles.saveAction]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search apps"
        placeholderTextColor="#8a8a8a"
        value={query}
        onChangeText={setQuery}
      />

      <Text style={styles.count}>{selected.size} app(s) selected</Text>

      {loading ? (
        <ActivityIndicator style={styles.loading} color="#fff" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.packageName}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => toggle(item.packageName)}>
              {item.icon ? (
                <Image
                  source={{ uri: `data:image/png;base64,${item.icon}` }}
                  style={styles.icon}
                />
              ) : (
                <View style={[styles.icon, styles.iconPlaceholder]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.appName} numberOfLines={1}>
                  {item.appName}
                </Text>
                <Text style={styles.packageName} numberOfLines={1}>
                  {item.packageName}
                </Text>
              </View>
              <Switch
                value={selected.has(item.packageName)}
                onValueChange={() => toggle(item.packageName)}
              />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerAction: { color: '#fff', fontSize: 16 },
  saveAction: { color: '#e5484d', fontWeight: '700' },
  search: {
    marginHorizontal: 16,
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
  },
  count: { color: '#8a8a8a', fontSize: 12, marginHorizontal: 16, marginVertical: 8 },
  loading: { marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  icon: { width: 40, height: 40, borderRadius: 8, marginRight: 12 },
  iconPlaceholder: { backgroundColor: '#2c2c2e' },
  rowText: { flex: 1 },
  appName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  packageName: { color: '#7a7a80', fontSize: 11 },
});
