import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { createProfile, updateProfile } from '@/services/auth.service';
import { uploadAvatar } from '@/services/storage.service';
import { supabase } from '@/services/supabase';
import { ACTIVITIES } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { ActivityId } from '@/types/models';

export default function ProfileSetupScreen() {
  const session = useAuthStore((s) => s.session);
  const setUser = useAuthStore((s) => s.setUser);

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [interests, setInterests] = useState<Set<ActivityId>>(new Set());
  const [loading, setLoading] = useState(false);

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled) {
      setPhotoUri(result.assets[0].uri);
      setPhotoBase64(result.assets[0].base64 ?? null);
    }
  }

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
      let photoUrl: string | undefined;
      if (photoBase64) {
        photoUrl = await uploadAvatar(session.user.id, photoBase64);
      }

      const profile = await createProfile(session.user.id, {
        name: name.trim(),
        age: ageNum,
        bio: bio.trim() || undefined,
        photo_url: photoUrl,
        interests: Array.from(interests),
      });

      setUser(profile);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Set up your profile</Text>

        <TouchableOpacity style={styles.avatarWrapper} onPress={pickPhoto}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>📷</Text>
              <Text style={styles.avatarPlaceholderLabel}>Add photo</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={styles.input}
            placeholder="Age"
            placeholderTextColor={COLORS.textMuted}
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, styles.bioInput]}
            placeholder="Short bio (optional)"
            placeholderTextColor={COLORS.textMuted}
            value={bio}
            onChangeText={setBio}
            multiline
          />
        </View>

        <Text style={styles.sectionLabel}>Your interests</Text>
        <View style={styles.grid}>
          {ACTIVITIES.map((a) => {
            const sel = interests.has(a.id);
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.pill, sel && styles.pillSelected]}
                onPress={() => toggleInterest(a.id)}
              >
                <Text style={styles.pillEmoji}>{a.emoji}</Text>
                <Text style={[styles.pillLabel, sel && styles.pillLabelSelected]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !name && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={loading || !name}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save & Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 24, paddingTop: 40, gap: 16 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  avatarWrapper: { alignSelf: 'center' },
  avatar: { width: 96, height: 96, borderRadius: 48 },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: { fontSize: 24 },
  avatarPlaceholderLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  form: { gap: 12 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  bioInput: { minHeight: 80, textAlignVertical: 'top' },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  pillSelected: { borderColor: COLORS.primary, backgroundColor: '#FFF0EF' },
  pillEmoji: { fontSize: 16 },
  pillLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  pillLabelSelected: { color: COLORS.primary },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: COLORS.disabled },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
