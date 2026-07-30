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
	beginnerFriendly?: boolean | null;
	coverImage?: ApiJobMedia | null;
	// 수집 공고의 대표 이미지. job_post_media 행이 아니라 미러링된 URL 한 줄로 오므로
	// storageKey 기반 조립을 거치지 않는다(버킷이 없는 환경에서는 원본 URL이 그대로 온다).
	coverImageUrl?: null | string;
	description?: string | null;
	descriptionBlocks?: JobDescriptionBlock[] | null;
	district?: string | null;
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
	payUnit: string;
	performance?: JobPerformanceMetrics;
	promotionLabel?: null | string;
	promotionTier?: "premium" | "recommended" | "standard" | null;
	ratingAverage?: null | number | string;
	ratingCount?: null | number | string;
	region: string;
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
export const formatMarketplacePay = ({
	payAmount,
	payUnit,
}: Pick<ApiMarketplaceJob, "payAmount" | "payUnit">): string =>
	payAmount === null || payAmount === undefined
		? NEGOTIABLE_PAY_TEXT
		: `${payUnit} ${payAmount.toLocaleString("ko-KR")}원`;

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
		beginnerFriendly: job.beginnerFriendly ?? false,
		company,
		coverImage,
		desc:
			job.description ??
			"공고 상세와 면접 안내는 밤비알바 채팅에서 안전하게 확인할 수 있어요.",
		descriptionBlocks: job.descriptionBlocks ?? [],
		detailImages,
		district: job.district ?? "",
		employerVerifiedPhone: job.employerVerifiedPhone ?? null,
		exposureType: job.exposureType ?? null,
		featured: job.employerVerificationStatus === "verified",
		hours: job.workSchedule ?? "채팅으로 확인",
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
	// "crawled"면 수집 공고다. 상세 페이지가 없으므로 링크를 걸지 않는다.
	source?: null | string;
	teamDisplayName?: string | null;
	title: string;
}

export interface AdBannerItem {
	company: string;
	// 클릭 대상. 수집 배너는 갈 곳이 없어 null이고, 렌더러가 링크 없이 그린다.
	href: null | string;
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
		// 수집 공고는 /seeker/jobs/[id]에 없다. 링크를 걸면 배너를 누른 사람이 오류 화면을 본다.
		href: isCrawled ? null : `/seeker/jobs/${job.id}`,
		id: job.id,
		imageUrl: media.url,
		layout: job.layout ?? null,
		title: job.title,
	};
};
