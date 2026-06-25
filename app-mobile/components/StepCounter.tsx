import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, fontSize } from '@/lib/theme';
import { formatSteps } from '@/lib/format';
import { Text } from './Text';

interface Props {
  steps: number;
}

/** Large step numeral with a brief count-up animation on mount. */
export function StepCounter({ steps }: Props) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const duration = 700;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(steps * eased));
      if (t < 1) raf.current = setTimeout(tick, 16);
    };
    tick();
    return () => {
      if (raf.current) clearTimeout(raf.current);
    };
  }, [steps]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.number}>{formatSteps(display)}</Text>
      <Text style={styles.unit}>steps today</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  number: { fontFamily: fontFamily.extraBold, fontSize: fontSize.display, color: colors.textPrimary, lineHeight: 56 },
  unit: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: colors.textSecondary },
});
