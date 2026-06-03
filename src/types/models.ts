export type ActivityId =
  | 'coffee'
  | 'gym'
  | 'drinks'
  | 'trekking'
  | 'study'
  | 'music'
  | 'parties'
  | 'gaming';

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export type NotificationType =
  | 'friend_request'
  | 'join_request'
  | 'join_approved'
  | 'event_update'
  | 'new_message'
  | 'event_starting_soon'
  | 'friend_joined_event';

export type ParticipantStatus = 'pending' | 'approved';

export interface Profile {
  id: string;
  name: string;
  photo_url: string | null;
  age: number | null;
  bio: string | null;
  city: string | null;
  interests: ActivityId[];
  events_hosted: number;
  friends_count: number;
  is_ghost_mode: boolean;
  expo_push_token: string | null;
  last_seen: string;
  created_at: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface NearbyEvent {
  id: string;
  host_id: string;
  activity: ActivityId;
  title: string;
  description: string | null;
  location_name: string | null;
  starts_at: string;
  ends_at: string | null;
  max_people: number | null;
  is_public: boolean;
  requires_approval: boolean;
  distance_m: number;
  participant_count: number;
  lat: number;
  lng: number;
  host?: Profile;
}

export interface EventParticipant extends Profile {
  status: ParticipantStatus;
}

export interface EventDetail extends NearbyEvent {
  // All participants (both approved and pending). The UI splits these.
  participants: EventParticipant[];
}

export interface Message {
  id: string;
  event_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'system' | 'location';
  created_at: string;
  sender?: Profile;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  created_at: string;
  updated_at: string;
  friend?: Profile;
}

export interface Notification {
  id: string;
  recipient_id: string;
  sender_id: string | null;
  type: NotificationType;
  event_id: string | null;
  is_read: boolean;
  payload: Record<string, unknown>;
  created_at: string;
  sender?: Profile;
  event?: NearbyEvent;
}
