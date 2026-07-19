import { Text } from 'react-native';
import { ActivityId } from '@/types/models';
import { ACTIVITY_MAP } from '@/constants/activities';
import { Icon, IconName, hasGlyph } from './Icon';

// Renders an activity's hand-drawn SVG glyph, falling back to its emoji for
// types that don't have a glyph yet. Use anywhere a category icon is drawn
// inline (chips, pills, tiles) so new activities never render blank.
export function ActivityGlyph({
  activity,
  size = 20,
  color,
}: {
  activity: ActivityId | string;
  size?: number;
  color?: string;
}) {
  if (hasGlyph(activity)) {
    return <Icon name={activity as IconName} size={size} color={color} />;
  }
  return (
    <Text style={{ fontSize: Math.round(size * 0.95), lineHeight: size }}>
      {ACTIVITY_MAP[activity as ActivityId]?.emoji ?? '📍'}
    </Text>
  );
}
