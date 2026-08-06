import { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { RADIUS, SPACING } from '@/constants/spacing';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Avatar } from '@/components/ui';
import { markNoteOpened } from '@/services/wrap.service';
import type { WrapNote } from '@/types/models';
import { themedStyles } from '@/theme';

// "Notes for you" — the notes this host was left, one per slide.
//
// Authored by construction, and that is why this section exists where the
// feedback stats above it stay anonymous: `wrap_notes` carries a `sender`, so
// showing a face next to the words is the data telling the truth rather than a
// choice to attribute something that was given anonymously.
//
// Every slide is the same height whether or not its note has a photo. A pager
// that changes height as you swipe drags the whole page under your thumb.
const SLIDE_HEIGHT = 168;

export default function HostNotesCarousel({
  notes,
  sheetWidth,
}: {
  notes: WrapNote[];
  // The sheet's inner width. Passed in rather than measured: the slides have to
  // be page-width for `pagingEnabled` to land on them, and the parent already
  // knows its own padding.
  sheetWidth: number;
}) {
  const { width } = useWindowDimensions();
  const slideWidth = sheetWidth || width;
  const [index, setIndex] = useState(0);
  // Which notes this session has already marked. A ref, not state: marking is a
  // side effect nobody renders, and a re-render per swipe to store it would be
  // the tail wagging the dog.
  const marked = useRef<Set<string>>(new Set());

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (next === index) return;
    setIndex(next);

    // Once per note, not once per render: `opened_at` is what stops it showing
    // as new in the wrap, and firing it on every frame of a swipe would be a
    // write per frame.
    const note = notes[next];
    if (note && !note.opened_at && !marked.current.has(note.id)) {
      marked.current.add(note.id);
      markNoteOpened(note.id).catch(() => {
        // Non-fatal: worst case it stays "new" and is marked next time.
        marked.current.delete(note.id);
      });
    }
  }

  if (notes.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ width: slideWidth }}
      >
        {notes.map((note) => (
          <View key={note.id} style={[styles.slide, { width: slideWidth }]}>
            <View style={styles.head}>
              <Avatar
                name={note.sender?.name}
                photoUrl={note.sender?.photo_url}
                size={32}
              />
              <Text style={styles.sender} numberOfLines={1}>
                {note.sender?.name ?? 'Someone'}
              </Text>
            </View>

            <View style={styles.bodyRow}>
              {note.photo_url ? (
                <Image
                  source={{ uri: note.photo_url }}
                  style={styles.photo}
                  contentFit="cover"
                  transition={150}
                />
              ) : null}
              <Text
                style={styles.body}
                // The slide is a fixed height, so the text has to stop
                // somewhere rather than push the pager around.
                numberOfLines={note.photo_url ? 4 : 5}
              >
                {note.content}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {notes.length > 1 && (
        <View style={styles.pager}>
          {notes.map((note, i) => (
            <View
              key={note.id}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: { gap: SPACING[2.5] },
  slide: {
    height: SLIDE_HEIGHT,
    justifyContent: 'center',
    gap: SPACING[3],
    paddingRight: SPACING[4],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2.5] },
  sender: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.white,
  },
  bodyRow: { flexDirection: 'row', gap: SPACING[3], alignItems: 'flex-start' },
  photo: {
    width: 74,
    height: 74,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.fillOnDarkStrong,
  },
  body: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.bodySm,
    lineHeight: 20,
    color: COLORS.textOnDark,
  },
  pager: { flexDirection: 'row', gap: SPACING[1], justifyContent: 'center' },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.fillOnDarkStrong,
  },
  dotActive: { backgroundColor: COLORS.white },
}));
