import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { useLocationStore } from '@/stores/locationStore';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/services/auth.service';
import { nextProfileCity } from '@/utils/profileCity';

export function useLocation() {
  const { setLocation } = useLocationStore();
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  async function requestAndStart() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return false;

      // getCurrentPositionAsync can throw if no GPS fix is available yet
      // (common on simulators/emulators); fall back to last known position.
      let pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => Location.getLastKnownPositionAsync());

      if (!pos) return true; // permission granted but no fix yet — don't crash

      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(coords);

      try {
        const [place] = await Location.reverseGeocodeAsync(pos.coords);
        const city =
          place?.city ?? place?.district ?? place?.region ?? 'Nearby';
        setLocation(coords, city);

        // Persist the resolved city to the profile too, so posts composed
        // afterwards carry it (usePostMutations reads user?.city) and the
        // feed's same-city rung has something to match on. Best-effort and
        // entirely separate from the display update above: this whole
        // function already refuses to let location failures crash onboarding,
        // and a profile write failing must not change that.
        try {
          const authUser = useAuthStore.getState().user;
          const resolvedCity = place?.city ?? place?.district ?? place?.region;
          const cityToWrite = nextProfileCity(resolvedCity, authUser?.city);
          if (authUser && cityToWrite) {
            const updated = await updateProfile(authUser.id, {
              city: cityToWrite,
            });
            useAuthStore.getState().setUser(updated);
          }
        } catch {
          // profile write is best-effort; ignore failures
        }
      } catch {
        // geocoding is best-effort; ignore failures
      }

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 50,
        },
        (update) => {
          setLocation({
            lat: update.coords.latitude,
            lng: update.coords.longitude,
          });
        }
      );

      return true;
    } catch {
      // Never let a location failure crash the onboarding flow.
      return false;
    }
  }

  useEffect(() => {
    return () => {
      subscriptionRef.current?.remove();
    };
  }, []);

  return { requestAndStart };
}
