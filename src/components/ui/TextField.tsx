import { forwardRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  StyleProp,
  ViewStyle,
  type TextInputProps,
} from 'react-native';
import { COLORS } from '@/constants/colors';
import { RADIUS } from '@/constants/spacing';
import { FONTS, TYPE_SIZE } from '@/constants/typography';

// Labelled text input with the app's focus ring, error state, optional trailing
// accessory and character counter. Replaces the
// input/inputFocused/inputError/label style quartet that was copy-pasted across
// every form screen.
//
// The border lives on the wrapper rather than the TextInput so that a trailing
// accessory (password eye toggle, clear button) sits *inside* the field and
// shares its focus ring.
//
// All TextInput props pass through, so callers keep full control of
// keyboardType, autoCapitalize, secureTextEntry and friends.
export const TextField = forwardRef<TextInput, TextFieldProps>(
  function TextField(
    {
      label,
      error,
      success = false,
      hint,
      trailingLabel,
      leading,
      trailing,
      locked = false,
      multiline = false,
      showCount = false,
      containerStyle,
      onFocus,
      onBlur,
      style,
      ...rest
    },
    ref
  ) {
    const [focused, setFocused] = useState(false);
    const max = rest.maxLength;

    return (
      <View style={containerStyle}>
        {(label || trailingLabel) && (
          <View style={styles.labelRow}>
            {label ? <Text style={styles.label}>{label}</Text> : <View />}
            {trailingLabel ? (
              <Text style={styles.trailingLabel}>{trailingLabel}</Text>
            ) : null}
          </View>
        )}

        <View
          style={[
            styles.field,
            multiline && styles.fieldMultiline,
            focused && styles.focused,
            !!error && styles.error,
            success && !error && styles.success,
            locked && styles.locked,
          ]}
        >
          {leading}
          <TextInput
            ref={ref}
            placeholderTextColor={COLORS.placeholder}
            editable={!locked}
            multiline={multiline}
            style={[styles.input, multiline && styles.inputMultiline, style]}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...rest}
          />
          {trailing}
        </View>

        {(error || hint || (showCount && max)) && (
          <View style={styles.footer}>
            <Text style={[styles.hint, !!error && styles.errorText]}>
              {error ?? hint ?? ''}
            </Text>
            {showCount && max ? (
              <Text style={styles.count}>
                {String(rest.value ?? '').length}/{max}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    );
  }
);

export type TextFieldProps = Omit<TextInputProps, 'editable'> & {
  label?: string;
  // Shown in place of the hint, and turns the border red.
  error?: string | null;
  // Green border for a validated value (e.g. an available username).
  success?: boolean;
  hint?: string;
  // Right-aligned note beside the label, e.g. "VERIFIED · LOCKED".
  trailingLabel?: string;
  // Rendered inside the field, before the input — e.g. an "@" prefix.
  leading?: React.ReactNode;
  // Rendered inside the field, after the input — eye toggles, clear buttons.
  trailing?: React.ReactNode;
  // Read-only: greyed fill, not editable. For ID-verified fields.
  locked?: boolean;
  showCount?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  label: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.micro,
    letterSpacing: 0.3,
    color: COLORS.inkLabel,
  },
  trailingLabel: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    letterSpacing: 0.3,
    color: COLORS.verified,
  },
  field: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fieldMultiline: {
    height: 'auto',
    minHeight: 96,
    alignItems: 'stretch',
    paddingVertical: 13,
  },
  focused: { borderWidth: 1.5, borderColor: COLORS.primary },
  error: { borderWidth: 1.5, borderColor: COLORS.error },
  success: { borderWidth: 1.5, borderColor: COLORS.success },
  locked: { backgroundColor: COLORS.inkFaint },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.body,
    color: COLORS.textPrimary,
  },
  inputMultiline: { height: 'auto', textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 8,
  },
  hint: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  errorText: { color: COLORS.error, fontFamily: FONTS.semibold },
  count: { fontFamily: FONTS.semibold, fontSize: TYPE_SIZE.micro, color: COLORS.textMuted },
});
