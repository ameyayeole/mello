import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { NearbyEvent } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { formatDistance } from '@/utils/distance';
import { BOOST_EMOJI, BOOST_TINT } from '@/utils/boost';
import { Avatar, CategoryTile, Icon, PressableScale } from '@/components/ui';

// The map's "🔥 Hot events" list: a bottom card of the currently-boosted events
// in the visible region. Tapping a row hands the event id back so the map can
// recenter and open its bottom sheet.
export default function HotEventsSheet({
  visible,
  events,
  onSelect,
  onClose,
}: {
  visible: boolean;
  events: NearbyEvent[];
  onSelect: (event: NearbyEvent) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>{BOOST_EMOJI} Hot events near you</Text>
          <PressableScale
            scaleTo={0.9}
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Icon name="close" size={20} color={COLORS.textSecondary} />
          </PressableScale>
        </View>

        {events.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{BOOST_EMOJI}</Text>
            <Text style={styles.emptyTitle}>No boosted events here yet</Text>
            <Text style={styles.emptyText}>
              Pan around, or boost your own event to top the map for 24 hours.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {events.map((event) => {
              const activity = ACTIVITY_MAP[event.activity];
              return (
                <PressableScale
                  key={event.id}
                  scaleTo={0.98}
                  style={styles.row}
                  onPress={() => onSelect(event)}
                >
                  <CategoryTile activity={event.activity} size={40} radius={12} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {event.title}
                    </Text>
                    <View style={styles.rowMetaRow}>
                      <Avatar
                        name={event.host_name}
                        photoUrl={event.host_photo_url}
                        size={16}
                      />
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {activity?.label ?? event.activity}
                        {event.distance_m != null
                          ? ` · ${formatDistance(event.distance_m)}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.flamePill}>
                    <Text style={styles.flamePillText}>{BOOST_EMOJI}</Text>
                  </View>
                </PressableScale>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,24,44,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(15,24,44,0.15)',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 18,
    letterSpacing: -0.3,
    color: COLORS.textPrimary,
  },
  list: { flexGrow: 0 },
  listContent: { gap: 10, paddingBottom: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,106,43,0.25)',
  },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMeta: {
    flexShrink: 1,
    fontFamily: FONTS.semibold,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  flamePill: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BOOST_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flamePillText: { fontSize: 16 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  emptyEmoji: { fontSize: 38, marginBottom: 2 },
  emptyTitle: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
  },
});
