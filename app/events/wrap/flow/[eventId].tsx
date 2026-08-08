import { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Loader, Screen, ScreenHeader } from '@/components/ui';
import { FlowProgress, FlowShell } from '@/components/wrap/flow/FlowShell';
import { useWrapFlowStore, wrapFlowSteps } from '@/stores/wrapFlowStore';
import { getEventDetail } from '@/services/events.service';
import { queryKeys } from '@/constants/queryKeys';
import { useAuthStore } from '@/stores/authStore';

// The contribution flow: photos, the people you met, rewind, how the event was.
// One route with a step pointer rather than four routes, so finishing feels
// like one journey and so a single `wrap_contributions` row can be written at
// the end — that row is what the gate counts (migration 075).
export default function WrapFlowScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const user = useAuthStore((s) => s.user);

  const step = useWrapFlowStore((s) => s.step);
  const start = useWrapFlowStore((s) => s.start);
  const reset = useWrapFlowStore((s) => s.reset);

  const eventQuery = useQuery({
    queryKey: queryKeys.eventDetail.of(eventId),
    queryFn: () => getEventDetail(eventId!),
    enabled: !!eventId,
  });
  const event = eventQuery.data;
  const isHost = !!event && !!user && event.host_id === user.id;

  // Start on mount, clear on unmount — otherwise opening a second event's flow
  // resumes wherever the first one was left.
  //
  // Depends on `event.id`, never on `event`. React Query hands back a new object
  // identity on every refetch, and a refetch mid-flow would re-run `start` and
  // throw the user back to step one. That failure needs a background refetch to
  // reproduce, so it will not show up while you are clicking through.
  const eventKey = event?.id;
  useEffect(() => {
    if (eventId && eventKey) start(eventId, isHost);
    return reset;
  }, [eventId, eventKey, isHost, start, reset]);

  const steps = useMemo(() => wrapFlowSteps(isHost), [isHost]);
  const index = steps.indexOf(step);

  if (eventQuery.isLoading || !event) {
    return (
      <Screen>
        <Loader inline />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Wrap it up"
        subtitle={event.title}
        backIcon="chevronDown"
        tone="transparent"
      />
      <FlowProgress total={steps.length} index={index} />
      <View style={{ flex: 1 }}>
        <FlowShell key={step}>
          {/* Replaced task by task — Tasks 5-8. */}
          <Text>{step}</Text>
        </FlowShell>
      </View>
    </Screen>
  );
}
