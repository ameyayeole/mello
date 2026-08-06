// The shapes. They live here rather than in `ui/` because they are not
// primitives — each one mirrors a specific component, and they span three
// features (community, chat, profile). Keeping them in one folder is what makes
// it obvious that a shape already exists before someone writes a seventh.
//
// The engine they are built from — `SkeletonGroup` and `SkeletonBone` — is in
// `ui/Skeleton.tsx`, since that part *is* a primitive.
export { default as SkeletonPersonRow } from './SkeletonPersonRow';
export { default as SkeletonChatRow } from './SkeletonChatRow';
export { default as SkeletonPostCard } from './SkeletonPostCard';
export { default as SkeletonNotifRow } from './SkeletonNotifRow';
export { default as SkeletonEventCard } from './SkeletonEventCard';
export { default as SkeletonBubble } from './SkeletonBubble';
