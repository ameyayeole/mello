import { ActivityId } from '@/types/models';

export interface Activity {
  id: ActivityId;
  label: string;
  emoji: string;
  gradient: [string, string];
}

export const ACTIVITIES: Activity[] = [
  { id: 'coffee',   label: 'Coffee',   emoji: '☕', gradient: ['#FF5E5B', '#FF8E8B'] },
  { id: 'gym',      label: 'Gym',      emoji: '💪', gradient: ['#950952', '#C74876'] },
  { id: 'drinks',   label: 'Drinks',   emoji: '🍸', gradient: ['#0F182C', '#2A3548'] },
  { id: 'trekking', label: 'Trekking', emoji: '🥾', gradient: ['#FF5E5B', '#950952'] },
  { id: 'study',    label: 'Study',    emoji: '📚', gradient: ['#950952', '#0F182C'] },
  { id: 'music',    label: 'Music',    emoji: '🎵', gradient: ['#FF5E5B', '#C74876'] },
  { id: 'parties',  label: 'Party',    emoji: '🎉', gradient: ['#FF8E8B', '#FF5E5B'] },
  { id: 'gaming',   label: 'Gaming',   emoji: '🎮', gradient: ['#950952', '#0F182C'] },
];

export const ACTIVITY_MAP = Object.fromEntries(
  ACTIVITIES.map((a) => [a.id, a])
) as Record<ActivityId, Activity>;
