import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { NavButton } from './NavButton';
import { IconName } from './Icon';

// App header: back button + title, optional subtitle and right slot.
//
// `subtitle`, `tone` and the wider `backIcon` set exist because their absence
// is why ~31 screens hand-rolled their own header row — and drifted into five
// different title treatments in the process.
//
// `tone` sets the fill and the foreground together, because those two always
// move together in practice:
//
//   surface     white bar, dark text — the default
//   transparent no fill, dark text — over a light screen background
//   dark        black bar, light text
//   onDark      no fill, light text — over a screen that is already dark
//
// A titleless header (back button alone, floating over a hero) is valid: pass
// no `title` and the text block collapses.
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backIcon = 'back',
  right,
  tone = 'surface',
  style,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon?: IconName;
  right?: React.ReactNode;
  tone?: 'surface' | 'transparent' | 'dark' | 'onDark';
  style?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const onDark = tone === 'dark' || tone === 'onDark';
  const fg = onDark ? COLORS.white : COLORS.textPrimary;

  return (
    <View
      style={[
        styles.header,
        tone === 'surface' && styles.surface,
        tone === 'dark' && styles.dark,
        style,
      ]}
    >
      <NavButton
        icon={backIcon}
        color={fg}
        onPress={onBack ?? (() => router.back())}
        accessibilityLabel="Go back"
      />

      <View style={styles.titleWrap}>
        {title ? (
          <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            style={[styles.subtitle, onDark && styles.subtitleDark]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  surface: { backgroundColor: COLORS.surface },
  dark: { backgroundColor: COLORS.accent },
  titleWrap: { flex: 1 },
  title: { fontFamily: FONTS.heavy, fontSize: TYPE_SIZE.title, letterSpacing: -0.4 },
  subtitle: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  subtitleDark: { color: 'rgba(255,255,255,0.6)' },
  spacer: { width: 40 },
});
