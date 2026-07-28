// 광고 상품의 미리보기 템플릿(preview_template)을 공고 노출 타입(exposure_type)으로
// 변환하는 단일 소스. 운영자가 등록한 광고 상품이 어떤 노출 영역을 구동하는지 서버에서
// 도출할 때 사용한다.
//
// 광고 상품 개편: 좌/우 사이드 배너 상품을 프리미엄 광고 하나로 통합했다. 프리미엄을 산
// 공고는 상단(가로)·좌측(가로)·우측(세로) 슬롯 모두의 노출 후보가 된다. 레거시 side 템플릿
// (side-horizontal/side-vertical) 상품 구매는 premium-banner로 흡수하고, DB enum 값
// (left-banner/right-banner, side-*)은 레거시 데이터 때문에 제거하지 않는다 — 통합은 전부
// 코드 레벨이다. 이미 left-banner/right-banner로 판매된 공고는 프리미엄 풀에 합류해 계속
// 노출한다(groupAdBannerJobs 참고).

import { isAdBannerImageRequired } from "./bambi-ad-banner-layout";

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
	// 레거시 side 상품 구매도 프리미엄으로 흡수한다(통합 후 신규 판매 경로는 premium-banner 하나).
	"side-horizontal": "premium-banner",
	"side-vertical": "premium-banner",
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

// 좌/우 사이드 배너의 위치별 최대 슬롯 수. 프리미엄은 1행 2열 고정이라 2개로 캡한다.
export const SIDE_BANNER_MAX_SLOTS = 3;
export const PREMIUM_BANNER_MAX_SLOTS = 2;

// 광고 배너 로테이션 기본 주기(분). 운영자가 사이트 설정에서 바꿀 수 있고, 미설정이면 이 값을 쓴다.
// 같은 버킷 안에서는 어떤 요청·인스턴스든 같은 결과를 돌려준다.
export const DEFAULT_AD_ROTATION_MINUTES = 60;
const DEFAULT_AD_ROTATION_INTERVAL_MS = DEFAULT_AD_ROTATION_MINUTES * 60 * 1000;

// 링 위치를 좌→중간(상단 프리미엄)→우 순서로 고정 배치한다. 좌측 3칸(base 0)·상단 2칸(base 3)·
// 우측 3칸(base 5)으로 총 8칸이며, 이 순서가 활성 칸이 전진하는 방향이다.
const LEFT_RING_BASE = 0;
const PREMIUM_RING_BASE = 3;
const RIGHT_RING_BASE = 5;
const TOTAL_RING_SLOTS = RIGHT_RING_BASE + SIDE_BANNER_MAX_SLOTS;

// 결제완료된 배너형 공고를 상단·좌·우 슬롯별로 그룹핑한다. 광고 통합 후 세 슬롯은 하나의
// 프리미엄 풀을 공유한다 — 후보 = exposureType이 배너 3종(AD_BANNER_EXPOSURE_TYPES) 중
// 하나이고 활성(미만료)인 공고 전체(레거시 left-banner/right-banner 공고 포함).
//
// 컨베이어(밀어내기) 순환: 한 광고는 언제나 정확히 한 칸에만 존재한다. 풀을 id 오름차순으로
// 정렬해 링 기준 순서를 고정하고(DB 정렬 순서 의존 제거), n개 광고를 길이 L=max(n,8)인 링에
// 얹어 매 버킷 전체가 한 칸씩 전진시킨다. 슬롯 s(0..7 = 좌0-2·중3-4·우5-7)의 광고는 pool[j],
// j=(((s−bucket) mod L)+L) mod L 이 n 미만이면, 아니면 null(대기 중, 호출부가 자리표시로 렌더).
// 각 광고는 좌1→좌2→좌3→중1→중2→우1→우2→우3까지 걸어간 뒤 화면에서 빠지고 L−8버킷 대기했다가
// 좌1로 재진입한다. n≥8이면 8칸 전부 서로 다른 광고가 동시 노출되고, n<8이면 등록순 연속 칸을
// 채운 "열차"가 함께 이동하며, n=1이면 그 광고가 슬롯 (bucket mod 8) 한 칸만 옮겨 다닌다. 같은
// 버킷이면 어느 인스턴스·요청이든 같은 결과다(다중 인스턴스 정합). 각 그룹은 고정 길이(좌3·중2·
// 우3) 배열이며 대기 칸은 null이다. 풀이 비면 전부 null이다.
export const groupAdBannerJobs = <TRow extends AdBannerRow>(
	rows: TRow[],
	now: Date,
	rotationIntervalMs: number = DEFAULT_AD_ROTATION_INTERVAL_MS
): {
	leftBanner: (TRow | null)[];
	premiumBanner: (TRow | null)[];
	rightBanner: (TRow | null)[];
} => {
	const interval =
		rotationIntervalMs > 0
			? rotationIntervalMs
			: DEFAULT_AD_ROTATION_INTERVAL_MS;
	const bucket = Math.floor(now.getTime() / interval);
	// 배너 3종 전부를 하나의 프리미엄 풀로 모으고 id로 정렬해 링 기준 순서를 고정한다.
	const bannerExposureTypes = new Set<string>(AD_BANNER_EXPOSURE_TYPES);
	const pool = rows
		.filter(
			(item) =>
				bannerExposureTypes.has(item.exposureType) &&
				isExposureActive(item.exposureEndsAt, now)
		)
		.sort((a, b) => a.id.localeCompare(b.id));
	const n = pool.length;

	const emptySlots = (count: number): (TRow | null)[] =>
		Array.from({ length: count }, () => null);
	const leftBanner = emptySlots(SIDE_BANNER_MAX_SLOTS);
	const premiumBanner = emptySlots(PREMIUM_BANNER_MAX_SLOTS);
	const rightBanner = emptySlots(SIDE_BANNER_MAX_SLOTS);

	if (n === 0) {
		return { leftBanner, premiumBanner, rightBanner };
	}

	// 컨베이어 링 길이(광고가 8개 미만이어도 8칸 링에 대기 자리를 둔다). 슬롯 s의 광고는
	// pool[j] (j=((s−bucket) mod ring)), j<n이면 노출·아니면 대기. now는 항상 양수라 모듈러는
	// 안전하지만 음수 안전형으로 감아 둔다.
	const ring = Math.max(n, TOTAL_RING_SLOTS);
	const place = (slots: (TRow | null)[], base: number): void => {
		for (let i = 0; i < slots.length; i++) {
			const s = base + i;
			const j = (((s - bucket) % ring) + ring) % ring;
			if (j < n) {
				slots[i] = pool[j] as TRow;
			}
		}
	};
	place(leftBanner, LEFT_RING_BASE);
	place(premiumBanner, PREMIUM_RING_BASE);
	place(rightBanner, RIGHT_RING_BASE);

	return { leftBanner, premiumBanner, rightBanner };
};

// 배너형 공고가 필요로 하는 광고 이미지 규격. 배너형 공고는 가로(상단·좌측 레일)와
// 세로(우측 레일) 두 규격을 모두 쓰므로 두 이미지가 모두 필요하다. 배너형이 아니면 없음.
export const requiredAdBannerUsagesForExposureType = (
	exposureType: string
): ("ad_horizontal" | "ad_vertical")[] =>
	(AD_BANNER_EXPOSURE_TYPES as readonly string[]).includes(exposureType)
		? ["ad_horizontal", "ad_vertical"]
		: [];

// usage(업로드 축) ↔ 후보 행의 이미지 컬럼 대응.
const AD_BANNER_MEDIA_KEY = {
	ad_horizontal: "adHorizontal",
	ad_vertical: "adVertical",
} as const;

// 활성 칸의 광고가 그 슬롯 방향(좌·중=가로 7:3 / 우=세로 4:9) 배너를 안 올렸으면 커버로
// 폴백하지 않고 그 칸을 비운다(자리표시). 노출도 impression 기록도 하지 않는다.
// 단, 그 슬롯 배경이 단색이면 업로드 이미지는 렌더에 쓰이지 않으므로 이미지 없이도 후보로
// 남긴다 — 여기서 떨어뜨리면 구인자가 저장까지 마친 단색 배너가 영영 노출되지 않는다.
export const requireDirectionImage = <
	Row extends {
		adHorizontal?: unknown;
		adVertical?: unknown;
		layout?: unknown;
	},
>(
	items: (Row | null)[],
	usage: "ad_horizontal" | "ad_vertical"
): (Row | null)[] =>
	items.map((item) => {
		if (!item) {
			return null;
		}

		const hasImage = Boolean(item[AD_BANNER_MEDIA_KEY[usage]]);

		return hasImage || !isAdBannerImageRequired(item.layout, usage)
			? item
			: null;
	});
