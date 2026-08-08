import { create } from 'zustand';

// The contribution flow's step pointer, and nothing else.
//
// A store rather than useState in the route, for the reason AGENTS.md gives
// about the create wizard: steps that read the pointer from a store can be
// memoised and stop re-rendering each other. Every step here owns a gesture
// deck or an upload queue, so that is not a micro-optimisation.
//
// Step DATA deliberately stays in React Query where it already lives. This
// store knows where you are, never what you typed.
export type WrapFlowStep = 'photos' | 'rate' | 'rewind' | 'feedback' | 'done';

// The host never rates their own event, so `feedback` drops out of their flow —
// the same split `wrapStepTotal` already encodes as `isHost ? 2 : 3`.
export function wrapFlowSteps(isHost: boolean): WrapFlowStep[] {
  return isHost
    ? ['photos', 'rate', 'rewind', 'done']
    : ['photos', 'rate', 'rewind', 'feedback', 'done'];
}

interface WrapFlowState {
  step: WrapFlowStep;
  eventId: string | null;
  isHost: boolean;
  // Which of the five 4:5 carousel slots is centred (Phase 2b). It lives here
  // rather than in a useState inside StepPhotos so the step keeps subscribing
  // to a store instead of holding local state — see AGENTS.md on the create
  // wizard.
  photoIndex: number;
  start: (eventId: string, isHost: boolean) => void;
  next: () => void;
  back: () => void;
  setPhotoIndex: (i: number) => void;
  reset: () => void;
}

const INITIAL = {
  step: 'photos' as WrapFlowStep,
  eventId: null,
  isHost: false,
  photoIndex: 0,
};

export const useWrapFlowStore = create<WrapFlowState>((set) => ({
  ...INITIAL,

  start: (eventId, isHost) => set({ ...INITIAL, eventId, isHost }),

  next: () =>
    set((s) => {
      const list = wrapFlowSteps(s.isHost);
      const i = list.indexOf(s.step);
      return { step: list[Math.min(i + 1, list.length - 1)] };
    }),

  back: () =>
    set((s) => {
      const list = wrapFlowSteps(s.isHost);
      const i = list.indexOf(s.step);
      return { step: list[Math.max(i - 1, 0)] };
    }),

  setPhotoIndex: (i) => set({ photoIndex: i }),

  reset: () => set({ ...INITIAL }),
}));
