import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient();

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

    if (!session) {
      // Logged out: allow the onboarding flow AND the auth (login/signup) screens.
      if (!inOnboarding && !inAuth) router.replace('/onboarding/welcome');
    } else if (!user) {
      // Logged in but no profile yet: force profile setup.
      if (seg[1] !== 'profile-setup') router.replace('/auth/profile-setup');
    } else {
      // Fully authed. Only bounce to the tabs if they're stranded on an
      // onboarding/auth screen — NOT when opening modal routes like
      // events/create, notifications, or profile (those sit on top of tabs).
      if (inOnboarding || inAuth) router.replace('/(tabs)');
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
          name="events/create"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="profile/index"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="profile/settings"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="notifications"
          options={{ presentation: 'modal' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
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
