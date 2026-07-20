import { useState, useEffect } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
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
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { ActivityId, Gender } from '@/types/models';
import {
  ActivityGlyph,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
  TextField,
} from '@/components/ui';
import { showError } from '@/utils/errors';

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

  // Name, age and gender come off the verified government ID and are locked to
  // it once KYC is approved (migration 036 enforces this server-side too).
  const identityLocked = user.kyc_status === 'approved';

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
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen modal>
      <ScreenHeader
        title="Edit profile"
        backIcon="close"
        onBack={() => router.back()}
        right={
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
              <Loader inline />
            ) : (
              <Text style={[styles.save, !name.trim() && styles.saveDisabled]}>
                Save
              </Text>
            )}
          </TouchableOpacity>
        }
      />

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
          <TextField
            label="DISPLAY NAME"
            trailingLabel={identityLocked ? 'VERIFIED · LOCKED' : undefined}
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            locked={identityLocked}
          />

          <View>
            <TextField
              label="USERNAME"
              leading={<Text style={styles.atPrefix}>@</Text>}
              placeholder="username"
              value={username}
              onChangeText={(t) => setUsername(normalizeUsername(t))}
              autoCapitalize="none"
              autoCorrect={false}
              error={usernameError}
            />
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

          <TextField
            label="AGE"
            trailingLabel={identityLocked ? 'VERIFIED · LOCKED' : undefined}
            placeholder="18+"
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
            locked={identityLocked}
          />

          <View>
            <View style={styles.labelRow}>
              <Text style={styles.label}>GENDER</Text>
              {identityLocked && <Text style={styles.lockedTag}>VERIFIED · LOCKED</Text>}
            </View>
            <View style={styles.grid}>
              {GENDERS.map((g) => {
                const sel = gender === g.id;
                return (
                  <PressableScale
                    key={g.id}
                    scaleTo={identityLocked ? 1 : 0.94}
                    style={[
                      styles.pill,
                      sel && styles.pillSelected,
                      identityLocked && !sel && styles.pillLocked,
                    ]}
                    onPress={() => {
                      if (identityLocked) return;
                      setGender(sel ? null : g.id);
                    }}
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

          {identityLocked && (
            <Text style={styles.lockedNote}>
              Your name, age and gender are locked to your verified ID.
            </Text>
          )}

          <TextField
            label="BIO"
            placeholder="Coffee, climbing, live music…"
            value={bio}
            onChangeText={setBio}
            multiline
          />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  save: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.body, color: COLORS.primary },
  saveDisabled: { color: COLORS.textMuted },
  scroll: { padding: SPACING[5], gap: SPACING[5], paddingBottom: SPACING[8] },
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginBottom: SPACING[1.5],
  },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: -3,
    marginBottom: SPACING[2.5],
  },
  form: { gap: SPACING[3.5] },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedTag: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.3,
    color: COLORS.verified,
    marginBottom: SPACING[1.5],
  },
  lockedNote: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 18,
    color: COLORS.textMuted,
    marginTop: -4,
  },
  atPrefix: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textSecondary,
    marginRight: SPACING[0.5],
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
    marginTop: SPACING[2],
  },
  suggestionChip: {
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
  },
  suggestionText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[2.5] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    height: 42,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillSelected: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    backgroundColor: COLORS.primaryTint,
  },
  pillLocked: { opacity: 0.5 },
  pillLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: 'rgba(15,24,44,0.7)',
  },
  pillLabelSel: { color: COLORS.primary },
});
