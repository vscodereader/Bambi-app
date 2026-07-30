import { describe, expect, it } from "vitest";

import {
	type CrawledAdBannerSource,
	resolveCrawledAdBanners,
} from "./bambi-crawl-ad-banners";

const post = (
	id: string,
	overrides: Partial<CrawledAdBannerSource> = {}
): CrawledAdBannerSource => ({
	bannerHorizontalUrl: null,
	bannerVerticalUrl: null,
	sourceExternalId: id,
	thumbnailUrl: null,
	...overrides,
});

describe("resolveCrawledAdBanners", () => {
	it("keeps its own banners when both orientations exist", () => {
		const target = post("1", {
			bannerHorizontalUrl: "h.jpg",
			bannerVerticalUrl: "v.jpg",
			thumbnailUrl: "t.jpg",
		});

		expect(resolveCrawledAdBanners(target, [target])).toMatchObject({
			horizontalOrigin: "own",
			horizontalUrl: "h.jpg",
			verticalOrigin: "own",
			verticalUrl: "v.jpg",
		});
	});

	it("falls back to the thumbnail when the horizontal banner is missing", () => {
		const target = post("1", { thumbnailUrl: "t.jpg" });

		expect(resolveCrawledAdBanners(target, [target])).toMatchObject({
			horizontalOrigin: "thumbnail",
			horizontalUrl: "t.jpg",
		});
	});

	it("reports none when neither a horizontal banner nor a thumbnail exists", () => {
		expect(resolveCrawledAdBanners(post("1"), [])).toMatchObject({
			horizontalOrigin: "none",
			horizontalUrl: null,
		});
	});

	// 빌린 배너는 클릭 시 이동하는 공고와 이미지의 주인이 다르다. 그 사실이 반환값에
	// 남지 않으면 화면이 남의 창작물을 이 공고 것으로 단정하게 된다.
	it("borrows a vertical banner from another post and records the lender", () => {
		const target = post("1");
		const lender = post("2", { bannerVerticalUrl: "other-v.jpg" });

		expect(resolveCrawledAdBanners(target, [target, lender])).toMatchObject({
			verticalBorrowedFrom: "2",
			verticalOrigin: "borrowed",
			verticalUrl: "other-v.jpg",
		});
	});

	it("never borrows from itself", () => {
		const target = post("1", { bannerVerticalUrl: null });
		const selfWithBanner = post("1", { bannerVerticalUrl: "v.jpg" });

		expect(resolveCrawledAdBanners(target, [selfWithBanner])).toMatchObject({
			verticalOrigin: "none",
			verticalUrl: null,
		});
	});

	// 난수로 고르면 렌더마다 배너가 바뀌어 화면이 깜빡이고, 어떤 조합이 노출됐는지
	// 되짚을 수 없다. 후보 순서가 흔들려도 같은 배너가 나와야 한다.
	it("picks the same lender regardless of pool order", () => {
		const target = post("1");
		const lenders = [
			post("2", { bannerVerticalUrl: "a.jpg" }),
			post("3", { bannerVerticalUrl: "b.jpg" }),
			post("4", { bannerVerticalUrl: "c.jpg" }),
		];

		const forward = resolveCrawledAdBanners(target, lenders);
		const reversed = resolveCrawledAdBanners(target, [...lenders].reverse());

		expect(forward.verticalUrl).toBe(reversed.verticalUrl);
		expect(forward.verticalBorrowedFrom).toBe(reversed.verticalBorrowedFrom);
	});

	it("spreads borrowers across the available lenders", () => {
		const lenders = Array.from({ length: 5 }, (_, index) =>
			post(`lender-${index}`, { bannerVerticalUrl: `${index}.jpg` })
		);
		const borrowed = new Set(
			Array.from(
				{ length: 40 },
				(_, index) =>
					resolveCrawledAdBanners(post(`borrower-${index}`), lenders)
						.verticalBorrowedFrom
			)
		);

		// 모두 한 배너로 몰리면 그 업소만 40번 노출된다.
		expect(borrowed.size).toBeGreaterThan(1);
	});

	it("skips pool entries that have no vertical banner", () => {
		const target = post("1");
		const noBanner = post("2", { thumbnailUrl: "t.jpg" });

		expect(resolveCrawledAdBanners(target, [noBanner])).toMatchObject({
			verticalBorrowedFrom: null,
			verticalOrigin: "none",
		});
	});
});
