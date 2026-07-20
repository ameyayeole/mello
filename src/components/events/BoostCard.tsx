import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EventDetail } from '@/types/models';
import { useAuthStore } from '@/stores/authStore';
import { COLORS } from '@/constants/colors';
import { FONTS } from '@/constants/typography';
import {
  BOOST_ACCENT,
  BOOST_EMOJI,
  BOOST_HOURS,
  BOOST_PACKS,
  BOOST_TINT,
  boostHoursLeft,
  isBoosted,
} from '@/utils/boost';
import { PurchaseCancelled, purchaseBoostPack, BoostPack } from '@/services/iap';
import { getBoostCredits, spendBoost } from '@/services/boost.service';
import { Button, Icon, PressableScale } from '@/components/ui';
import { showError } from '@/utils/errors';

// Host-only card on the manage-event panel. Boosts are credits now (028):
// "Boost event" opens a sheet showing the host's balance — spend one from
// there, or, when the balance is empty, buy a pack (1 · ₹69 / 5 · ₹249).
// While boosted it shows a countdown + the boost's impact, like before.
export default function BoostCard({
  event,
  saversCount,
  onBoosted,
}: {
  event: EventDetail;
  saversCount: number;
  onBoosted: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // 'use' shows the balance + spend button; 'buy' shows the packs.
  const [view, setView] = useState<'use' | 'buy'>('use');
  const [pack, setPack] = useState<BoostPack>('single');
  const [pending, setPending] = useState(false);

  const boosted = isBoosted(event);
  const hoursLeft = boostHoursLeft(event);

  const {
    data: credits = 0,
    isFetching: creditsLoading,
    refetch: refetchCredits,
  } = useQuery({
    queryKey: ['boostCredits', user?.id],
    queryFn: () => getBoostCredits(user!.id),
    enabled: !!user && !boosted,
  });

  function openSheet() {
    setOpen(true);
    // Always re-read the balance on open — it can change outside this screen
    // (a purchase elsewhere, a manual grant) and the cached value may be stale.
    refetchCredits().then((r) => setView((r.data ?? 0) > 0 ? 'use' : 'buy'));
  }

  async function handleUse() {
    if (pending) return;
    setPending(true);
    try {
      await spendBoost(event.id);
      queryClient.invalidateQueries({ queryKey: ['boostCredits'] });
      setOpen(false);
      onBoosted();
    } catch (e) {
      showError(e, 'Could not boost');
    } finally {
      setPending(false);
    }
  }

  async function handleBuy() {
    if (pending) return;
    setPending(true);
    try {
      const ok = await purchaseBoostPack(pack);
      if (ok) {
        await queryClient.invalidateQueries({ queryKey: ['boostCredits'] });
        // Straight into spending what they just bought.
        setView('use');
      } else {
        // ExpoIap isn't in this binary yet (see project constraints) — buying
        // packs will work after the next native rebuild.
        Alert.alert(
          'Boosts coming soon',
          'In-app payments activate in the next app update. For now, boosts can be granted manually.'
        );
      }
    } catch (e) {
      if (e instanceof PurchaseCancelled) return; // user backed out
      Alert.alert('Purchase failed', 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  if (boosted) {
    return (
      <View style={styles.activeCard}>
        <View style={styles.activeHeader}>
          <Text style={styles.activeTitle}>
            {BOOST_EMOJI} Boosted
          </Text>
          <View style={styles.timePill}>
            <Text style={styles.timePillText}>
              {hoursLeft}h left
            </Text>
          </View>
        </View>
        <Text style={styles.activeSub}>
          Your event is top of the map, Explore and the swipe deck.
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{event.participant_count}</Text>
            <Text style={styles.statLabel}>going</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statNum}>{saversCount}</Text>
            <Text style={styles.statLabel}>wishlisted</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      <PressableScale
        scaleTo={0.98}
        style={styles.card}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel="Boost this event"
      >
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{BOOST_EMOJI}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Boost event</Text>
          <Text style={styles.sub}>
            Top of the map, Explore & cards for {BOOST_HOURS}h
          </Text>
        </View>
        {credits > 0 ? (
          <View style={styles.creditsPill}>
            <Text style={styles.creditsPillText}>×{credits}</Text>
          </View>
        ) : (
          <Icon name="chevronRight" size={18} color={BOOST_ACCENT} />
        )}
      </PressableScale>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => !pending && setOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetIcon}>
              <Text style={styles.sheetIconEmoji}>{BOOST_EMOJI}</Text>
            </View>

            {creditsLoading ? (
              <ActivityIndicator color={BOOST_ACCENT} style={{ marginVertical: 24 }} />
            ) : view === 'use' ? (
              <>
                <Text style={styles.sheetTitle}>
                  You have {credits} boost{credits === 1 ? '' : 's'}
                </Text>
                <Text style={styles.sheetSub}>
                  Use 1 boost to put this event on top of the map, Explore and
                  the swipe deck for {BOOST_HOURS} hours.
                </Text>
                <Button
                  variant="primary"
                  label="Use 1 boost"
                  onPress={handleUse}
                  loading={pending}
                  style={styles.sheetBtn}
                />
                <TouchableOpacity
                  onPress={() => setView('buy')}
                  hitSlop={8}
                  disabled={pending}
                >
                  <Text style={styles.link}>Buy more boosts</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>
                  {credits > 0 ? 'Buy more boosts' : "You're out of boosts"}
                </Text>
                <Text style={styles.sheetSub}>
                  Boosts put your events on top of the map, Explore and the
                  swipe deck for {BOOST_HOURS} hours each.
                </Text>
                <View style={styles.packs}>
                  {BOOST_PACKS.map((p) => {
                    const sel = pack === p.id;
                    return (
                      <PressableScale
                        key={p.id}
                        scaleTo={0.97}
                        style={[styles.pack, sel && styles.packSel]}
                        onPress={() => setPack(p.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.packLabel, sel && styles.packLabelSel]}>
                            {p.label}
                          </Text>
                          {p.note && <Text style={styles.packNote}>{p.note}</Text>}
                        </View>
                        <Text style={[styles.packPrice, sel && styles.packLabelSel]}>
                          ₹{p.price}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
                <Button
                  variant="primary"
                  label={`Buy for ₹${BOOST_PACKS.find((p) => p.id === pack)!.price}`}
                  onPress={handleBuy}
                  loading={pending}
                  style={styles.sheetBtn}
                />
                {credits > 0 && (
                  <TouchableOpacity
                    onPress={() => setView('use')}
                    hitSlop={8}
                    disabled={pending}
                  >
                    <Text style={styles.link}>
                      Use one of my {credits} boost{credits === 1 ? '' : 's'}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BOOST_ACCENT,
    padding: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: BOOST_TINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  title: {
    fontFamily: FONTS.heavy,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  sub: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    lineHeight: 16,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  creditsPill: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 100,
    backgroundColor: BOOST_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditsPillText: {
    fontFamily: FONTS.heavy,
    fontSize: 13,
    color: '#fff',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,24,44,0.45)',
    justifyContent: 'center',
    padding: 28,
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  sheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BOOST_TINT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  sheetIconEmoji: { fontSize: 26 },
  sheetTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 18,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  sheetSub: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  sheetBtn: { alignSelf: 'stretch', marginTop: 16 },
  link: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: BOOST_ACCENT,
    marginTop: 14,
  },
  packs: { alignSelf: 'stretch', gap: 8, marginTop: 16 },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  packSel: {
    borderColor: BOOST_ACCENT,
    backgroundColor: BOOST_TINT,
  },
  packLabel: {
    fontFamily: FONTS.bold,
    fontSize: 14.5,
    color: COLORS.textPrimary,
  },
  packLabelSel: { color: BOOST_ACCENT },
  packNote: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.success,
    marginTop: 1,
  },
  packPrice: {
    fontFamily: FONTS.heavy,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  activeCard: {
    backgroundColor: BOOST_TINT,
    borderRadius: 18,
    padding: 15,
    gap: 10,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeTitle: {
    fontFamily: FONTS.heavy,
    fontSize: 16,
    color: BOOST_ACCENT,
  },
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(255,106,43,0.18)',
  },
  timePillText: {
    fontFamily: FONTS.bold,
    fontSize: 11.5,
    color: BOOST_ACCENT,
  },
  activeSub: {
    fontFamily: FONTS.medium,
    fontSize: 12.5,
    lineHeight: 17,
    color: COLORS.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statNum: {
    fontFamily: FONTS.heavy,
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(15,24,44,0.08)',
  },
});
