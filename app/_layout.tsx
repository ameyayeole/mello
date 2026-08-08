import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';
import InAppNotification from '@/components/InAppNotification';
import { EventDealtCard } from '@/components/events/EventDealtCard';
import { WrapDealtCard } from '@/components/wrap/WrapDealtCard';
import { useThemeName, useThemeStore } from '@/stores/themeStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Shared by every route that opens as a full-screen overlay — see the note at
// the <Stack.Screen> declarations below.
const OVERLAY_SCREEN_OPTIONS = {
  presentation: 'transparentModal',
  animation: 'none',
  gestureEnabled: false,
} as const;

function AuthGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { session, user, isLoading } = useAuthStore();

  useNotifications();

  useEffect(() => {
    if (isLoading) return;

    const seg = segments as string[];
    const inOnboarding = seg[0] === 'onboarding';
    const inAuth = seg[0] === 'auth';

    // Password recovery: exchanging the emailed code signs the user in, but
    // they still need to type their new password — don't yank them to the map.
    if (inAuth && seg[1] === 'reset-password') return;

    if (!session) {
      if (!inOnboarding && !inAuth) router.replace('/onboarding/welcome');
    } else if (!user) {
      if (seg[1] !== 'profile-setup') router.replace('/auth/profile-setup');
    } else {
      if (inOnboarding || inAuth) router.replace('/(tabs)/map');
    }
  }, [session, user, isLoading, segments]);

  return null;
}

function RootLayoutInner() {
  useAuth();

  return (
    <>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="events/wishlist"
          options={{ presentation: 'modal' }}
        />
        {/* A full screen, not a sheet: the composer grows with each attachment
            and needs the whole window rather than whatever the keyboard leaves. */}
        <Stack.Screen
          name="community/compose"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="events/host/[eventId]" />
        <Stack.Screen name="events/attendees/[eventId]" />
        <Stack.Screen
          name="events/edit/[eventId]"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="friends" />
        <Stack.Screen
          name="profile/settings"
          options={OVERLAY_SCREEN_OPTIONS}
        />
        {/* The settings sub-screens. Transparent with the native animation off,
            like the overlays below, but for a different reason: each one slides
            its own contents in from the right while the back chip stays put, so
            the whole list reads as one place you move around inside rather than
            five cards thrown up from the bottom edge. A native slide would
            carry the chip along with everything else — see SettingsPanel. */}
        <Stack.Screen name="profile/edit" options={OVERLAY_SCREEN_OPTIONS} />
        <Stack.Screen
          name="profile/change-password"
          options={OVERLAY_SCREEN_OPTIONS}
        />
        <Stack.Screen
          name="profile/change-email"
          options={OVERLAY_SCREEN_OPTIONS}
        />
        <Stack.Screen name="profile/verify" options={OVERLAY_SCREEN_OPTIONS} />
        <Stack.Screen name="profile/blocked" options={OVERLAY_SCREEN_OPTIONS} />
        {/* The two overlays. Full screen and transparent, not modal cards: the
            page underneath stays mounted so it can recede as they come in, and
            so it can hand an element over — the bell chip becomes the back
            button, the search bar becomes the search field.

            `animation: 'none'` because the whole transition is driven in JS
            from the overlay itself (see `useOverlayScreen`) — a native one on
            top of that would be a second, differently-timed transition over the
            first. That also means the exit has to be played by hand before
            router.back(); the hook does it.

            `gestureEnabled: false` for the same reason: a swipe-dismiss would
            drag the native card away while the JS transition is still holding
            the pieces where they are. Each screen's own control is the way
            out. */}
        <Stack.Screen
          name="notifications"
          options={OVERLAY_SCREEN_OPTIONS}
        />
        <Stack.Screen name="search" options={OVERLAY_SCREEN_OPTIONS} />
        <Stack.Screen name="map-filters" options={{ presentation: 'modal' }} />
        <Stack.Screen name="premium" options={{ presentation: 'modal' }} />
      </Stack>
      {/* The one event card for the whole app, and the reason it is a sibling
          of <Stack> rather than of <Tabs>: three openers (events/wishlist,
          friends/[userId]) and every push-notification target
          live on routes stacked ABOVE (tabs), so a card mounted inside the
          tabs layout was dealt into a layer behind the screen that dealt it
          and never appeared at all. From here it is above every pushed route
          on Android, and `EventDealtCard`'s own `CardPortal` lifts it above
          native modal routes on iOS the same way `InAppNotification` does.

          Any opener, anywhere, calls uiStore.dealCard(id, origin);
          this always-mounted component watches uiStore.dealtCard and renders
          whatever that produced, so there's no cold-start ref-not-ready race
          to retry around. It renders nothing until a card is dealt. */}
      <EventDealtCard />
      {/* The wrap's launch card, mounted here for the same reason: it deals
          itself on app open, whatever route the app resumed on, and CardPortal
          has to lift it above anything already presented. It renders nothing
          unless `useWrapDeal` says this user has an unwrapped event inside the
          48h window that they have not already been dealt. */}
      <WrapDealtCard />
      {/* The map's "Up for it?" fan and the swipe deck it opens, as one
          component that never unmounts between the two sizes — see that
          file's own header comment and design doc
          2026-08-04-event-deck-one-component-design.md. Root-mounted for the
          same reason `EventDealtCard` is: `CardPortal` lifts it into a
          `FullWindowOverlay` on iOS, which attaches to the key window the
          moment it mounts, so it has to be mounted for as long as it might be
          on top — not just for as long as the map tab is active. Visibility
          is therefore an internal rule (`deckVisible`, gated on the route, the
          create-event flow and any open overlay) rather than this being
          conditionally rendered by whoever is on screen. */}
      <InAppNotification />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });

  // The saved theme, read before anything paints. Gated alongside the fonts and
  // for the same reason: a first frame in the wrong palette is the same kind of
  // flash as a first frame in the wrong typeface, and this app already holds the
  // splash screen for one of those.
  const themeLoaded = useThemeStore((s) => s.loaded);
  useEffect(() => {
    useThemeStore.getState().load();
  }, []);

  // Subscribing here is what makes the rest of the app follow a theme change.
  // Styles resolve through a proxy (see src/theme), so they are always current
  // *when read* — but only a re-render reads them again, and re-rendering the
  // root re-renders everything under it. Two more subscriptions sit lower down,
  // in the tabs layout and in `Screen`, so a change reaches screens that are
  // mounted but not currently the root's child.
  const theme = useThemeName();

  const ready = fontsLoaded && themeLoaded;
  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    // Keyed on the theme, which remounts the tree when it changes.
    //
    // Not a shortcut — a re-render alone does not reach the screens. React
    // Navigation wraps every screen in a `StaticContainer` that deliberately
    // blocks re-renders coming from above it, so a root that re-renders leaves
    // every mounted screen holding the styles it read under the old palette.
    // Remounting is what gets past that.
    //
    // It should keep your place: the navigation state lives in the container
    // above this layout, and a navigator that remounts rehydrates from it rather
    // than resetting. "Should" is doing real work in that sentence — it is the
    // first row of the test sheet.
    <GestureHandlerRootView style={{ flex: 1 }} key={theme}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <RootLayoutInner />
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
