// 밤비 신고 사유 카탈로그 — 신고 UI(safety-kit)가 쓰는 실데이터.
// 각 사유 id는 report-dialog.tsx에서 서버 신고 enum으로 매핑된다.

import type { ReportReason } from "./types";

export const REPORT_REASONS: ReportReason[] = [
	{ id: "sex", label: "성매매·성적 서비스 암시", sev: "high" },
	{ id: "coerce", label: "강요·협박·착취", sev: "high" },
	{ id: "minor", label: "미성년 관련", sev: "high" },
	{ id: "fake", label: "허위 공고·사기", sev: "mid" },
	{ id: "external", label: "외부 연락처 유도", sev: "mid" },
	{ id: "abuse", label: "욕설·혐오 표현", sev: "mid" },
	{ id: "etc", label: "기타", sev: "low" },
];
