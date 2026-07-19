import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  FadeInDown,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { createProfile, signOut } from '@/services/auth.service';
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
import { ActivityId } from '@/types/models';
import { ActivityGlyph, Button, Icon, PressableScale } from '@/components/ui';

const STEPS = ['name', 'username', 'dob', 'photos', 'interests', 'bio'] as const;
type Step = (typeof STEPS)[number];

// Duolingo-style bar. Starts pre-filled (never 0): step 1 already shows
// 2/7 of the track, the last step lands just short of full. Glides between
// steps with a plain ease-out; no spring, no wobble.
function WizardProgressBar({ index }: { index: number }) {
  const progress = useSharedValue((index + 1) / (STEPS.length + 1));
  useEffect(() => {
    progress.value = withTiming((index + 1) / (STEPS.length + 1), {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, index]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, fillStyle]} />
    </View>
  );
}

function ageFromDob(day: string, month: string, year: string): number | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(d) || isNaN(m) || isNaN(y) || year.length < 4) return null;
  const date = new Date(y, m - 1, d);
  // Reject rollovers like 31/02.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d)
    return null;
  const now = new Date();
  if (y < 1900 || date > now) return null;
  let age = now.getFullYear() - y;
  const hadBirthday =
    now.getMonth() > m - 1 || (now.getMonth() === m - 1 && now.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age;
}

export default function ProfileSetupScreen() {
  const session = useAuthStore((s) => s.session);
  const setUser = useAuthStore((s) => s.setUser);

  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const usernameTouched = useRef(false);
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [interests, setInterests] = useState<Set<ActivityId>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const age = ageFromDob(dobDay, dobMonth, dobYear);
  const dobComplete =
    dobDay.length > 0 && dobMonth.length > 0 && dobYear.length === 4;

  // Follow the display name with a suggested handle until the user edits the
  // username field themselves (Instagram-style prefill).
  useEffect(() => {
    if (usernameTouched.current) return;
    setUsername(normalizeUsername(name.replace(/\s+/g, '_')));
  }, [name]);

  // Debounced live availability check (like Instagram's signup form).
  useEffect(() => {
    if (!username) {
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
        // Pre-migration (RPC missing) or offline: don't block signup on the
        // check, the DB unique index is the real gate.
        setUsernameStatus('available');
        setSuggestions([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [username, name]);

  function toggleInterest(id: ActivityId) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function canContinue(): boolean {
    switch (step) {
      case 'name':
        return name.trim().length > 0;
      case 'username':
        return usernameStatus === 'available';
      case 'dob':
        return age !== null && age >= 18;
      case 'photos':
        return photos.length > 0;
      case 'interests':
      case 'bio':
        return true;
    }
  }

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      handleSave();
    }
  }

  function goBack() {
    if (stepIndex === 0) {
      signOut();
    } else {
      setStepIndex(stepIndex - 1);
    }
  }

  async function handleSave() {
    if (!name.trim() || !session?.user) return;
    if (age === null || age < 18) {
      Alert.alert('Invalid date of birth', 'You must be 18 or older to use MELLO.');
      return;
    }
    const formatError = validateUsername(username);
    if (formatError) {
      Alert.alert('Invalid username', formatError);
      return;
    }
    if (photos.length === 0) {
      Alert.alert(
        'Add a photo',
        'A profile picture is required. It also becomes the cover for events you host.'
      );
      setStepIndex(STEPS.indexOf('photos'));
      return;
    }
    if (usernameStatus === 'taken') {
      Alert.alert(
        'Username taken',
        `The username @${username} isn't available. Try one of the suggestions.`
      );
      return;
    }

    try {
      setLoading(true);
      const photoUrls = await uploadProfilePhotos(session.user.id, photos);

      const base = {
        name: name.trim(),
        age,
        bio: bio.trim() || undefined,
        photo_url: photoUrls[0],
        photos: photoUrls,
        interests: Array.from(interests),
      };

      let profile;
      try {
        profile = await createProfile(session.user.id, { ...base, username });
      } catch (e: any) {
        // Before migration 029 the username column doesn't exist. Create the
        // profile without it rather than dead-ending signup.
        if (/username/i.test(e?.message ?? '')) {
          profile = await createProfile(session.user.id, base);
        } else {
          throw e;
        }
      }

      setUser(profile);
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

  const dobFieldStyle = (key: string) => [
    styles.input,
    styles.dobInput,
    focused === key && styles.inputFocused,
    dobComplete && (age === null || age < 18) && styles.inputError,
    dobComplete && age !== null && age >= 18 && styles.inputOk,
  ];

  const isLast = stepIndex === STEPS.length - 1;

  const titles: Record<Step, { title: string; subtitle: string }> = {
    name: {
      title: "What's your name?",
      subtitle: 'This is how people see you at events.',
    },
    username: {
      title: 'Pick your username',
      subtitle: 'Friends can find you by @username. You can change it later.',
    },
    dob: {
      title: 'When were you born?',
      subtitle: 'Mello is 18+. Only your age shows on your profile, never your birthday.',
    },
    photos: {
      title: 'Add your photos',
      subtitle:
        'At least one is required. Up to 6 — the first is your main photo.',
    },
    interests: {
      title: 'What are you into?',
      subtitle: 'Pick a few interests and we suggest better plans.',
    },
    bio: {
      title: 'Say hi in one line',
      subtitle: 'A short bio helps people know what to expect.',
    },
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <PressableScale style={styles.backBtn} scaleTo={0.88} onPress={goBack}>
          <Icon name="back" size={22} color={COLORS.textPrimary} />
        </PressableScale>
        <WizardProgressBar index={stepIndex} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Animated.View
          key={step}
          entering={FadeInDown.duration(260).easing(Easing.out(Easing.cubic))}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>{titles[step].title}</Text>
            <Text style={styles.subtitle}>{titles[step].subtitle}</Text>

            <View style={styles.stepBody}>
              {step === 'name' && (
                <TextInput
                  style={inputStyle('name')}
                  placeholder="Your name"
                  placeholderTextColor="rgba(15,24,44,0.40)"
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={() => canContinue() && goNext()}
                />
              )}

              {step === 'username' && (
                <View>
                  <View
                    style={[
                      styles.usernameWrap,
                      focused === 'username' && styles.inputFocused,
                      usernameStatus === 'taken' || usernameStatus === 'invalid'
                        ? styles.inputError
                        : usernameStatus === 'available'
                          ? styles.inputOk
                          : null,
                    ]}
                  >
                    <Text style={styles.atPrefix}>@</Text>
                    <TextInput
                      style={styles.usernameInput}
                      placeholder="username"
                      placeholderTextColor="rgba(15,24,44,0.40)"
                      value={username}
                      onChangeText={(t) => {
                        usernameTouched.current = true;
                        setUsername(normalizeUsername(t));
                      }}
                      onFocus={() => setFocused('username')}
                      onBlur={() => setFocused(null)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                      returnKeyType="next"
                      onSubmitEditing={() => canContinue() && goNext()}
                    />
                    {usernameStatus === 'available' && (
                      <Icon name="check" size={16} color={COLORS.success} />
                    )}
                  </View>
                  {usernameError ? (
                    <Text style={styles.fieldError}>{usernameError}</Text>
                  ) : usernameStatus === 'checking' ? (
                    <Text style={styles.fieldHint}>Checking…</Text>
                  ) : null}
                  {suggestions.length > 0 && (
                    <View style={styles.suggestionRow}>
                      {suggestions.map((s) => (
                        <PressableScale
                          key={s}
                          scaleTo={0.94}
                          style={styles.suggestionChip}
                          onPress={() => {
                            usernameTouched.current = true;
                            setUsername(s);
                          }}
                        >
                          <Text style={styles.suggestionText}>@{s}</Text>
                        </PressableScale>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {step === 'dob' && (
                <View>
                  <View style={styles.dobRow}>
                    <TextInput
                      style={dobFieldStyle('dobDay')}
                      placeholder="DD"
                      placeholderTextColor="rgba(15,24,44,0.40)"
                      value={dobDay}
                      onChangeText={(t) => {
                        const v = t.replace(/\D/g, '').slice(0, 2);
                        setDobDay(v);
                        if (v.length === 2) monthRef.current?.focus();
                      }}
                      onFocus={() => setFocused('dobDay')}
                      onBlur={() => setFocused(null)}
                      keyboardType="number-pad"
                      maxLength={2}
                      autoFocus
                    />
                    <TextInput
                      ref={monthRef}
                      style={dobFieldStyle('dobMonth')}
                      placeholder="MM"
                      placeholderTextColor="rgba(15,24,44,0.40)"
                      value={dobMonth}
                      onChangeText={(t) => {
                        const v = t.replace(/\D/g, '').slice(0, 2);
                        setDobMonth(v);
                        if (v.length === 2) yearRef.current?.focus();
                      }}
                      onFocus={() => setFocused('dobMonth')}
                      onBlur={() => setFocused(null)}
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <TextInput
                      ref={yearRef}
                      style={[...dobFieldStyle('dobYear'), styles.dobYear]}
                      placeholder="YYYY"
                      placeholderTextColor="rgba(15,24,44,0.40)"
                      value={dobYear}
                      onChangeText={(t) => setDobYear(t.replace(/\D/g, '').slice(0, 4))}
                      onFocus={() => setFocused('dobYear')}
                      onBlur={() => setFocused(null)}
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                  </View>
                  {dobComplete && age !== null && age >= 18 && (
                    <Text style={styles.fieldOk}>You're {age}. Looks good.</Text>
                  )}
                  {dobComplete && age !== null && age < 18 && (
                    <Text style={styles.fieldError}>
                      You must be 18 or older to use Mello.
                    </Text>
                  )}
                  {dobComplete && age === null && (
                    <Text style={styles.fieldError}>
                      That date doesn't look right. Check it and try again.
                    </Text>
                  )}
                </View>
              )}

              {step === 'photos' && (
                <PhotoGridPicker photos={photos} onChange={setPhotos} max={6} />
              )}

              {step === 'interests' && (
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
                          size={18}
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
              )}

              {step === 'bio' && (
                <TextInput
                  style={[...inputStyle('bio'), styles.bioInput]}
                  placeholder="Coffee, climbing, live music…"
                  placeholderTextColor="rgba(15,24,44,0.40)"
                  value={bio}
                  onChangeText={setBio}
                  onFocus={() => setFocused('bio')}
                  onBlur={() => setFocused(null)}
                  multiline
                  autoFocus
                />
              )}
            </View>
          </ScrollView>
        </Animated.View>

        <View style={styles.footer}>
          <Button
            label={
              isLast
                ? 'Create profile'
                : step === 'interests' && interests.size > 0
                  ? `Continue · ${interests.size} selected`
                  : 'Continue'
            }
            onPress={goNext}
            loading={loading}
            disabled={!canContinue()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 22,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  backBtn: {
    marginLeft: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 100,
    backgroundColor: COLORS.primary,
  },
  scroll: { padding: 22, paddingTop: 26, paddingBottom: 20 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 26,
    letterSpacing: -0.52,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginTop: 7,
  },
  stepBody: { marginTop: 26 },
  input: {
    height: 52,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    fontFamily: FONTS.semibold,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputFocused: { borderWidth: 1.5, borderColor: COLORS.primary },
  inputError: { borderWidth: 1.5, borderColor: '#E5484D' },
  inputOk: { borderWidth: 1.5, borderColor: COLORS.success },
  usernameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  atPrefix: {
    fontFamily: FONTS.semibold,
    fontSize: 16,
    color: COLORS.textSecondary,
    marginRight: 1,
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.semibold,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  fieldError: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: '#E5484D',
    marginTop: 8,
  },
  fieldHint: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  fieldOk: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.success,
    marginTop: 8,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
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
  dobRow: { flexDirection: 'row', gap: 10 },
  dobInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
  },
  dobYear: { flex: 1.6 },
  bioInput: {
    height: undefined,
    minHeight: 96,
    paddingVertical: 13,
    textAlignVertical: 'top',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: 'rgba(15,24,44,0.7)',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 12,
    backgroundColor: COLORS.background,
  },
});
