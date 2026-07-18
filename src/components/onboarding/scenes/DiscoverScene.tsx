import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import { CATEGORY_STYLE } from '@/constants/categoryStyle';
import { Icon } from '@/components/ui';
import { Stage, MapPanel, EventPin, ClusterBubble, FloatingCard } from '../Stage';

// Slide 1: the live map. Pins pop in the way they do on the real map screen,
// with the featured one pulsing softly.
export function DiscoverScene() {
  const music = CATEGORY_STYLE.music;
  return (
    <Stage>
      <View style={styles.center}>
        <MapPanel tilt="-4deg" style={styles.panel}>
          <View style={[styles.spot, { top: '13%', left: '16%' }]}>
            <EventPin emoji="☕" size={44} avatarColor="#F3C6A5" delay={350} />
          </View>
          <View style={[styles.spot, { top: '34%', left: '56%' }]}>
            <EventPin
              emoji="🎵"
              size={54}
              avatarColor="#B7C9E8"
              delay={600}
              pulse={music.accent}
            />
          </View>
          <View style={[styles.spot, { top: '60%', left: '22%' }]}>
            <ClusterBubble count={3} delay={850} />
          </View>
        </MapPanel>

        <FloatingCard delay={1100} style={styles.eventCard}>
          <View style={[styles.eventIcon, { backgroundColor: music.tint }]}>
            <Icon name="music" size={19} color={music.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>Indie gig tonight</Text>
            <Text style={styles.eventMeta}>0.8 km away · 9 going</Text>
          </View>
          <View style={styles.avatars}>
            <View style={[styles.avatar, { backgroundColor: '#F3C6A5' }]} />
            <View style={[styles.avatar, styles.avatarOverlap, { backgroundColor: '#B7C9E8' }]} />
            <View style={[styles.avatar, styles.avatarOverlap, { backgroundColor: '#C9E4C5' }]} />
          </View>
        </FloatingCard>
      </View>
    </Stage>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: {
    width: '76%',
    height: '78%',
    maxWidth: 330,
  },
  spot: { position: 'absolute' },
  eventCard: {
    position: 'absolute',
    bottom: '11%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: '78%',
    maxWidth: 320,
  },
  eventIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  eventMeta: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  avatars: { flexDirection: 'row' },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarOverlap: { marginLeft: -8 },
});
