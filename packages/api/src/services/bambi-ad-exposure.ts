// 광고 상품의 미리보기 템플릿(preview_template)을 공고 노출 타입(exposure_type)으로
// 변환하는 단일 소스. 운영자가 등록한 광고 상품이 어떤 노출 영역을 구동하는지 서버에서
// 도출할 때 사용한다.

export type AdPreviewTemplate =
	| "premium-top"
	| "special-list"
	| "urgent-list"
	| "recommended-list"
	| "side-vertical"
	| "side-horizontal"
	| "none";

export type JobExposureType =
	| "premium-banner"
	| "left-banner"
	| "right-banner"
	| "special"
	| "urgent"
	| "recommended"
	| "standard";

const PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE: Record<
	AdPreviewTemplate,
	JobExposureType
> = {
	none: "standard",
	"premium-top": "premium-banner",
	"recommended-list": "recommended",
	"side-horizontal": "left-banner",
	"side-vertical": "right-banner",
	"special-list": "special",
	"urgent-list": "urgent",
};

export function previewTemplateToExposureType(
	template: AdPreviewTemplate
): JobExposureType {
	return PREVIEW_TEMPLATE_TO_EXPOSURE_TYPE[template] ?? "standard";
}

export const LISTING_SECTION_EXPOSURE_TYPES = [
	"special",
	"urgent",
	"recommended",
] as const;
export type ListingSectionExposureType =
	(typeof LISTING_SECTION_EXPOSURE_TYPES)[number];

export const AD_BANNER_EXPOSURE_TYPES = [
	"premium-banner",
	"left-banner",
	"right-banner",
] as const;
export type AdBannerExposureType = (typeof AD_BANNER_EXPOSURE_TYPES)[number];

export const EXPOSURE_SECTION_LIMITS: Record<
	ListingSectionExposureType,
	number
> = { recommended: 10, special: 5, urgent: 6 };

export const AD_BANNER_SLOT_LIMITS: Record<AdBannerExposureType, number> = {
	"left-banner": 3,
	"premium-banner": 4,
	"right-banner": 3,
};

export const EXPOSURE_TYPE_LABELS: Record<JobExposureType, string> = {
	"left-banner": "좌측 배너",
	"premium-banner": "프리미엄 배너",
	"right-banner": "우측 배너",
	recommended: "추천 채용",
	special: "스페셜 채용",
	standard: "일반 구인",
	urgent: "급구 채용",
};

// 유료 노출이 아직 유효한가 — 만료일이 없으면(운영자가 기간 없이 결제 처리 등) 유효로 본다.
export const isExposureActive = (
	exposureEndsAt: Date | null,
	now: Date
): boolean =>
	exposureEndsAt === null || exposureEndsAt.getTime() > now.getTime();

export interface ExposureSectionRow {
	exposureEndsAt: Date | null;
	exposureType: string;
	id: string;
	publishedAt: Date | null;
	status: string;
}

export interface ExposureJobSections<TRow extends ExposureSectionRow> {
	organic: TRow[];
	recommended: TRow[];
	special: TRow[];
	urgent: TRow[];
}

// 유료 리스팅 섹션(스페셜/급구/추천)을 확정하고, 섹션에 든 공고는 organic에서 제외한다.
// 만료된 유료 공고는 섹션에서 빠져 organic으로 강등된다(공고 자체는 계속 게시).
export const buildExposureJobSections = <TRow extends ExposureSectionRow>({
	limit,
	now,
	organicRows,
	recommendedRows,
	specialRows,
	urgentRows,
}: {
	limit: number;
	now: Date;
	organicRows: TRow[];
	recommendedRows: TRow[];
	specialRows: TRow[];
	urgentRows: TRow[];
}): { sections: ExposureJobSections<TRow>; totalCount: number } => {
	const activeSection = (
		rows: TRow[],
		type: ListingSectionExposureType
	): TRow[] =>
		rows
			.filter(
				(item) =>
					item.exposureType === type &&
					item.status === "published" &&
					isExposureActive(item.exposureEndsAt, now)
			)
			.slice(0, EXPOSURE_SECTION_LIMITS[type]);

	const special = activeSection(specialRows, "special");
	const urgent = activeSection(urgentRows, "urgent");
	const recommended = activeSection(recommendedRows, "recommended");
	const sectionJobIds = new Set(
		[...special, ...urgent, ...recommended].map((item) => item.id)
	);
	const organicLimit = Math.max(0, limit - sectionJobIds.size);
	const organic = organicRows
		.filter(
			(item) => item.status === "published" && !sectionJobIds.has(item.id)
		)
		.slice(0, organicLimit);

	return {
		sections: { organic, recommended, special, urgent },
		totalCount:
			special.length + urgent.length + recommended.length + organic.length,
	};
};

export interface AdBannerRow {
	exposureEndsAt: Date | null;
	exposureType: string;
	id: string;
}

// 결제완료된 배너형 공고를 노출 위치별로 슬롯 한도까지 그룹핑한다.
export const groupAdBannerJobs = <TRow extends AdBannerRow>(
	rows: TRow[],
	now: Date
): { leftBanner: TRow[]; premiumBanner: TRow[]; rightBanner: TRow[] } => {
	const pick = (type: AdBannerExposureType): TRow[] =>
		rows
			.filter(
				(item) =>
					item.exposureType === type &&
					isExposureActive(item.exposureEndsAt, now)
			)
			.slice(0, AD_BANNER_SLOT_LIMITS[type]);

	return {
		leftBanner: pick("left-banner"),
		premiumBanner: pick("premium-banner"),
		rightBanner: pick("right-banner"),
	};
};
