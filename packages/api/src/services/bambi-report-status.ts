// 신고 상태(report_status: open/reviewing/resolved/dismissed) 분류.
//
// createReport의 중복 신고 멱등 처리는 "미처리(open/reviewing) 신고가 이미 있으면 새 행을
// 만들지 않고 그 행을 돌려준다"가 목적이다. 종결(resolved/dismissed)된 신고까지 멱등 대상에
// 넣으면, 운영자가 기각(dismissed)한 뒤 같은 대상을 재신고해도 조용히 옛 기각 행이 반환돼
// 새 신고가 접수되지 않고, 기각 시 복구된 채팅방 숨김도 다시 걸리지 않는다.
// 그래서 멱등 대상은 미처리 상태로만 좁힌다.

export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

// 미처리(운영자 조치 전) 상태. 이 상태의 기존 신고만 재신고 시 멱등 대상으로 재사용한다.
export const PENDING_REPORT_STATUSES = ["open", "reviewing"] as const;

// 종결(기각/조치완료)된 신고가 있어도 재신고는 새 신고 행을 만들어야 하므로, 멱등 판정은
// 미처리 상태에서만 참이다.
export const isPendingReportStatus = (status: string): boolean =>
	(PENDING_REPORT_STATUSES as readonly string[]).includes(status);
