import { describe, expect, it } from "vitest";
import { maskJobsForBackdrop } from "./auth-backdrop";
import type { Job } from "./types";

const job: Job = {
	beginnerFriendly: false,
	company: "문스톤 라운지",
	desc: "서울 강남 문스톤 라운지에서 주말 야간 근무자를 모십니다.",
	district: "강남",
	featured: true,
	hours: "19:00–01:00",
	id: "j2",
	instantInterview: false,
	location: "서울 · 강남",
	pay: "시급 17,000원",
	pref: "장기 우대",
	rating: 4.8,
	region: "서울",
	reviews: 12,
	status: "published",
	tags: ["주말", "고정", "장기 우대"],
	title: "주말 야간 홀",
	type: "룸싸롱",
	verified: true,
};

// 결과 객체 안의 모든 문자열을 끌어모은다 — 새 필드가 추가돼도 자동으로 검사에 걸린다.
const collectStrings = (value: unknown): string[] => {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(collectStrings);
	}
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(collectStrings);
	}
	return [];
};

const MASK_ONLY = /^■*$/;

describe("maskJobsForBackdrop", () => {
	it("마스크 문자 외에는 아무 문자도 남기지 않는다", () => {
		for (const text of collectStrings(maskJobsForBackdrop([job]))) {
			expect(text).toMatch(MASK_ONLY);
		}
	});

	it("글자 수를 보존해 카드 레이아웃이 실제와 같아 보인다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked.company).toHaveLength(job.company.length);
		expect(masked.title).toHaveLength(job.title.length);
		expect(masked.tags).toHaveLength(job.tags.length);
		expect(masked.tags[0]).toHaveLength(job.tags[0].length);
	});

	it("식별자·미디어·설명을 아예 싣지 않는다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked).not.toHaveProperty("id");
		expect(masked).not.toHaveProperty("desc");
		expect(masked).not.toHaveProperty("coverImage");
		expect(masked).not.toHaveProperty("rating");
	});
});
