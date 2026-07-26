import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/useAuth';
import { getMyProfile } from '@/lib/api/profile';

/** Entry gate: route to login, onboarding, or the main tabs based on session + profile state. */
export default function Index() {
  const { session, loading } = useAuth();
  const [profileChecked, setProfileChecked] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    if (!session) {
      setHasProfile(false);
      setProfileChecked(true);
      return;
    }
    let active = true;
    setProfileChecked(false);
    getMyProfile()
      .then((profile) => {
        if (!active) return;
        setHasProfile(!!profile);
        setProfileChecked(true);
      })
      .catch(() => {
        if (active) setProfileChecked(true);
      });
    return () => {
      active = false;
    };
  }, [session]);

  if (loading || !profileChecked) return null;
  if (!session) return <Redirect href="/login" />;
  if (!hasProfile) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/home" />;
}
