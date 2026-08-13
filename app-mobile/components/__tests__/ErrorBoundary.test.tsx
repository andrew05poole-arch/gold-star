import React from 'react';
import { Text as RNText } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ErrorBoundary } from '../ErrorBoundary';

/** Throws on render so we can drive ErrorBoundary's catch path. */
function Bomb(): React.ReactElement {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // React (and our own componentDidCatch) log the caught error to
    // console.error — expected here, so silence it to keep test output clean
    // without hiding a genuinely unexpected failure elsewhere.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when nothing throws', async () => {
    const { getByText, queryByText } = await render(
      <ErrorBoundary>
        <RNText>All good</RNText>
      </ErrorBoundary>,
    );

    expect(getByText('All good')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();
  });

  it('renders the recovery UI instead of crashing when a child throws', async () => {
    const { getByText } = await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('resets its error state when "Try again" is pressed', async () => {
    let shouldThrow = true;
    function MaybeBomb() {
      if (shouldThrow) throw new Error('kaboom');
      return <RNText>Recovered</RNText>;
    }

    const { getByText } = await render(
      <ErrorBoundary>
        <MaybeBomb />
      </ErrorBoundary>,
    );

    expect(getByText('Something went wrong')).toBeTruthy();

    // Fix the underlying condition before retrying, the same way a real
    // transient failure (e.g. a flaky fetch) would clear on the next render.
    shouldThrow = false;
    fireEvent.press(getByText('Try again'));

    await waitFor(() => expect(getByText('Recovered')).toBeTruthy());
  });
});
