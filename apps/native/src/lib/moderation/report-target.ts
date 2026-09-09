import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	type ReportSeverity,
	targetTypeLabel,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";

// 목록·상세가 같은 캐시(listReports)를 보므로 행 타입도 라우터 추론에서 그대로 뽑는다.
export type ModerationReport = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listReports"]>
>[number];

export type ReportTargetContext = NonNullable<
	ModerationReport["targetContext"]
>;

// 심각도 → Pill 톤. 목록 행과 상세 헤더가 같은 색을 쓴다.
export const REPORT_SEVERITY_TONES: Record<
	ReportSeverity,
	"danger" | "neutral" | "warning"
> = {
	high: "danger",
	low: "neutral",
	mid: "warning",
};

export interface ReportTargetParty {
	name: string;
	role: string;
}

// 피신고 대상 한 줄 표기. 대상 종류마다 이름이 될 필드가 달라 여기서 한 번만 고른다.
// 컨텍스트가 유실된 신고(대상 하드삭제)는 대상 유형 라벨 + id 앞자리로 떨어뜨린다.
export function resolveReportTargetParty(
	report: ModerationReport
): ReportTargetParty {
	const idShort = `#${report.targetId.slice(0, 8)}`;
	const ctx = report.targetContext;

	if (ctx && "user" in ctx) {
		return {
			name: ctx.user.displayName || idShort,
			role: userRoleLabel(ctx.user.role),
		};
	}
	if (ctx && "jobPost" in ctx) {
		return { name: ctx.jobPost.title, role: "공고" };
	}
	if (ctx && "chatRoom" in ctx) {
		return { name: ctx.chatRoom.jobPostTitle, role: "채팅방" };
	}
	// 커뮤니티·채팅 메시지 컨텍스트는 스냅샷 폴백 때문에 키가 있어도 값이 비어 있을 수
	// 있다(서버 sanitizeReportIdentitySnapshots도 같은 이중 확인을 한다).
	if (ctx && "communityPost" in ctx && ctx.communityPost) {
		return { name: ctx.communityPost.title || idShort, role: "커뮤니티 글" };
	}
	if (ctx && "communityComment" in ctx && ctx.communityComment) {
		// 댓글은 제목이 없다 — 본문 미리보기가 id보다 대상을 알아보기 쉽다.
		return {
			name: ctx.communityComment.bodyPreview || idShort,
			role: "커뮤니티 댓글",
		};
	}
	return { name: idShort, role: targetTypeLabel(report.targetType) };
}
