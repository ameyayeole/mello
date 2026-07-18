import Animated, { ZoomIn } from 'react-native-reanimated';
import { Icon } from '@/components/ui';

// WhatsApp-style delivery state for your own messages:
//   sending → little clock · sent → single tick · read → blue double tick.
// The key swap re-runs the pop-in animation on every state change.

export type TickStatus = 'sending' | 'sent' | 'read';

export default function Ticks({
  status,
  light,
}: {
  status: TickStatus;
  // On the colored "mine" bubble the ticks render in white/blue-on-color.
  light?: boolean;
}) {
  const color =
    status === 'read'
      ? light
        ? '#9BEBFF'
        : '#3BA7F0'
      : light
        ? 'rgba(255,255,255,0.8)'
        : 'rgba(15,24,44,0.4)';

  return (
    <Animated.View key={status} entering={ZoomIn.duration(200)}>
      <Icon
        name={
          status === 'sending'
            ? 'clock'
            : status === 'sent'
              ? 'check'
              : 'checkDouble'
        }
        size={13}
        color={color}
        strokeWidth={2.2}
      />
    </Animated.View>
  );
}
