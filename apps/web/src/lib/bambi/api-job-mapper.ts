import { env } from "@bambi-app/env/web";

import { NEGOTIABLE_PAY_TEXT } from "../bambi-options";

import type { AdBannerLayout } from "./ad-banner-layout";
import type { JobAdBannerUsage } from "./job-ad-banner-spec";
import { sampleCoverMedia, sampleThumbnailUrl } from "./sample-thumbnails";
import type {
	Job,
	JobDescriptionBlock,
	JobMedia,
	JobMediaUsage,
	JobPerformanceMetrics,
} from "./types";

// workSchedule이 없을 때 hours에 채워 넣는 자리표시 문구. 공개 랜딩이 근무시간 줄을
// 이 값과 비교해 통째로 생략하므로(값 없는데 "채팅으로 확인"을 근무시간처럼 색인하지
// 않으려고), 매퍼와 소비처가 같은 상수를 봐야 한다.
export const HOURS_PLACEHOLDER = "채팅으로 확인";

export interface ApiJobMedia {
	altText?: null | string;
	byteSize: number;
	fileName: string;
	height?: null | number;
	id?: string;
	mimeType: string;
	storageKey: string;
	usage: JobMediaUsage;
	width?: null | number;
}

export interface ApiJobMediaSet {
	adHorizontal?: ApiJobMedia | null;
	adVertical?: ApiJobMedia | null;
	cover?: ApiJobMedia | null;
	detail?: ApiJobMedia[];
}

export interface ApiMarketplaceJob {
	// jobs.list가 유료 카드에만 부착하는 조직 단위 누적 광고 집계. 그 외 경로(search·수집)엔 없음.
	adPeriod?: { count: number; totalDays: number } | null;
	beginnerFriendly?: boolean | null;
	coverImage?: ApiJobMedia | null;
	// 수집 공고의 대표 이미지. job_post_media 행이 아니라 미러링된 URL 한 줄로 오므로
	// storageKey 기반 조립을 거치지 않는다(버킷이 없는 환경에서는 원본 URL이 그대로 온다).
	coverImageUrl?: null | string;
	createdByDisplayName?: null | string;
	createdByProfileImageUrl?: null | string;
	// 공고 상세(getById) 응답에만 존재 — 공고를 올린 구인자의 user id.
	createdByUserId?: null | string;
	description?: string | null;
	descriptionBlocks?: JobDescriptionBlock[] | null;
	district?: string | null;
	// 지역 마스터 코드. 표시 문자열(region·district)과 달리 필터·폼이 쓰는 값이다.
	districtCode?: null | string;
	employerDisplayName?: string | null;
	employerVerificationStatus?: string | null;
	// 공고 상세(getById) 응답에만 존재 — 작성자 인증번호(미인증이면 null).
	employerVerifiedPhone?: string | null;
	exposureType?: null | string;
	id: string;
	industryCategory: string;
	instantInterview?: boolean | null;
	isPromoted?: boolean;
	lastBoostedAt?: Date | null | string;
	media?: ApiJobMediaSet;
	// 급여 단위가 "협의"인 공고는 금액이 없다.
	payAmount: null | number;
	// 수집 공고는 원본이 단위를 주지 않아 null이다.
	payUnit: null | string;
	performance?: JobPerformanceMetrics;
	promotionLabel?: null | string;
	promotionTier?: "premium" | "recommended" | "standard" | null;
	ratingAverage?: null | number | string;
	ratingCount?: null | number | string;
	region: string;
	regionCode?: null | string;
	// "crawled"면 수집 공고다 — 상세가 job_post 경로에 없어 카드 클릭이 갈 곳이 다르다.
	source?: null | string;
	status: string;
	teamDisplayName?: string | null;
	title: string;
	workSchedule?: string | null;
}

const TRAILING_SLASH_PATTERN = /\/$/;

// 공개 버킷의 객체는 브라우저가 직접 조회한다(서버·서명 URL을 거치지 않는다).
// 버킷이 구성되지 않은 개발 환경에서는 storageKey 기준 결정적 샘플 썸네일로 폴백한다.
// 프로덕션 빌드는 packages/env/src/web.ts가 base URL 누락 시 빌드를 실패시키므로,
// 이 폴백은 개발에서만 도달한다(배포된 화면에 샘플이 뜨는 일은 없다).
export const jobMediaPublicUrl = (storageKey: string): string => {
	const publicBaseUrl = env.NEXT_PUBLIC_GCS_PUBLIC_BASE_URL;

	if (!publicBaseUrl) {
		return sampleThumbnailUrl(storageKey);
	}

	return `${publicBaseUrl.replace(TRAILING_SLASH_PATTERN, "")}/${storageKey}`;
};

const toJobMediaUrl = (media: ApiJobMedia): string =>
	jobMediaPublicUrl(media.storageKey);

// 이미 완성된 URL 한 줄을 카드가 쓰는 미디어 형태로 감싼다. 파일명·용량·MIME은 알 수 없고
// 카드도 쓰지 않는다(url과 altText만 읽는다) — 모르는 값을 그럴듯하게 지어내지 않는다.
const toUrlJobMedia = (
	url?: null | string,
	usage: JobMediaUsage = "cover"
): JobMedia | null =>
	url
		? {
				altText: "",
				byteSize: 0,
				fileName: "",
				mimeType: "",
				storageKey: "",
				url,
				usage,
			}
		: null;

const toJobMedia = (media?: ApiJobMedia | null): JobMedia | null => {
	if (!media) {
		return null;
	}

	return {
		altText: media.altText ?? "",
		byteSize: media.byteSize,
		fileName: media.fileName,
		id: media.id,
		mimeType: media.mimeType,
		storageKey: media.storageKey,
		url: toJobMediaUrl(media),
		usage: media.usage,
	};
};

export const getMarketplaceJobCompany = (job: ApiMarketplaceJob): string =>
	job.teamDisplayName ?? job.employerDisplayName ?? "검증 업체";

// 금액이 없는 공고(급여 단위 "협의")는 목록·카드에서 "급여 협의"로 보여준다.
// 카드의 splitPay가 "급여"를 단위 배지로 떼어내므로 이 형식을 지켜야 한다.
//
// 단위가 없는 경우(수집 공고 — 원본이 "120,000원"처럼 금액만 준다)는 금액만 적는다.
// 모르는 단위를 지어내면 시급인지 일급인지 화면이 거짓말을 하게 된다.
export const formatMarketplacePay = ({
	payAmount,
	payUnit,
}: Pick<ApiMarketplaceJob, "payAmount" | "payUnit">): string => {
	if (payAmount === null || payAmount === undefined) {
		return NEGOTIABLE_PAY_TEXT;
	}

	const amount = `${payAmount.toLocaleString("ko-KR")}원`;

	return payUnit ? `${payUnit} ${amount}` : amount;
};

const toFiniteNumber = (value: null | number | string | undefined): number => {
	const numericValue = Number(value ?? 0);

	return Number.isFinite(numericValue) ? numericValue : 0;
};

const toReviewCount = (value: null | number | string | undefined): number =>
	Math.max(0, Math.trunc(toFiniteNumber(value)));

const toRating = ({
	ratingAverage,
	ratingCount,
}: Pick<ApiMarketplaceJob, "ratingAverage" | "ratingCount">): number => {
	if (toReviewCount(ratingCount) === 0) {
		return 0;
	}

	return Math.round(toFiniteNumber(ratingAverage) * 10) / 10;
};

// 코드가 없는 공고(크롤 원문 매칭 실패)는 빈 문자열로 내린다 — 코드 필터는 표시 문자열을
// 보지 않으므로 그런 공고는 지역 필터에 걸리지 않는다(서버 필터와 같은 결과).
const toRegionCodes = (
	job: ApiMarketplaceJob
): Pick<Job, "districtCode" | "regionCode"> => ({
	districtCode: job.districtCode ?? "",
	regionCode: job.regionCode ?? "",
});

// 공고를 올린 구인자의 user id. 상세(getById) 응답에만 있어 목록에서는 undefined다.
// (매퍼 본문이 이미 복잡도 상한이라 분기를 밖으로 뺀다)
const toEmployerUserId = (job: ApiMarketplaceJob): string | undefined =>
	job.createdByUserId ?? undefined;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: legacy mapper keeps all marketplace fallbacks in one place.
export const toMarketplaceJob = (job: ApiMarketplaceJob): Job => {
	const company = getMarketplaceJobCompany(job);
	const coverImage =
		toJobMedia(job.media?.cover ?? job.coverImage ?? null) ??
		toUrlJobMedia(job.coverImageUrl) ??
		sampleCoverMedia(job.id, `${company} 대표 이미지`);
	const detailImages = (job.media?.detail ?? [])
		.map(toJobMedia)
		.filter((media): media is JobMedia => media !== null);
	const tags = [
		job.promotionLabel ?? "",
		job.industryCategory,
		job.region,
		job.district ?? "",
		job.employerVerificationStatus === "verified" ? "검증 완료" : "검수 완료",
	].filter((tag) => tag.length > 0);
	// 시/도 · 세부지역을 한 줄로 합친다. 세부지역이 없는 공고는 시/도만 남는다.
	const location = [job.region, job.district].filter(Boolean).join(" · ");

	return {
		adPeriod: job.adPeriod ?? null,
		beginnerFriendly: job.beginnerFriendly ?? false,
		company,
		coverImage,
		// 카드 클릭이 /seeker/jobs/[id] 대신 수집 전용 상세로 가야 한다(그 id는 job_post에 없다).
		crawled: job.source === "crawled",
		desc:
			job.description ??
			"공고 상세와 면접 안내는 밤비알바 채팅에서 안전하게 확인할 수 있어요.",
		descriptionBlocks: job.descriptionBlocks ?? [],
		detailImages,
		district: job.district ?? "",
		employerUserId: toEmployerUserId(job),
		createdByDisplayName: job.createdByDisplayName ?? undefined,
		createdByProfileImageUrl: job.createdByProfileImageUrl ?? undefined,
		employerVerifiedPhone: job.employerVerifiedPhone ?? null,
		exposureType: job.exposureType ?? null,
		featured: job.employerVerificationStatus === "verified",
		hours: job.workSchedule ?? HOURS_PLACEHOLDER,
		id: job.id,
		instantInterview: job.instantInterview ?? false,
		isPromoted: job.isPromoted ?? Boolean(job.promotionTier),
		lastBoostedAt: job.lastBoostedAt ?? null,
		location: location || job.region,
		pay: formatMarketplacePay(job),
		...(job.performance ? { performance: job.performance } : {}),
		pref: "면접 전 연락처 보호",
		promotionLabel: job.promotionLabel ?? null,
		promotionTier: job.promotionTier ?? null,
		rating: toRating(job),
		region: job.region,
		...toRegionCodes(job),
		reviews: toReviewCount(job.ratingCount),
		status: job.status,
		tags,
		title: job.title,
		type: job.industryCategory,
		verified: job.employerVerificationStatus === "verified",
	};
};

export interface ApiAdBannerJob {
	adHorizontal?: ApiJobMedia | null;
	// 수집 공고의 배너. 업로드 미디어가 아니라 미러링된 URL 한 줄로 온다.
	adHorizontalUrl?: null | string;
	adVertical?: ApiJobMedia | null;
	adVerticalUrl?: null | string;
	coverImage?: ApiJobMedia | null;
	employerDisplayName?: string | null;
	id: string;
	layout?: AdBannerLayout | null;
	// "crawled"면 수집 공고다. 상세 경로(수집 전용)와 배너 렌더 비율이 결제 광고와 다르다.
	source?: null | string;
	teamDisplayName?: string | null;
	title: string;
}

export interface AdBannerItem {
	company: string;
	// 수집 공고 배너다. 원본 배너는 규격이 제각각(실측 약 3:2)이라 우리 슬롯 비율로
	// 자르지 않고 원본 비율로 그린다 — 렌더러가 이 값으로 분기한다.
	crawled: boolean;
	// 클릭 대상. 수집 배너도 이제 갈 곳(수집 전용 상세)이 있다.
	href: string;
	id: string;
	// 커버가 아니라 슬롯 배너가 우선이라 coverUrl이 아닌 imageUrl이다.
	imageUrl: string;
	// 이미지 위에 얹을 레이아웃(가로·세로 두 슬롯 전부). 편집한 적 없는 공고는 null이라
	// 이미지만 나온다.
	layout: AdBannerLayout | null;
	title: string;
}

// 배너 슬롯은 규격이 서로 달라(가로 7:3 / 세로 4:9) 슬롯에 맞게 업로드된 배너를 골라 써야 한다.
// 배너를 올리지 않은 기존 공고는 커버 → 결정적 샘플 커버로 폴백해 슬롯이 비지 않게 한다.
export const toAdBannerItem = (
	job: ApiAdBannerJob,
	usage: JobAdBannerUsage
): AdBannerItem => {
	const company = job.teamDisplayName ?? job.employerDisplayName ?? "검증 업체";
	const isCrawled = job.source === "crawled";
	const banner = usage === "ad_horizontal" ? job.adHorizontal : job.adVertical;
	const bannerUrl =
		usage === "ad_horizontal" ? job.adHorizontalUrl : job.adVerticalUrl;
	const media =
		toJobMedia(banner ?? job.coverImage ?? null) ??
		toUrlJobMedia(bannerUrl, usage) ??
		sampleCoverMedia(job.id, `${company} 대표 이미지`);

	// 슬롯별 판정은 하지 않는다 — 레이아웃은 가로·세로 슬롯을 모두 담고 있고, 어느 쪽을
	// 그릴지는 렌더러가 슬롯을 보고 정한다.
	return {
		company,
		crawled: isCrawled,
		// 수집 공고의 id는 job_post에 없다 — 수집 전용 상세로 보내야 오류 화면이 뜨지 않는다.
		href: isCrawled
			? `/seeker/jobs/crawled/${job.id}`
			: `/seeker/jobs/${job.id}`,
		id: job.id,
		imageUrl: media.url,
		layout: job.layout ?? null,
		title: job.title,
	};
};
