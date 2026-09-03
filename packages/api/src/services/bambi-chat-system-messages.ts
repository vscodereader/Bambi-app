// 채팅 인라인 시스템 메시지(contact_request·interview_proposal)의 metadata 해석과 문구.
// web(seeker-chat-room-responsive)·native(chat-system-card)가 함께 import한다.
// 전화번호 포맷은 앱마다 다르므로(web formatPhone) 호출부가 포맷한 문자열을 넘긴다.

export type ContactRequestStatus = "declined" | "pending" | "revealed";
export type ContactRevealDecision = "decline" | "reveal";

export interface ContactRequestMetadata {
	requesterUserId: string;
	status: ContactRequestStatus;
	targetUserId: string;
}

const CONTACT_REQUEST_STATUSES: readonly string[] = [
	"declined",
	"pending",
	"revealed",
];

// contact_request 메시지의 jsonb metadata는 unknown이라 좁혀서 읽는다. 형태가
// 어긋나면 null(특수 렌더를 건너뛴다).
export const readContactRequestMetadata = (
	value: unknown
): ContactRequestMetadata | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const { requesterUserId, status, targetUserId } = value as Record<
		string,
		unknown
	>;

	if (
		typeof requesterUserId === "string" &&
		typeof targetUserId === "string" &&
		typeof status === "string" &&
		CONTACT_REQUEST_STATUSES.includes(status)
	) {
		return {
			requesterUserId,
			status: status as ContactRequestStatus,
			targetUserId,
		};
	}

	return null;
};

// contact_request 인라인 시스템 메시지 문구. 역할(구인자/구직자)과 status 전이로 분기.
export const getContactRequestNotice = ({
	counterpartName,
	revealedPhoneLabel,
	status,
	viewerIsEmployer,
}: {
	counterpartName: string;
	revealedPhoneLabel: null | string;
	status: ContactRequestStatus;
	viewerIsEmployer: boolean;
}): string => {
	if (status === "pending") {
		return viewerIsEmployer
			? "연락처 공개를 요청했습니다. (응답 대기 중)"
			: `${counterpartName}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?`;
	}

	if (status === "revealed") {
		return viewerIsEmployer
			? `${counterpartName}님께서 연락처를 공개했습니다: ${revealedPhoneLabel ?? "확인 필요"}`
			: "연락처를 공개했습니다.";
	}

	return viewerIsEmployer
		? `${counterpartName}님께서 연락처 공개를 거절하셨습니다.`
		: "연락처 공개를 거절했습니다.";
};

// interview_proposal 메시지 metadata는 interviewScheduleId만 담는다(상태·일시는 방
// 조회 schedules가 정본). 형태가 어긋나면 null → body 텍스트 폴백.
export const readInterviewProposalMetadata = (
	value: unknown
): { interviewScheduleId: string } | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const { interviewScheduleId } = value as Record<string, unknown>;

	if (typeof interviewScheduleId === "string") {
		return { interviewScheduleId };
	}

	return null;
};

// 면접 제안 인라인 카드 문구. status 전이 + 내가 제안자(구인자)인지로 분기.
export const getInterviewProposalNotice = (
	status: string,
	viewerIsProposer: boolean
): string => {
	switch (status) {
		case "proposed":
			return viewerIsProposer
				? "면접 일정을 제안했어요."
				: "면접 일정 제안이 도착했어요.";
		case "confirmed":
			return "면접 일정이 확정됐어요.";
		case "declined":
			return "면접 제안이 거절됐어요.";
		case "canceled":
			return "면접이 취소됐어요.";
		case "completed":
			return "면접이 완료됐어요.";
		default:
			return "면접 일정을 제안했습니다.";
	}
};
