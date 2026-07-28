import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '@/lib/theme';
import { deleteChallenge, getChallengeDetail, updateChallenge } from '@/lib/api/challenges';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Text } from '@/components/Text';
import type { ChallengeDetail, ChallengeGoalType, ChallengeStatus } from '@/lib/types';

const GOAL_TYPE_LABEL: Record<ChallengeGoalType, string> = {
  stepsPerDay: 'steps/day',
  totalSteps: 'total steps',
  daysStreak: 'day streak',
};

const STATUS_COLOR: Record<ChallengeStatus, string> = {
  active: colors.primary,
  completed: colors.secondary,
  expired: colors.textSecondary,
};

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getChallengeDetail(id)
      .then((d) => {
        setDetail(d);
        setEditTitle(d.title);
        setEditSubtitle(d.subtitle);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this challenge.'))
      .finally(() => setLoading(false));
  }, [id]);

  // Refetches whenever this screen regains focus — covers coming back here
  // after joining/editing/deleting elsewhere, since (unlike a full remount)
  // navigating "back" alone wouldn't otherwise re-run a one-time effect.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSaveEdit() {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateChallenge(detail.id, editTitle.trim(), editSubtitle.trim());
      setEditing(false);
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!detail) return;
    Alert.alert('Delete this challenge?', "This removes it for everyone who joined. This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChallenge(detail.id);
            router.back();
          } catch (e) {
            Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text variant="heading">Challenge</Text>
        <View style={styles.backBtn} />
      </View>

      {loading && (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}

      {!loading && error && (
        <Card>
          <Text variant="body">{error}</Text>
        </Card>
      )}

      {!loading && detail && (
        <>
          <Card style={styles.summaryCard}>
            {editing ? (
              <>
                <Text variant="label">TITLE</Text>
                <TextInput
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={styles.input}
                  placeholderTextColor={colors.textSecondary}
                />
                <Text variant="label" style={styles.fieldLabel}>
                  SUBTITLE
                </Text>
                <TextInput
                  value={editSubtitle}
                  onChangeText={setEditSubtitle}
                  placeholder="Optional"
                  style={styles.input}
                  placeholderTextColor={colors.textSecondary}
                />
                {saveError && <Text style={styles.error}>{saveError}</Text>}
                <View style={styles.editActions}>
                  <PrimaryButton
                    label="Cancel"
                    variant="ghost"
                    onPress={() => setEditing(false)}
                    disabled={saving}
                    style={styles.editBtn}
                  />
                  <PrimaryButton
                    label="Save"
                    onPress={handleSaveEdit}
                    loading={saving}
                    disabled={editTitle.trim().length === 0}
                    style={styles.editBtn}
                  />
                </View>
              </>
            ) : (
              <>
                <Text variant="title">{detail.title}</Text>
                {!!detail.subtitle && (
                  <Text variant="body" style={styles.subtitle}>
                    {detail.subtitle}
                  </Text>
                )}
                <Text variant="caption" style={styles.meta}>
                  {detail.goalValue.toLocaleString()} {GOAL_TYPE_LABEL[detail.goalType]} · {detail.durationDays}-day
                  window per member · started {detail.startsAt}
                </Text>
                {detail.isOwner && (
                  <View style={styles.ownerActions}>
                    <PrimaryButton label="Edit" variant="ghost" onPress={() => setEditing(true)} style={styles.editBtn} />
                    <PrimaryButton label="Delete" variant="ghost" onPress={handleDelete} style={styles.editBtn} />
                  </View>
                )}
              </>
            )}
          </Card>

          <View style={styles.section}>
            <Text variant="heading">Members ({detail.members.length})</Text>
            {detail.members.length === 0 && <Text variant="body">No one has joined yet.</Text>}
            {detail.members.map((m, i) => (
              <Card key={m.userId} style={styles.memberCard}>
                <View style={styles.memberRow}>
                  <Text style={styles.rank}>#{i + 1}</Text>
                  <View style={[styles.avatar, { backgroundColor: m.avatarColor }]}>
                    <Text style={styles.avatarInitial}>{m.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{m.isMe ? `${m.displayName} (you)` : m.displayName}</Text>
                    <Text variant="caption">Ends {m.windowEnd}</Text>
                  </View>
                  <View style={styles.memberProgress}>
                    <Text style={[styles.memberProgressValue, { color: STATUS_COLOR[m.status] }]}>
                      {Math.round(m.progress).toLocaleString()}
                    </Text>
                    <Text variant="caption" style={{ color: STATUS_COLOR[m.status] }}>
                      {m.status}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  centerBox: { alignItems: 'center', paddingVertical: spacing.xxl },
  summaryCard: { gap: spacing.xs },
  subtitle: { color: colors.textSecondary },
  meta: { marginTop: spacing.xs },
  ownerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  editBtn: { flex: 1, height: 44 },
  fieldLabel: { marginTop: spacing.sm },
  input: {
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  editActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  error: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.danger, marginTop: spacing.xs },
  section: { gap: spacing.sm },
  memberCard: { paddingVertical: spacing.md },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { fontFamily: fontFamily.extraBold, fontSize: 13, color: colors.textSecondary, width: 28 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: fontFamily.extraBold, fontSize: 14, color: '#FFFFFF' },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.textPrimary },
  memberProgress: { alignItems: 'flex-end', gap: 2 },
  memberProgressValue: { fontFamily: fontFamily.extraBold, fontSize: 15 },
});
