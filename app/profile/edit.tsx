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
  AppBackground,
  ConfirmDialog,
  Glass,
  Loader,
  PressableScale,
  Screen,
  ScreenHeader,
  SectionLabel,
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

// One selectable chip, replacing the two near-identical `styles.pill` copies
// this screen used for gender and interests.
//
// Local, not a ui/ primitive, and deliberately so: the only two callers are
// both on this screen. The create flow's SectionPills looks similar but is a
// different component — a horizontal single-select row with a travelling
// indicator, not a wrapping grid — so there is no third caller to generalise
// for. Promote it if one appears; a premature primitive is as bad as a fork.
//
// It stays a pill. AGENTS.md's "no pill buttons" rule is about `Button`;
// selection chips are pills everywhere in this app (SectionPills, CategoryPill)
// and squaring these off would fight the design language.
function SelectChip({
  label,
  selected,
  onPress,
  disabled = false,
  accent,
  tint,
  leading,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  // Category chips colour themselves; gender chips fall back to coral.
  accent?: string;
  tint?: string;
  leading?: React.ReactNode;
}) {
  const on = accent ?? COLORS.primary;
  return (
    <PressableScale
      scaleTo={disabled ? 1 : 0.94}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={[
        styles.chip,
        selected && {
          backgroundColor: tint ?? COLORS.primaryTint,
          borderColor: on,
          borderWidth: 1.5,
        },
        disabled && !selected && styles.chipLocked,
      ]}
    >
      {leading}
      <Text style={[styles.chipLabel, selected && { color: on }]}>{label}</Text>
    </PressableScale>
  );
}

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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

  // The close button used to discard a half-edited profile silently. Compared
  // against the profile as loaded, so re-typing a value back to what it was
  // counts as clean rather than trapping the user behind a dialog they can't
  // clear. Sets are compared by size + membership; order is not meaningful.
  const original = user!;
  const dirty =
    name !== (original.name ?? '') ||
    username !== (original.username ?? '') ||
    age !== (original.age ? String(original.age) : '') ||
    gender !== (original.gender ?? null) ||
    bio !== (original.bio ?? '') ||
    photos.join('|') !==
      (original.photos?.length
        ? original.photos
        : original.photo_url
          ? [original.photo_url]
          : []
      ).join('|') ||
    interests.size !== (original.interests?.length ?? 0) ||
    (original.interests ?? []).some((i) => !interests.has(i));

  function handleClose() {
    if (dirty) setConfirmDiscard(true);
    else router.back();
  }

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
    // This screen is launched from Settings, which is frosted glass over the
    // drifting background — and it used to land on flat white, which is most of
    // why it read as the old screen. It is a modal route outside the tabs, so
    // it does not inherit the AppBackground mounted behind the tab navigator
    // and has to bring its own, the same way Settings does.
    //
    // Behind <Screen> rather than inside it: Screen's SafeAreaView pads the top
    // edge on Android, and an absoluteFill child would stop at that padding and
    // leave a bare strip under the status bar.
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <AppBackground />
      </View>

      {/* keyboardAvoiding: BIO is a multiline field at the bottom of the
          scroll, and without this the keyboard covered it. Every other
          text-entry screen in this cluster already passed it. */}
      <Screen modal keyboardAvoiding background="transparent">
      <ScreenHeader
        title="Edit profile"
        backIcon="close"
        onBack={handleClose}
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
        {/* Which groups get a panel and which don't is one rule, not taste: a
            TextField already draws its own surface, so putting it on glass is a
            box inside a box. The loose collections — the photo grid and the two
            chip grids — are the ones that need a container to read as a group. */}
        <View>
          <SectionLabel>Photos</SectionLabel>
          <Text style={styles.hint}>
            Add up to 6 — the first is your main photo.
          </Text>
          <Glass tier="panel" radius={RADIUS['2xl']} style={styles.panel}>
            <PhotoGridPicker photos={photos} onChange={setPhotos} max={6} />
          </Glass>
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
              <SectionLabel>Gender</SectionLabel>
              {identityLocked && (
                <Text style={styles.lockedTag}>VERIFIED · LOCKED</Text>
              )}
            </View>
            <Glass tier="panel" radius={RADIUS['2xl']} style={styles.panel}>
              <View style={styles.grid}>
                {GENDERS.map((g) => (
                  <SelectChip
                    key={g.id}
                    label={g.label}
                    selected={gender === g.id}
                    disabled={identityLocked}
                    onPress={() =>
                      setGender(gender === g.id ? null : g.id)
                    }
                  />
                ))}
              </View>
            </Glass>
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
          <SectionLabel>Interests</SectionLabel>
          <Glass tier="panel" radius={RADIUS['2xl']} style={styles.panel}>
            <View style={styles.grid}>
              {ACTIVITIES.map((a) => {
                const sel = interests.has(a.id);
                const cat = categoryStyle(a.id);
                return (
                  <SelectChip
                    key={a.id}
                    label={a.label}
                    selected={sel}
                    onPress={() => toggleInterest(a.id)}
                    accent={cat.accent}
                    tint={cat.tint}
                    leading={
                      <ActivityGlyph
                        activity={a.id}
                        size={17}
                        color={sel ? cat.accent : COLORS.textSecondary}
                      />
                    }
                  />
                );
              })}
            </View>
          </Glass>
        </View>
      </ScrollView>
      </Screen>

      <ConfirmDialog
        visible={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        tone="destructive"
        icon="warning"
        title="Discard changes?"
        body="Your edits to this profile won't be saved."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmDiscard(false);
          router.back();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  save: { fontFamily: FONTS.bold, fontSize: TYPE_SIZE.body, color: COLORS.primary },
  saveDisabled: { color: COLORS.textMuted },
  scroll: { padding: SPACING[5], gap: SPACING[5], paddingBottom: SPACING[8] },
  // The container for a loose collection. Same tier and radius as Settings'
  // SettingsCard, so the two screens read as one surface family.
  panel: { padding: SPACING[4], marginTop: SPACING[2], overflow: 'hidden' },
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
  // Was two near-identical `pill` blocks, one for gender and one for interests.
  // The unselected fill is the ink ramp's faintest rung rather than solid white:
  // these now sit on a glass panel, and an opaque chip on frosted glass reads as
  // a sticker on top of it instead of part of it.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    height: 42,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.inkFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipLocked: { opacity: 0.5 },
  chipLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
});
