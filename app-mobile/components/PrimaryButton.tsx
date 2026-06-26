import { ActivityIndicator, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { colors, fontFamily, fontSize, radii, spacing } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const isGhost = variant === 'ghost';
  const bg = variant === 'secondary' ? colors.secondary : isGhost ? 'transparent' : colors.primary;
  const fg = isGhost ? colors.textSecondary : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        isGhost && styles.ghost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  ghost: { borderWidth: 2, borderColor: colors.border },
  label: { fontFamily: fontFamily.extraBold, fontSize: fontSize.md },
});
