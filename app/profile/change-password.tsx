import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { verifyCurrentPassword, updatePassword } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { Button, Icon, ScreenHeader } from '@/components/ui';

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (next.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        'Password too short',
        `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }
    if (next !== confirm) {
      Alert.alert('Passwords don’t match', 'Please re-enter them.');
      return;
    }
    try {
      setSaving(true);
      if (!(await verifyCurrentPassword(current))) {
        Alert.alert('Wrong password', 'Your current password is incorrect.');
        return;
      }
      await updatePassword(next);
      Alert.alert('Password updated', 'Your new password is active.');
      router.back();
    } catch (e: any) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  function field(
    placeholder: string,
    value: string,
    onChange: (v: string) => void,
    key: string,
    withToggle = false
  ) {
    return (
      <View style={[styles.passwordRow, focused === key && styles.inputFocused]}>
        <TextInput
          style={styles.passwordInput}
          placeholder={placeholder}
          placeholderTextColor="rgba(15,24,44,0.40)"
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(key)}
          onBlur={() => setFocused(null)}
          secureTextEntry={!showPasswords}
          autoCapitalize="none"
        />
        {withToggle && (
          <TouchableOpacity
            onPress={() => setShowPasswords(!showPasswords)}
            hitSlop={10}
            accessibilityLabel={
              showPasswords ? 'Hide passwords' : 'Show passwords'
            }
          >
            <Icon
              name={showPasswords ? 'eyeOff' : 'eye'}
              size={20}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Change password" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <Animated.View entering={FadeInDown.duration(350)} style={styles.form}>
          <Text style={styles.hint}>
            Enter your current password, then choose a new one of at least{' '}
            {MIN_PASSWORD_LENGTH} characters.
          </Text>
          {field('Current password', current, setCurrent, 'current', true)}
          {field('New password', next, setNext, 'next')}
          {field('Confirm new password', confirm, setConfirm, 'confirm')}
          <Button
            label="Update password"
            onPress={handleSave}
            loading={saving}
            disabled={!current || !next || !confirm}
            style={{ marginTop: 4 }}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, padding: 20, paddingTop: 10 },
  form: { gap: 13 },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  passwordRow: {
    height: 48,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  inputFocused: { borderWidth: 1.5, borderColor: COLORS.primary },
});
