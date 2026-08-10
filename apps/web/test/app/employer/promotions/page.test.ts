import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { srcPath } from "../../../src-path";

const source = fs.readFileSync(
	srcPath("app/employer/promotions/page.tsx"),
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
		// 네 축의 판정은 getBoostState 하나로 모였고(비활성 사유 문구까지 함께 계산),
		// 드롭다운의 끌어올리기 항목은 그 결과로만 비활성화된다.
		expect(source).toContain('ad.status !== "published"');
		expect(source).toContain('ad.paymentStatus !== "paid"');
		expect(source).toContain("isExposureActive(ad.exposureEndsAt");
		expect(source).toContain("remainingBoosts(ad) === 0");
		expect(source).toContain("disabled={!canBoost || isBoostPending}");
	});

	it("renders the shared DataTable instead of ad cards", () => {
		expect(source).toContain("DataTable");
		expect(source).toContain("@/components/bambi/data-table");
	});

	it("drops the edit action, leaving only a read-oriented 공고 보기 link", () => {
		// 수정은 공고 관리(내 공고) 화면의 책임이라 광고 관리엔 수정 액션을 두지 않는다.
		// 구인자용 공고 상세 라우트가 /edit 하나뿐이라 "공고 보기"가 그 경로를 재사용한다.
		expect(source).not.toContain("수정");
		expect(source).toContain("공고 보기");
	});

	it("adds an auto-boost column showing today's runs over the daily quota", () => {
		expect(source).toContain("autoBoostsPerDay: number;");
		expect(source).toContain("autoBoostsUsedToday: number;");
		expect(source).toContain('header: "자동 끌어올리기"');
		// 미포함은 "—", 포함이면 "오늘 M/N회 실행"
		expect(source).toContain("회 실행");
	});

	it("replaces boost UI with a notice for banner exposure rows", () => {
		// 배너형(프리미엄·좌측·우측 배너)은 끌어올리기 대상이 아니라 안내 문구만 표시
		expect(source).toContain("isBannerExposureType");
		expect(source).toContain("끌어올리기 대상이 아닙니다");
	});

	it("re-shows the bank transfer guide for unpaid rows", () => {
		// 미결제 행은 상태 옆 "입금 안내" 팝오버로 계좌 안내를 다시 볼 수 있다
		expect(source).toContain('ad.paymentStatus === "unpaid"');
		expect(source).toContain("입금 안내");
		expect(source).toContain("BankTransferGuide");
	});

	it("shows only the team name as the title subtext, not the employer name", () => {
		// 자기 조직 화면이라 모든 행이 같은 업체명 → 정보 가치 없음 → 보조 텍스트에서 제거
		expect(source).not.toContain("ad.employerDisplayName");
		// 팀명만 보조 텍스트로 표시(null이면 줄 자체 미렌더)
		expect(source).toContain("ad.teamDisplayName");
	});
});
