/**
 * StepLeague design tokens.
 * Single source of truth is design/DESIGN.md §3 — keep these values in sync.
 */

export const colors = {
  primary: '#FF6B4A', // coral/orange — CTAs, streak flame, daily-goal fill
  primaryDark: '#E85A3A', // pressed primary
  secondary: '#1FB6A8', // teal — progress, "You" in rival comparison
  secondaryDark: '#178F84',
  accent: '#FFD23F', // sunny yellow — celebrations, badges, milestones
  rivalAccent: '#7C6FFF', // soft indigo — the AI Rival in head-to-head bars
  background: '#FBF8F5', // soft off-white app background
  surface: '#FFFFFF', // card / sheet backgrounds
  textPrimary: '#2E2A27', // charcoal
  textSecondary: '#766F6A', // muted labels
  border: '#EDE7E2', // hairlines, empty tracks
  danger: '#E8543A', // "behind" / negative states
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  full: 999,
} as const;

export const fontFamily = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  display: 48, // step counter / scoreboard numerals
} as const;

export const theme = { colors, spacing, radii, fontFamily, fontSize } as const;
export type Theme = typeof theme;
