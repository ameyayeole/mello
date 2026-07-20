import { useEffect, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Location from 'expo-location';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Icon } from '@/components/ui';
import { errorProp } from '@/utils/errors';

export interface PlaceResult {
  lat: number;
  lng: number;
  name: string;
  // Photon bounding box for the place, as [west, north, east, south].
  // Present for areas (cities, parks…) but not point features (a house).
  extent?: [number, number, number, number];
}

interface Suggestion extends PlaceResult {
  id: string;
}

const DEBOUNCE_MS = 280;

// Turn a place into a map region whose zoom fits how big the place is: a city
// fills the viewport from its bounding box, while a precise address (no box)
// falls back to a tight street-level zoom.
const FALLBACK_DELTA = 0.008;
const MIN_DELTA = 0.004;
const MAX_DELTA = 1.5;

// `maxDelta` caps how far out we're willing to zoom. On the full-screen map we
// pass a small cap so searching a big place (e.g. a city) still zooms in near
// the coordinate instead of framing the whole boundary far away.
export function regionForPlace(r: PlaceResult, maxDelta = MAX_DELTA) {
  let latDelta = FALLBACK_DELTA;
  let lngDelta = FALLBACK_DELTA;
  if (r.extent) {
    const [west, north, east, south] = r.extent;
    // Pad by 30% so the place isn't flush against the screen edges.
    latDelta = Math.abs(north - south) * 1.3;
    lngDelta = Math.abs(east - west) * 1.3;
  }
  return {
    latitude: r.lat,
    longitude: r.lng,
    latitudeDelta: Math.min(Math.max(latDelta, MIN_DELTA), maxDelta),
    longitudeDelta: Math.min(Math.max(lngDelta, MIN_DELTA), maxDelta),
  };
}

// Photon (https://photon.komoot.io) is a keyless geocoding autocomplete built on
// OpenStreetMap. Each feature already carries coordinates, so a tap resolves to a
// location without a second "place details" round-trip.
function buildLabel(props: any): string {
  const parts = [props?.name, props?.street, props?.city, props?.state, props?.country];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out.slice(0, 3).join(', ');
}

export default function PlaceSearch({
  onResult,
  placeholder = 'Search for a place',
  style,
  bias,
}: {
  onResult: (r: PlaceResult) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  bias?: { lat: number; lng: number } | null;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      abortRef.current?.abort();
    };
  }, []);

  function onChange(text: string) {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    const q = text.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    timer.current = setTimeout(() => fetchSuggestions(q), DEBOUNCE_MS);
  }

  async function fetchSuggestions(q: string) {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setLoading(true);
      let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`;
      if (bias) url += `&lat=${bias.lat}&lon=${bias.lng}`;
      const res = await fetch(url, { signal: ctrl.signal });
      const json = await res.json();
      const items: Suggestion[] = (json.features ?? [])
        .map((f: any, i: number) => ({
          id: `${f.properties?.osm_id ?? i}-${i}`,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          name: buildLabel(f.properties) || q,
          extent: Array.isArray(f.properties?.extent)
            ? (f.properties.extent as [number, number, number, number])
            : undefined,
        }))
        .filter((s: Suggestion) => s.name);
      setSuggestions(items);
      setOpen(items.length > 0);
    } catch (e) {
      if (errorProp(e, 'name') !== 'AbortError') {
        setSuggestions([]);
        setOpen(false);
      }
    } finally {
      setLoading(false);
    }
  }

  function pick(s: Suggestion) {
    setQuery(s.name);
    setSuggestions([]);
    setOpen(false);
    Keyboard.dismiss();
    onResult({ lat: s.lat, lng: s.lng, name: s.name, extent: s.extent });
  }

  // Return key: take the top suggestion, or fall back to the device geocoder.
  async function submit() {
    if (suggestions.length) {
      pick(suggestions[0]);
      return;
    }
    const q = query.trim();
    if (!q) return;
    Keyboard.dismiss();
    try {
      setLoading(true);
      const r = await Location.geocodeAsync(q);
      if (r.length) onResult({ lat: r[0].latitude, lng: r[0].longitude, name: q });
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.bar}>
        <Icon name="search" size={17} color="rgba(15,24,44,0.5)" />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          returnKeyType="search"
          onSubmitEditing={submit}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={styles.trailing} />
        ) : query.length > 0 ? (
          <TouchableOpacity style={styles.trailing} onPress={clear} hitSlop={8}>
            <Text style={styles.clear}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {open && (
        <View style={styles.dropdown}>
          {suggestions.map((s) => (
            <TouchableOpacity key={s.id} style={styles.item} onPress={() => pick(s)}>
              <Icon name="location" size={15} color={COLORS.primary} />
              <Text style={styles.itemText} numberOfLines={1}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', zIndex: 30 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 100,
    paddingHorizontal: 15,
    height: 44,
    gap: 10,
    shadowColor: '#0F182C',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  input: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  trailing: { paddingHorizontal: 4 },
  clear: { color: COLORS.textMuted, fontWeight: '700', fontSize: 15 },
  dropdown: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    zIndex: 40,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  itemIcon: { fontSize: 14 },
  itemText: { flex: 1, fontSize: 14.5, color: COLORS.textPrimary },
});
