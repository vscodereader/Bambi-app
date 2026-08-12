import { describe, expect, it } from "vitest";

import {
	isPendingReportStatus,
	PENDING_REPORT_STATUSES,
} from "@/services/bambi-report-status";

describe("isPendingReportStatus", () => {
	it("미처리(open/reviewing) 신고는 멱등 대상이라 true", () => {
		expect(isPendingReportStatus("open")).toBe(true);
		expect(isPendingReportStatus("reviewing")).toBe(true);
	});

	// 재신고 버그의 회귀 가드: 기각(dismissed)·조치완료(resolved) 신고는 멱등 대상이 아니어야
	// 재신고 시 새 신고 행이 생기고, 기각으로 복구된 채팅방 숨김이 다시 걸린다.
	it("종결(resolved/dismissed) 신고는 멱등 대상이 아니라 false", () => {
		expect(isPendingReportStatus("resolved")).toBe(false);
		expect(isPendingReportStatus("dismissed")).toBe(false);
	});

	it("멱등 대상 상태 집합은 open/reviewing 둘뿐이다", () => {
		expect([...PENDING_REPORT_STATUSES]).toEqual(["open", "reviewing"]);
	});
});
