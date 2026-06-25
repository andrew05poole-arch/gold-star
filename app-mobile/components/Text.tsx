import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { colors, fontFamily, fontSize } from '@/lib/theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
}

/** Themed Text that applies the Nunito family + variant sizing. */
export function Text({ variant = 'body', color, style, ...rest }: Props) {
  return <RNText {...rest} style={[styles[variant], color ? { color } : null, style]} />;
}

const styles = StyleSheet.create({
  display: { fontFamily: fontFamily.extraBold, fontSize: fontSize.display, color: colors.textPrimary },
  title: { fontFamily: fontFamily.extraBold, fontSize: fontSize.xl, color: colors.textPrimary },
  heading: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  body: { fontFamily: fontFamily.semibold, fontSize: fontSize.md, color: colors.textPrimary },
  label: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.textSecondary },
  caption: { fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: colors.textSecondary },
});
