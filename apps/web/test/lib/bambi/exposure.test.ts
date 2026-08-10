import { describe, expect, it } from "vitest";
import {
	expiryLabel,
	getExpiryTone,
	getJobDisplayStatus,
	JOB_DETAIL_DESIGN_STATUS_LABELS,
	remainingDays,
} from "@/lib/bambi/exposure";

const DAY_MS = 24 * 60 * 60 * 1000;

const daysFromNow = (days: number): Date =>
	new Date(Date.now() + days * DAY_MS);

describe("remainingDays", () => {
	it("returns null when there is no expiry date", () => {
		expect(remainingDays(null)).toBeNull();
	});

	it("returns a positive count for a future expiry", () => {
		const value = remainingDays(daysFromNow(10));

		expect(value).not.toBeNull();
		expect(value as number).toBeGreaterThan(0);
		expect(value as number).toBeLessThanOrEqual(10);
	});

	it("returns zero or negative for a past expiry", () => {
		const value = remainingDays(daysFromNow(-5));

		expect(value).not.toBeNull();
		expect(value as number).toBeLessThanOrEqual(0);
	});

	it("accepts ISO strings as well as Date objects", () => {
		const iso = daysFromNow(3).toISOString();

		expect(remainingDays(iso)).toBeGreaterThan(0);
	});
});

describe("expiryLabel", () => {
	it("labels a missing expiry as 해당 없음", () => {
		expect(expiryLabel(null)).toBe("해당 없음");
	});

	it("labels a future expiry as 진행중", () => {
		expect(expiryLabel(daysFromNow(7))).toBe("진행중");
	});

	it("labels a past expiry as 만료", () => {
		expect(expiryLabel(daysFromNow(-1))).toBe("만료");
	});
});

describe("getExpiryTone", () => {
	it("진행중은 good", () => {
		expect(getExpiryTone("진행중")).toBe("good");
	});
	it("만료는 danger", () => {
		expect(getExpiryTone("만료")).toBe("danger");
	});
	it("그 외는 default", () => {
		expect(getExpiryTone("대기")).toBe("default");
	});
});

describe("JOB_DETAIL_DESIGN_STATUS_LABELS", () => {
	it("enum 원값 대신 한국어 라벨을 제공한다", () => {
		expect(JOB_DETAIL_DESIGN_STATUS_LABELS.requested).toBe("제작 대기");
		expect(JOB_DETAIL_DESIGN_STATUS_LABELS.completed).toBe("제작 완료");
	});

	it("DB enum 값 2종만 담는다", () => {
		expect(Object.keys(JOB_DETAIL_DESIGN_STATUS_LABELS).sort()).toEqual([
			"completed",
			"requested",
		]);
	});
});

describe("getJobDisplayStatus", () => {
	it("marks a published-but-unpaid job as 미공개 (still gated before payment)", () => {
		expect(
			getJobDisplayStatus({
				paymentStatus: "unpaid",
				status: "published",
			})
		).toEqual({ label: "미공개", tone: "warning" });
	});

	it("marks a published and paid job as 공개", () => {
		expect(
			getJobDisplayStatus({
				paymentStatus: "paid",
				status: "published",
			})
		).toEqual({ label: "공개", tone: "good" });
	});

	it("keeps 검수 대기 for a pending review job regardless of payment", () => {
		expect(
			getJobDisplayStatus({
				paymentStatus: "unpaid",
				status: "pending_review",
			})
		).toEqual({ label: "검수 대기", tone: "warning" });
	});

	it("keeps existing labels/tones for rejected, hidden, and draft states", () => {
		expect(
			getJobDisplayStatus({
				paymentStatus: "unpaid",
				status: "rejected",
			})
		).toEqual({ label: "반려", tone: "danger" });
		expect(
			getJobDisplayStatus({ paymentStatus: "unpaid", status: "hidden" })
		).toEqual({ label: "숨김", tone: "default" });
		expect(
			getJobDisplayStatus({ paymentStatus: "unpaid", status: "draft" })
		).toEqual({ label: "임시 저장", tone: "default" });
	});
});
