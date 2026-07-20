import { useEffect, useState } from 'react';
import { RADIUS, SPACING } from '@/constants/spacing';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { Icon } from '@/components/ui';
import {
  looksLikeMoneyRequest,
  canShowMoneyGuard,
  markMoneyGuardShown,
} from '@/services/safety';

// Scam guard (spec #11): watches incoming chat messages for payment-related
// terms and shows a warning strip to the recipient, once per conversation per
// day. Render it directly above the message input bar.

interface Msg {
  sender_id: string;
  content: string;
  created_at: string;
  type?: string;
}

export function useMoneyGuard(
  conversationId: string | undefined,
  messages: Msg[],
  myId: string | undefined
) {
  const [visible, setVisible] = useState(false);
  const [flaggedSenderId, setFlaggedSenderId] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId || !myId || messages.length === 0) return;

    // Newest incoming text message.
    const incoming = messages
      .filter((m) => m.sender_id !== myId && (m.type ?? 'text') === 'text')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .pop();
    if (!incoming || !looksLikeMoneyRequest(incoming.content)) return;

    let cancelled = false;
    canShowMoneyGuard(myId, conversationId).then((ok) => {
      if (cancelled || !ok) return;
      setFlaggedSenderId(incoming.sender_id);
      setVisible(true);
      markMoneyGuardShown(myId, conversationId);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, myId, messages]);

  return { visible, flaggedSenderId, dismiss: () => setVisible(false) };
}

// Amber card treatment per the design gallery (matches the Coffee category
// palette: #C8791E on #FBF0E2 with a dark-amber text ramp).
const AMBER = '#C8791E';
const AMBER_DARK = '#8A5313';

export default function MoneyGuardBanner({
  visible,
  onReport,
  onDismiss,
}: {
  visible: boolean;
  onReport: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <View style={{ marginTop: SPACING[0.5] }}>
          <Icon name="warning" size={18} color={AMBER} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            Careful — this looks like a money request
          </Text>
          <Text style={styles.body}>
            Mello never charges for events. If this feels shady, report it.
          </Text>
          <TouchableOpacity onPress={onReport} hitSlop={8}>
            <Text style={styles.reportLink}>Report this →</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={10}
          accessibilityLabel="Dismiss warning"
        >
          <Icon name="close" size={14} color="rgba(138,83,19,0.5)" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: SPACING[3], paddingBottom: SPACING[2.5] },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[2],
    backgroundColor: '#FBF0E2',
    borderWidth: 1,
    borderColor: 'rgba(200,121,30,0.3)',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[2.5],
    paddingHorizontal: SPACING[3],
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: AMBER_DARK,
  },
  body: {
    fontFamily: FONTS.medium,
    fontSize: TYPE_SIZE.micro,
    lineHeight: 15,
    color: 'rgba(138,83,19,0.85)',
    marginTop: SPACING[0.5],
  },
  reportLink: {
    fontFamily: FONTS.bold,
    fontSize: TYPE_SIZE.caption,
    color: COLORS.primary,
    marginTop: SPACING[1.5],
  },
});
