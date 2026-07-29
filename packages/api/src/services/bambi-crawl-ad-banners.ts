// 수집 공고를 광고 슬롯에 채울 때의 이미지 대체 규칙. 순수 판정만 둔다 — 이 규칙은
// "누구의 이미지를 누구 자리에 쓰는가"를 결정하므로, DB·네트워크에 묶여 있으면 검증할 수 없다.
//
// 우리 광고 상품은 가로형·세로형 배너를 함께 받고(job_post_media의 ad_horizontal /
// ad_vertical), 방향에 맞는 배너가 없는 후보는 슬롯에서 빠진다. 수집 공고는 원본이 한쪽만
// 걸어두는 경우가 흔해 그대로 두면 슬롯이 비므로, 아래 대체 규칙을 적용한다.
//
// 이 규칙은 **수집 공고에만** 적용한다. 돈을 낸 광고주의 공고는 지금처럼 이미지가 없으면
// 슬롯에서 빠져야 한다 — 광고주가 올리지 않은 이미지를 우리가 지어내 그 자리에 걸 수는 없다.

import { createHash } from "node:crypto";

export interface CrawledAdBannerSource {
	bannerHorizontalUrl: null | string;
	bannerVerticalUrl: null | string;
	sourceExternalId: string;
	thumbnailUrl: null | string;
}

// 가로형 대체 출처. 렌더하는 쪽이 "이 이미지가 이 공고 것인가"를 알아야 하므로 숨기지 않는다.
export type HorizontalBannerOrigin = "none" | "own" | "thumbnail";

// 세로형 대체 출처. borrowed는 **다른 공고의 배너**라는 뜻이다 — 클릭 시 이동하는 공고와
// 이미지의 주인이 다르므로, 화면이 이 값을 보고 "광고" 표기나 출처 안내를 붙일 수 있어야 한다.
export type VerticalBannerOrigin = "borrowed" | "none" | "own";

export interface ResolvedAdBanners {
	horizontalOrigin: HorizontalBannerOrigin;
	horizontalUrl: null | string;
	// 세로형을 어느 공고에서 빌렸는지. own·none이면 null.
	verticalBorrowedFrom: null | string;
	verticalOrigin: VerticalBannerOrigin;
	verticalUrl: null | string;
}

// 빌릴 배너를 고를 때 난수를 쓰지 않는다. 같은 공고가 매 렌더마다 다른 배너를 입으면
// 화면이 깜빡이고, 어떤 조합이 노출됐는지 되짚을 수도 없다. 공고 ID로 결정론적으로 고른다.
const stableIndex = (seed: string, size: number): number => {
	const digest = createHash("sha256").update(seed).digest();

	return digest.readUInt32BE(0) % size;
};

/**
 * 수집 공고 한 건의 광고 배너 두 방향을 확정한다.
 *
 * - 가로형이 없으면 그 공고의 썸네일로 대체한다(같은 공고 이미지라 주인이 안 바뀐다).
 * - 세로형이 없으면 세로형을 가진 **다른 공고**의 배너를 빌린다. 빌린 사실과 출처 공고를
 *   함께 돌려주므로, 렌더하는 쪽이 그 이미지를 이 공고의 것으로 단정하지 않을 수 있다.
 *
 * pool에는 자기 자신이 섞여 있어도 된다(sourceExternalId로 걸러낸다).
 */
export const resolveCrawledAdBanners = (
	post: CrawledAdBannerSource,
	pool: readonly CrawledAdBannerSource[]
): ResolvedAdBanners => {
	const horizontal: Pick<
		ResolvedAdBanners,
		"horizontalOrigin" | "horizontalUrl"
	> = post.bannerHorizontalUrl
		? { horizontalOrigin: "own", horizontalUrl: post.bannerHorizontalUrl }
		: {
				horizontalOrigin: post.thumbnailUrl ? "thumbnail" : "none",
				horizontalUrl: post.thumbnailUrl,
			};

	if (post.bannerVerticalUrl) {
		return {
			...horizontal,
			verticalBorrowedFrom: null,
			verticalOrigin: "own",
			verticalUrl: post.bannerVerticalUrl,
		};
	}

	const lenders = pool.filter(
		(candidate) =>
			candidate.sourceExternalId !== post.sourceExternalId &&
			candidate.bannerVerticalUrl
	);

	if (lenders.length === 0) {
		return {
			...horizontal,
			verticalBorrowedFrom: null,
			verticalOrigin: "none",
			verticalUrl: null,
		};
	}

	// 후보 순서가 회차마다 흔들려도 같은 배너가 걸리도록, 인덱스가 아니라 ID로 정렬해 고른다.
	const sorted = [...lenders].sort((left, right) =>
		left.sourceExternalId.localeCompare(right.sourceExternalId)
	);
	const lender = sorted[stableIndex(post.sourceExternalId, sorted.length)];

	return {
		...horizontal,
		verticalBorrowedFrom: lender?.sourceExternalId ?? null,
		verticalOrigin: lender ? "borrowed" : "none",
		verticalUrl: lender?.bannerVerticalUrl ?? null,
	};
};
