import { describe, expect, it } from "vitest";
import { maskJobsForBackdrop } from "@/lib/bambi/auth-backdrop";
import type { Job } from "@/lib/bambi/types";

const job: Job = {
	beginnerFriendly: false,
	company: "문스톤 라운지",
	desc: "서울 강남 문스톤 라운지에서 주말 야간 근무자를 모십니다.",
	district: "강남구",
	districtCode: "1168000000",
	featured: true,
	hours: "19:00–01:00",
	id: "j2",
	instantInterview: false,
	location: "서울 · 강남",
	pay: "시급 17,000원",
	pref: "장기 우대",
	rating: 4.8,
	region: "서울",
	regionCode: "1100000000",
	reviews: 12,
	status: "published",
	tags: ["주말", "고정", "장기 우대"],
	title: "주말 야간 홀",
	type: "룸싸롱",
	verified: true,
};

// 글자·숫자를 지우고 공백·문장부호만 남긴 골격. 마스킹 전후가 같아야 단어 덩어리와
// 리듬이 그대로 남은 것이다(블러 아래서 진짜 업소명으로 읽히는 근거).
const LETTER_OR_DIGIT_RE = /[\p{L}\p{Nd}]/gu;
const skeleton = (value: string) => value.replace(LETTER_OR_DIGIT_RE, "*");

describe("maskJobsForBackdrop", () => {
	it("업소명은 원문과 다르게 치환한다(비가역)", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked.company).not.toBe(job.company);
		// 원문이 결과 어디에도 부분 문자열로 남지 않는다.
		expect(masked.company).not.toContain(job.company);
	});

	it("업소명은 글자 수·공백 위치를 보존한다(카드 레이아웃 유지)", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked.company).toHaveLength(job.company.length);
		expect(skeleton(masked.company)).toBe(skeleton(job.company));
	});

	it("지역·급여는 실값을 그대로 싣는다(/jobs 공개와 일치)", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked.location).toBe(job.location);
		expect(masked.pay).toBe(job.pay);
	});

	it("같은 입력에는 항상 같은 결과를 낸다(서버·클라 렌더 동일, 난수 사용 안 함)", () => {
		expect(maskJobsForBackdrop([job, job])).toEqual(
			maskJobsForBackdrop([job, job])
		);
	});

	it("식별자·미디어·설명과 배경이 안 그리는 필드(제목·태그)를 아예 싣지 않는다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked).not.toHaveProperty("id");
		expect(masked).not.toHaveProperty("desc");
		expect(masked).not.toHaveProperty("coverImage");
		expect(masked).not.toHaveProperty("rating");
		expect(masked).not.toHaveProperty("title");
		expect(masked).not.toHaveProperty("tags");
	});
});
