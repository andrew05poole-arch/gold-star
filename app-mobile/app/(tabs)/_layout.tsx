import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily } from '@/lib/theme';
import { getMyProfile } from '@/lib/api/profile';
import { Avatar } from '@/components/Avatar';
import type { User } from '@/lib/types';

export default function TabsLayout() {
  // Shown as the Profile tab's icon instead of a generic person glyph, so
  // which account is signed in is visible from any tab — not just after
  // navigating into Profile itself (the actual ask: testing with multiple
  // accounts side by side made it easy to lose track of which was active).
  const [profile, setProfile] = useState<User | null>(null);

  useEffect(() => {
    getMyProfile().then(setProfile).catch(() => {});
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: fontFamily.bold, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'League',
          tabBarIcon: ({ color, size }) => <Ionicons name="podium" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="rival"
        options={{
          title: 'Rival',
          tabBarIcon: ({ color, size }) => <Ionicons name="flash" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="streaks"
        options={{
          title: 'Streaks',
          tabBarIcon: ({ color, size }) => <Ionicons name="flame" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) =>
            profile ? (
              <Avatar name={profile.displayName} color={profile.avatarColor} photoUrl={profile.avatarUrl} size={size} />
            ) : (
              <Ionicons name="person-circle" size={size} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}
