import { describe, expect, it } from "vitest";
import type { Job, MarketplaceJobSections } from "./types";
import { getVisualJobExposureSections } from "./visual-job-exposure";

const job = (patch: Partial<Job> & Pick<Job, "id">): Job => {
	const { id, ...restPatch } = patch;

	return {
		company: "테스트업체",
		coverImage: null,
		desc: "검수된 테스트 공고입니다.",
		featured: false,
		hours: "협의",
		id,
		isPromoted: false,
		lastBoostedAt: null,
		location: "서울 강남구",
		pay: "시급 150,000원",
		pref: "면접 전 연락처 보호",
		promotionLabel: null,
		promotionTier: null,
		rating: 0,
		reviews: 0,
		status: "published",
		tags: ["검수 완료"],
		title: "테스트 공고",
		type: "라운지",
		verified: true,
		...restPatch,
	};
};

describe("getVisualJobExposureSections", () => {
	it("maps premium jobs to special exposure", () => {
		const premium = job({
			id: "premium-1",
			isPromoted: true,
			promotionLabel: "프리미엄",
			promotionTier: "premium",
		});
		const sections: MarketplaceJobSections = {
			organic: [],
			premium: [premium],
			recommended: [],
		};

		expect(getVisualJobExposureSections(sections).special).toEqual([premium]);
	});

	it("builds urgent exposure from recently boosted promoted jobs", () => {
		const older = job({
			id: "older",
			isPromoted: true,
			lastBoostedAt: "2026-06-29T01:00:00.000Z",
			promotionTier: "recommended",
		});
		const newer = job({
			id: "newer",
			isPromoted: true,
			lastBoostedAt: "2026-06-29T02:00:00.000Z",
			promotionTier: "premium",
		});
		const sections: MarketplaceJobSections = {
			organic: [],
			premium: [newer],
			recommended: [older],
		};

		expect(
			getVisualJobExposureSections(sections).urgent.map((item) => item.id)
		).toEqual(["newer", "older"]);
	});

	it("keeps recommended and organic sections unchanged", () => {
		const recommended = job({ id: "recommended-1" });
		const organic = job({ id: "organic-1" });
		const sections: MarketplaceJobSections = {
			organic: [organic],
			premium: [],
			recommended: [recommended],
		};

		const result = getVisualJobExposureSections(sections);

		expect(result.recommended).toEqual([recommended]);
		expect(result.organic).toEqual([organic]);
	});
});
