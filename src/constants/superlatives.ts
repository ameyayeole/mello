import { SuperlativeCategory } from '@/types/models';

export interface Superlative {
  id: SuperlativeCategory;
  label: string;
  emoji: string;
  hint: string;
}

// The four post-event awards. Ids are mirrored in the SQL CHECK constraint
// (migration 032) — change both together.
export const SUPERLATIVES: Superlative[] = [
  { id: 'mvp',             label: 'MVP of the night',        emoji: '🏆', hint: 'Carried the whole plan' },
  { id: 'first_to_arrive', label: 'First to arrive',         emoji: '⏰', hint: 'There before the host' },
  { id: 'next_host',       label: 'Most likely to host next', emoji: '📍', hint: 'Already planning round two' },
  { id: 'best_vibes',      label: 'Best vibes',              emoji: '✨', hint: 'Made everyone feel welcome' },
];

export const SUPERLATIVE_MAP = Object.fromEntries(
  SUPERLATIVES.map((s) => [s.id, s])
) as Record<SuperlativeCategory, Superlative>;
