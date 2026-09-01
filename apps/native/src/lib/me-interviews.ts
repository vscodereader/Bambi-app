// "예정된 면접" 화면 전용 순수 헬퍼.

// 면접 상태 enum을 화면에 원값으로 내보내지 않는다 — 웹 lib/bambi-options의
// interviewStatusLabels 사본이다(apps/web은 native의 의존성이 아니라 import할 수 없다).
// 5종 누락은 테스트가 잡는다.
const INTERVIEW_STATUS_LABELS: Record<string, string> = {
	canceled: "취소",
	completed: "완료",
	confirmed: "확정",
	declined: "거절",
	proposed: "제안됨",
};

export const interviewStatusLabel = (status: string): string =>
	INTERVIEW_STATUS_LABELS[status] ?? "상태 미확인";

// 웹 upcoming-interviews-screen의 STATUS_TONES와 같은 매칭 — 제안=대기, 확정=진행,
// 거절·취소·완료는 지나간 일이라 중립.
export const interviewStatusTone = (
	status: string
): "neutral" | "success" | "warning" => {
	if (status === "proposed") {
		return "warning";
	}

	return status === "confirmed" ? "success" : "neutral";
};

// 서버 canSetInterviewStatus(packages/api/src/routers/bambi/chats.ts:278)의 confirmed·
// declined 조건을 그대로 미러링한다. 세션이 아직 로딩 중이면(viewerUserId undefined)
// "내가 제안한 건"과 구분이 안 되므로 버튼을 그리지 않는다 — 서버가 최종 방어선이지만
// 눌러도 FORBIDDEN인 버튼을 먼저 보여줄 이유가 없다.
export const canRespondToInterview = (
	interview: { proposedByUserId: string; status: string },
	viewerUserId: string | undefined
): boolean =>
	viewerUserId !== undefined &&
	interview.status === "proposed" &&
	interview.proposedByUserId !== viewerUserId;
