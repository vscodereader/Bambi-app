import { describe, expect, it } from "vitest";

import {
	getReportSeverity,
	matchesUserStatusFilter,
	moderationActionLabel,
	QUEUE_VERDICTS,
	REPORT_SEVERITY_LABELS,
	resolveQueueRiskLevel,
	targetTypeLabel,
} from "@/services/bambi-moderation-labels";

describe("getReportSeverity", () => {
	it("labels warning reversals from the moderation audit log", () => {
		expect(moderationActionLabel("revert_warning")).toBe("최근 경고 되돌리기");
	});
	it("marks safety reasons on open reports as high", () => {
		expect(getReportSeverity("coercion_or_safety", "open")).toBe("high");
		expect(getReportSeverity("underage_concern", "reviewing")).toBe("high");
	});
	it("marks other open reasons as mid", () => {
		expect(getReportSeverity("harassment", "open")).toBe("mid");
	});
	it("marks closed reports as low regardless of reason", () => {
		expect(getReportSeverity("coercion_or_safety", "resolved")).toBe("low");
		expect(getReportSeverity("other", "dismissed")).toBe("low");
	});
	it("has a Korean label for every severity", () => {
		expect(REPORT_SEVERITY_LABELS).toEqual({
			high: "높음",
			low: "참고",
			mid: "중간",
		});
	});
});

describe("QUEUE_VERDICTS", () => {
	it("maps verdicts to job post statuses with default reasons", () => {
		expect(QUEUE_VERDICTS.approve.status).toBe("published");
		expect(QUEUE_VERDICTS.hold.status).toBe("on_hold");
		expect(QUEUE_VERDICTS.reject.status).toBe("rejected");
		expect(QUEUE_VERDICTS.reject.danger).toBe(true);
		expect(QUEUE_VERDICTS.approve.reasons).toHaveLength(5);
		expect(QUEUE_VERDICTS.hold.defaultReason.length).toBeGreaterThanOrEqual(2);
	});
});

describe("resolveQueueRiskLevel", () => {
	it("is mid when terms were detected and low otherwise", () => {
		expect(resolveQueueRiskLevel(["x"])).toBe("mid");
		expect(resolveQueueRiskLevel([])).toBe("low");
	});
});

describe("matchesUserStatusFilter", () => {
	const active = { deletedAt: null, status: "active" };
	const deleted = { deletedAt: new Date(), status: "active" };
	it("treats all as pass-through", () => {
		expect(matchesUserStatusFilter(active, "all")).toBe(true);
		expect(matchesUserStatusFilter(deleted, "all")).toBe(true);
	});
	it("matches deleted only by deletedAt", () => {
		expect(matchesUserStatusFilter(deleted, "deleted")).toBe(true);
		expect(matchesUserStatusFilter(active, "deleted")).toBe(false);
	});
	it("excludes withdrawn accounts from status filters", () => {
		expect(matchesUserStatusFilter(active, "active")).toBe(true);
		expect(matchesUserStatusFilter(deleted, "active")).toBe(false);
	});
});

describe("labels keep existing behaviour", () => {
	it("labels a test account creation", () => {
		expect(moderationActionLabel("create_test_account")).toBe("가계정 생성");
	});
	it("falls back for unknown target types", () => {
		expect(targetTypeLabel("nope")).toBe("기타");
	});
});
