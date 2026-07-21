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

// 좌/우 사이드 배너의 위치별 최대 슬롯 수. 프리미엄은 1행 2열 고정이라 2개로 캡한다.
export const SIDE_BANNER_MAX_SLOTS = 3;
export const PREMIUM_BANNER_MAX_SLOTS = 2;

// 로테이션 주기. 같은 버킷 안에서는 어떤 요청·인스턴스든 같은 선발을 돌려준다.
const ROTATION_INTERVAL_MS = 60 * 60 * 1000;

// 문자열을 32비트 시드로 접는 FNV-1a. 시간 버킷+위치 타입을 시드화하는 용도라
// 암호학적 강도는 필요 없다. XOR·>>>는 해시 정의상 필수인 의도된 비트 연산이다.
const hashSeed = (input: string): number => {
	let hash = 0x81_1c_9d_c5;
	for (let index = 0; index < input.length; index++) {
		// biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a 정의상 XOR 필수(의도된 비트 연산).
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01_00_01_93);
	}
	// biome-ignore lint/suspicious/noBitwiseOperators: 32비트 부호 없는 정수로 정규화(의도된 비트 연산).
	return hash >>> 0;
};

// mulberry32 — 의존성 없는 결정적 PRNG. 시드가 같으면 수열이 같다. 시프트·XOR·OR는
// 알고리즘 정의상 필수인 의도된 비트 연산이다.
const createSeededRandom = (seed: number): (() => number) => {
	// biome-ignore lint/suspicious/noBitwiseOperators: 32비트 부호 없는 시드로 정규화(의도된 비트 연산).
	let state = seed >>> 0;
	return () => {
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 상태 전이(32비트 부호 없는 덧셈).
		state = (state + 0x6d_2b_79_f5) >>> 0;
		let t = state;
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 믹싱 단계(의도된 비트 연산).
		t = Math.imul(t ^ (t >>> 15), t | 1);
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 믹싱 단계(의도된 비트 연산).
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		// biome-ignore lint/suspicious/noBitwiseOperators: 32비트 정규화 후 [0,1) 매핑(의도된 비트 연산).
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};

// 시드 고정 Fisher–Yates. 입력을 훼손하지 않고 새 배열을 돌려준다.
const shuffleWithSeed = <T>(items: T[], seed: number): T[] => {
	const result = [...items];
	const random = createSeededRandom(seed);
	for (let index = result.length - 1; index > 0; index--) {
		const target = Math.floor(random() * (index + 1));
		[result[index], result[target]] = [result[target] as T, result[index] as T];
	}
	return result;
};

// 결제완료된 배너형 공고를 노출 위치별로 그룹핑한다. 활성(미만료) 후보가 슬롯을 초과하면
// 시간 버킷(1시간)+위치 타입을 시드로 한 랜덤 셔플로 매시간 새로 선발한다 — 정해진 순서를
// 도는 순환이 아니라 매시간 독립 추첨이라 모든 배너가 동일 확률로 노출된다. 후보가 슬롯
// 이하면 전원 노출되고 표시 순서만 매시간 섞인다.
export const groupAdBannerJobs = <TRow extends AdBannerRow>(
	rows: TRow[],
	now: Date
): { leftBanner: TRow[]; premiumBanner: TRow[]; rightBanner: TRow[] } => {
	const hourBucket = Math.floor(now.getTime() / ROTATION_INTERVAL_MS);
	const pick = (type: AdBannerExposureType, maxSlots: number): TRow[] => {
		// id 정렬로 DB 정렬 순서 의존을 끊어야 같은 버킷=같은 선발이 보장된다.
		const matched = rows
			.filter(
				(item) =>
					item.exposureType === type &&
					isExposureActive(item.exposureEndsAt, now)
			)
			.sort((a, b) => a.id.localeCompare(b.id));
		return shuffleWithSeed(matched, hashSeed(`${hourBucket}:${type}`)).slice(
			0,
			maxSlots
		);
	};

	return {
		leftBanner: pick("left-banner", SIDE_BANNER_MAX_SLOTS),
		premiumBanner: pick("premium-banner", PREMIUM_BANNER_MAX_SLOTS),
		rightBanner: pick("right-banner", SIDE_BANNER_MAX_SLOTS),
	};
};
