import { useRef } from 'react';

// Counts renders of the component that calls it and logs each one to Metro.
//
// Temporary instrumentation for the create-event perf pass — see
// docs/superpowers/specs/2026-08-03-create-event-flow-perf-design.md. It exists
// because "this re-renders too much" is a hypothesis until it has a number
// against it, and two earlier audits in this repo were wrong for exactly that
// reason.
//
// Reads as a stream rather than a total: perform one interaction, count the new
// lines. That needs no reset call, which matters because the measurement is
// taken on a device with no console to type into.
//
// Compiled out of release builds. `__DEV__` is a literal for the minifier, so
// the whole body drops rather than merely not running.
export function useRenderCount(name: string) {
  const n = useRef(0);
  if (__DEV__) {
    // Touching a ref during render is impure, and deliberately so: a commit-time
    // effect would miss renders that bail out before committing, which are
    // precisely the wasted ones this is looking for. There is no StrictMode in
    // this app, so renders are not doubled and the count is the true one.
    //
    // The lint rule is right in general and wrong here — measuring renders is
    // the one job that has to happen in the render phase. Disabled with a reason
    // rather than worked around, because every trick that satisfies the rule
    // (a state box, a module-level map) is the same mutation wearing a hat.
    /* eslint-disable react-hooks/refs */
    n.current += 1;
    console.log(`[render] ${name} #${n.current}`);
    /* eslint-enable react-hooks/refs */
  }
}
