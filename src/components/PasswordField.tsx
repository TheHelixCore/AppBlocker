import React, { useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

interface Props extends Omit<TextInputProps, 'secureTextEntry' | 'style'> {
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * A password TextInput with a Show/Hide toggle. Lets a mistyped character be caught by looking
 * at it, instead of only finding out via a wrong-password rejection after submitting.
 */
export default function PasswordField({ containerStyle, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.row, containerStyle]}>
      <TextInput {...rest} secureTextEntry={!visible} style={styles.input} />
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.toggle}>
        <Text style={styles.toggleText}>{visible ? 'HIDE' : 'SHOW'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, color: '#fff', fontSize: 16, padding: 0 },
  toggle: { marginLeft: 10, paddingVertical: 4 },
  toggleText: { color: '#8a8a8a', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
});
