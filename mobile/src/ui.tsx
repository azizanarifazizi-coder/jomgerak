import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export const C = {
  bg: '#F2F5F1', surface: '#FFFFFF', sunk: '#E8EEE8', fg: '#13201A', muted: '#58695F', line: '#D6DFD8',
  green: '#1E7A4C', greenSoft: '#8CC3A5', orange: '#D9621A', red: '#C23B2E', ok: '#2E8B57',
};

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Label({ children }: { children: ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
export function Note({ children }: { children: ReactNode }) {
  return <Text style={s.note}>{children}</Text>;
}
export function Button({ title, onPress, ghost, disabled }: { title: string; onPress: () => void; ghost?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
      style={({ pressed }) => [s.btn, ghost && s.btnGhost, (disabled || pressed) && { opacity: disabled ? 0.5 : 0.8 }]}>
      <Text style={[s.btnText, ghost && { color: C.fg }]}>{title}</Text>
    </Pressable>
  );
}
export function Chip({ title, on, onPress }: { title: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{title}</Text>
    </Pressable>
  );
}
export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.row, style]}>{children}</View>;
}
export function Meter({ value }: { value: number }) {
  return <View style={s.meter}><View style={[s.meterFill, { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }]} /></View>;
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  label: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: C.muted, fontWeight: '700' },
  note: { fontSize: 12, color: C.muted, lineHeight: 17 },
  btn: { backgroundColor: C.green, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: C.sunk },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chip: { borderColor: C.line, borderWidth: 1, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.green, borderColor: C.green },
  chipText: { fontSize: 13, fontWeight: '600', color: C.fg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  meter: { height: 6, backgroundColor: C.sunk, borderRadius: 99, overflow: 'hidden', flex: 1 },
  meterFill: { height: '100%', backgroundColor: C.green, borderRadius: 99 },
  h: { fontSize: 16, fontWeight: '700', color: C.fg },
  muted: { fontSize: 13, color: C.muted },
  input: { borderColor: C.line, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: C.surface, color: C.fg },
  err: { color: C.red, fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
