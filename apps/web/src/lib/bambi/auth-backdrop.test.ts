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

// 글자·숫자를 지우고 공백·문장부호만 남긴 골격. 마스킹 전후가 같아야 단어 덩어리와
// 리듬이 그대로 남은 것이다(블러 아래서 진짜 문장으로 읽히는 근거).
const LETTER_OR_DIGIT_RE = /[\p{L}\p{Nd}]/gu;
const skeleton = (value: string) => value.replace(LETTER_OR_DIGIT_RE, "*");

const SOURCE_TEXTS = [
	job.company,
	job.title,
	job.location,
	job.pay,
	...job.tags,
];

describe("maskJobsForBackdrop", () => {
	it("원본 문자열이 결과 어디에도 남지 않는다", () => {
		for (const text of collectStrings(maskJobsForBackdrop([job]))) {
			for (const source of SOURCE_TEXTS) {
				expect(text).not.toContain(source);
			}
		}
	});

	it("글자 수를 보존해 카드 레이아웃이 실제와 같아 보인다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked.company).toHaveLength(job.company.length);
		expect(masked.title).toHaveLength(job.title.length);
		expect(masked.pay).toHaveLength(job.pay.length);
		expect(masked.tags).toHaveLength(job.tags.length);
		expect(masked.tags[0]).toHaveLength(job.tags[0].length);
	});

	it("공백·문장부호 위치를 보존한다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(skeleton(masked.company)).toBe(skeleton(job.company));
		expect(skeleton(masked.location)).toBe(skeleton(job.location));
		// "시급 17,000원"의 쉼표·자릿수가 남아야 급여로 읽힌다.
		expect(skeleton(masked.pay)).toBe(skeleton(job.pay));
	});

	it("같은 입력에는 항상 같은 결과를 낸다(난수 사용 안 함)", () => {
		expect(maskJobsForBackdrop([job, job])).toEqual(
			maskJobsForBackdrop([job, job])
		);
	});

	it("식별자·미디어·설명을 아예 싣지 않는다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked).not.toHaveProperty("id");
		expect(masked).not.toHaveProperty("desc");
		expect(masked).not.toHaveProperty("coverImage");
		expect(masked).not.toHaveProperty("rating");
	});
});
