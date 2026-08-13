import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, radii, spacing } from '@/lib/theme';
import { Avatar } from './Avatar';
import { Text } from './Text';
import type { Friend } from '@/lib/types';

interface Props {
  friends: Friend[];
  selectedIds: Set<string>;
  onToggle: (friendId: string) => void;
  /** Shown instead of the list when `friends` is empty. */
  emptyHint?: string;
}

/**
 * Multi-select friend list for picking challenge invitees. Extracted from
 * app/(tabs)/streaks.tsx's create-challenge form — the original (and still
 * only, pre-#84) place this UI existed — so app/challenge/[id].tsx's
 * owner-only "Invite friends" action (issue #84) can reuse the exact same
 * picker instead of duplicating it. Visuals/behavior are unchanged from the
 * inline version this replaced.
 */
export function FriendPicker({ friends, selectedIds, onToggle, emptyHint = 'Add some friends first to invite them.' }: Props) {
  if (friends.length === 0) {
    return <Text style={styles.hint}>{emptyHint}</Text>;
  }

  return (
    <View style={styles.picker}>
      {friends.map((friend) => {
        const selected = selectedIds.has(friend.id);
        return (
          <TouchableOpacity
            key={friend.id}
            style={[styles.option, selected && styles.optionActive]}
            onPress={() => onToggle(friend.id)}
          >
            <Avatar name={friend.displayName} color={friend.avatarColor} photoUrl={friend.avatarUrl} size={32} />
            <Text style={styles.optionText}>{friend.displayName}</Text>
            {selected && <Ionicons name="checkmark-circle" size={20} color={colors.rivalAccent} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textSecondary },
  picker: { gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: '#EFEDFF',
  },
  optionActive: { backgroundColor: colors.rivalAccent + '22' },
  optionText: { flex: 1, fontFamily: fontFamily.bold, fontSize: 13, color: colors.textPrimary },
});
