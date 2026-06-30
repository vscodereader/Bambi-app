import type { Job, MarketplaceJobSections } from "./types";

export interface VisualJobExposureSections {
	organic: Job[];
	recommended: Job[];
	special: Job[];
	urgent: Job[];
}

const getBoostTime = (job: Job): number => {
	if (!job.lastBoostedAt) {
		return 0;
	}

	const value = new Date(job.lastBoostedAt).getTime();
	return Number.isFinite(value) ? value : 0;
};

export const getVisualJobExposureSections = (
	sections: MarketplaceJobSections
): VisualJobExposureSections => {
	const promotedJobs = [...sections.premium, ...sections.recommended];
	const urgent = promotedJobs
		.filter((job) => getBoostTime(job) > 0)
		.toSorted((left, right) => getBoostTime(right) - getBoostTime(left))
		.slice(0, 6);

	return {
		organic: sections.organic,
		recommended: sections.recommended,
		special: sections.premium,
		urgent,
	};
};
