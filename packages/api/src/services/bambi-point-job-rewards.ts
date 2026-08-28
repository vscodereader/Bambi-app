const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export const adjustPointJobCooldown = (
	cooldownUntil: Date,
	now: Date,
	newRotationHours: number
): Date => {
	const reduction = newRotationHours * MILLISECONDS_PER_HOUR;
	return cooldownUntil.getTime() <= now.getTime() + reduction
		? now
		: new Date(cooldownUntil.getTime() - reduction);
};

export const pointJobRewardNextEligibleAt = (
	lastRewardedAt: Date | null,
	rotationHours: number
): Date | null =>
	lastRewardedAt
		? new Date(lastRewardedAt.getTime() + rotationHours * MILLISECONDS_PER_HOUR)
		: null;

export const isPointJobRewardEligible = (
	cooldownUntil: Date | null,
	now: Date
): boolean => cooldownUntil === null || cooldownUntil <= now;

export const isPointJobSelectionActive = (
	selectedAt: Date,
	rotationHours: number,
	now: Date
): boolean =>
	selectedAt.getTime() + rotationHours * MILLISECONDS_PER_HOUR > now.getTime();

export const pickPointJobCandidate = <T>(
	candidates: readonly T[],
	randomValue: number
): T | null => {
	if (candidates.length === 0) {
		return null;
	}
	const normalized = Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON);
	return candidates[Math.floor(normalized * candidates.length)] ?? null;
};
export const POINT_JOB_REWARD_CATEGORIES = [
	"premium",
	"special",
	"recommended",
] as const;
export type PointJobRewardCategory =
	(typeof POINT_JOB_REWARD_CATEGORIES)[number];
