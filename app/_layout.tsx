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
          name="events/swipe"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="events/wishlist"
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
        <Stack.Screen name="profile/edit" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="profile/change-password"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="profile/change-email"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="profile/verify"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="profile/blocked" />
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

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <RootLayoutInner />
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
