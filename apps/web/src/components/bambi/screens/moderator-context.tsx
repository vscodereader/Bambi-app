"use client";

// 밤비 — 운영자 콘솔 라우트 간 공유 상태(검수 큐/신고/사용자/선택/토스트).
// 레이아웃에 ModProvider를 두면 /moderator/* 라우트 전환에도 상태가 유지된다.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast as sonnerToast } from "sonner";
import { QUEUE, REPORTS, USERS } from "@/lib/bambi/data";
import { getVisibleModerationData } from "@/lib/bambi/moderation-data";
import type {
	CommunityTargetStatus,
	ManagedUser,
	QueueItem,
	Report,
	ReportCommunityTarget,
	UserStatus,
} from "@/lib/bambi/types";
import { orpc } from "@/utils/orpc";

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
	bulkAction: (
		scope: ModerationBulkScope,
		action: ModerationBulkAction,
		reason: string
	) => void;
	clearSelection: () => void;
	isBulkApplying: boolean;
	isLoading: boolean;
	moderateCommunityTarget: (
		report: Report,
		status: CommunityTargetStatus,
		reason: string
	) => void;
	openReports: number;
	queue: QueueItem[];
	reports: Report[];
	resolveQueue: (id: string, action: "approve" | "reject") => void;
	resolveReport: (id: string, action: "dismiss" | "act") => void;
	sanction: (id: string, status: UserStatus, label: string) => void;
	selected: string[];
	toast: string | null;
	toggleSelect: (id: string) => void;
	users: ManagedUser[];
	warnedUsers: number;
}

interface ApiQueueItem {
	createdAt: Date | string;
	description: string;
	descriptionBlocks: { text: string }[];
	hasCoverImage: boolean;
	id: string;
	industryCategory: string;
	mediaCount: number;
	organizationDisplayName: string;
	payAmount: number;
	payUnit: string;
	region: string;
	riskFlags: string[];
	status: string;
	title: string;
}

const ModContext = createContext<ModContextValue | null>(null);
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_ID_PATTERN = /^[qru]\d+$/;

const isUuid = (value: string) => UUID_PATTERN.test(value);
const isPreviewId = (value: string) => PREVIEW_ID_PATTERN.test(value);
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
const RISKY_BLOCK_TERMS = ["미성년", "성매매", "강요"] as const;
const getBlockRiskMatches = (
	blocks: { text: string }[] | null | undefined
): string[] => {
	if (!blocks?.length) {
		return [];
	}

	const matches = new Set<string>();

	for (const block of blocks) {
		for (const term of RISKY_BLOCK_TERMS) {
			if (block.text.includes(term)) {
				matches.add(term);
			}
		}
	}

	return [...matches];
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
	const blockRiskMatches = getBlockRiskMatches(item.descriptionBlocks);
	const mediaSummaries = getQueueMediaSummaries(item);
	const policyFlags = item.riskFlags.map((flag) => ({
		label: "정책 확인",
		match: flag,
		sev: "review" as const,
	}));
	const blockFlags = blockRiskMatches.map((match) => ({
		label: "블록 위험어",
		match,
		sev: "review" as const,
	}));
	const mediaFlags = mediaSummaries.map((summary) => ({
		label: "공고 구성",
		match: summary,
		sev: "ok" as const,
	}));
	const reviewFlags = [...policyFlags, ...blockFlags];
	const flags =
		reviewFlags.length || mediaFlags.length
			? [...reviewFlags, ...mediaFlags]
			: [
					{
						label: "검수 대기",
						match: item.status,
						sev: "review" as const,
					},
				];
	const detected = [
		...item.riskFlags,
		...blockRiskMatches,
		...mediaSummaries,
	].filter((summary) => summary.length > 0);

	return {
		company: item.organizationDisplayName,
		desc: item.description,
		detected: detected.length ? detected : ["검수 필요"],
		flags,
		id: item.id,
		location: item.region,
		pay: `${item.payUnit} ${item.payAmount.toLocaleString("ko-KR")}원`,
		receivedAt: formatDate(item.createdAt),
		refId: `#${item.id.slice(0, 8)}`,
		risk: reviewFlags.length ? "review" : "warn",
		riskLevel: reviewFlags.length ? "mid" : "low",
		role: item.industryCategory,
		submitted: formatDate(item.createdAt),
		title: item.title,
	};
};
const getRoleLabel = (role: string) => {
	if (role === "admin") {
		return "운영자";
	}

	if (role === "employer") {
		return "구인자";
	}

	return "구직자";
};

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

// 서버 계약(확장된 targetContext)에 맞춘 커뮤니티 대상 컨텍스트 형태. chatMessage는
// 다른 곳에서 다루므로 여기선 선택 필드로만 둔다(글·댓글 union도 이 형태에 대입 가능).
interface ReportCommunityContext {
	communityComment?: {
		authorName: string | null;
		bodyPreview: string;
		createdAt: Date | string;
		id: string;
		postBoard: string;
		postId: string;
		postTitle: string;
		status: CommunityTargetStatus;
	};
	communityPost?: {
		authorName: string | null;
		board: string;
		bodyPreview: string;
		createdAt: Date | string;
		id: string;
		status: CommunityTargetStatus;
		title: string;
	};
}

// 신고 행에서 커뮤니티 대상 정보를 UI 모델 필드로 변환한다. 대상 종류는 컨텍스트가
// 유실돼도 targetType으로 알 수 있어 상세의 "대상 없음" 안내에 쓴다.
const deriveReportCommunity = (input: {
	targetContext: ReportCommunityContext | null | undefined;
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

	const post = input.targetContext?.communityPost;
	if (post) {
		return {
			communityKind,
			communityTarget: {
				authorName: post.authorName,
				board: post.board,
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

	const comment = input.targetContext?.communityComment;
	if (comment) {
		return {
			communityKind,
			communityTarget: {
				authorName: comment.authorName,
				board: comment.postBoard,
				bodyPreview: comment.bodyPreview,
				createdAt: comment.createdAt,
				id: comment.id,
				kind: "comment",
				postId: comment.postId,
				status: comment.status,
				title: comment.postTitle,
			},
			target: `커뮤니티 댓글 · 원글 ${truncateTargetLabel(comment.postTitle)}`,
		};
	}

	return {
		communityKind,
		communityTarget: undefined,
		target: `${input.targetType} ${input.targetId.slice(0, 8)}`,
	};
};

export function ModProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const [queue, setQueue] = useState<QueueItem[]>(QUEUE);
	const [reports, setReports] = useState<Report[]>(REPORTS);
	const [users, setUsers] = useState<ManagedUser[]>(USERS);
	const [selected, setSelected] = useState<string[]>([]);
	const [toast, setToast] = useState<string | null>(null);
	const [hasQueueApiData, setHasQueueApiData] = useState(false);
	const [hasReportsApiData, setHasReportsApiData] = useState(false);
	const [hasUsersApiData, setHasUsersApiData] = useState(false);
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
		orpc.bambi.moderation.listUsers.queryOptions({
			input: { limit: 50 },
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

	useEffect(() => {
		if (moderationQueueQuery.isSuccess) {
			setHasQueueApiData(true);
		}
	}, [moderationQueueQuery.isSuccess]);

	useEffect(() => {
		if (moderationReportsQuery.isSuccess) {
			setHasReportsApiData(true);
		}
	}, [moderationReportsQuery.isSuccess]);

	useEffect(() => {
		if (moderationUsersQuery.isSuccess) {
			setHasUsersApiData(true);
		}
	}, [moderationUsersQuery.isSuccess]);

	const value = useMemo<ModContextValue>(() => {
		const flash = (msg: string) => {
			setToast(msg);
			if (timer.current) {
				clearTimeout(timer.current);
			}
			timer.current = setTimeout(() => setToast(null), 2200);
		};
		const apiQueue = moderationQueueQuery.data?.map(toApiQueueItem);
		const apiReports = moderationReportsQuery.data?.map<Report>((item) => {
			const attachments = item.targetContext?.chatMessage?.attachments ?? [];
			const attachmentMessages = attachments.map((attachment) => ({
				mine: false,
				text: `첨부 파일 · ${attachment.fileName} · ${attachment.mimeType} · ${formatByteSize(attachment.byteSize)}`,
			}));
			const baseNote = item.details ?? "상세 신고 내용이 없습니다.";
			const attachmentNote = attachments.length
				? `첨부 ${attachments.length}개 포함`
				: null;
			// 커뮤니티 대상(글·댓글) 컨텍스트·라벨은 별도 헬퍼로 뽑아 콜백 복잡도를 낮춘다.
			const { communityKind, communityTarget, target } =
				deriveReportCommunity(item);

			return {
				communityKind,
				communityTarget,
				id: item.id,
				note: attachmentNote ? `${baseNote}\n${attachmentNote}` : baseNote,
				reason: item.reason,
				reporter: `신고자 ${item.reporterUserId.slice(0, 6)}`,
				reporterRole: "사용자",
				sev: item.status === "open" ? "mid" : "low",
				status:
					item.status === "open" || item.status === "reviewing"
						? "open"
						: "closed",
				target,
				targetRole: "대상",
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
			id: item.userId,
			joined: formatDate(item.createdAt),
			name: item.displayName ?? item.email,
			note: item.isPhoneVerified
				? "휴대폰 인증 완료"
				: "휴대폰 인증이 필요합니다.",
			reports: 0,
			role: getRoleLabel(item.role),
			status: item.status,
			warnings: item.status === "warned" ? 1 : 0,
		}));
		const visibleQueue = getVisibleModerationData({
			apiData: apiQueue,
			hasApiData: hasQueueApiData || moderationQueueQuery.isSuccess,
			previewData: queue,
		});
		const visibleReports = getVisibleModerationData({
			apiData: apiReports,
			hasApiData: hasReportsApiData || moderationReportsQuery.isSuccess,
			previewData: reports,
		});
		const visibleUsers = getVisibleModerationData({
			apiData: apiUsers,
			hasApiData: hasUsersApiData || moderationUsersQuery.isSuccess,
			previewData: users,
		});
		const isLoading =
			moderationQueueQuery.isPending ||
			moderationQueueQuery.isFetching ||
			moderationReportsQuery.isPending ||
			moderationReportsQuery.isFetching ||
			moderationUsersQuery.isPending ||
			moderationUsersQuery.isFetching;
		const isBulkApplying =
			bulkSetJobPostStatusMutation.isPending ||
			bulkSetReportStatusMutation.isPending ||
			bulkSetUserStatusMutation.isPending;
		const toggleSelect = (id: string) =>
			setSelected((s) =>
				s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
			);
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
		const invalidateUsers = async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.bambi.moderation.listUsers.queryKey({
					input: { limit: 50 },
				}),
			});
		};
		const resolveQueue = (id: string, action: "approve" | "reject") => {
			if (isUuid(id)) {
				setJobPostStatusMutation.mutate(
					{
						jobPostId: id,
						reason:
							action === "approve"
								? "운영자가 공고를 승인했습니다."
								: "운영자가 정책 위반으로 공고를 반려했습니다.",
						status: action === "approve" ? "published" : "rejected",
					},
					{
						onSuccess: async () => {
							await queryClient.invalidateQueries({
								queryKey: orpc.bambi.moderation.listJobPosts.queryKey({
									input: { limit: 50, status: "pending_review" },
								}),
							});
						},
						onError: () =>
							flash("공고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."),
					}
				);
			}

			setQueue((q) => q.filter((x) => x.id !== id));
			setSelected((s) => s.filter((x) => x !== id));
			flash(action === "approve" ? "공고를 승인했어요" : "공고를 반려했어요");
		};
		const resolveReport = (id: string, action: "dismiss" | "act") => {
			if (isUuid(id)) {
				setReportStatusMutation.mutate(
					{
						reason:
							action === "dismiss"
								? "운영자가 신고를 기각했습니다."
								: "운영자가 신고 조치를 완료했습니다.",
						reportId: id,
						status: action === "dismiss" ? "dismissed" : "resolved",
					},
					{
						onSuccess: async () => {
							await queryClient.invalidateQueries({
								queryKey: orpc.bambi.moderation.listReports.queryKey({
									input: { limit: 50 },
								}),
							});
						},
						onError: () =>
							flash("신고 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."),
					}
				);
			}

			setReports((r) =>
				r.map((x) => (x.id === id ? { ...x, status: "closed" as const } : x))
			);
			flash(action === "dismiss" ? "신고를 기각했어요" : "조치를 적용했어요");
		};
		const sanction = (id: string, status: UserStatus, label: string) => {
			if (!isPreviewId(id)) {
				setUserStatusMutation.mutate(
					{
						reason: label,
						status: status === "blocked" ? "suspended" : status,
						targetUserId: id,
					},
					{
						onSuccess: async () => {
							await queryClient.invalidateQueries({
								queryKey: orpc.bambi.moderation.listUsers.queryKey({
									input: { limit: 50 },
								}),
							});
						},
						onError: () =>
							flash(
								"사용자 상태를 API에 반영하지 못했어요. 다시 시도해 주세요."
							),
					}
				);
			}

			setUsers((u) =>
				u.map((x) =>
					x.id === id
						? {
								...x,
								status,
								warnings: status === "warned" ? x.warnings + 1 : x.warnings,
							}
						: x
				)
			);
			flash(label);
		};
		// 커뮤니티 대상(글·댓글) 콘텐츠 조치. 신고 상태 변경(resolveReport)과는 별개로,
		// kind에 맞는 프로시저를 호출하고 성공 시 신고 목록을 무효화해 상태 배지를 갱신한다.
		const moderateCommunityTarget = (
			report: Report,
			status: CommunityTargetStatus,
			reason: string
		) => {
			const communityTarget = report.communityTarget;
			if (!communityTarget) {
				return;
			}

			const onSuccess = async () => {
				await invalidateReports();
				sonnerToast(communityActionMessage(communityTarget.kind, status));
			};
			const onError = () =>
				sonnerToast("조치를 반영하지 못했어요. 다시 시도해 주세요.");

			if (communityTarget.kind === "post") {
				setPostStatusByAdminMutation.mutate(
					{
						postId: communityTarget.id,
						reason,
						reportId: report.id,
						status,
					},
					{ onError, onSuccess }
				);
			} else {
				setCommentStatusByAdminMutation.mutate(
					{
						commentId: communityTarget.id,
						reason,
						reportId: report.id,
						status,
					},
					{ onError, onSuccess }
				);
			}
		};
		const applyQueueBulkAction = (
			selectedIds: string[],
			action: ModerationBulkAction,
			reason: string
		) => {
			let status: "hidden" | "published" | "rejected" = "hidden";
			let actionLabel = "공고 보류";

			if (action === "approve") {
				status = "published";
				actionLabel = "공고 승인";
			} else if (action === "reject") {
				status = "rejected";
				actionLabel = "공고 반려";
			}

			const apiIds = selectedIds.filter(isUuid);
			const previewIds = selectedIds.filter((id) => !isUuid(id));

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

			if (previewIds.length > 0) {
				setQueue((items) =>
					items.filter((item) => !previewIds.includes(item.id))
				);
				flash(`${actionLabel} · 성공 ${previewIds.length}건 · 실패 0건`);
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
			const previewIds = selectedIds.filter((id) => !isUuid(id));

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

			if (previewIds.length > 0) {
				setReports((items) =>
					items.map((item) =>
						previewIds.includes(item.id)
							? { ...item, status: "closed" as const }
							: item
					)
				);
				flash(`${actionLabel} · 성공 ${previewIds.length}건 · 실패 0건`);
			}
		};
		const applyUserBulkAction = (
			selectedIds: string[],
			action: ModerationBulkAction,
			reason: string
		) => {
			const status = action === "suspend" ? "suspended" : "warned";
			const actionLabel = action === "suspend" ? "사용자 정지" : "사용자 경고";
			const apiIds = selectedIds.filter((id) => !isPreviewId(id));
			const previewIds = selectedIds.filter(isPreviewId);

			if (apiIds.length > 0) {
				bulkSetUserStatusMutation.mutate(
					{
						reason,
						status,
						targetUserIds: apiIds,
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

			if (previewIds.length > 0) {
				setUsers((items) =>
					items.map((item) =>
						previewIds.includes(item.id)
							? {
									...item,
									status,
									warnings:
										status === "warned" ? item.warnings + 1 : item.warnings,
								}
							: item
					)
				);
				flash(`${actionLabel} · 성공 ${previewIds.length}건 · 실패 0건`);
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

		return {
			queue: visibleQueue,
			reports: visibleReports,
			users: visibleUsers,
			isLoading,
			isBulkApplying,
			selected,
			toast,
			openReports: visibleReports.filter((r) => r.status === "open").length,
			warnedUsers: visibleUsers.filter((u) => u.status === "warned").length,
			toggleSelect,
			clearSelection,
			resolveQueue,
			resolveReport,
			sanction,
			moderateCommunityTarget,
			bulkAction,
		};
	}, [
		bulkSetJobPostStatusMutation,
		bulkSetReportStatusMutation,
		bulkSetUserStatusMutation,
		hasQueueApiData,
		hasReportsApiData,
		hasUsersApiData,
		moderationQueueQuery.data,
		moderationQueueQuery.isFetching,
		moderationQueueQuery.isPending,
		moderationQueueQuery.isSuccess,
		moderationReportsQuery.data,
		moderationReportsQuery.isFetching,
		moderationReportsQuery.isPending,
		moderationReportsQuery.isSuccess,
		moderationUsersQuery.data,
		moderationUsersQuery.isFetching,
		moderationUsersQuery.isPending,
		moderationUsersQuery.isSuccess,
		queue,
		queryClient,
		reports,
		selected,
		setCommentStatusByAdminMutation,
		setJobPostStatusMutation,
		setPostStatusByAdminMutation,
		setReportStatusMutation,
		setUserStatusMutation,
		toast,
		users,
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
