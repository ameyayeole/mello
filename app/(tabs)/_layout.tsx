import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { useAuthStore } from '@/stores/authStore';
import { TabGlyph, Avatar } from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { SafetyPopup, SosModal, WelcomeSafetyModal } from '@/components/safety';
import { hasSeenSafetyFlag, markSafetyFlagSeen } from '@/services/safety';
import { sharePlan } from '@/utils/sharePlan';

// Safety popup #1: full-screen welcome shown once ever, the first time a
// signed-in user lands in the app after onboarding. "Read the Safety Centre"
// opens the SOS/helplines screen (the closest thing to a Safety Centre today).
function WelcomeSafetyPopup() {
  const userId = useAuthStore((s) => s.user?.id);
  const [visible, setVisible] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    hasSeenSafetyFlag(userId, 'welcome').then((seen) => {
      if (!cancelled && !seen) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function dismiss() {
    setVisible(false);
    if (userId) markSafetyFlagSeen(userId, 'welcome');
  }

  return (
    <>
      <WelcomeSafetyModal
        visible={visible}
        onDone={dismiss}
        onSafetyCentre={() => {
          dismiss();
          setSosOpen(true);
        }}
      />
      <SosModal visible={sosOpen} onClose={() => setSosOpen(false)} />
    </>
  );
}

// Safety popup #4: "Meeting in real life" sheet, opened when the user taps the
// 2-hours-before local notification (set in uiStore by useNotifications).
function EventReminderSheet() {
  const reminderEvent = useUIStore((s) => s.safetyReminderEvent);
  const clear = useUIStore((s) => s.setSafetyReminderEvent);

  if (!reminderEvent) return null;
  return (
    <SafetyPopup
      visible
      icon="location"
      title={`Heading to ${reminderEvent.title} soon?`}
      body={[
        'Share your plan with a trusted contact.',
        'Arrange your own way there and back.',
        'Keep an eye on your drink and your belongings.',
      ]}
      primaryLabel="Share my plan"
      onPrimary={() => {
        sharePlan(reminderEvent);
        clear(null);
      }}
      secondaryLabel="I'm good"
      onSecondary={() => clear(null)}
      onClose={() => clear(null)}
    />
  );
}

function ProfileTabIcon({ focused }: { focused: boolean }) {
  const user = useAuthStore((s) => s.user);
  return (
    <View style={[styles.avatarWrap, focused && styles.avatarWrapActive]}>
      <Avatar name={user?.name} photoUrl={user?.photo_url} size={26} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <>
    <WelcomeSafetyPopup />
    <EventReminderSheet />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: 'rgba(15,24,44,0.22)',
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: 'rgba(15,24,44,0.08)',
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOpacity: 0.05,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: -1 },
          elevation: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabGlyph name="home" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ focused }) => (
            <TabGlyph name="explore" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => <TabGlyph name="map" active={focused} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused }) => (
            <TabGlyph name="inbox" active={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileTabIcon focused={focused} />,
        }}
      />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    borderRadius: 15,
    padding: 1,
  },
  avatarWrapActive: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    padding: 0,
    margin: -1,
  },
});
