import { Component, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { ScreenContainer } from './ScreenContainer';
import { PrimaryButton } from './PrimaryButton';
import { Text } from './Text';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level render-error catch-all. Without this, an uncaught error thrown
 * during render anywhere in the tree unmounts the whole app and React Native
 * shows a blank screen (or a bare redbox in dev) — no way for the user to
 * recover short of a full app restart.
 *
 * Class components are the only way to implement this: `componentDidCatch` /
 * `getDerivedStateFromError` have no hook equivalent, so this can't be a
 * function component.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Intentionally not swallowed — surface it wherever this app's console
    // output is monitored (Metro logs, device logs, error-reporting shims).
    console.error('Uncaught render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <ScreenContainer scroll={false}>
          <View style={styles.container}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              StepLeague hit an unexpected error. Your data is safe — try again to keep going.
            </Text>
            <PrimaryButton label="Try again" onPress={this.handleReset} style={styles.button} />
          </View>
        </ScreenContainer>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  title: { fontFamily: fontFamily.extraBold, fontSize: 22, color: colors.textPrimary, textAlign: 'center' },
  message: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  button: { marginTop: spacing.md, alignSelf: 'stretch' },
});
