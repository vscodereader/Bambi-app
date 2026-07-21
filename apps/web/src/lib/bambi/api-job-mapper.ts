import { env } from "@bambi-app/env/web";

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
	description?: string | null;
	descriptionBlocks?: JobDescriptionBlock[] | null;
	employerDisplayName?: string | null;
	employerVerificationStatus?: string | null;
	exposureType?: null | string;
	id: string;
	industryCategory: string;
	instantInterview?: boolean | null;
	isPromoted?: boolean;
	lastBoostedAt?: Date | null | string;
	media?: ApiJobMediaSet;
	payAmount: number;
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

export const formatMarketplacePay = ({
	payAmount,
	payUnit,
}: Pick<ApiMarketplaceJob, "payAmount" | "payUnit">): string =>
	`${payUnit} ${payAmount.toLocaleString("ko-KR")}원`;

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
		sampleCoverMedia(job.id, `${company} 대표 이미지`);
	const detailImages = (job.media?.detail ?? [])
		.map(toJobMedia)
		.filter((media): media is JobMedia => media !== null);
	const tags = [
		job.promotionLabel ?? "",
		job.industryCategory,
		job.region,
		job.employerVerificationStatus === "verified" ? "검증 완료" : "검수 완료",
	].filter((tag) => tag.length > 0);

	return {
		beginnerFriendly: job.beginnerFriendly ?? false,
		company,
		coverImage,
		desc:
			job.description ??
			"공고 상세와 면접 안내는 밤비 채팅에서 안전하게 확인할 수 있어요.",
		descriptionBlocks: job.descriptionBlocks ?? [],
		detailImages,
		exposureType: job.exposureType ?? null,
		featured: job.employerVerificationStatus === "verified",
		hours: job.workSchedule ?? "채팅으로 확인",
		id: job.id,
		instantInterview: job.instantInterview ?? false,
		isPromoted: job.isPromoted ?? Boolean(job.promotionTier),
		lastBoostedAt: job.lastBoostedAt ?? null,
		location: job.region,
		pay: formatMarketplacePay(job),
		...(job.performance ? { performance: job.performance } : {}),
		pref: "면접 전 연락처 보호",
		promotionLabel: job.promotionLabel ?? null,
		promotionTier: job.promotionTier ?? null,
		rating: toRating(job),
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
	adVertical?: ApiJobMedia | null;
	coverImage?: ApiJobMedia | null;
	employerDisplayName?: string | null;
	id: string;
	teamDisplayName?: string | null;
	title: string;
}

export interface AdBannerItem {
	company: string;
	id: string;
	// 커버가 아니라 슬롯 배너가 우선이라 coverUrl이 아닌 imageUrl이다.
	imageUrl: string;
	title: string;
}

// 배너 슬롯은 규격이 서로 달라(가로 7:3 / 세로 4:9) 슬롯에 맞게 업로드된 배너를 골라 써야 한다.
// 배너를 올리지 않은 기존 공고는 커버 → 결정적 샘플 커버로 폴백해 슬롯이 비지 않게 한다.
export const toAdBannerItem = (
	job: ApiAdBannerJob,
	usage: JobAdBannerUsage
): AdBannerItem => {
	const company = job.teamDisplayName ?? job.employerDisplayName ?? "검증 업체";
	const banner = usage === "ad_horizontal" ? job.adHorizontal : job.adVertical;
	const media =
		toJobMedia(banner ?? job.coverImage ?? null) ??
		sampleCoverMedia(job.id, `${company} 대표 이미지`);
	return { company, id: job.id, imageUrl: media.url, title: job.title };
};
