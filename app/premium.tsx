import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuthStore } from '@/stores/authStore';
import { getProfile } from '@/services/auth.service';
import {
  iapAvailable,
  purchasePremium,
  restorePremium,
  PurchaseCancelled,
} from '@/services/iap';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import {
  isPremium,
  PREMIUM_GOLD,
  PREMIUM_GOLD_TINT,
  PREMIUM_PLANS,
} from '@/utils/premium';
import {
  Button,
  Icon,
  IconName,
  NavButton,
  PressableScale,
  Screen,
} from '@/components/ui';

// Why the paywall opened — puts the blocked feature first in the list.
type Reason = 'distance' | 'filters' | 'swipes' | 'wishlist';

const PERKS: { id: Reason | 'priority' | 'badge'; icon: IconName; title: string; sub: string }[] = [
  {
    id: 'distance',
    icon: 'location',
    title: 'Join events anywhere',
    sub: 'Go beyond the 10 km free radius',
  },
  {
    id: 'filters',
    icon: 'filter',
    title: 'Premium filters',
    sub: 'Activities, spots available & verified hosts',
  },
  {
    id: 'swipes',
    icon: 'heart',
    title: 'Unlimited swipes + rewind',
    sub: 'No daily cap, undo any pass',
  },
  {
    id: 'wishlist',
    icon: 'bookmark',
    title: 'See who wishlisted your event',
    sub: 'Know your audience before it starts',
  },
  {
    id: 'priority',
    icon: 'userPlus',
    title: 'Priority join requests',
    sub: 'Your requests show first to hosts',
  },
  {
    id: 'badge',
    icon: 'crown',
    title: 'Mello+ badge',
    sub: 'A gold crown on your profile',
  },
];

const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

export default function PremiumScreen() {
  const router = useRouter();
  const { reason } = useLocalSearchParams<{ reason?: Reason }>();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const alreadyPremium = isPremium(user);
  const [plan, setPlan] = useState<'weekly' | 'monthly'>('monthly');
  const [busy, setBusy] = useState(false);

  // The perk that triggered the paywall leads the list.
  const perks = reason
    ? [...PERKS].sort((a, b) => (a.id === reason ? -1 : b.id === reason ? 1 : 0))
    : PERKS;

  // Pull the fresh premium columns after the store purchase was verified.
  async function refreshProfile() {
    if (!user) return;
    const fresh = await getProfile(user.id);
    if (fresh) setUser(fresh);
  }

  // Purchase runs through the platform store (Apple IAP / Play Billing): the
  // store collects the payment method + autopay and applies the 1-month-free
  // intro offer; verify-iap then grants premium server-side. On the current
  // binary (no billing module yet) it falls back to a "coming soon" note.
  async function subscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const done = await purchasePremium(plan);
      if (!done) {
        Alert.alert(
          'Almost there',
          "Payments are coming to Mello very soon. We'll let you know the moment Mello+ can be activated!"
        );
        return;
      }
      await refreshProfile();
      Alert.alert(
        'Welcome to Mello+ 🎉',
        `Your first month is free — after that it renews automatically through the ${STORE_NAME}.`,
        [{ text: 'Nice', onPress: () => router.back() }]
      );
    } catch (e) {
      if (!(e instanceof PurchaseCancelled)) {
        Alert.alert(
          "Couldn't complete the purchase",
          'Nothing was charged. Please try again in a moment.'
        );
      }
    } finally {
      setBusy(false);
    }
  }

  // Apple requires a visible restore path for subscriptions.
  async function restore() {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await iapAvailable())) {
        Alert.alert(
          'Almost there',
          'Restoring purchases will be available once payments launch.'
        );
        return;
      }
      const found = await restorePremium();
      if (found) {
        await refreshProfile();
        Alert.alert('Restored', 'Your Mello+ subscription is active again.');
      } else {
        Alert.alert(
          'Nothing to restore',
          `We couldn't find a Mello+ subscription on this ${STORE_NAME} account.`
        );
      }
    } catch {
      Alert.alert('Restore failed', 'Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen modal>
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <View style={styles.headerBrand}>
          <Icon name="crown" size={18} color={PREMIUM_GOLD} strokeWidth={2} />
          <Text style={styles.headerTitle}>Mello+</Text>
        </View>
        <NavButton
          icon="close"
          onPress={() => router.back()}
          accessibilityLabel="Close"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {alreadyPremium && (
          <Animated.View
            entering={FadeInDown.duration(350)}
            style={styles.activePill}
          >
            <Icon name="crown" size={14} color={PREMIUM_GOLD} strokeWidth={2.2} />
            <Text style={styles.activePillText}>
              {user?.premium_until
                ? `Active until ${new Date(user.premium_until).toLocaleDateString()}`
                : 'Active — enjoy everything below'}
            </Text>
          </Animated.View>
        )}

        {/* Perks */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={styles.card}>
          {perks.map((p, i) => (
            <View
              key={p.id}
              style={[styles.perkRow, i < perks.length - 1 && styles.perkBorder]}
            >
              <View style={styles.perkIcon}>
                <Icon name={p.icon} size={18} color={PREMIUM_GOLD} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.perkTitle}>{p.title}</Text>
                <Text style={styles.perkSub}>{p.sub}</Text>
              </View>
              {reason === p.id && (
                <View style={styles.reasonPill}>
                  <Text style={styles.reasonPillText}>Unlocks this</Text>
                </View>
              )}
            </View>
          ))}
        </Animated.View>

        {/* Plans */}
        {!alreadyPremium && (
          <Animated.View
            entering={FadeInDown.delay(120).duration(350)}
            style={styles.plansRow}
          >
            {PREMIUM_PLANS.map((p) => {
              const active = plan === p.id;
              return (
                <PressableScale
                  key={p.id}
                  scaleTo={0.97}
                  style={[styles.planCard, active && styles.planCardActive]}
                  onPress={() => setPlan(p.id)}
                >
                  <View
                    style={[styles.planHint, active && styles.planHintActive]}
                  >
                    <Text
                      style={[
                        styles.planHintText,
                        active && styles.planHintTextActive,
                      ]}
                    >
                      {p.hint}
                    </Text>
                  </View>
                  <Text style={styles.planLabel}>{p.label}</Text>
                  <Text style={styles.planPrice}>₹{p.price}</Text>
                  <Text style={styles.planPer}>per {p.per}</Text>
                </PressableScale>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>

      {!alreadyPremium && (
        <View style={styles.footer}>
          <Button
            variant="primary"
            label={
              busy
                ? 'Just a moment…'
                : `Start 1 month free · then ₹${PREMIUM_PLANS.find((p) => p.id === plan)!.price}/${plan === 'weekly' ? 'week' : 'month'}`
            }
            onPress={subscribe}
            disabled={busy}
          />
          <Text style={styles.footerHint}>
            Billed via {STORE_NAME} after your free month — auto-renews, cancel
            anytime in your {STORE_NAME} subscriptions.
          </Text>
          <Text style={styles.restoreLink} onPress={restore}>
            Restore purchases
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 19,
    letterSpacing: -0.38,
    color: COLORS.textPrimary,
  },
  scroll: { padding: 20, paddingTop: 8, gap: 16, paddingBottom: 24 },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: PREMIUM_GOLD_TINT,
  },
  activePillText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: PREMIUM_GOLD,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  perkBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  perkIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: PREMIUM_GOLD_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  perkSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  reasonPill: {
    backgroundColor: PREMIUM_GOLD_TINT,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  reasonPillText: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: PREMIUM_GOLD,
  },
  plansRow: { flexDirection: 'row', gap: 12 },
  planCard: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingVertical: 18,
    paddingTop: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  planCardActive: { borderColor: PREMIUM_GOLD },
  planHint: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    marginBottom: 8,
  },
  planHintActive: { backgroundColor: PREMIUM_GOLD_TINT },
  planHintText: {
    fontFamily: FONTS.bold,
    fontSize: 10.5,
    color: COLORS.textSecondary,
  },
  planHintTextActive: { color: PREMIUM_GOLD },
  planLabel: {
    fontFamily: FONTS.bold,
    fontSize: 13.5,
    color: COLORS.textSecondary,
  },
  planPrice: {
    fontFamily: FONTS.heavy,
    fontSize: 27,
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
  },
  planPer: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  footerHint: {
    fontFamily: FONTS.medium,
    fontSize: 11.5,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  restoreLink: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: COLORS.primary,
    textAlign: 'center',
    paddingVertical: 2,
  },
});
