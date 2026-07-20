// The Supabase client reads these at import time, and a missing URL throws
// before a single test runs. The values are never dialled — every test that
// touches the network mocks the client — they only have to be well-formed.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

// Deliberately NOT importing react-native-reanimated here. Reanimated 4
// initialises its native worklets runtime on import and throws under Jest, so
// pulling it in globally would break every suite — including the pure ones that
// never touch animation. Component tests will need a worklets mock of their
// own; that is a separate problem from testing utils and services.

// React 19 refuses to flush updates inside act() unless this is set, and
// without a flush the hook under test never commits — which surfaces as every
// test after the first one timing out, not as an obvious error.
// @ts-ignore -- global test-only flag
global.IS_REACT_ACT_ENVIRONMENT = true;
