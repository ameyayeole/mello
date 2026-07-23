import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Button, Icon, PressableScale, Sheet } from '@/components/ui';
import { WrapChecklist, WrapStep } from './WrapChecklist';
import { useWrap } from '@/hooks/useWrap';
import { ACTIVITY_MAP } from '@/constants/activities';
import { NearbyEvent } from '@/types/models';

// The wrap, met from the chat. When an event has ended, opening its chat lands
// you here first: a dark sheet up from the bottom with the post-event cards —
// rate people, drop photos, vote the awards — each tappable, and a way through
// to the chat itself at the bottom.
//
// It is the wrap hub's checklist in a sheet, not a second copy of it: the same
// `useWrap` status drives both, the step cards push the same screens, and the
// "See the full recap" link hands off to the full hub for the gallery, encore
// and night-in-numbers that don't belong in a glance. Dark because the chat is
// bright and this is a moment on top of it, not part of it.
export function WrapSheet({
  visible,
  onClose,
  event,
}: {
  visible: boolean;
  onClose: () => void;
  event: NearbyEvent;
}) {
  const router = useRouter();
  const { status } = useWrap(event.id);
  const emoji = ACTIVITY_MAP[event.activity]?.emoji ?? '📍';

  // A tapped card leaves the sheet and opens its step — you came here to do the
  // thing, so get out of the way and let the chat be there when you're back.
  function openStep(step: WrapStep) {
    onClose();
    if (step === 'rate') router.push(`/events/wrap/rate/${event.id}`);
    if (step === 'photos') router.push(`/events/wrap/photos/${event.id}`);
    if (step === 'superlatives')
      router.push(`/events/wrap/superlatives/${event.id}`);
    if (step === 'feedback') router.push(`/events/wrap/feedback/${event.id}`);
  }

  function openFullRecap() {
    onClose();
    router.push(`/events/wrap/${event.id}`);
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      animation="slide"
      grabber
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.emojiChip}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{"This one's a wrap"}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {status ? (
          <WrapChecklist status={status} expanded onStepPress={openStep} />
        ) : (
          <ActivityIndicator color={COLORS.white} style={styles.loading} />
        )}

        {/* The rest of the hub — gallery, run-it-back, the recap — lives one tap
            away rather than cramming this glance. */}
        <PressableScale
          scaleTo={0.98}
          style={styles.recapLink}
          onPress={openFullRecap}
          accessibilityRole="button"
          accessibilityLabel="See the full recap"
        >
          <Text style={styles.recapLinkText}>See the full recap</Text>
          <Icon name="chevronRight" size={16} color={COLORS.textOnDark} />
        </PressableScale>
      </ScrollView>

      <Button
        label="View chat"
        variant="tertiary"
        fullWidth
        onPress={onClose}
        style={styles.viewChat}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // The app black — a moment laid over the bright chat, not part of it.
  card: { backgroundColor: COLORS.accent },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[4],
  },
  emojiChip: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 24 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    letterSpacing: -0.4,
    color: COLORS.white,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textOnDark,
    marginTop: SPACING[0.5],
  },
  // Capped so a full checklist scrolls inside the sheet rather than pushing the
  // "View chat" button off the bottom of tall content.
  scroll: { maxHeight: '62%' },
  scrollBody: { paddingHorizontal: SPACING[5], gap: SPACING[3] },
  loading: { marginVertical: SPACING[6] },
  recapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[1],
    paddingVertical: SPACING[2],
  },
  recapLinkText: {
    fontFamily: FONTS.semibold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textOnDark,
  },
  viewChat: { marginHorizontal: SPACING[5], marginTop: SPACING[3] },
});
