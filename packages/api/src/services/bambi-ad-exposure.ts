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

// 유료 리스팅 섹션(스페셜/급구/추천)을 확정한다. 섹션에 든 공고도 전체 공고(organic)에
// 함께 담겨 중복 노출된다 — 광고 상품을 적용해도 전체 공고 목록에서 빠지지 않는다.
// 슬롯 상한 없이 결제완료·미만료 매칭 공고를 전부 노출한다(그리드가 다음 행으로 확장).
// 만료된 유료 공고는 섹션에서 빠져 organic에만 남는다(공고 자체는 계속 게시).
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
		rows.filter(
			(item) =>
				item.exposureType === type &&
				item.status === "published" &&
				isExposureActive(item.exposureEndsAt, now)
		);

	const special = activeSection(specialRows, "special");
	const urgent = activeSection(urgentRows, "urgent");
	const recommended = activeSection(recommendedRows, "recommended");
	const sectionJobIds = new Set(
		[...special, ...urgent, ...recommended].map((item) => item.id)
	);
	// 전체 공고에는 광고 상품 적용 여부와 무관하게 게시된 공고를 모두 담는다
	// (유료 섹션과 중복 노출). 유료 공고가 앞자리를 차지해 무료 공고가 상한에
	// 밀리지 않도록 organic 한도를 유료 섹션 크기만큼 늘린다.
	const organic = organicRows
		.filter((item) => item.status === "published")
		.slice(0, limit + sectionJobIds.size);

	return {
		sections: { organic, recommended, special, urgent },
		// 유료 공고는 섹션과 전체 공고에 동시에 담기므로 고유 id로 센다.
		totalCount: new Set(
			[...special, ...urgent, ...recommended, ...organic].map((item) => item.id)
		).size,
	};
};

export interface AdBannerRow {
	exposureEndsAt: Date | null;
	exposureType: string;
	id: string;
}

// 좌/우 사이드 배너의 위치별 최대 슬롯 수. 사이드 레일 공간이 유한해 정렬(호출부에서
// publishedAt desc)상 앞에서부터 이 수만큼만 노출한다. 프리미엄 배너는 상한 없이 유지한다.
export const SIDE_BANNER_MAX_SLOTS = 3;

// 결제완료된 배너형 공고를 노출 위치별로 그룹핑한다. 활성(미만료) 배너 공고 중 좌/우 사이드
// 배너는 각각 최대 SIDE_BANNER_MAX_SLOTS개까지만(정렬상 앞에서부터) 노출하고, 프리미엄은
// 상한 없이 전부 포함한다(프리미엄은 다음 행으로 확장).
export const groupAdBannerJobs = <TRow extends AdBannerRow>(
	rows: TRow[],
	now: Date
): { leftBanner: TRow[]; premiumBanner: TRow[]; rightBanner: TRow[] } => {
	const pick = (type: AdBannerExposureType, maxSlots?: number): TRow[] => {
		const matched = rows.filter(
			(item) =>
				item.exposureType === type && isExposureActive(item.exposureEndsAt, now)
		);
		return maxSlots === undefined ? matched : matched.slice(0, maxSlots);
	};

	return {
		leftBanner: pick("left-banner", SIDE_BANNER_MAX_SLOTS),
		premiumBanner: pick("premium-banner"),
		rightBanner: pick("right-banner", SIDE_BANNER_MAX_SLOTS),
	};
};
