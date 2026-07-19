import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { updateProfile } from '@/services/auth.service';
import {
  normalizeUsername,
  validateUsername,
  checkUsernameAvailable,
  suggestUsernames,
} from '@/services/username';
import { uploadProfilePhotos } from '@/services/storage.service';
import { PhotoGridPicker } from '@/components/PhotoGridPicker';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId, Gender } from '@/types/models';
import { ActivityGlyph, IconButton, PressableScale } from '@/components/ui';

const GENDERS: { id: Gender; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'non-binary', label: 'Non-binary' },
  { id: 'other', label: 'Other' },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [bio, setBio] = useState(user?.bio ?? '');
  const [photos, setPhotos] = useState<string[]>(
    user?.photos?.length ? user.photos : user?.photo_url ? [user.photo_url] : []
  );
  const [interests, setInterests] = useState<Set<ActivityId>>(
    new Set(user?.interests ?? [])
  );
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced availability check; the user's current handle is always "free".
  useEffect(() => {
    if (!username || username === user?.username) {
      setUsernameStatus('idle');
      setUsernameError(null);
      setSuggestions([]);
      return;
    }
    const formatError = validateUsername(username);
    if (formatError) {
      setUsernameStatus('invalid');
      setUsernameError(formatError);
      setSuggestions([]);
      return;
    }
    setUsernameStatus('checking');
    setUsernameError(null);
    const timer = setTimeout(async () => {
      try {
        const available = await checkUsernameAvailable(username);
        if (available) {
          setUsernameStatus('available');
          setSuggestions([]);
        } else {
          setUsernameStatus('taken');
          setUsernameError(`The username @${username} isn't available.`);
          setSuggestions(await suggestUsernames(name || username, username));
        }
      } catch {
        setUsernameStatus('available');
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [username, name, user?.username]);

  if (!user) return null;

  function toggleInterest(id: ActivityId) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    const ageNum = age ? parseInt(age) : null;
    if (age && (isNaN(ageNum!) || ageNum! < 18)) {
      Alert.alert('Invalid age', 'You must be 18 or older to use MELLO.');
      return;
    }
    const usernameChanged = username !== (user!.username ?? '');
    if (usernameChanged) {
      const formatError = validateUsername(username);
      if (formatError) {
        Alert.alert('Invalid username', formatError);
        return;
      }
      if (usernameStatus === 'taken') {
        Alert.alert('Username taken', `The username @${username} isn't available.`);
        return;
      }
    }

    try {
      setLoading(true);
      const photoUrls = await uploadProfilePhotos(user!.id, photos);
      const updated = await updateProfile(user!.id, {
        ...(usernameChanged ? { username } : {}),
        name: name.trim(),
        age: ageNum,
        gender,
        bio: bio.trim() || null,
        photo_url: photoUrls[0] ?? null,
        photos: photoUrls,
        interests: Array.from(interests),
      });
      setUser(updated);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (key: string) => [
    styles.input,
    focused === key && styles.inputFocused,
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="close"
          variant="ghost"
          onPress={() => router.back()}
          accessibilityLabel="Cancel"
        />
        <Text style={styles.headerTitle}>Edit profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={
            loading ||
            !name.trim() ||
            photos.length === 0 ||
            usernameStatus === 'taken' ||
            usernameStatus === 'invalid' ||
            usernameStatus === 'checking'
          }
          hitSlop={8}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Text style={[styles.save, !name.trim() && styles.saveDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.label}>PHOTOS</Text>
          <Text style={styles.hint}>
            Add up to 6 — the first is your main photo.
          </Text>
          <PhotoGridPicker photos={photos} onChange={setPhotos} max={6} />
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>DISPLAY NAME</Text>
            <TextInput
              style={inputStyle('name')}
              placeholder="Your name"
              placeholderTextColor="rgba(15,24,44,0.40)"
              value={name}
              onChangeText={setName}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
            />
          </View>

          <View>
            <Text style={styles.label}>USERNAME</Text>
            <View
              style={[
                styles.usernameWrap,
                focused === 'username' && styles.inputFocused,
                (usernameStatus === 'taken' || usernameStatus === 'invalid') &&
                  styles.inputError,
              ]}
            >
              <Text style={styles.atPrefix}>@</Text>
              <TextInput
                style={styles.usernameInput}
                placeholder="username"
                placeholderTextColor="rgba(15,24,44,0.40)"
                value={username}
                onChangeText={(t) => setUsername(normalizeUsername(t))}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused(null)}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {usernameError ? (
              <Text style={styles.usernameError}>{usernameError}</Text>
            ) : null}
            {suggestions.length > 0 && (
              <View style={styles.suggestionRow}>
                {suggestions.map((s) => (
                  <PressableScale
                    key={s}
                    scaleTo={0.94}
                    style={styles.suggestionChip}
                    onPress={() => setUsername(s)}
                  >
                    <Text style={styles.suggestionText}>@{s}</Text>
                  </PressableScale>
                ))}
              </View>
            )}
          </View>

          <View>
            <Text style={styles.label}>AGE</Text>
            <TextInput
              style={inputStyle('age')}
              placeholder="18+"
              placeholderTextColor="rgba(15,24,44,0.40)"
              value={age}
              onChangeText={setAge}
              onFocus={() => setFocused('age')}
              onBlur={() => setFocused(null)}
              keyboardType="numeric"
            />
          </View>

          <View>
            <Text style={styles.label}>GENDER</Text>
            <View style={styles.grid}>
              {GENDERS.map((g) => {
                const sel = gender === g.id;
                return (
                  <PressableScale
                    key={g.id}
                    scaleTo={0.94}
                    style={[styles.pill, sel && styles.pillSelected]}
                    onPress={() => setGender(sel ? null : g.id)}
                  >
                    <Text
                      style={[styles.pillLabel, sel && styles.pillLabelSel]}
                    >
                      {g.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={styles.label}>BIO</Text>
            <TextInput
              style={[...inputStyle('bio'), styles.bioInput]}
              placeholder="Coffee, climbing, live music…"
              placeholderTextColor="rgba(15,24,44,0.40)"
              value={bio}
              onChangeText={setBio}
              onFocus={() => setFocused('bio')}
              onBlur={() => setFocused(null)}
              multiline
            />
          </View>
        </View>

        <View>
          <Text style={styles.label}>INTERESTS</Text>
          <View style={styles.grid}>
            {ACTIVITIES.map((a) => {
              const sel = interests.has(a.id);
              const cat = categoryStyle(a.id);
              return (
                <PressableScale
                  key={a.id}
                  scaleTo={0.94}
                  style={[
                    styles.pill,
                    sel && {
                      backgroundColor: cat.tint,
                      borderColor: cat.accent,
                      borderWidth: 1.5,
                    },
                  ]}
                  onPress={() => toggleInterest(a.id)}
                >
                  <ActivityGlyph
                    activity={a.id}
                    size={17}
                    color={sel ? cat.accent : 'rgba(15,24,44,0.55)'}
                  />
                  <Text
                    style={[styles.pillLabel, sel && { color: cat.accent }]}
                  >
                    {a.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONTS.heavy,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  save: { fontFamily: FONTS.bold, fontSize: 15, color: COLORS.primary },
  saveDisabled: { color: COLORS.textMuted },
  scroll: { padding: 22, gap: 20, paddingBottom: 32 },
  label: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginBottom: 7,
  },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: -3,
    marginBottom: 10,
  },
  form: { gap: 14 },
  input: {
    height: 48,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputFocused: { borderWidth: 1.5, borderColor: COLORS.primary },
  inputError: { borderWidth: 1.5, borderColor: '#E5484D' },
  usernameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  atPrefix: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textSecondary,
    marginRight: 1,
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  usernameError: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: '#E5484D',
    marginTop: 6,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: COLORS.primaryTint,
  },
  suggestionText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
  },
  bioInput: {
    height: undefined,
    minHeight: 80,
    paddingVertical: 12,
    textAlignVertical: 'top',
    fontFamily: FONTS.medium,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillSelected: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    backgroundColor: COLORS.primaryTint,
  },
  pillLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: 'rgba(15,24,44,0.7)',
  },
  pillLabelSel: { color: COLORS.primary },
});
