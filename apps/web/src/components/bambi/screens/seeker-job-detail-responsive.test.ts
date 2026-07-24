import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
	new URL("./seeker-job-detail-responsive.tsx", import.meta.url),
	"utf8"
);

describe("공고 상세 구인자 번호", () => {
	it("근무시간·고용형태 사이에 구인자 인증번호 안내를 렌더한다", () => {
		expect(source).toContain("employerVerifiedPhone");
		expect(source).toContain("밤비알바 보고 전화드렸는데요");
	});
});
