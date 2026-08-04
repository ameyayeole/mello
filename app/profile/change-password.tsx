import { useState } from 'react';
import { SPACING } from '@/constants/spacing';
import { Text, StyleSheet, Alert } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { verifyCurrentPassword, updatePassword } from '@/services/auth.service';
import { friendlyAuthError } from '@/utils/authErrors';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import {
  Button,
  Icon,
  PressableScale,
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
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Mirrors the confirmation state change-email already shows, so the two
  // password/email screens end the same way instead of one backing out
  // silently and the other explaining itself.
  const [done, setDone] = useState(false);

  // Validation belongs on the field that failed, not in an OS alert. An alert
  // covers the form, names the problem in a title bar, and then leaves the user
  // to work out which of the three boxes it meant — and every one of these
  // errors is about one specific box.
  async function handleSave() {
    setCurrentError(null);
    setNextError(null);
    setConfirmError(null);

    if (next.length < MIN_PASSWORD_LENGTH) {
      setNextError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setConfirmError('These don’t match.');
      return;
    }
    try {
      setSaving(true);
      if (!(await verifyCurrentPassword(current))) {
        setCurrentError('That’s not your current password.');
        return;
      }
      await updatePassword(next);
      setDone(true);
    } catch (e) {
      // Unexpected service failures keep the alert — that is what showError
      // does everywhere else, and unlike the three above it has no field to
      // attach itself to.
      Alert.alert('Error', friendlyAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  const visibilityToggle = (
    <PressableScale
      scaleTo={0.9}
      onPress={() => setShowPasswords(!showPasswords)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={showPasswords ? 'Hide passwords' : 'Show passwords'}
    >
      <Icon
        name={showPasswords ? 'eyeOff' : 'eye'}
        size={20}
        color={COLORS.textMuted}
        variant="linear"
      />
    </PressableScale>
  );

  return (
    <Screen modal keyboardAvoiding>
      <ScreenHeader title="Change password" />
      <Animated.View entering={FadeInDown.duration(350)} style={styles.form}>
        {done ? (
          <>
            <Text style={styles.hint}>
              Your password has been updated. You&apos;ll use the new one next
              time you sign in.
            </Text>
            <Button
              variant="tertiary"
              label="Done"
              onPress={() => router.back()}
            />
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Enter your current password, then choose a new one of at least{' '}
              {MIN_PASSWORD_LENGTH} characters.
            </Text>
            <TextField
              placeholder="Current password"
              value={current}
              onChangeText={(t) => {
                setCurrent(t);
                setCurrentError(null);
              }}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              trailing={visibilityToggle}
              error={currentError}
            />
            <TextField
              placeholder="New password"
              value={next}
              onChangeText={(t) => {
                setNext(t);
                setNextError(null);
              }}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              error={nextError}
            />
            <TextField
              placeholder="Confirm new password"
              value={confirm}
              onChangeText={(t) => {
                setConfirm(t);
                setConfirmError(null);
              }}
              secureTextEntry={!showPasswords}
              autoCapitalize="none"
              error={confirmError}
            />
            <Button
              variant="primary"
              label="Update password"
              onPress={handleSave}
              loading={saving}
              disabled={!current || !next || !confirm}
              style={{ marginTop: SPACING[1] }}
            />
          </>
        )}
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
