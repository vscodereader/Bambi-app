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

// 취소는 canSetInterviewStatus(chats.ts:289)에서 제안자 제한이 없다 — proposed·confirmed면
// 양측 누구나. 그래서 수락·거절과 달리 viewerUserId를 보지 않는다.
export const canCancelInterview = (interview: { status: string }): boolean =>
	interview.status === "proposed" || interview.status === "confirmed";

const INTERVIEW_STATUS_ERROR_MESSAGES: Record<string, string> = {
	CONFLICT: "면접 상태가 바뀌었어요. 목록을 새로고침했어요.",
	// 이 맵은 수락·거절·취소가 공유하는 setInterviewStatus onError 하나에 물려 있고,
	// 서버 canSetInterviewStatus는 요청 status와 무관하게 FORBIDDEN을 던진다(chats.ts:1696).
	// 그래서 특정 동작("취소")을 지목하지 않는 중립 문구여야 한다.
	FORBIDDEN:
		"지금은 처리할 수 없는 면접이에요. 상대가 먼저 상태를 바꿨을 수 있어요.",
	// 목록은 나간 방의 면접도 내려주는데(chats.ts:1029) setInterviewStatus의 나간 방 예외는
	// completed 전용이라(chats.ts:1679) 취소만 NOT_FOUND로 튕긴다 — 응답만으로는 나간 방인지
	// 알 수 없어 UI로 못 막고 이 문구로 받아낸다.
	NOT_FOUND: "채팅방을 나가서 이 면접은 처리할 수 없어요.",
};

const INTERVIEW_STATUS_ERROR_FALLBACK = "잠시 후 다시 시도해 주세요.";

// oRPC는 message 없는 ORPCError에 영어 기본 문구를 채우므로(@orpc/client
// fallbackORPCErrorMessage: FORBIDDEN→"Forbidden") error.message를 그대로 쓰면 영어가 뜬다.
// 다만 채팅 차단·신고 대기(throwChatBlocked, chats.ts:699)만은 서버가 한국어 message와
// data.chatBlockReason을 함께 싣는다 — "message가 있으면"이 아니라 그 사유가 있을 때만
// 서버 문구를 살려야 영어 기본값과 구분된다.
export const interviewStatusErrorMessage = (error: {
	code?: string;
	data?: unknown;
	message?: string;
}): string => {
	const { data } = error;

	if (
		typeof data === "object" &&
		data !== null &&
		"chatBlockReason" in data &&
		typeof data.chatBlockReason === "string" &&
		error.message
	) {
		return error.message;
	}

	return (
		INTERVIEW_STATUS_ERROR_MESSAGES[error.code ?? ""] ??
		INTERVIEW_STATUS_ERROR_FALLBACK
	);
};

// 서버 bambi-review-policy.ts의 REVIEW_BODY_MIN/MAX_LENGTH·rating 1~5 정수와 같은 값.
// 어긋나면 눌러 봐야 BAD_REQUEST라 화면에서 먼저 막는다.
export const REVIEW_BODY_MIN_LENGTH = 20;
export const REVIEW_BODY_MAX_LENGTH = 1000;
export const REVIEW_RATINGS = [1, 2, 3, 4, 5] as const;

export const reviewBodyError = (body: string): null | string => {
	const { length } = body.trim();

	if (length < REVIEW_BODY_MIN_LENGTH) {
		return `후기는 ${REVIEW_BODY_MIN_LENGTH}자 이상 작성해 주세요.`;
	}

	if (length > REVIEW_BODY_MAX_LENGTH) {
		return `후기는 ${REVIEW_BODY_MAX_LENGTH}자 이하로 작성해 주세요.`;
	}

	return null;
};

// rating 0은 "미선택"이라 서버 zod(z.number())는 통과해도 validateReviewInput에서 튕긴다.
export const canSubmitReview = (input: {
	body: string;
	rating: number;
}): boolean =>
	Number.isInteger(input.rating) &&
	input.rating >= 1 &&
	input.rating <= 5 &&
	reviewBodyError(input.body) === null;

const REVIEW_ERROR_MESSAGES: Record<string, string> = {
	BAD_REQUEST: "별점과 후기 내용을 다시 확인해 주세요.",
	// 서버 중복 검사는 jobPostId 기준인데(reviews.ts:118) 화면의 기존 후기 탐지는
	// chatRoomId 기준이라, 같은 공고를 다른 방에서 진행하면 폼이 열린 채 CONFLICT가 난다.
	// 그래서 "이 채팅방"이 아니라 "이 공고"라고 쓴다(웹 문구는 이 점에서 부정확).
	CONFLICT: "이미 이 공고의 후기를 등록했어요.",
	// reviews.create는 그 방의 completed 면접 1건만 통과시킨다(reviews.ts:96) —
	// 서버 message는 "confirmed or completed"라고 하지만 쿼리는 completed만 본다.
	FORBIDDEN: "완료된 면접에만 후기를 남길 수 있어요.",
	UNAUTHORIZED: "로그인 후 다시 시도해 주세요.",
};

export const reviewErrorMessage = (code: string): string =>
	REVIEW_ERROR_MESSAGES[code] ??
	"후기를 등록하지 못했어요. 잠시 후 다시 시도해 주세요.";

// review.status enum(bambi-review-policy.ts ReviewStatus)도 원값을 내보내지 않는다.
// riskFlags(운영 판정 정보)는 라벨에도 싣지 않는다. hidden은 죽은 값이 아니다 —
// 운영자 숨김 조치(moderation set_status:hidden)로 실제 도달하며 포인트 회수·알림과
// 세트라, 초록 톤/미확인 문구로 얼버무리면 안 된다.
const REVIEW_STATUS_LABELS: Record<string, string> = {
	hidden: "숨김 처리됨",
	pending_review: "검수 중",
	published: "등록 완료",
};

const REVIEW_STATUS_TONES: Record<string, "danger" | "success" | "warning"> = {
	hidden: "danger",
	pending_review: "warning",
	published: "success",
};

export const reviewStatusLabel = (status: string): string =>
	REVIEW_STATUS_LABELS[status] ?? "상태 미확인";

export const reviewStatusTone = (
	status: string
): "danger" | "neutral" | "success" | "warning" =>
	REVIEW_STATUS_TONES[status] ?? "neutral";
