import { IconName } from '@/components/ui';

// Per-type icon + accent used by the notifications tab rows and the in-app
// banner, so a notification looks the same everywhere it appears.
export const NOTIFICATION_ICONS: Record<
  string,
  { icon: IconName; color: string; tint: string }
> = {
  friend_request: { icon: 'userPlus', color: '#1FA463', tint: 'rgba(31,164,99,0.12)' },
  friend_accepted: { icon: 'check', color: '#1FA463', tint: 'rgba(31,164,99,0.12)' },
  join_request: { icon: 'user', color: '#FF5E5B', tint: '#FFF0EF' },
  join_approved: { icon: 'check', color: '#1FA463', tint: 'rgba(31,164,99,0.12)' },
  event_update: { icon: 'bell', color: '#7C5CE0', tint: '#F0ECFC' },
  new_message: { icon: 'chat', color: '#FF5E5B', tint: '#FFF0EF' },
  event_starting_soon: { icon: 'clock', color: '#FF5E5B', tint: '#FFF0EF' },
  friend_joined_event: { icon: 'heart', color: '#D6478E', tint: '#FBE7F1' },
  event_boosted: { icon: 'pin', color: '#FF6A2B', tint: '#FFEDE3' },
  host_announcement: { icon: 'megaphone', color: '#E8940A', tint: '#FFF6E9' },
  mention: { icon: 'chat', color: '#4F7DF9', tint: '#EDF2FE' },
  // Post-event wrap (migration 032)
  wrap_ready: { icon: 'camera', color: '#FF5E5B', tint: '#FFF0EF' },
  note_received: { icon: 'chat', color: '#D6478E', tint: '#FBE7F1' },
  photo_liked: { icon: 'heart', color: '#FF5E5B', tint: '#FFF0EF' },
  photo_commented: { icon: 'chat', color: '#4F7DF9', tint: '#EDF2FE' },
  encore_requested: { icon: 'refresh', color: '#1FA463', tint: 'rgba(31,164,99,0.12)' },
};
