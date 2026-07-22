import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { RADIUS, SPACING } from '@/constants/spacing';
import { OVERLAY_TRANSITION } from '@/constants/motion';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  useOverlayBackdrop,
  useOverlayScreen,
} from '@/hooks/useOverlayScreen';
import { signOut, deleteAccount, updateProfile } from '@/services/auth.service';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  AppBackground,
  Button,
  Glass,
  Icon,
  IconName,
  PressableScale,
  SectionLabel,
} from '@/components/ui';
import { showError } from '@/utils/errors';

// The chip flies at the size the profile screen drew it — it *is* that chip,
// not a copy sized to this screen's taste. Profile's `topGlyph` is 46/23, the
// same as the home screen's header chips and the back button notifications
// lands: one chip size across the app.
const CHIP = 46;
const CHIP_RADIUS = 23;

// The gear hands over to the chevron across the middle of the flight, so the
// chip is visibly turning into the back button while it moves rather than
// arriving and then changing its mind. Same ranges the notifications chip uses.
const GEAR_OUT = [0.05, 0.4] as const;
const CHEVRON_IN = [0.35, 0.75] as const;

// Profile's chip is `onPhoto` — smoked glass with a white glyph, because it
// sits on the user's photo. It lands on this screen's light backdrop, where
// that reads as a black button rather than as glass, so the pane cross-fades
// tiers on the way over. Two stacked panes rather than one that changes: a
// <Glass> tier is a fill, a blur and a border together, not a colour to
// animate.
const TIER_SWAP = [0.25, 0.65] as const;

const TITLE_IN = [0, 0.55] as const;
const BODY_IN = [0.2, 0.9] as const;

// When the status bar flips from profile's light glyphs to this screen's dark
// ones. The bar is drawn by the OS and cannot cross-fade with the backdrop
// under it, so it switches once that backdrop is most of the way in — dark
// glyphs any earlier would be dark-on-near-black while profile is still there.
const STATUS_BAR_FLIP_MS = Math.round(OVERLAY_TRANSITION.sceneOutMs * 0.7);

function SettingsRow({
  icon,
  iconColor = COLORS.textPrimary,
  title,
  subtitle,
  onPress,
  trailing,
  last = false,
}: {
  icon: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <PressableScale
      scaleTo={onPress ? 0.98 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, !last && styles.rowBorder]}
    >
      <Icon name={icon} size={20} color={iconColor} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {trailing ??
        (onPress ? (
          <Icon name="chevronRight" size={18} color={COLORS.textMuted} />
        ) : null)}
    </PressableScale>
  );
}

// A group of rows on one pane of glass. Replaces the white card with a hairline
// divider the screen used to draw by hand — same shape, same grouping, but the
// surface is the app's rather than a colour of its own.
function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <Glass tier="panel" radius={RADIUS['2xl']} style={styles.card}>
      {children}
    </Glass>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const email = useAuthStore((s) => s.session?.user?.email);
  const clear = useAuthStore((s) => s.clear);
  const { ghostMode, setGhostMode } = useUIStore();

  // The chip's flight, the content's arrival and the way out — the app's
  // overlay choreography, shared with notifications and search.
  const { travel, content, handoff, dismiss } = useOverlayScreen();
  const backdropStyle = useOverlayBackdrop();

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), STATUS_BAR_FLIP_MS);
    return () => clearTimeout(t);
  }, []);

  const destX = SPACING[5];
  const destY = insets.top + SPACING[3];
  const hasOrigin = !!handoff;
  const fromX = handoff?.x ?? destX;
  const fromY = handoff?.y ?? destY;

  const chipStyle = useAnimatedStyle(() => {
    const t = travel.value;
    return {
      transform: [
        { translateX: fromX + (destX - fromX) * t },
        { translateY: fromY + (destY - fromY) * t },
        // A dip through the middle of the journey. A circle that slides at a
        // fixed size reads as a sprite being dragged; one that gives a little
        // on the way reads as an object with weight.
        { scale: interpolate(t, [0, 0.5, 1], [1, 0.94, 1]) },
      ],
      // Nothing to fly from, so it arrives in place instead.
      opacity: hasOrigin
        ? 1
        : interpolate(t, [0, 0.4], [0, 1], Extrapolation.CLAMP),
    };
  });

  const darkPaneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, TIER_SWAP, [1, 0], Extrapolation.CLAMP),
  }));

  const lightPaneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, TIER_SWAP, [0, 1], Extrapolation.CLAMP),
  }));

  const gearStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, GEAR_OUT, [1, 0], Extrapolation.CLAMP),
  }));

  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, CHEVRON_IN, [0, 1], Extrapolation.CLAMP),
  }));

  const titleStyle = useAnimatedStyle(() => {
    const t = interpolate(content.value, TITLE_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 14 }] };
  });

  const bodyStyle = useAnimatedStyle(() => {
    const t = interpolate(content.value, BODY_IN, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 24 }] };
  });

  async function toggleGhostMode(value: boolean) {
    setGhostMode(value);
    if (user) {
      await updateProfile(user.id, { is_ghost_mode: value });
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your profile, events, chats and photos. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            // A second confirm — deletion is irreversible, one mis-tap
            // shouldn't be enough.
            Alert.alert('Are you absolutely sure?', 'There is no way back.', [
              { text: 'Keep my account', style: 'cancel' },
              {
                text: 'Delete forever',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await deleteAccount();
                    clear();
                    router.replace('/onboarding/welcome');
                  } catch (e) {
                    showError(e);
                  }
                },
              },
            ]),
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          clear();
          router.replace('/onboarding/welcome');
        },
      },
    ]);
  }

  return (
    <View style={styles.root}>
      <StatusBar style={settled ? 'dark' : 'light'} />

      {/* This screen brings its own backdrop, which the other two overlays do
          not need. See useOverlayBackdrop: the profile tab is the one screen
          that paints an opaque floor over <AppBackground>, so there is nothing
          to reveal underneath — without this the glass rows and ink type land
          on near-black. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, backdropStyle]}
        pointerEvents="none"
      >
        <AppBackground />
      </Animated.View>

      <View style={[styles.content, { paddingTop: destY + CHIP + SPACING[5] }]}>
        <Animated.Text style={[styles.title, titleStyle]}>
          Settings
        </Animated.Text>

        <Animated.View style={[styles.fill, bodyStyle]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: insets.bottom + SPACING[8] },
            ]}
          >
            <View>
              <SectionLabel style={styles.sectionLabel}>Account</SectionLabel>
              <SettingsCard>
                <SettingsRow
                  icon="user"
                  title="Edit profile"
                  onPress={() => router.push('/profile/edit')}
                />
                <SettingsRow
                  icon="lock"
                  title="Change password"
                  onPress={() => router.push('/profile/change-password')}
                />
                <SettingsRow
                  icon="send"
                  title="Change email"
                  subtitle={email}
                  onPress={() => router.push('/profile/change-email')}
                  last
                />
              </SettingsCard>
            </View>

            <View>
              <SectionLabel style={styles.sectionLabel}>
                Privacy & safety
              </SectionLabel>
              <SettingsCard>
                <SettingsRow
                  icon="lock"
                  iconColor={COLORS.verified}
                  title="Ghost mode"
                  subtitle="Hide your online presence from others"
                  trailing={
                    <Switch
                      value={ghostMode}
                      onValueChange={toggleGhostMode}
                      trackColor={{
                        true: COLORS.primary,
                        false: COLORS.disabled,
                      }}
                      thumbColor={COLORS.surface}
                    />
                  }
                />
                <SettingsRow
                  icon="block"
                  iconColor={COLORS.error}
                  title="Blocked users"
                  subtitle="Review and unblock people"
                  onPress={() => router.push('/profile/blocked')}
                />
                <SettingsRow
                  icon="shield"
                  iconColor={COLORS.verified}
                  title="Verify your identity"
                  subtitle={
                    user?.kyc_status === 'approved'
                      ? 'Verified — badge active'
                      : user?.kyc_status === 'pending_review'
                        ? 'Under review'
                        : 'Get the verified badge'
                  }
                  onPress={() => router.push('/profile/verify')}
                  last
                />
              </SettingsCard>
            </View>

            <View>
              <SectionLabel style={styles.sectionLabel}>
                Danger zone
              </SectionLabel>
              <SettingsCard>
                <SettingsRow
                  icon="trash"
                  iconColor={COLORS.error}
                  title="Delete account"
                  subtitle="Permanently erase your account and data"
                  onPress={handleDeleteAccount}
                  last
                />
              </SettingsCard>
              <Button
                label="Log out"
                variant="tertiary"
                height={46}
                onPress={handleSignOut}
                style={styles.logout}
              />
            </View>
          </ScrollView>
        </Animated.View>
      </View>

      {/* The travelling chip. Absolutely positioned in *window* coordinates,
          outside the padded content column, because that is the space the
          origin was measured in.

          Deliberately keeps its glass fill, where AGENTS.md's NavButton is a
          bare glyph. The chip is load-bearing here: it is the same object the
          user pressed on the profile screen, and an object that dissolves
          halfway through its own journey has not moved anywhere. */}
      <Animated.View style={[styles.chip, chipStyle]} pointerEvents="box-none">
        <PressableScale
          scaleTo={0.9}
          onPress={() => dismiss()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          {/* Two panes and two glyphs, all four filling the same box and
              cross-fading. Nothing reflows mid-flight. */}
          <Animated.View style={[styles.pane, darkPaneStyle]}>
            <Glass tier="onPhoto" radius={CHIP_RADIUS} style={styles.paneFill} />
          </Animated.View>
          <Animated.View style={[styles.pane, lightPaneStyle]}>
            <Glass tier="panel" radius={CHIP_RADIUS} style={styles.paneFill} />
          </Animated.View>

          <View style={styles.chipBox}>
            <Animated.View style={[styles.pane, gearStyle]}>
              <Icon name="settings" size={20} color={COLORS.white} />
            </Animated.View>
            <Animated.View style={[styles.pane, backStyle]}>
              <Icon
                name="back"
                size={22}
                color={COLORS.textPrimary}
                strokeWidth={2.1}
              />
            </Animated.View>
          </View>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The route is transparent; the backdrop above supplies the gradient. This is
  // the one place a second <AppBackground> is mounted, and it is safe precisely
  // because the profile tab's opaque floor means the shared one is never
  // visible at the same time — so the two blobs being at different points in
  // their drift cannot show as a cross-fade.
  root: { flex: 1 },
  content: { flex: 1 },
  fill: { flex: 1 },

  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.display,
    lineHeight: 40,
    letterSpacing: -1,
    color: COLORS.textPrimary,
    paddingHorizontal: SPACING[5],
  },

  scroll: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[5],
    gap: SPACING[5],
  },
  sectionLabel: { marginBottom: SPACING[2] },
  card: { overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3.5],
  },
  // The divider rides on the glass rather than on a white card, so it is the
  // ink ramp's faintest rung instead of a literal.
  rowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.inkSubtle },
  rowText: { flex: 1 },
  rowTitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  logout: { marginTop: SPACING[2.5] },

  chip: { position: 'absolute', top: 0, left: 0 },
  chipBox: { width: CHIP, height: CHIP },
  pane: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paneFill: { width: CHIP, height: CHIP },
});
