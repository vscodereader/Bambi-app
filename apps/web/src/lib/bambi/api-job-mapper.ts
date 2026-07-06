import { sampleCoverMedia, sampleThumbnailUrl } from "./sample-thumbnails";
import type {
	Job,
	JobDescriptionBlock,
	JobMedia,
	JobPerformanceMetrics,
} from "./types";

export interface ApiJobMedia {
	altText?: null | string;
	byteSize: number;
	fileName: string;
	id?: string;
	mimeType: string;
	storageKey: string;
	usage: "cover" | "detail";
}

export interface ApiJobMediaSet {
	cover?: ApiJobMedia | null;
	detail?: ApiJobMedia[];
}

export interface ApiMarketplaceJob {
	coverImage?: ApiJobMedia | null;
	description?: string | null;
	descriptionBlocks?: JobDescriptionBlock[] | null;
	employerDisplayName?: string | null;
	employerVerificationStatus?: string | null;
	id: string;
	industryCategory: string;
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

// 실제 스토리지 이미지 연동 전까지, API 미디어도 storageKey 기준으로 결정적
// 샘플 썸네일을 쓴다. (기존 /bambi/local-job-media 는 "COVER" 라벨 SVG 플레이스홀더라
// mock 샘플이 떴다가 회색 박스로 덮이는 문제가 있었다.)
const toJobMediaUrl = (media: ApiJobMedia): string =>
	sampleThumbnailUrl(media.storageKey);

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
		company,
		coverImage,
		desc:
			job.description ??
			"공고 상세와 면접 안내는 밤비 채팅에서 안전하게 확인할 수 있어요.",
		descriptionBlocks: job.descriptionBlocks ?? [],
		detailImages,
		featured: job.employerVerificationStatus === "verified",
		hours: job.workSchedule ?? "채팅으로 확인",
		id: job.id,
		isPromoted: Boolean(job.promotionTier),
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
