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
});
