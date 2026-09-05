import type { GoalMilestone } from './types';

/**
 * Convert authored milestone state into display progress.
 * Numeric word targets can move automatically; milestones without one stay
 * intentionally writer-controlled through their explicit status.
 */
export function milestoneProgress(milestone: GoalMilestone, currentWords: number): number {
  // TODO(learning): Tune policy if automatic word progress should outrank manual status.
  if (milestone.status === 'completed') return 100;
  if (milestone.targetWords && milestone.targetWords > 0) {
    return Math.min(99, Math.round((currentWords / milestone.targetWords) * 100));
  }
  return milestone.status === 'in_progress' ? 50 : 0;
}
