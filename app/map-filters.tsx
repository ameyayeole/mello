import { useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { isPremium, PREMIUM_GOLD, PREMIUM_GOLD_TINT } from '@/utils/premium';
import { ACTIVITIES } from '@/constants/activities';
import { categoryStyle } from '@/constants/categoryStyle';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { ActivityId } from '@/types/models';
import {
  ActivityGlyph,
  Button,
  Icon,
  IconName,
  PressableScale,
  Screen,
  ScreenHeader,
  SectionLabel,
} from '@/components/ui';
import {
  DEFAULT_MAP_FILTERS,
  GroupSize,
  MapFilters,
  TimeWindow,
} from '@/utils/mapFilters';

const TIME_OPTIONS: { id: TimeWindow; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'now', label: 'Happening now' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This week' },
];

const DISTANCE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 2_000, label: '2 km' },
  { value: 5_000, label: '5 km' },
  { value: 10_000, label: '10 km' },
  { value: 25_000, label: '25 km' },
];

const SIZE_OPTIONS: { id: GroupSize; label: string; hint?: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'small', label: 'Small', hint: '≤5' },
  { id: 'medium', label: 'Medium', hint: '6–15' },
  { id: 'large', label: 'Large', hint: '15+' },
];

function OptionChip({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={0.94}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
      {hint ? (
        <Text style={[styles.chipHint, active && styles.chipTextActive]}>
          {hint}
        </Text>
      ) : null}
    </PressableScale>
  );
}

// Small gold "Mello+" tag on premium-only filters.
function PlusTag() {
  return (
    <View style={plusStyles.tag}>
      <Icon name="crown" size={11} color={PREMIUM_GOLD} strokeWidth={2.2} />
      <Text style={plusStyles.tagText}>Mello+</Text>
    </View>
  );
}

function ToggleRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onChange,
  premiumOnly = false,
  last = false,
}: {
  icon: IconName;
  iconColor: string;
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  premiumOnly?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, !last && styles.toggleRowBorder]}>
      <Icon name={icon} size={20} color={iconColor} />
      <View style={styles.toggleText}>
        <View style={styles.toggleTitleRow}>
          <Text style={styles.toggleTitle}>{title}</Text>
          {premiumOnly && <PlusTag />}
        </View>
        <Text style={styles.toggleSub}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: COLORS.primary }}
      />
    </View>
  );
}

export default function MapFiltersScreen() {
  const router = useRouter();
  const { mapFilters, setMapFilters } = useUIStore();
  const premium = isPremium(useAuthStore((s) => s.user));
  // Edited locally; the map only updates when "Show events" is tapped.
  const [draft, setDraft] = useState<MapFilters>(mapFilters);

  function patch(p: Partial<MapFilters>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  // Premium filters bounce free users to the paywall instead of applying.
  function requirePremium(): boolean {
    if (premium) return true;
    router.push('/premium?reason=filters');
    return false;
  }

  function toggleActivity(id: ActivityId) {
    if (!requirePremium()) return;
    patch({
      activities: draft.activities.includes(id)
        ? draft.activities.filter((a) => a !== id)
        : [...draft.activities, id],
    });
  }

  function apply() {
    setMapFilters(draft);
    router.back();
  }

  return (
    <Screen modal>
      <ScreenHeader
        title="Filters"
        backIcon="close"
        right={
          <PressableScale
            scaleTo={0.94}
            onPress={() => setDraft(DEFAULT_MAP_FILTERS)}
            accessibilityRole="button"
            accessibilityLabel="Reset all filters"
            style={styles.resetBtn}
          >
            <Text style={styles.resetText}>Reset</Text>
          </PressableScale>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Animated.View entering={FadeInDown.duration(350)}>
          <View style={styles.sectionLabelRow}>
            <SectionLabel style={styles.sectionLabel}>Activities</SectionLabel>
            {!premium && <PlusTag />}
          </View>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {ACTIVITIES.map((a) => {
                const active = draft.activities.includes(a.id);
                const cat = categoryStyle(a.id);
                return (
                  <PressableScale
                    key={a.id}
                    scaleTo={0.94}
                    onPress={() => toggleActivity(a.id)}
                    style={[
                      styles.chip,
                      active && {
                        backgroundColor: cat.tint,
                        borderColor: cat.accent,
                      },
                    ]}
                  >
                    <ActivityGlyph
                      activity={a.id}
                      size={14}
                      color={active ? cat.accent : COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        active && { color: cat.accent },
                      ]}
                    >
                      {a.label}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
            <Text style={styles.cardHint}>
              Nothing selected shows every activity.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(350)}>
          <SectionLabel style={styles.sectionLabel}>When</SectionLabel>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {TIME_OPTIONS.map((t) => (
                <OptionChip
                  key={t.id}
                  label={t.label}
                  active={draft.when === t.id}
                  onPress={() => patch({ when: t.id })}
                />
              ))}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <SectionLabel style={styles.sectionLabel}>
            Distance from me
          </SectionLabel>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {DISTANCE_OPTIONS.map((d) => (
                <OptionChip
                  key={d.label}
                  label={d.label}
                  active={draft.maxDistanceM === d.value}
                  onPress={() => patch({ maxDistanceM: d.value })}
                />
              ))}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(350)}>
          <SectionLabel style={styles.sectionLabel}>Group size</SectionLabel>
          <View style={styles.card}>
            <View style={styles.chipWrap}>
              {SIZE_OPTIONS.map((s) => (
                <OptionChip
                  key={s.id}
                  label={s.label}
                  hint={s.hint}
                  active={draft.groupSize === s.id}
                  onPress={() => patch({ groupSize: s.id })}
                />
              ))}
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(350)}>
          <SectionLabel style={styles.sectionLabel}>Event type</SectionLabel>
          <View style={styles.card}>
            <ToggleRow
              icon="userPlus"
              iconColor={COLORS.success}
              title="Spots available"
              subtitle="Hide events that are already full"
              value={draft.hasSpotsOnly}
              premiumOnly={!premium}
              onChange={(v) => {
                if (!requirePremium()) return;
                patch({ hasSpotsOnly: v });
              }}
            />
            <ToggleRow
              icon="shield"
              iconColor={COLORS.verified}
              title="Verified hosts"
              subtitle="Only events from ID-verified hosts"
              value={draft.verifiedHostsOnly}
              premiumOnly={!premium}
              onChange={(v) => {
                if (!requirePremium()) return;
                patch({ verifiedHostsOnly: v });
              }}
            />
            <ToggleRow
              icon="check"
              iconColor={COLORS.verified}
              title="Instant join"
              subtitle="No host approval needed"
              value={draft.instantJoinOnly}
              onChange={(v) => patch({ instantJoinOnly: v })}
            />
            <ToggleRow
              icon="shield"
              iconColor={COLORS.secondary}
              title="Women only"
              subtitle="Only women-only events"
              value={draft.womenOnly}
              onChange={(v) => patch({ womenOnly: v })}
            />
            <ToggleRow
              icon="heart"
              iconColor={COLORS.primary}
              title="Hosted by friends"
              subtitle="Only events from people you know"
              value={draft.friendsOnly}
              onChange={(v) => patch({ friendsOnly: v })}
              last
            />
          </View>
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
  variant="primary" label="Show events" onPress={apply} />
      </View>
    </Screen>
  );
}

const plusStyles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1],
    paddingHorizontal: SPACING[2],
    paddingVertical: SPACING[0.5],
    borderRadius: RADIUS.full,
    backgroundColor: PREMIUM_GOLD_TINT,
  },
  tagText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.nano,
    color: PREMIUM_GOLD,
  },
});

const styles = StyleSheet.create({
  scroll: { padding: SPACING[4], paddingBottom: SPACING[6], gap: SPACING[1] },
  sectionLabel: { marginTop: SPACING[3.5], marginBottom: SPACING[2], marginLeft: SPACING[1] },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  toggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[3.5],
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textMuted,
    marginTop: SPACING[2.5],
    marginLeft: SPACING[0.5],
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[1.5],
    height: 36,
    paddingHorizontal: SPACING[3.5],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: COLORS.primaryTint,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textSecondary,
  },
  chipTextActive: { color: COLORS.primary },
  chipHint: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    color: COLORS.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[0.5],
  },
  toggleRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  toggleText: { flex: 1 },
  toggleTitle: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textPrimary,
  },
  toggleSub: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING[0.5],
  },
  resetBtn: {
    height: 40,
    paddingHorizontal: SPACING[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.primary,
  },
  footer: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[2.5],
    paddingBottom: SPACING[2],
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
});
