import { ActivityId } from '@/types/models';

export type SectionId =
  | 'nightlife'
  | 'music'
  | 'sports'
  | 'wellness'
  | 'food'
  | 'outdoors'
  | 'creative'
  | 'social'
  | 'play';

export interface Section {
  id: SectionId;
  label: string;
}

// Display order of sections in the picker.
export const SECTIONS: Section[] = [
  { id: 'nightlife', label: 'Nightlife & Parties' },
  { id: 'music',     label: 'Music & Live' },
  { id: 'sports',    label: 'Sports' },
  { id: 'wellness',  label: 'Wellness' },
  { id: 'food',      label: 'Food & Drinks' },
  { id: 'outdoors',  label: 'Outdoors & Travel' },
  { id: 'creative',  label: 'Creative & Culture' },
  { id: 'social',    label: 'Social & Growth' },
  { id: 'play',      label: 'Play' },
];

export interface Activity {
  id: ActivityId;
  label: string;
  emoji: string;
  section: SectionId;
  gradient: [string, string];
}

export const ACTIVITIES: Activity[] = [
  // Nightlife & Parties
  { id: 'parties',      label: 'Party',        emoji: '🎉', section: 'nightlife', gradient: ['#FF8E8B', '#FF5E5B'] },
  { id: 'drinks',       label: 'Drinks',       emoji: '🍸', section: 'nightlife', gradient: ['#0F182C', '#2A3548'] },
  { id: 'house_party',  label: 'House Party',  emoji: '🏠', section: 'nightlife', gradient: ['#FF8E8B', '#D6478E'] },
  { id: 'club_night',   label: 'Club Night',   emoji: '🪩', section: 'nightlife', gradient: ['#D6478E', '#7C5CE0'] },
  { id: 'boiler_room',  label: 'Boiler Room',  emoji: '🎧', section: 'nightlife', gradient: ['#7C5CE0', '#0F182C'] },
  { id: 'karaoke',      label: 'Karaoke',      emoji: '🎤', section: 'nightlife', gradient: ['#FF5E5B', '#D6478E'] },

  // Music & Live
  { id: 'music',        label: 'Music',        emoji: '🎵', section: 'music', gradient: ['#FF5E5B', '#C74876'] },
  { id: 'live_gig',     label: 'Live Gig',     emoji: '🎸', section: 'music', gradient: ['#C74876', '#7C5CE0'] },
  { id: 'open_mic',     label: 'Open Mic',     emoji: '🎙️', section: 'music', gradient: ['#7C5CE0', '#C74876'] },
  { id: 'jam_session',  label: 'Jam',          emoji: '🥁', section: 'music', gradient: ['#FF8E8B', '#7C5CE0'] },
  { id: 'standup',      label: 'Comedy',       emoji: '😂', section: 'music', gradient: ['#FF5E5B', '#7C5CE0'] },
  { id: 'concert',      label: 'Concert',      emoji: '🎫', section: 'music', gradient: ['#7C5CE0', '#0F182C'] },
  { id: 'dj_set',       label: 'DJ Set',       emoji: '🎚️', section: 'music', gradient: ['#C74876', '#0F182C'] },

  // Sports
  { id: 'cricket',      label: 'Cricket',      emoji: '🏏', section: 'sports', gradient: ['#2A6FDB', '#0F182C'] },
  { id: 'football',     label: 'Football',     emoji: '⚽', section: 'sports', gradient: ['#1FA463', '#0F182C'] },
  { id: 'badminton',    label: 'Badminton',    emoji: '🏸', section: 'sports', gradient: ['#2A6FDB', '#1FA463'] },
  { id: 'volleyball',   label: 'Volleyball',   emoji: '🏐', section: 'sports', gradient: ['#C8791E', '#2A6FDB'] },
  { id: 'basketball',   label: 'Basketball',   emoji: '🏀', section: 'sports', gradient: ['#C8791E', '#FF5E5B'] },
  { id: 'table_tennis', label: 'Table Tennis', emoji: '🏓', section: 'sports', gradient: ['#2A6FDB', '#C74876'] },
  { id: 'tennis',       label: 'Tennis',       emoji: '🎾', section: 'sports', gradient: ['#1FA463', '#2A6FDB'] },
  { id: 'running',      label: 'Running',      emoji: '🏃', section: 'sports', gradient: ['#2A6FDB', '#7C5CE0'] },
  { id: 'cycling',      label: 'Cycling',      emoji: '🚴', section: 'sports', gradient: ['#1FA463', '#2A6FDB'] },
  { id: 'swimming',     label: 'Swimming',     emoji: '🏊', section: 'sports', gradient: ['#2A6FDB', '#0E8F8F'] },

  // Wellness
  { id: 'gym',          label: 'Gym',          emoji: '💪', section: 'wellness', gradient: ['#950952', '#C74876'] },
  { id: 'yoga',         label: 'Yoga',         emoji: '🧘', section: 'wellness', gradient: ['#1FA463', '#0E8F8F'] },
  { id: 'meditation',   label: 'Meditation',   emoji: '🌿', section: 'wellness', gradient: ['#0E8F8F', '#1FA463'] },

  // Food & Drinks
  { id: 'coffee',       label: 'Coffee',       emoji: '☕', section: 'food', gradient: ['#FF5E5B', '#FF8E8B'] },
  { id: 'food',         label: 'Food',         emoji: '🍽️', section: 'food', gradient: ['#FF8E8B', '#C8791E'] },
  { id: 'brunch',       label: 'Brunch',       emoji: '🥞', section: 'food', gradient: ['#C8791E', '#FF8E8B'] },

  // Outdoors & Travel
  { id: 'trekking',     label: 'Trekking',     emoji: '🥾', section: 'outdoors', gradient: ['#FF5E5B', '#950952'] },
  { id: 'camping',      label: 'Camping',      emoji: '🏕️', section: 'outdoors', gradient: ['#1FA463', '#950952'] },
  { id: 'beach',        label: 'Beach',        emoji: '🏖️', section: 'outdoors', gradient: ['#0E8F8F', '#C8791E'] },
  { id: 'road_trip',    label: 'Road Trip',    emoji: '🚗', section: 'outdoors', gradient: ['#C8791E', '#950952'] },

  // Creative & Culture
  { id: 'art',          label: 'Art',          emoji: '🎨', section: 'creative', gradient: ['#FF5E5B', '#7C5CE0'] },
  { id: 'photography',  label: 'Photo',        emoji: '📷', section: 'creative', gradient: ['#0F182C', '#7C5CE0'] },
  { id: 'dance',        label: 'Dance',        emoji: '💃', section: 'creative', gradient: ['#D6478E', '#FF5E5B'] },
  { id: 'movies',       label: 'Movies',       emoji: '🎬', section: 'creative', gradient: ['#0F182C', '#C74876'] },

  // Social & Growth
  { id: 'study',        label: 'Study',        emoji: '📚', section: 'social', gradient: ['#950952', '#0F182C'] },
  { id: 'volunteering', label: 'Volunteer',    emoji: '🙌', section: 'social', gradient: ['#1FA463', '#0E8F8F'] },
  { id: 'networking',   label: 'Network',      emoji: '🤝', section: 'social', gradient: ['#0E8F8F', '#0F182C'] },
  { id: 'book_club',    label: 'Book Club',    emoji: '📖', section: 'social', gradient: ['#0E8F8F', '#2A6FDB'] },
  { id: 'board_games',  label: 'Board Games',  emoji: '🎲', section: 'social', gradient: ['#7C5CE0', '#0E8F8F'] },

  // Play
  { id: 'gaming',       label: 'Gaming',       emoji: '🎮', section: 'play', gradient: ['#950952', '#0F182C'] },
];

export const ACTIVITY_MAP = Object.fromEntries(
  ACTIVITIES.map((a) => [a.id, a])
) as Record<ActivityId, Activity>;
