import { Image, StyleSheet, View } from 'react-native';
import { fontFamily, radii } from '@/lib/theme';
import { Text } from './Text';

interface Props {
  name: string;
  color: string;
  size?: number;
  /** When set, renders the photo instead of the colored-initials fallback. */
  photoUrl?: string;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ name, color, size = 44, photoUrl }: Props) {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: radii.full }}
      />
    );
  }
  return (
    <View style={[styles.base, { width: size, height: size, borderRadius: radii.full, backgroundColor: color }]}>
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fontFamily.extraBold, color: '#FFFFFF' },
});
