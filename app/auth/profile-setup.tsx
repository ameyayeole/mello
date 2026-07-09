import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { createProfile, signOut } from '@/services/auth.service';
import { uploadProfilePhotos } from '@/services/storage.service';
import { PhotoGridPicker } from '@/components/PhotoGridPicker';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import { Button, Icon, IconName, PressableScale } from '@/components/ui';

export default function ProfileSetupScreen() {
  const session = useAuthStore((s) => s.session);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [interests, setInterests] = useState<Set<ActivityId>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleInterest(id: ActivityId) {
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!name.trim() || !session?.user) return;
    const ageNum = parseInt(age);
    if (isNaN(ageNum) || ageNum < 18) {
      Alert.alert('Invalid age', 'You must be 18 or older to use MELLO.');
      return;
    }

    try {
      setLoading(true);
      const photoUrls = await uploadProfilePhotos(session.user.id, photos);

      const profile = await createProfile(session.user.id, {
        name: name.trim(),
        age: ageNum,
        bio: bio.trim() || undefined,
        photo_url: photoUrls[0],
        photos: photoUrls,
        interests: Array.from(interests),
      });

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

  return (
    <SafeAreaView style={styles.container}>
      <PressableScale style={styles.backBtn} scaleTo={0.88} onPress={() => signOut()}>
        <Icon name="back" size={22} color={COLORS.textPrimary} />
      </PressableScale>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={styles.title}>Set up your profile</Text>
          <Text style={styles.subtitle}>
            This is how people see you at events.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <Text style={styles.fieldLabel}>YOUR PHOTOS</Text>
          <Text style={styles.fieldHint}>
            Add up to 6 — the first is your main photo.
          </Text>
          <PhotoGridPicker photos={photos} onChange={setPhotos} max={6} />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(140).duration(400)}
          style={styles.form}
        >
          <View>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
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
            <Text style={styles.fieldLabel}>AGE</Text>
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
            <Text style={styles.fieldLabel}>BIO</Text>
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
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <Text style={styles.fieldLabel}>WHAT ARE YOU INTO?</Text>
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
                  <Icon
                    name={a.id as IconName}
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
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={
            interests.size > 0
              ? `Continue · ${interests.size} selected`
              : 'Continue'
          }
          onPress={handleSave}
          loading={loading}
          disabled={!name}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  backBtn: {
    marginTop: 8,
    marginLeft: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { padding: 22, paddingTop: 12, gap: 22, paddingBottom: 20 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 24,
    letterSpacing: -0.48,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  fieldLabel: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: 'rgba(15,24,44,0.5)',
    marginBottom: 7,
  },
  fieldHint: {
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
  bioInput: {
    height: undefined,
    minHeight: 80,
    paddingVertical: 12,
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
    backgroundColor: COLORS.background,
  },
});
