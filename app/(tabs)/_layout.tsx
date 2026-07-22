import { useEffect, useState } from 'react';
import { SHADOWS, SPACING } from '@/constants/spacing';
import { Tabs, usePathname } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { useAuthStore } from '@/stores/authStore';
import {
  AppBackground,
  TabGlyph,
  Avatar,
  TabBarBackground,
  useTabBarBottomMargin,
  useTabBarSideMargin,
  useTabBarSlide,
  CHIP_HEIGHT,
  CHIP_WIDTH,
  TAB_BAR_HEIGHT,
  TAB_BAR_PADDING_X,
  TAB_BAR_RADIUS,
} from '@/components/ui';
import { useUIStore } from '@/stores/uiStore';
import { useUnreadDms } from '@/hooks/useUnreadDms';
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

// Must stay in the same order as the <Tabs.Screen> declarations below: the
// indicator derives which slot to sit in from a route's index in this list.
const TAB_ROUTES = ['/', '/explore', '/map', '/chats', '/profile'] as const;

// The glyph and its badge only. Selection is drawn by the single travelling
// indicator on the glass behind these — see TabBarBackground.
function TabIcon({
  name,
  focused,
  badge,
}: {
  name: 'home' | 'explore' | 'map' | 'inbox';
  focused: boolean;
  badge?: number;
}) {
  return (
    <View style={styles.iconBox}>
      <TabGlyph name={name} active={focused} />
      {!!badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

function InboxTabIcon({ focused }: { focused: boolean }) {
  const unread = useUnreadDms();
  return <TabIcon name="inbox" focused={focused} badge={unread} />;
}

function ProfileTabIcon() {
  const user = useAuthStore((s) => s.user);
  return (
    <View style={styles.avatarWrap}>
      <Avatar name={user?.name} photoUrl={user?.photo_url} size={30} />
    </View>
  );
}

export default function TabLayout() {
  // The in-map event creation flow takes the whole screen: the tab bar steps
  // aside with the rest of the chrome until the flow closes.
  const creatingEvent = useUIStore((s) => s.creatingEvent);
  const bottomMargin = useTabBarBottomMargin();
  const sideMargin = useTabBarSideMargin();

  // An open conversation is a focused view: with the bar floating over the
  // content it would otherwise sit on top of the composer. `/chats` itself is
  // the list and keeps the bar — anything deeper is a thread. `usePathname`
  // strips the `(tabs)` group, so these are `/chats/<eventId>` and
  // `/chats/dm/<friendId>`.
  const inConversation = usePathname().startsWith('/chats/');

  // The full-screen overlays — notifications, search — are *transparent*
  // routes, so unlike every other push the bar would otherwise still be sitting
  // there: visible but inert, since the screen above swallows the touches.
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const hidden = creatingEvent || inConversation || overlayOpen;

  // All three reasons slide it down the same way, on the same timings the scene
  // beneath an overlay recedes on. It used to be `display: 'none'` — one frame,
  // no motion, in the middle of a half-second transition.
  const slide = useTabBarSlide(hidden);

  return (
    <>
    {/* One instance for the whole tab navigator, not one per screen. The
        backdrop is a single continuous surface the screens slide over — mounted
        per screen, its drifting blobs would jump back to their start position
        on every tab change, and you would be paying for five of them. */}
    <AppBackground />
    <WelcomeSafetyPopup />
    <EventReminderSheet />
    <Tabs
      screenOptions={{
        headerShown: false,
        // Without this each screen paints an opaque background over the one
        // above and no glass has anything to be translucent over.
        sceneStyle: { backgroundColor: 'transparent' },
        // Screens cross-fade with a small lateral shift toward the tab you
        // came from. 150ms default: enough to read as motion, short enough
        // that it never sits between you and the content.
        animation: 'shift',
        tabBarShowLabel: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.placeholder,
        tabBarBackground: () => <TabBarBackground routes={TAB_ROUTES} />,
        // React Navigation renders the icon into a fixed 31x28 box, inside a
        // button that is `justifyContent: 'flex-start'` with 5pt of padding —
        // room it reserves for the label even when the label is hidden. That
        // parks every glyph 13pt above the bar's centre line. `flex: 1` makes
        // the icon box fill the button's content height instead, so the chip
        // is centred on the bar rather than pinned to its top edge.
        tabBarIconStyle: { flex: 1, width: CHIP_WIDTH },
        // A floating pill, not a bar welded to the bottom edge: absolute so the
        // screen runs full height and its content passes under the glass.
        // `marginHorizontal`/`marginBottom` rather than left/right/bottom
        // because React Navigation already pins start/end/bottom to 0, and
        // `start`/`end` beat `left`/`right` in Yoga.
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: sideMargin,
          marginBottom: bottomMargin,
          height: TAB_BAR_HEIGHT,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: TAB_BAR_PADDING_X,
          borderTopWidth: 0,
          borderRadius: TAB_BAR_RADIUS,
          // Transparent so the blur shows through — which also means Android
          // draws no elevation shadow here. The hairline edge on the glass is
          // what separates the pill from the content there.
          backgroundColor: 'transparent',
          ...SHADOWS.lg,
          // Last, so its transform wins over the bar's built-in one. Spread
          // rather than nested: `tabBarStyle` takes one object, and the slide
          // has to sit at the same level as the layout above it.
          ...slide,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="explore" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ focused }) => <TabIcon name="map" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused }) => <InboxTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: () => <ProfileTabIcon />,
        }}
      />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sits on the glyph's top-right corner, inside the chip's bounds so it does
  // not shift when the chip appears.
  badge: {
    position: 'absolute',
    top: 4,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: SPACING[1],
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    lineHeight: 13,
    color: COLORS.white,
  },
  avatarWrap: {
    borderRadius: 999,
    padding: SPACING[0.5],
  },
});
