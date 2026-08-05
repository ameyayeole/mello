import { Text,
  View } from 'react-native';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { Dialog } from './Overlay';
import { themedStyles } from '@/theme';

// The app's "are you sure?" card.
//
// Built because three screens had already forked the same shape — the block
// confirm, the create-flow discard and the community delete — each with its own
// hand-rolled red PressableScale, and a fourth was about to be written for
// Delete account. The tell that they were one component: DiscardDialog's own
// comment says it copies the community confirm's "shape and tokens" so the two
// "read identically", which is a primitive being described in prose.
//
// The remaining `Alert.alert` confirms in the app are OS alerts, which cannot
// carry the glyph, the ink ramp or the type scale — the reason deleting your
// account looked less considered than blocking someone did.

export function ConfirmDialog({
  visible,
  onClose,
  title,
  body,
  icon,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  tone = 'default',
  loading = false,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  icon?: IconName;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  tone?: 'default' | 'destructive';
  loading?: boolean;
}) {
  const destructive = tone === 'destructive';

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      // A destructive confirm must be dismissed by a button. Backdrop-tap
      // dismissal is fine for "did you mean to?", but it makes the safe way out
      // the one that is easiest to hit by accident, which is backwards when the
      // other button erases an account.
      dismissOnBackdropPress={!destructive}
      style={styles.card}
    >
      {icon ? (
        <View style={[styles.bubble, destructive && styles.bubbleDanger]}>
          <Icon
            name={icon}
            size={22}
            color={destructive ? COLORS.error : COLORS.primary}
            variant="linear"
          />
        </View>
      ) : null}

      <Text style={[styles.title, icon != null && styles.titleWithIcon]}>
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}

      <View style={styles.row}>
        <Button
          label={cancelLabel}
          variant="tertiary"
          size="md"
          onPress={onClose}
          disabled={loading}
          style={styles.btn}
        />
        <Button
          label={confirmLabel}
          // Weight and valence are separate axes: the confirm is always the
          // heavier button, and `tone` only decides whether it is red.
          variant={destructive ? 'secondary' : 'primary'}
          tone={destructive ? 'destructive' : 'default'}
          size="md"
          onPress={onConfirm}
          loading={loading}
          style={styles.btn}
        />
      </View>
    </Dialog>
  );
}

const styles = themedStyles(() => ({
  // Stretches to the Dialog's gutter rather than shrink-wrapping the text,
  // so the two buttons below get a full-width row to split.
  card: { alignSelf: 'stretch' },
  bubble: {
    width: 48,
    height: 48,
    borderRadius: RADIUS['3xl'],
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleDanger: { backgroundColor: COLORS.errorTint },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: TYPE_SIZE.section,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  titleWithIcon: { marginTop: SPACING[3] },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    lineHeight: 17,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  row: {
    flexDirection: 'row',
    gap: SPACING[2],
    alignSelf: 'stretch',
    marginTop: SPACING[4],
  },
  btn: { flex: 1, paddingHorizontal: 0 },
}));
