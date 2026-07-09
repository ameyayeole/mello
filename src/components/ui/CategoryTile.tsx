import { View, StyleSheet } from 'react-native';
import { ActivityId } from '@/types/models';
import { categoryStyle } from '@/constants/categoryStyle';
import { Icon, IconName } from './Icon';

// Rounded-square tile with the category's stroke icon on its tint background.
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
      <Icon
        name={activity as IconName}
        size={Math.round(size * 0.5)}
        color={accent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
