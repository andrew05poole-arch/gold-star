import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('@/lib/api/profile', () => ({
  updateDailyGoal: jest.fn(),
}));

import { DailyGoalPicker } from '../DailyGoalPicker';
import { updateDailyGoal } from '@/lib/api/profile';

const mockUpdateDailyGoal = updateDailyGoal as jest.Mock;

describe('DailyGoalPicker', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('persists the chosen preset via updateDailyGoal and reports it back', async () => {
    mockUpdateDailyGoal.mockResolvedValue(undefined);
    const onChange = jest.fn();
    const { getByText } = await render(<DailyGoalPicker dailyGoal={10000} onChange={onChange} />);

    await act(async () => {
      fireEvent.press(getByText('12,000'));
      // Flush the microtask queue so the `await updateDailyGoal()` continuation
      // (onChange + the trailing `finally { setSaving(null) }`) settles inside act().
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUpdateDailyGoal).toHaveBeenCalledWith(12000);
    expect(onChange).toHaveBeenCalledWith(12000);
  });

  it('does not call updateDailyGoal when the already-active preset is pressed', async () => {
    const onChange = jest.fn();
    const { getByText } = await render(<DailyGoalPicker dailyGoal={8000} onChange={onChange} />);

    fireEvent.press(getByText('8,000'));

    expect(mockUpdateDailyGoal).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an error and does not call onChange when the update fails', async () => {
    mockUpdateDailyGoal.mockRejectedValue({ message: 'network down' });
    const onChange = jest.fn();
    const { getByText, findByText } = await render(<DailyGoalPicker dailyGoal={10000} onChange={onChange} />);

    await act(async () => {
      fireEvent.press(getByText('15,000'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await findByText('network down')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });
});
