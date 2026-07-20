import { useState } from 'react';
import { SPACING } from '@/constants/spacing';
import { Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { verifyCurrentPassword, updatePassword } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Button,
  Icon,
  Screen,
  ScreenHeader,
  TextField,
} from '@/components/ui';

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
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
    } catch (e) {
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  const visibilityToggle = (
    <TouchableOpacity
      onPress={() => setShowPasswords(!showPasswords)}
      hitSlop={10}
      accessibilityLabel={showPasswords ? 'Hide passwords' : 'Show passwords'}
    >
      <Icon
        name={showPasswords ? 'eyeOff' : 'eye'}
        size={20}
        color={COLORS.textMuted}
      />
    </TouchableOpacity>
  );

  return (
    <Screen modal keyboardAvoiding>
      <ScreenHeader title="Change password" />
      <Animated.View entering={FadeInDown.duration(350)} style={styles.form}>
        <Text style={styles.hint}>
          Enter your current password, then choose a new one of at least{' '}
          {MIN_PASSWORD_LENGTH} characters.
        </Text>
        <TextField
          placeholder="Current password"
          value={current}
          onChangeText={setCurrent}
          secureTextEntry={!showPasswords}
          autoCapitalize="none"
          trailing={visibilityToggle}
        />
        <TextField
          placeholder="New password"
          value={next}
          onChangeText={setNext}
          secureTextEntry={!showPasswords}
          autoCapitalize="none"
        />
        <TextField
          placeholder="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!showPasswords}
          autoCapitalize="none"
        />
        <Button
          variant="primary"
          label="Update password"
          onPress={handleSave}
          loading={saving}
          disabled={!current || !next || !confirm}
          style={{ marginTop: SPACING[1] }}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACING[3], padding: SPACING[5], paddingTop: SPACING[2.5] },
  hint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 19,
    color: COLORS.textSecondary,
    marginBottom: SPACING[1],
  },
});
