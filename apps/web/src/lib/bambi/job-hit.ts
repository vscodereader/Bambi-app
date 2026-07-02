import type { Job } from "./types";

// Hit 임계값 — 의미 있는 상수로 분리한다.
export const HIT_DETAIL_VIEWS_THRESHOLD = 100;
export const HIT_IMPRESSIONS_THRESHOLD = 200;
export const HIT_CTR_THRESHOLD = 0.12;

// 최근 7일 metrics로 Hit 여부를 계산한다(seed/DB에 boolean으로 저장하지 않음).
export const isJobHit = (job: Pick<Job, "performance">): boolean => {
	const performance = job.performance;

	if (!performance) {
		return false;
	}

	// 조건 A: 상세 조회수 단독(impressions와 독립, impressions가 0이어도 판정).
	if (performance.detailViews >= HIT_DETAIL_VIEWS_THRESHOLD) {
		return true;
	}

	// 조건 B: 충분한 노출 + 높은 CTR. impressions>=200 보장이라 0으로 나누지 않는다.
	if (performance.impressions >= HIT_IMPRESSIONS_THRESHOLD) {
		return (
			performance.detailViews / performance.impressions >= HIT_CTR_THRESHOLD
		);
	}

	return false;
};

export type ExposureTone = "organic" | "recommended" | "special" | "urgent";
export type HitRibbonTone = "recommended" | "special" | "urgent";

const HIT_RIBBON_TONES: readonly HitRibbonTone[] = [
	"special",
	"urgent",
	"recommended",
];

const isHitRibbonTone = (tone: ExposureTone): tone is HitRibbonTone =>
	(HIT_RIBBON_TONES as readonly string[]).includes(tone);

// organic에는 리본 없음. special/urgent/recommended이고 Hit일 때만 표시.
export const shouldShowHitRibbon = (
	job: Pick<Job, "performance">,
	tone: ExposureTone
): boolean => isHitRibbonTone(tone) && isJobHit(job);

// 섹션 테두리 tone과 일치하는 리본 색(고정 보라색 금지, 텍스트 대비 확보).
export const HIT_RIBBON_CLASS_BY_TONE: Record<HitRibbonTone, string> = {
	recommended: "bg-sky-500 text-white",
	special: "bg-coral-500 text-white",
	urgent: "bg-amber-500 text-ink-900",
};
