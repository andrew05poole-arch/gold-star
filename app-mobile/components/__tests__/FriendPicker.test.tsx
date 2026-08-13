import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FriendPicker } from '../FriendPicker';
import type { Friend } from '@/lib/types';

const FRIENDS: Friend[] = [
  { id: 'f1', displayName: 'Alice', avatarColor: '#111', weeklySteps: 1000, rank: 1, previousRank: 1 },
  { id: 'f2', displayName: 'Bob', avatarColor: '#222', weeklySteps: 900, rank: 2, previousRank: 2 },
];

describe('FriendPicker', () => {
  it('renders every friend and calls onToggle with the pressed friend id', async () => {
    const onToggle = jest.fn();
    const { getByText } = await render(
      <FriendPicker friends={FRIENDS} selectedIds={new Set()} onToggle={onToggle} />,
    );

    expect(getByText('Alice')).toBeTruthy();
    expect(getByText('Bob')).toBeTruthy();

    fireEvent.press(getByText('Bob'));
    expect(onToggle).toHaveBeenCalledWith('f2');
  });

  it('shows the empty hint instead of any friend rows when the list is empty', async () => {
    const { getByText, queryByText } = await render(
      <FriendPicker friends={[]} selectedIds={new Set()} onToggle={jest.fn()} emptyHint="No friends yet." />,
    );

    expect(getByText('No friends yet.')).toBeTruthy();
    expect(queryByText('Alice')).toBeNull();
  });

  it('uses the default empty hint when none is provided', async () => {
    const { getByText } = await render(<FriendPicker friends={[]} selectedIds={new Set()} onToggle={jest.fn()} />);
    expect(getByText('Add some friends first to invite them.')).toBeTruthy();
  });
});
