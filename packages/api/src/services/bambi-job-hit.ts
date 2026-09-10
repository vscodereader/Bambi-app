export const HIT_DETAIL_VIEWS_THRESHOLD = 100;
export const HIT_IMPRESSIONS_THRESHOLD = 200;
export const HIT_CTR_THRESHOLD = 0.12;

export interface JobPerformance {
	detailViews: number;
	impressions: number;
}

export const isJobHit = (
	performance: JobPerformance | null | undefined
): boolean => {
	if (!performance) {
		return false;
	}
	if (performance.detailViews >= HIT_DETAIL_VIEWS_THRESHOLD) {
		return true;
	}
	return (
		performance.impressions >= HIT_IMPRESSIONS_THRESHOLD &&
		performance.detailViews / performance.impressions >= HIT_CTR_THRESHOLD
	);
};

export const shouldShowHitRibbon = (
	performance: JobPerformance | null | undefined,
	section: "organic" | "recommended" | "special" | "urgent"
): boolean => section !== "organic" && isJobHit(performance);
