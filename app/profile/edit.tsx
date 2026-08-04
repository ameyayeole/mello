import { useState, useEffect } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
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

// 18 is the product floor (and the copy users see). The ceiling only exists to
// catch a typo'd year of birth — it is not a real limit on anyone.
const MIN_AGE = 18;
const MAX_AGE = 120;

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
  const [nameError, setNameError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);

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

  // One test, driving both the `disabled` prop and the greyed style. They used
  // to be written separately — `disabled` checked five conditions and the style
  // checked only `!name.trim()` — so with a name typed but no photos added the
  // Save button rendered in full coral and did nothing when tapped.
  const canSave =
    !loading &&
    !!name.trim() &&
    photos.length > 0 &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'invalid' &&
    usernameStatus !== 'checking';

  function toggleInterest(id: ActivityId) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Validation lands on the field that failed. The username field already had
  // an inline error slot, and two of these four alerts were *about the username
  // field* — so the screen was answering the same question in two different
  // places depending on which check tripped.
  async function handleSave() {
    setNameError(null);
    setAgeError(null);

    if (!name.trim()) {
      setNameError('Please enter your name.');
      return;
    }
    const ageNum = age ? parseInt(age, 10) : null;
    if (age && (isNaN(ageNum!) || ageNum! < MIN_AGE)) {
      setAgeError(`You must be ${MIN_AGE} or older to use Mello.`);
      return;
    }
    if (ageNum != null && ageNum > MAX_AGE) {
      setAgeError('Please enter a real age.');
      return;
    }
    const usernameChanged = username !== (user!.username ?? '');
    if (usernameChanged) {
      const formatError = validateUsername(username);
      if (formatError) {
        setUsernameError(formatError);
        return;
      }
      if (usernameStatus === 'taken') {
        setUsernameError(`The username @${username} isn't available.`);
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
    // keyboardAvoiding: BIO is a multiline field at the bottom of the scroll,
    // and without this the keyboard covered it. Every other text-entry screen
    // in this cluster already passed it; this one was the exception.
    <Screen modal keyboardAvoiding>
      <ScreenHeader
        title="Edit profile"
        backIcon="close"
        onBack={() => router.back()}
        right={
          <PressableScale
            scaleTo={canSave ? 0.92 : 1}
            onPress={handleSave}
            disabled={!canSave}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save profile"
          >
            {loading ? (
              <Loader inline />
            ) : (
              <Text style={[styles.save, !canSave && styles.saveDisabled]}>
                Save
              </Text>
            )}
          </PressableScale>
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
            onChangeText={(t) => {
              setName(t);
              setNameError(null);
            }}
            locked={identityLocked}
            error={nameError}
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
            onChangeText={(t) => {
              setAge(t);
              setAgeError(null);
            }}
            keyboardType="numeric"
            locked={identityLocked}
            error={ageError}
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
                    color={sel ? cat.accent : COLORS.textSecondary}
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
    color: COLORS.inkLabel,
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
    color: COLORS.textSecondary,
  },
  pillLabelSel: { color: COLORS.primary },
});
