import { Alert, Platform } from 'react-native';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/**
 * Cross-platform replacement for RN's Alert.alert. react-native-web's own
 * Alert.alert is a documented no-op (`static alert() {}` —
 * node_modules/react-native-web/dist/cjs/exports/Alert/index.js), so every
 * Alert.alert call in this app has silently done nothing on web — including
 * confirmation dialogs (delete challenge, remove friend) and simple
 * feedback (Share invite link's "Copied!", upload/sign-out failures).
 * Delegates to the real native Alert on iOS/Android; falls back to
 * window.alert/window.confirm on web. Zero/one-button calls map to
 * window.alert (that button's onPress fires immediately after, matching
 * native's "OK dismisses and fires onPress" behavior); two-or-more-button
 * calls map to window.confirm, treating the 'cancel'-style button as
 * Cancel and the first non-cancel button as OK — window.confirm is binary,
 * so a 3+-button Alert.alert can't be represented exactly, but no call site
 * in this app currently uses more than two.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');

  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const confirmButton = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  if (window.confirm(text)) {
    confirmButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
