import { View, Text, StyleSheet } from 'react-native';
import { ActivityId } from '@/types/models';
import { categoryStyle } from '@/constants/categoryStyle';
import { ACTIVITY_MAP } from '@/constants/activities';
import { Icon, IconName, hasGlyph } from './Icon';

// Rounded-square tile with the category's stroke icon on its tint background.
// Types without a hand-drawn glyph fall back to their emoji.
export function CategoryTile({
  activity,
  size = 38,
  radius,
}: {
  activity: ActivityId | string;
  size?: number;
  radius?: number;
}) {
  const { accent, tint } = categoryStyle(activity);
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radius ?? Math.round(size * 0.29),
          backgroundColor: tint,
        },
      ]}
    >
      {hasGlyph(activity) ? (
        <Icon
          name={activity as IconName}
          size={Math.round(size * 0.5)}
          color={accent}
        />
      ) : (
        <Text style={{ fontSize: Math.round(size * 0.5) }}>
          {ACTIVITY_MAP[activity as ActivityId]?.emoji ?? '📍'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
