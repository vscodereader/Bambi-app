import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
	path.join(import.meta.dirname, "page.tsx"),
	"utf8"
);

describe("employer ads management page", () => {
	it("uses the new ad-axis procedures instead of legacy campaigns", () => {
		expect(source).toContain("promotions.listMyAds");
		expect(source).toContain("promotions.boost");
		// jobs.listMine 무효화는 정상 — 금지 대상은 구 promotions.listMine뿐이다
		expect(source).not.toContain("promotions.listMine");
		expect(source).not.toContain("activateForManualPayment");
	});

	it("titles the screen 광고 관리 and derives status from the public gate", () => {
		expect(source).toContain('title="광고 관리"');
		expect(source).toContain("getJobDisplayStatus");
	});

	it("gates the boost button on publish, payment, exposure and daily limit", () => {
		expect(source).toContain('status === "published"');
		expect(source).toContain('paymentStatus === "paid"');
		expect(source).toContain("remainingToday > 0");
	});

	it("renders the shared DataTable instead of ad cards", () => {
		expect(source).toContain("DataTable");
		expect(source).toContain("@/components/bambi/data-table");
	});

	it("drops the 공고 수정 edit link entirely", () => {
		expect(source).not.toContain("공고 수정");
		expect(source).not.toContain("/edit");
	});

	it("adds an auto-boost column showing today's runs over the daily quota", () => {
		expect(source).toContain("autoBoostsPerDay: number;");
		expect(source).toContain("autoBoostsUsedToday: number;");
		expect(source).toContain('header: "자동 끌어올리기"');
		// 미포함은 "—", 포함이면 "오늘 M/N회 실행"
		expect(source).toContain("회 실행");
	});

	it("shows only the team name as the title subtext, not the employer name", () => {
		// 자기 조직 화면이라 모든 행이 같은 업체명 → 정보 가치 없음 → 보조 텍스트에서 제거
		expect(source).not.toContain("ad.employerDisplayName");
		// 팀명만 보조 텍스트로 표시(null이면 줄 자체 미렌더)
		expect(source).toContain("ad.teamDisplayName");
	});
});
