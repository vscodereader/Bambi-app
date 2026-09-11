// 밤비 native — "내 신고 내역" 화면 전용 라벨·대상 요약 순수 로직.
// enum 값은 packages/api moderation의 reportReasonSchema/targetTypeSchema와,
// 라벨 문자열은 apps/web/src/lib/bambi/report-labels.ts와 일치해야 한다.

export const REPORT_REASON_LABELS: Record<string, string> = {
	illegal_or_prohibited_content: "불법·금지 콘텐츠",
	coercion_or_safety: "강요·안전 위협",
	underage_concern: "미성년 의심",
	scam_or_fraud: "사기·기만",
	harassment: "괴롭힘",
	misleading_job_information: "허위 공고 정보",
	other: "기타",
};

export const REPORT_TARGET_TYPE_LABELS: Record<string, string> = {
	job_post: "공고",
	chat_room: "채팅방",
	chat_message: "채팅 메시지",
	review: "후기",
	user: "사용자",
	community_post: "커뮤니티 글",
	community_comment: "커뮤니티 댓글",
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
	open: "접수됨",
	reviewing: "검토 중",
	resolved: "처리 완료",
	dismissed: "반려됨",
};

type PillTone = "accent" | "danger" | "neutral" | "success" | "warning";

const REPORT_STATUS_TONES: Record<string, PillTone> = {
	open: "warning",
	reviewing: "accent",
	resolved: "success",
	dismissed: "danger",
};

// reason·targetType·status는 서버가 text/enum으로 내려주는 string이라 TS 유니온이 아니다.
// 아래 헬퍼들은 알 수 없는 값에도 중립 폴백을 돌려준다 — DB enum 원값이 화면에 그대로
// 노출되는 것을 막는다(웹 statusLabel은 원값을 그대로 렌더해 여기서 의도적으로 갈라진다).
export function reportReasonLabel(reason: string): string {
	return REPORT_REASON_LABELS[reason] ?? "기타";
}

export function targetTypeLabel(targetType: string): string {
	return REPORT_TARGET_TYPE_LABELS[targetType] ?? "기타";
}

export function statusLabel(status: string): string {
	return REPORT_STATUS_LABELS[status] ?? "처리 중";
}

export function statusTone(status: string): PillTone {
	return REPORT_STATUS_TONES[status] ?? "neutral";
}

export const previewText = (value: string, max = 12): string =>
	value.length > max ? `${value.slice(0, max)}...` : value;

// 서버 targetContext는 판별 프로퍼티가 아니라 키가 다른 객체 유니온이라, 좁히기(캐스팅)를
// 이 파일 한 곳에 가두고 화면에는 kind 판별 유니온만 넘긴다.
interface ReportTargetContext {
	chatRoom?: null | { jobPostTitle: string; organizationDisplayName: string };
	communityComment?: null | { bodyPreview: string };
	communityPost?: null | { title: string };
	jobPost?: null | {
		id: string;
		organizationDisplayName: string;
		payAmount: null | number;
		payUnit: string;
		title: string;
	};
}

export type ReportTargetSummary =
	| { kind: "box"; subtitle: string; title: string }
	| {
			kind: "jobPost";
			id: string;
			organizationDisplayName: string;
			payAmount: null | number;
			payUnit: string;
			title: string;
	  }
	| { kind: "line"; text: string }
	| { kind: "none" }
	| { kind: "unavailable" };

export function summarizeReportTarget(item: {
	targetContext: unknown;
	targetUnavailable: boolean;
}): ReportTargetSummary {
	if (item.targetUnavailable || !item.targetContext) {
		return { kind: "unavailable" };
	}

	const context = item.targetContext as ReportTargetContext;

	if (context.jobPost) {
		const { id, organizationDisplayName, payAmount, payUnit, title } =
			context.jobPost;
		return {
			id,
			kind: "jobPost",
			organizationDisplayName,
			payAmount,
			payUnit,
			title,
		};
	}

	if (context.chatRoom) {
		return {
			kind: "box",
			subtitle: context.chatRoom.organizationDisplayName,
			title: context.chatRoom.jobPostTitle,
		};
	}

	if (context.communityPost) {
		return {
			kind: "line",
			text: `원글 : ${previewText(context.communityPost.title)}`,
		};
	}

	if (context.communityComment) {
		return {
			kind: "line",
			text: `원 댓글 : ${previewText(context.communityComment.bodyPreview)}`,
		};
	}

	// review·user·chatMessage 대상은 웹도 요약을 렌더하지 않는다(사유·상태·날짜만 보인다).
	return { kind: "none" };
}
