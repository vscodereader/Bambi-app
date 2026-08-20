"use client";

// 밤비 — 운영자 콘솔 라우트 간 공유 상태(검수 큐/신고/사용자/선택/토스트).
// 레이아웃에 ModProvider를 두면 /moderator/* 라우트 전환에도 상태가 유지된다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast as sonnerToast } from "sonner";
import {
	jobPostStatusLabel,
	riskFlagLabel,
	userRoleLabel,
} from "@/lib/bambi/moderation-labels";
import { reportReasonLabel, targetTypeLabel } from "@/lib/bambi/report-labels";
import type {
	CommunityTargetStatus,
	ManagedUser,
	QueueItem,
	Report,
	ReportCommunityTarget,
	ReportSeverity,
	ReportTargetContext,
	ReportTargetType,
	UserStatus,
} from "@/lib/bambi/types";
import { NEGOTIABLE_PAY_TEXT } from "@/lib/bambi-options";
import { orpc } from "@/utils/orpc";

// 검수 상세의 판정. 보류는 일괄 처리의 보류와 같은 조치(공고를 hidden으로 내림)다.
export type QueueVerdict = "approve" | "hold" | "reject";
// 판정 성공 토스트(프리뷰 콘솔·실서비스 콘솔 공용).
export const QUEUE_VERDICT_TOAST: Record<QueueVerdict, string> = {
	approve: "공고를 승인했어요",
	hold: "공고를 보류했어요",
	reject: "공고를 반려했어요",
};

export type ModerationBulkScope = "queue" | "reports" | "users";
export type ModerationBulkAction =
	| "approve"
	| "dismiss"
	| "hold"
	| "reject"
	| "resolve"
	| "suspend"
	| "warn";

interface ModContextValue {
	blockChatRoom: (
		chatRoomId: string,
		isBlocked: boolean,
		reason: string
	) => void;
	bulkAction: (
		scope: ModerationBulkScope,
		action: ModerationBulkAction,
		reason: string
	) => void;
	clearSelection: () => void;
	isBlockingChatRoom: boolean;
	isBulkApplying: boolean;
	isLoading: boolean;
	// 사용자 목록 조회 실패(목록 화면의 에러 상태 전용).
	isUsersError: boolean;
	moderateCommunityTarget: (
		report: Report,
		status: CommunityTargetStatus,
		reason: string
	) => Promise<boolean>;
	openReports: number;
	queue: QueueItem[];
	reports: Report[];
	resolveQueue: (id: string, action: QueueVerdict, reason?: string) => void;
	resolveReport: (
		id: string,
		action: "dismiss" | "act",
		reason?: string
	) => Promise<boolean>;
	// 탈퇴 복구(deletedAt 해제). 파기 완료 계정 등 서버 거절 사유를 그대로 띄워야 해서
	// 성공 여부만 돌려준다.
	restoreAccount: (id: string, reason: string) => Promise<boolean>;
	revertLatestWarning: (id: string, reason: string) => Promise<boolean>;
	// 적용 성공 여부를 돌려준다 — 호출자가 성공했을 때만 목록으로 되돌아갈 수 있게.
	sanction: (id: string, status: UserStatus, label: string) => Promise<boolean>;
	selected: string[];
	// 무료 법률 자문 답변 계정 지정·해제(구직자 ↔ 법률자문). 서버가 거절한 사유를 그대로
	// 띄워야 해서 성공 여부만 돌려주고 화면 이동은 호출자가 정한다.
	setLegalAdvisor: (
		id: string,
		role: "job_seeker" | "legal_advisor",
		reason: string
	) => Promise<boolean>;
	toast: string | null;
	toggleSelect: (id: string) => void;
	users: ManagedUser[];
	warnedUsers: number;
}

interface ApiQueueItem {
	createdAt: Date | string;
	description: string;
	descriptionBlocks: { text: string }[];
	// 서버가 저장 시점에 판정한 금칙어 원문. 클라이언트가 규칙을 다시 구현하지 않는다.
	detectedTerms: string[];
	hasCoverImage: boolean;
	id: string;
	industryCategory: string;
	mediaCount: number;
	organizationDisplayName: string;
	payAmount: null | number;
	payUnit: string;
	region: string;
	riskFlags: string[];
	status: string;
	title: string;
}

// 검수 상세 판정 → 공고 상태·기본 사유. 보류는 일괄 처리(applyQueueBulkAction)와 동일하게
// on_hold로 내린다 — 두 경로가 다른 상태로 갈리면 보류 공고가 큐에서 서로 다르게 보인다.
// hidden(운영자 강제 숨김)과 섞으면 구인자 목록에 "숨김"으로 떠 보류인지 알 수 없다.
type QueueVerdictStatus = "on_hold" | "published" | "rejected";

const QUEUE_VERDICT_STATUS: Record<
	QueueVerdict,
	{ defaultReason: string; status: QueueVerdictStatus }
> = {
	approve: {
		defaultReason: "운영자가 공고를 승인했습니다.",
		status: "published",
	},
	hold: {
		defaultReason: "운영자가 추가 확인을 위해 공고를 보류했습니다.",
		status: "on_hold",
	},
	reject: {
		defaultReason: "운영자가 정책 위반으로 공고를 반려했습니다.",
		status: "rejected",
	},
};

const ModContext = createContext<ModContextValue | null>(null);
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string) => UUID_PATTERN.test(value);
const formatDate = (value: Date | string) =>
	new Intl.DateTimeFormat("ko-KR", {
		dateStyle: "short",
		timeStyle: "short",
	}).format(new Date(value));
const formatByteSize = (byteSize: number) => {
	if (byteSize >= 1024 * 1024) {
		return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
	}

	return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
};
// 신고 사유 기반 중요도. 안전과 직결된 미처리 신고를 심각으로, 그 외 미처리는 주의,
// 처리 완료(resolved/dismissed)는 참고로 표시한다(기존 status만 보던 파생을 개선).
const HIGH_SEVERITY_REPORT_REASONS = new Set([
	"illegal_or_prohibited_content",
	"coercion_or_safety",
	"underage_concern",
]);
const getReportSeverity = (reason: string, status: string): ReportSeverity => {
	if (status !== "open" && status !== "reviewing") {
		return "low";
	}

	return HIGH_SEVERITY_REPORT_REASONS.has(reason) ? "high" : "mid";
};
const getQueueMediaSummaries = (item: ApiQueueItem): string[] =>
	[
		item.hasCoverImage ? "대표 이미지 포함" : "",
		item.mediaCount > 0 ? `이미지 ${item.mediaCount}개` : "",
		item.descriptionBlocks.length > 0
			? `상세 블록 ${item.descriptionBlocks.length}개`
			: "",
	].filter((summary) => summary.length > 0);

const toApiQueueItem = (item: ApiQueueItem): QueueItem => {
	const mediaSummaries = getQueueMediaSummaries(item);
	const detected = item.detectedTerms;
	const hasDetection = detected.length > 0;
	const detectionFlags = hasDetection
		? [
				{
					label: riskFlagLabel(item.riskFlags[0] ?? "banned_word"),
					match: detected.join(", "),
					sev: "review" as const,
				},
			]
		: [
				{
					label: jobPostStatusLabel(item.status),
					match: "감지된 문구 없음",
					sev: "ok" as const,
				},
			];
	const mediaFlags = mediaSummaries.map((summary) => ({
		label: "공고 구성",
		match: summary,
		sev: "ok" as const,
	}));

	return {
		company: item.organizationDisplayName,
		desc: item.description,
		detected,
		flags: [...detectionFlags, ...mediaFlags],
		id: item.id,
		location: item.region,
		mediaSummaries,
		pay:
			item.payAmount === null
				? NEGOTIABLE_PAY_TEXT
				: `${item.payUnit} ${item.payAmount.toLocaleString("ko-KR")}원`,
		receivedAt: formatDate(item.createdAt),
		refId: `#${item.id.slice(0, 8)}`,
		// 무조건 검수 체제에서는 감지 0건이 다수다. 위험도로 갈라 두면 운영자가
		// 큐 필터·정렬로 감지 건부터 처리할 수 있다.
		risk: hasDetection ? "review" : "ok",
		riskLevel: hasDetection ? "mid" : "low",
		role: item.industryCategory,
		submitted: formatDate(item.createdAt),
		title: item.title,
	};
};
// 피신고 대상의 표시 이름·역할을 targetContext 타입별로 계산한다. 사용자는 닉네임 +
// userRoleLabel(role), 공고는 제목 + "공고", 대화방은 연결 공고 제목 + "채팅방". 이름을 알 수
// 없는 대상(후기·채팅 메시지·맥락 없음)은 대상 id 축약(#앞8자)을 이름으로, 유형 라벨을 역할로
// 채워 "대상" 하드코딩과 이름·역할의 단어 중복을 피한다. enum 원값은 userRoleLabel로 차단한다.
const resolveReportTargetParty = (
	targetContext: ReportTargetContext,
	targetType: ReportTargetType,
	targetId: string
): { name: string; role: string } => {
	const idShort = `#${targetId.slice(0, 8)}`;

	if (targetContext && "user" in targetContext) {
		return {
			name: targetContext.user.displayName ?? idShort,
			role: userRoleLabel(targetContext.user.role),
		};
	}

	if (targetContext && "jobPost" in targetContext) {
		return {
			name: targetContext.jobPost.title,
			role: targetTypeLabel(targetType),
		};
	}

	if (targetContext && "chatRoom" in targetContext) {
		return {
			name: targetContext.chatRoom.jobPostTitle,
			role: targetTypeLabel(targetType),
		};
	}

	return { name: idShort, role: targetTypeLabel(targetType) };
};

// 신고자 표시 이름·역할. 서버 reporter(닉네임·이메일·역할)를 우선 쓰고, displayName이 없으면
// email로, reporter 자체가 없으면(대상 프로필 유실 등) 기존 합성 문자열로 폴백한다. 역할은
// userRoleLabel로 enum 원값(job_seeker 등) 노출을 막는다.
const resolveReportReporter = (
	reporter: {
		displayName: string | null;
		email: string;
		gender: "female" | "male" | null;
		role: string;
	} | null,
	reporterUserId: string
): { gender: "female" | "male" | null; name: string; role: string } => {
	if (!reporter) {
		return {
			gender: null,
			name: `신고자 ${reporterUserId.slice(0, 6)}`,
			role: "사용자",
		};
	}

	return {
		gender: reporter.gender,
		name: reporter.displayName ?? reporter.email,
		role: userRoleLabel(reporter.role),
	};
};

// 피신고자 이름을 특정할 수 없을 때 쓰는 중립 라벨(대상 제목으로 대신 채우지 않는다).
const MISSING_TARGET_NAME = "대상 없음";

const COMMUNITY_TARGET_LABEL_MAX = 18;
// 대상 라벨에 넣을 제목을 한 줄 길이로 줄인다(초과분은 말줄임).
const truncateTargetLabel = (value: string): string =>
	value.length > COMMUNITY_TARGET_LABEL_MAX
		? `${value.slice(0, COMMUNITY_TARGET_LABEL_MAX)}…`
		: value;

// 커뮤니티 조치 성공 토스트 문구(숨김·삭제는 대상 종류를 붙이고, 복구는 공통).
const communityActionMessage = (
	kind: "post" | "comment",
	status: CommunityTargetStatus
): string => {
	if (status === "published") {
		return "복구했어요.";
	}
	const subject = kind === "post" ? "글을" : "댓글을";
	if (status === "hidden") {
		return `${subject} 숨겼어요.`;
	}
	return `${subject} 삭제했어요.`;
};

// 신고 행에서 커뮤니티 대상 정보를 UI 모델 필드로 변환한다. 대상 종류는 컨텍스트가
// 유실돼도 targetType으로 알 수 있어 상세의 "대상 없음" 안내에 쓴다.
// targetContext는 targetType별 단일 키 유니온(공고·후기·사용자·대화방·커뮤니티)이라
// 커뮤니티 키만 `in`으로 좁혀서 읽는다.
const deriveReportCommunity = (input: {
	targetContext: ReportTargetContext;
	targetId: string;
	targetType: string;
}): {
	communityKind: "post" | "comment" | undefined;
	communityTarget: ReportCommunityTarget | undefined;
	target: string;
} => {
	let communityKind: "post" | "comment" | undefined;
	if (input.targetType === "community_post") {
		communityKind = "post";
	} else if (input.targetType === "community_comment") {
		communityKind = "comment";
	}

	const ctx = input.targetContext;
	const post = ctx && "communityPost" in ctx ? ctx.communityPost : undefined;
	if (post) {
		return {
			communityKind,
			communityTarget: {
				authorName: post.authorName,
				board: post.board,
				boardLabel: post.boardLabel,
				boardSlug: post.boardSlug,
				bodyPreview: post.bodyPreview,
				createdAt: post.createdAt,
				id: post.id,
				kind: "post",
				status: post.status,
				title: post.title,
			},
			target: `커뮤니티 글 · ${truncateTargetLabel(post.title)}`,
		};
	}

	const comment =
		ctx && "communityComment" in ctx ? ctx.communityComment : undefined;
	if (comment) {
		return {
			communityKind,
			communityTarget: {
				authorName: comment.authorName,
				board: comment.postBoard,
				boardLabel: comment.postBoardLabel,
				boardSlug: comment.postBoardSlug,
				bodyPreview: comment.bodyPreview,
				createdAt: comment.createdAt,
				id: comment.id,
				kind: "comment",
				parentStatus: comment.postStatus,
				// 수집 글 댓글은 원글(community_post) 행이 없어 postId가 null로 온다 —
				// 원글 링크가 없는 상태(undefined)로 정규화한다.
				postId: comment.postId ?? undefined,
				status: comment.status,
				title: comment.postTitle,
			},
			target: `커뮤니티 댓글 · 원글 ${truncateTargetLabel(comment.postTitle)}`,
		};
	}

	// 커뮤니티 외 대상(또는 컨텍스트 유실)은 enum 원값 대신 한국어 대상 라벨로 표기한다.
	return {
		communityKind,
		communityTarget: undefined,
		target: `${targetTypeLabel(input.targetType)} ${input.targetId.slice(0, 8)}`,
	};
};

export function ModProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const [selected, setSelected] = useState<string[]>([]);
	const [toast, setToast] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const moderationQueueQuery = useQuery(
		orpc.bambi.moderation.listJobPosts.queryOptions({
			input: { limit: 50, status: "pending_review" },
		})
	);
	const moderationReportsQuery = useQuery(
		orpc.bambi.moderation.listReports.queryOptions({
			input: { limit: 50 },
		})
	);
	const moderationUsersQuery = useQuery(
		// 운영자 콘솔은 전체 계정을 관리해야 하므로 넉넉한 상한으로 조회한다(목록은
		// DataTable에서 클라이언트 페이징). 계정이 이 상한을 넘어서면 서버 페이징 필요.
		orpc.bambi.moderation.listUsers.queryOptions({
			input: { limit: 1000 },
		})
	);
	const setJobPostStatusMutation = useMutation(
		orpc.bambi.moderation.setJobPostStatus.mutationOptions()
	);
	const setReportStatusMutation = useMutation(
		orpc.bambi.moderation.setReportStatus.mutationOptions()
	);
	const setUserStatusMutation = useMutation(
		orpc.bambi.moderation.setUserStatus.mutationOptions()
	);
	const revertLatestWarningMutation = useMutation(
		orpc.bambi.moderation.revertLatestWarning.mutationOptions()
	);
	const setUserRoleMutation = useMutation(
		orpc.bambi.moderation.setUserRole.mutationOptions()
	);
	// 탈퇴 복구는 계정 복구 라우터에 있다(제재가 아니라 계정 생명주기 조치라서).
	const restoreWithdrawnAccountMutation = useMutation(
		orpc.bambi.accountRecovery.restoreWithdrawnAccount.mutationOptions()
	);
	// 커뮤니티 대상(글·댓글) 운영자 상태 변경 프로시저.
	const setPostStatusByAdminMutation = useMutation(
		orpc.bambi.community.setPostStatusByAdmin.mutationOptions()
	);
	const setCommentStatusByAdminMutation = useMutation(
		orpc.bambi.community.setCommentStatusByAdmin.mutationOptions()
	);
	const bulkSetJobPostStatusMutation = useMutation(
		orpc.bambi.moderation.bulkSetJobPostStatus.mutationOptions()
	);
	const bulkSetReportStatusMutation = useMutation(
		orpc.bambi.moderation.bulkSetReportStatus.mutationOptions()
	);
	const bulkSetUserStatusMutation = useMutation(
		orpc.bambi.moderation.bulkSetUserStatus.mutationOptions()
	);
	const setChatRoomBlockedMutation = useMutation(
		orpc.bambi.moderation.setChatRoomBlocked.mutationOptions()
	);

	const value = useMemo<ModContextValue>(() => {
		const flash = (msg: string) => {
			setToast(msg);
			if (timer.current) {
				clearTimeout(timer.current);
			}
			timer.current = setTimeout(() => setToast(null), 2200);
		};
		const apiQueue = moderationQueueQuery.data?.map(toApiQueueItem);
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: target unions are normalized in one exhaustive adapter.
		const apiReports = moderationReportsQuery.data?.map<Report>((item) => {
			// targetContext는 targetType별 단일 키 유니온이라 chat_message만 좁혀서 첨부를 읽는다.
			const targetContext = item.targetContext;
			const attachments =
				targetContext && "chatMessage" in targetContext
					? (targetContext.chatMessage?.attachments ?? [])
					: [];
			const attachmentMessages = attachments.map((attachment) => ({
				mine: false,
				text: `첨부 파일 · ${attachment.fileName} · ${attachment.mimeType} · ${formatByteSize(attachment.byteSize)}`,
			}));
			const baseNote = item.details ?? "상세 신고 내용이 없습니다.";
			const attachmentNote = attachments.length
				? `첨부 ${attachments.length}개 포함`
				: null;
			// 신고자·피신고 표시 이름·역할은 각각 전용 헬퍼가 계산한다. 제재·분기용
			// 원값(targetId/targetType/targetContext)은 반환에서 그대로 전달한다.
			const {
				gender: reporterGender,
				name: reporterName,
				role: reporterRole,
			} = resolveReportReporter(item.reporter, item.reporterUserId);
			const { name: targetName, role: targetRole } = resolveReportTargetParty(
				targetContext,
				item.targetType,
				item.targetId
			);
			const targetUser = item.targetUserId
				? moderationUsersQuery.data?.find(
						(candidate) => candidate.userId === item.targetUserId
					)
				: null;
			const isChatRoomTarget = Boolean(
				targetContext && "chatRoom" in targetContext
			);
			// 커뮤니티 대상(글·댓글) 컨텍스트·라벨은 별도 헬퍼로 뽑아 콜백 복잡도를 낮춘다.
			const { communityKind, communityTarget, target } =
				deriveReportCommunity(item);
			const targetFallbackName = communityKind ? target : targetName;

			return {
				communityKind,
				communityTarget,
				id: item.id,
				note: attachmentNote ? `${baseNote}\n${attachmentNote}` : baseNote,
				reason: reportReasonLabel(item.reason),
				resolutionReason: item.resolutionReason,
				reporter: reporterName,
				reporterGender,
				reporterRole,
				reporterVerifiedIdentity: item.reporterVerifiedIdentity,
				sev: getReportSeverity(item.reason, item.status),
				status:
					item.status === "open" || item.status === "reviewing"
						? "open"
						: "closed",
				// 커뮤니티 대상은 deriveReportCommunity가 만든 라벨("커뮤니티 글 · 제목")이 더
				// 구체적이고, 그 외 대상은 resolveReportTargetParty가 닉네임·공고 제목을 찾아준다.
				// 단 채팅방 신고의 targetName은 방 제목(연결 공고)이라 대상 회원을 못 찾았을 때
				// 그대로 쓰면 방 제목이 피신고자 이름 자리에 들어간다 — 중립 라벨로 막는다.
				target:
					targetUser?.name ??
					(isChatRoomTarget ? MISSING_TARGET_NAME : targetFallbackName),
				// 실데이터 신고의 대상 맥락(orpc 추론)을 그대로 전달해 상세에서 타입별 렌더한다.
				targetContext: item.targetContext,
				// 실제 대상 id(사용자 제재 등에 사용). 프리뷰 목업 신고에는 없다.
				targetId: item.targetId,
				targetUserId: item.targetUserId,
				targetVerifiedIdentity: item.targetVerifiedIdentity,
				targetRole:
					isChatRoomTarget || !targetUser
						? targetRole
						: userRoleLabel(targetUser.role),
				targetType: item.targetType,
				targetUserRole: targetUser ? userRoleLabel(targetUser.role) : null,
				thread: [
					{
						mine: false,
						text: item.details ?? "신고 상세 내용을 확인해 주세요.",
					},
					...attachmentMessages,
				],
				time: formatDate(item.createdAt),
			};
		});
		const apiUsers = moderationUsersQuery.data?.map<ManagedUser>((item) => ({
			blockedByCount: item.blockedByCount,
			deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
			email: item.email,
			grade: item.grade,
			id: item.userId,
			isPhoneVerified: item.isPhoneVerified,
			joined: formatDate(item.createdAt),
			// 정렬용 원값. 포맷 문자열(joined)로 정렬하면 "24. 1. 5." 같은 표기가 사전순으로 섞인다.
			joinedAt: new Date(item.createdAt),
			loginId: item.loginId,
			name: item.name,
			note: item.isPhoneVerified
				? "휴대폰 인증 완료"
				: "휴대폰 인증이 필요합니다.",
			organizationNames: item.organizationNames,
			pointBalance: item.pointBalance,
			purgedAt: item.purgedAt ? new Date(item.purgedAt) : null,
			reports: item.reportsCount,
			role: userRoleLabel(item.role),
			roleKey: item.role,
			status: item.status,
			warnings: item.warningsCount,
		}));
		const visibleQueue = apiQueue ?? [];
		const visibleReports = apiReports ?? [];
		const visibleUsers = apiUsers ?? [];
		// 초기 로딩만 로딩으로 취급한다. 백그라운드 refetch(isFetching)를 포함하면
		// 상세 페이지(queue/[id])의 `if (isLoading) return null`이 결제 패널을 언마운트하고,
		// 언마운트→리마운트 때 동일 쿼리를 다시 refetch해 listJobPosts를 무한 호출한다.
		const isLoading =
			moderationQueueQuery.isPending ||
			moderationReportsQuery.isPending ||
			moderationUsersQuery.isPending;
		const isBulkApplying =
			bulkSetJobPostStatusMutation.isPending ||
			bulkSetReportStatusMutation.isPending ||
			bulkSetUserStatusMutation.isPending;
		const toggleSelect = (id: string) => {
			const target = visibleReports.find((item) => item.id === id);
			if (target?.status === "closed") {
				return;
			}
			setSelected((s) =>
				s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
			);
		};
		const clearSelection = () => setSelected([]);
		const summarizeBulkResult = (
			actionLabel: string,
			result: {
				failed: number;
				failures: { targetId: string }[];
				succeeded: number;
			}
		) => {
			const failedIds = result.failures
				.slice(0, 3)
				.map((failure) => failure.targetId.slice(0, 8));
			const failureText = failedIds.length
				? ` · 실패 ID ${failedIds.join(", ")}`
				: "";

			return `${actionLabel} · 성공 ${result.succeeded}건 · 실패 ${result.failed}건${failureText}`;
		};
		const invalidateQueue = async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
					input: { limit: 50, status: "pending_review" },
				}),
			});
		};
		const invalidateReports = async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.listReports.queryKey({
					input: { limit: 50 },
				}),
			});
		};
		const invalidateUsers = async (targetUserId?: string) => {
			const invalidations = [
				queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listUsers.queryKey({
						input: { limit: 1000 },
					}),
				}),
			];
			if (targetUserId) {
				invalidations.push(
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.moderation.listUserModerationActions.queryKey({
							input: { targetUserId },
						}),
					})
				);
			}
			await Promise.all(invalidations);
		};
		const resolveQueue = (
			id: string,
			action: QueueVerdict,
			reason?: string
		) => {
			const verdict = QUEUE_VERDICT_STATUS[action];

			setJobPostStatusMutation.mutate(
				{
					jobPostId: id,
					// 상세에서 고른 사유를 그대로 감사 로그에 남긴다(미선택 시 기본 문구).
					reason: reason?.trim() || verdict.defaultReason,
					status: verdict.status,
				},
				{
					onSuccess: async () => {
						await invalidateQueue();
					},
					onError: () =>
						flash("공고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."),
				}
			);

			setSelected((s) => s.filter((x) => x !== id));
			flash(QUEUE_VERDICT_TOAST[action]);
		};
		const resolveReport = async (
			id: string,
			action: "dismiss" | "act",
			reason?: string
		) => {
			try {
				await setReportStatusMutation.mutateAsync({
					reason:
						reason?.trim() ||
						(action === "dismiss"
							? "운영자가 신고를 기각했습니다."
							: "운영자가 신고 조치를 완료했습니다."),
					reportId: id,
					status: action === "dismiss" ? "dismissed" : "resolved",
				});
			} catch {
				flash(
					"사유가 500자를 넘어 신고 상태를 API에 반영하지 못했어요. 사유는 500자 이내로 입력해 주세요."
				);
				return false;
			}

			await invalidateReports();
			flash(action === "dismiss" ? "신고를 기각했어요" : "조치를 적용했어요");
			return true;
		};
		// 적용이 끝날 때까지 기다렸다가 결과를 알려준다 — 실패한 제재로 화면이 먼저
		// 넘어가면 운영자가 반영되지 않은 걸 모른 채 목록으로 돌아간다.
		const sanction = async (id: string, status: UserStatus, label: string) => {
			try {
				await setUserStatusMutation.mutateAsync({
					reason: label,
					status,
					targetUserId: id,
				});
			} catch {
				flash("사용자 상태를 API에 반영하지 못했어요. 다시 시도해 주세요.");
				return false;
			}

			await invalidateUsers(id);
			flash(label);
			return true;
		};
		const revertLatestWarning = async (id: string, reason: string) => {
			try {
				await revertLatestWarningMutation.mutateAsync({
					reason,
					targetUserId: id,
				});
			} catch (error) {
				flash(
					error instanceof Error && error.message
						? error.message
						: "최근 경고를 되돌리지 못했어요. 다시 시도해 주세요."
				);
				return false;
			}

			await invalidateUsers(id);
			flash("최근 경고 1회를 되돌렸어요");
			return true;
		};
		// 역할 전환은 구직자 ↔ 법률자문만 열려 있다(서버 assertLegalAdvisorRoleSwitch).
		// 거절 사유가 계정 종류마다 달라 서버 메시지를 그대로 띄운다.
		const setLegalAdvisor = async (
			id: string,
			role: "job_seeker" | "legal_advisor",
			reason: string
		) => {
			try {
				await setUserRoleMutation.mutateAsync({
					reason,
					role,
					targetUserId: id,
				});
			} catch (error) {
				flash(
					error instanceof Error && error.message
						? error.message
						: "역할을 변경하지 못했어요. 다시 시도해 주세요."
				);
				return false;
			}

			await invalidateUsers(id);
			flash(
				role === "legal_advisor"
					? "법률자문으로 지정했어요"
					: "법률자문 지정을 해제했어요"
			);
			return true;
		};
		// 탈퇴 복구. 파기가 끝난 계정 등 서버가 거절하는 사유가 여러 갈래라 메시지를
		// 그대로 띄우고, 성공 여부만 돌려준다(화면 이동은 호출자가 정한다).
		const restoreAccount = async (id: string, reason: string) => {
			try {
				await restoreWithdrawnAccountMutation.mutateAsync({
					reason,
					targetUserId: id,
				});
			} catch (error) {
				flash(
					error instanceof Error && error.message
						? error.message
						: "탈퇴를 복구하지 못했어요. 다시 시도해 주세요."
				);
				return false;
			}

			await invalidateUsers(id);
			flash("탈퇴를 복구했어요. 본인이 기존 아이디로 다시 로그인할 수 있어요");
			return true;
		};
		// 커뮤니티 대상(글·댓글) 콘텐츠 조치. 신고 상태 변경(resolveReport)과는 별개로,
		// kind에 맞는 프로시저를 호출하고 성공 시 신고 목록을 무효화해 상태 배지를 갱신한다.
		const moderateCommunityTarget = async (
			report: Report,
			status: CommunityTargetStatus,
			reason: string
		) => {
			const communityTarget = report.communityTarget;
			if (!communityTarget) {
				return false;
			}

			try {
				if (communityTarget.kind === "post") {
					await setPostStatusByAdminMutation.mutateAsync({
						postId: communityTarget.id,
						reason,
						reportId: report.id,
						status,
					});
				} else {
					await setCommentStatusByAdminMutation.mutateAsync({
						commentId: communityTarget.id,
						reason,
						reportId: report.id,
						status,
					});
				}
			} catch {
				sonnerToast("조치를 반영하지 못했어요. 다시 시도해 주세요.");
				return false;
			}

			const resolved = await resolveReport(report.id, "act", reason);
			if (resolved) {
				sonnerToast(communityActionMessage(communityTarget.kind, status));
			}
			return resolved;
		};
		const applyQueueBulkAction = (
			selectedIds: string[],
			action: ModerationBulkAction,
			reason: string
		) => {
			let status: QueueVerdictStatus = "on_hold";
			let actionLabel = "공고 보류";

			if (action === "approve") {
				status = "published";
				actionLabel = "공고 승인";
			} else if (action === "reject") {
				status = "rejected";
				actionLabel = "공고 반려";
			}

			const apiIds = selectedIds.filter(isUuid);

			if (apiIds.length > 0) {
				bulkSetJobPostStatusMutation.mutate(
					{
						jobPostIds: apiIds,
						reason,
						status,
					},
					{
						onSuccess: async (result) => {
							await invalidateQueue();
							flash(summarizeBulkResult(actionLabel, result));
						},
						onError: () =>
							flash("공고 일괄 처리에 실패했어요. 다시 시도해 주세요."),
					}
				);
			}
		};
		const applyReportBulkAction = (
			selectedIds: string[],
			action: ModerationBulkAction,
			reason: string
		) => {
			const status = action === "dismiss" ? "dismissed" : "resolved";
			const actionLabel = action === "dismiss" ? "신고 기각" : "신고 해결";
			const apiIds = selectedIds.filter(isUuid);

			if (apiIds.length > 0) {
				bulkSetReportStatusMutation.mutate(
					{
						reason,
						reportIds: apiIds,
						status,
					},
					{
						onSuccess: async (result) => {
							await invalidateReports();
							flash(summarizeBulkResult(actionLabel, result));
						},
						onError: () =>
							flash("신고 일괄 처리에 실패했어요. 다시 시도해 주세요."),
					}
				);
			}
		};
		const applyUserBulkAction = (
			selectedIds: string[],
			action: ModerationBulkAction,
			reason: string
		) => {
			const status = action === "suspend" ? "suspended" : "warned";
			const actionLabel = action === "suspend" ? "사용자 정지" : "사용자 경고";

			if (selectedIds.length > 0) {
				bulkSetUserStatusMutation.mutate(
					{
						reason,
						status,
						targetUserIds: selectedIds,
					},
					{
						onSuccess: async (result) => {
							await invalidateUsers();
							flash(summarizeBulkResult(actionLabel, result));
						},
						onError: () =>
							flash("사용자 일괄 처리에 실패했어요. 다시 시도해 주세요."),
					}
				);
			}
		};
		const bulkAction = (
			scope: ModerationBulkScope,
			action: ModerationBulkAction,
			reason: string
		) => {
			const selectedIds = [...selected];

			if (selectedIds.length === 0) {
				return;
			}

			if (scope === "queue") {
				applyQueueBulkAction(selectedIds, action, reason);
			} else if (scope === "reports") {
				applyReportBulkAction(selectedIds, action, reason);
			} else {
				applyUserBulkAction(selectedIds, action, reason);
			}

			setSelected([]);
		};
		const blockChatRoom = (
			chatRoomId: string,
			isBlocked: boolean,
			reason: string
		) => {
			if (!isUuid(chatRoomId)) {
				flash("실데이터 대화방에만 차단을 적용할 수 있어요.");
				return;
			}

			setChatRoomBlockedMutation.mutate(
				{ chatRoomId, isBlocked, reason },
				{
					onSuccess: async () => {
						await invalidateReports();
						flash(
							isBlocked ? "대화방을 차단했어요" : "대화방 차단을 해제했어요"
						);
					},
					onError: () =>
						flash("대화방 차단 상태를 반영하지 못했어요. 다시 시도해 주세요."),
				}
			);
		};

		return {
			blockChatRoom,
			isBlockingChatRoom: setChatRoomBlockedMutation.isPending,
			queue: visibleQueue,
			reports: visibleReports,
			users: visibleUsers,
			isLoading,
			isBulkApplying,
			isUsersError: moderationUsersQuery.isError,
			selected,
			toast,
			openReports: visibleReports.filter((r) => r.status === "open").length,
			warnedUsers: visibleUsers.filter((u) => u.status === "warned").length,
			toggleSelect,
			clearSelection,
			resolveQueue,
			resolveReport,
			restoreAccount,
			revertLatestWarning,
			sanction,
			setLegalAdvisor,
			moderateCommunityTarget,
			bulkAction,
		};
	}, [
		bulkSetJobPostStatusMutation,
		bulkSetReportStatusMutation,
		bulkSetUserStatusMutation,
		moderationQueueQuery.data,
		moderationQueueQuery.isPending,
		moderationReportsQuery.data,
		moderationReportsQuery.isPending,
		moderationUsersQuery.data,
		moderationUsersQuery.isError,
		moderationUsersQuery.isPending,
		queryClient,
		restoreWithdrawnAccountMutation,
		revertLatestWarningMutation,
		selected,
		setChatRoomBlockedMutation,
		setCommentStatusByAdminMutation,
		setJobPostStatusMutation,
		setPostStatusByAdminMutation,
		setReportStatusMutation,
		setUserRoleMutation,
		setUserStatusMutation,
		toast,
	]);

	return <ModContext.Provider value={value}>{children}</ModContext.Provider>;
}

export function useMod(): ModContextValue {
	const ctx = useContext(ModContext);
	if (!ctx) {
		throw new Error("useMod must be used within ModProvider");
	}
	return ctx;
}
