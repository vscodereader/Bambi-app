import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	accountStatusLabel,
	CHAT_ROOM_BLOCK_TOASTS,
	COMMUNITY_ACTIONS,
	CONTENT_STATUS_LABELS,
	type CommunityAction,
	type CommunityContentStatus,
	communityActionToast,
	getReportSeverity,
	jobPostStatusLabel,
	OPEN_REPORT_STATUSES,
	REPORT_RESOLVE_DEFAULT_REASON,
	REPORT_SEVERITY_LABELS,
	REPORT_TOASTS,
	reportReasonLabel,
	reportStatusLabel,
	reviewStatusLabel,
	type SanctionStatus,
	targetTypeLabel,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Surface, useToast } from "heroui-native";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
	BambiScreen,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { ChatModerationThread } from "@/src/components/moderation/chat-moderation-thread";
import { ConfirmDialog } from "@/src/components/moderation/confirm-dialog";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { SanctionDialog } from "@/src/components/moderation/sanction-dialog";
import { contentBoardLabel } from "@/src/lib/me-content";
import { formatPhoneNumber } from "@/src/lib/me-settings";
import { createFollowupAction } from "@/src/lib/moderation/followup-action";
import { returnToModeratorList } from "@/src/lib/moderation/navigation";
import {
	reportListOptions,
	useInvalidateModeration,
	userListOptions,
} from "@/src/lib/moderation/queries";
import {
	type ModerationReport,
	REPORT_SEVERITY_TONES,
	type ReportTargetContext,
	type ReportTargetParty,
	resolveReportTargetParty,
} from "@/src/lib/moderation/report-target";
import { orpc } from "@/src/lib/orpc";

type DialogState =
	| null
	| { isBlocked: boolean; kind: "block" }
	| { action: CommunityAction; kind: "community" }
	| { kind: "dismiss" }
	| { kind: "sanction" };

// 대상 콘텐츠를 직접 조치해야 끝나는 신고들이다 — "조치 완료"만 누르고 넘어가지 못하게
// 버튼을 숨긴다(커뮤니티는 숨김·삭제, 채팅은 차단이 실제 조치다).
const CONTENT_ACTION_TARGET_TYPES = new Set<string>([
	"chat_message",
	"chat_room",
	"community_comment",
	"community_post",
]);

const MISSING_VERIFIED_IDENTITY = "본인인증 정보 없음";
const MISSING_TARGET_NAME = "대상 회원";

// 수집 커뮤니티 글에 달린 댓글은 원글 행이 없어 게시판 조인이 비고, 서버가 board만
// "work_talk"으로 세워 준다 — 그 게시판 이름으로 되짚어 key 원값이 화면에 새지 않게 한다.
const CRAWLED_COMMENT_BOARD_LABEL = "밤문화 이야기";
const CRAWLED_COMMENT_BOARD_KEY = "work_talk";

type ModeratorUser = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listUsers"]>
>[number];

// 채팅방 신고의 피신고자는 방 제목이 아니라 방을 만든 구인자다(targetUserId =
// chatRoom.employerUserId). 그대로 두면 "신고 대상 · 채팅방" 카드와 이름이 겹친다 —
// 사용자 목록 캐시에 있으면 회원명을, 없으면 중립 라벨을 쓴다(추가 조회는 하지 않는다).
function useReportTargetParty(report: ModerationReport): ReportTargetParty {
	const queryClient = useQueryClient();
	const ctx = report.targetContext;

	if (!(ctx && "chatRoom" in ctx)) {
		return resolveReportTargetParty(report);
	}

	const targetUser = queryClient
		.getQueryData<ModeratorUser[]>(userListOptions().queryKey)
		?.find((row) => row.userId === report.targetUserId);

	return {
		name: targetUser?.name || MISSING_TARGET_NAME,
		role: targetUser ? userRoleLabel(targetUser.role) : "구인자",
	};
}

// 상세에서 대상 사용자 계정으로 건너뛴다(제재 이력·누적 신고를 바로 확인하도록).
const userDetailHref = (id: string): Href =>
	({
		params: { id },
		pathname: "/(moderator)/users/[id]",
	}) as unknown as Href;

interface CommunityTargetView {
	authorName: string;
	boardLabel: string;
	bodyPreview: string;
	createdAt: Date | string;
	id: string;
	kind: "comment" | "post";
	status: CommunityContentStatus;
	title: string;
}

// 글·댓글은 필드 이름이 달라(board/postBoard, title/postTitle) 한 모양으로 맞춰 둔다.
const communityTargetView = (
	ctx: null | ReportTargetContext
): CommunityTargetView | null => {
	// 키가 있어도 값이 비어 있을 수 있다(신고 시점 스냅샷 폴백) — 서버와 같은 이중 확인.
	if (ctx && "communityPost" in ctx && ctx.communityPost) {
		const post = ctx.communityPost;

		return {
			authorName: post.authorName ?? "회원",
			// 게시판 행이 지워지면 라벨이 null이다 — board key 원값 대신 라벨 폴백을 쓴다.
			boardLabel: contentBoardLabel(post.boardLabel),
			bodyPreview: post.bodyPreview,
			createdAt: post.createdAt,
			id: post.id,
			kind: "post",
			status: post.status,
			title: post.title,
		};
	}
	if (ctx && "communityComment" in ctx && ctx.communityComment) {
		const comment = ctx.communityComment;

		return {
			authorName: comment.authorName ?? "회원",
			boardLabel: contentBoardLabel(
				comment.postBoardLabel ??
					(comment.postBoard === CRAWLED_COMMENT_BOARD_KEY
						? CRAWLED_COMMENT_BOARD_LABEL
						: null)
			),
			bodyPreview: comment.bodyPreview,
			createdAt: comment.createdAt,
			id: comment.id,
			kind: "comment",
			status: comment.status,
			title: comment.postTitle,
		};
	}
	return null;
};

function SectionCard({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Text className="font-bold text-base text-foreground">{title}</Text>
			{children}
		</Surface>
	);
}

function ReportHeaderCard({ report }: { report: ModerationReport }) {
	const severity = getReportSeverity(report.reason, report.status);

	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<View className="flex-row flex-wrap gap-2">
				<Pill tone={REPORT_SEVERITY_TONES[severity]}>
					{REPORT_SEVERITY_LABELS[severity]}
				</Pill>
				<Pill>{targetTypeLabel(report.targetType)}</Pill>
				<Pill tone="neutral">{reportStatusLabel(report.status)}</Pill>
			</View>
			<Text className="font-bold text-foreground text-xl" selectable>
				{reportReasonLabel(report.reason)}
			</Text>
			<Text className="text-muted text-xs">
				{formatDateTime(report.createdAt)} · #{report.id.slice(0, 8)}
			</Text>
		</Surface>
	);
}

// 카드 상단 설명 줄은 caption이다 — `role`이라는 prop 이름은 린터가 ARIA role로 읽는다.
function PartyCard({
	caption,
	detail,
	name,
	onPress,
}: {
	caption: string;
	detail?: string;
	name: string;
	onPress?: () => void;
}) {
	const card = (
		<Surface className="gap-1 rounded-lg p-3" variant="secondary">
			<Text className="text-muted text-xs">{caption}</Text>
			<Text className="font-semibold text-base text-foreground" selectable>
				{name}
			</Text>
			{detail ? (
				<Text className="text-muted text-sm" selectable>
					{detail}
				</Text>
			) : null}
		</Surface>
	);

	if (!onPress) {
		return card;
	}

	return (
		<Pressable
			accessibilityLabel={`${caption} ${name} 계정 상세 열기`}
			accessibilityRole="button"
			className="active:opacity-75"
			onPress={onPress}
		>
			{card}
		</Pressable>
	);
}

// 채팅방 신고는 방 → 피신고자 → 신고자, 나머지는 피신고자 → 신고자 순서다.
function ReportParties({ report }: { report: ModerationReport }) {
	const ctx = report.targetContext;
	const chatRoom = ctx && "chatRoom" in ctx ? ctx.chatRoom : null;
	const party = useReportTargetParty(report);
	const isChatTarget =
		report.targetType === "chat_message" || report.targetType === "chat_room";
	// 본인인증 정보는 서버가 채팅 대상 신고에만 채운다 — 그 신고만 "없음"까지 알린다.
	const missingIdentity = isChatTarget ? MISSING_VERIFIED_IDENTITY : undefined;
	const targetDetail = report.targetVerifiedIdentity
		? formatPhoneNumber(report.targetVerifiedIdentity.phoneNumber)
		: missingIdentity;
	const reporterDetail = report.reporterVerifiedIdentity
		? formatPhoneNumber(report.reporterVerifiedIdentity.phoneNumber)
		: undefined;
	const targetUserId = report.targetUserId;

	return (
		<SectionCard title="당사자">
			{chatRoom ? (
				<PartyCard caption="신고 대상 · 채팅방" name={chatRoom.jobPostTitle} />
			) : null}
			<PartyCard
				caption={`피신고자 · ${party.role}`}
				detail={targetDetail}
				name={party.name}
				onPress={
					targetUserId
						? () => router.push(userDetailHref(targetUserId))
						: undefined
				}
			/>
			<PartyCard
				caption={`신고자 · ${userRoleLabel(report.reporter?.role ?? "")}`}
				detail={reporterDetail}
				name={
					report.reporter?.displayName || report.reporter?.email || "알 수 없음"
				}
			/>
		</SectionCard>
	);
}

function CommunityTargetPanel({
	onAction,
	target,
}: {
	onAction: (action: CommunityAction) => void;
	target: CommunityTargetView;
}) {
	return (
		<SectionCard title={target.kind === "post" ? "신고된 글" : "신고된 댓글"}>
			<View className="flex-row flex-wrap gap-2">
				<Pill>{target.boardLabel}</Pill>
				<Pill tone={target.status === "published" ? "neutral" : "warning"}>
					{CONTENT_STATUS_LABELS[target.status]}
				</Pill>
			</View>
			<Text className="font-semibold text-foreground text-sm" selectable>
				{target.title}
			</Text>
			<Text className="text-foreground text-sm leading-5" selectable>
				{target.bodyPreview}
			</Text>
			<Text className="text-muted text-xs">
				{target.authorName} · {formatDateTime(target.createdAt)}
			</Text>
			<View className="flex-row flex-wrap gap-2">
				{COMMUNITY_ACTIONS[target.status].map((action) => (
					<Button
						key={action.status}
						onPress={() => onAction(action)}
						size="sm"
						variant={action.danger ? "danger" : "secondary"}
					>
						<Button.Label>{action.label}</Button.Label>
					</Button>
				))}
			</View>
		</SectionCard>
	);
}

function ChatRoomTargetPanel({
	chatRoom,
	onToggleBlock,
}: {
	chatRoom: Extract<ReportTargetContext, { chatRoom: unknown }>["chatRoom"];
	onToggleBlock: (next: boolean) => void;
}) {
	return (
		<SectionCard title="채팅방">
			<View className="flex-row flex-wrap gap-2">
				<Pill tone={chatRoom.isBlocked ? "danger" : "success"}>
					{chatRoom.isBlocked ? "차단됨" : "정상"}
				</Pill>
				{chatRoom.isDeleted ? <Pill tone="neutral">탈퇴</Pill> : null}
			</View>
			<Text className="font-semibold text-foreground text-sm" selectable>
				{chatRoom.jobPostTitle}
			</Text>
			<Text className="text-muted text-xs">
				{chatRoom.organizationDisplayName}
			</Text>
			<ChatModerationThread chatRoomId={chatRoom.id} />
			<Button
				onPress={() => onToggleBlock(!chatRoom.isBlocked)}
				variant={chatRoom.isBlocked ? "secondary" : "danger"}
			>
				<Button.Label>
					{chatRoom.isBlocked ? "차단 해제" : "대화방 차단"}
				</Button.Label>
			</Button>
		</SectionCard>
	);
}

function JobPostTargetPanel({
	jobPost,
}: {
	jobPost: Extract<ReportTargetContext, { jobPost: unknown }>["jobPost"];
}) {
	return (
		<SectionCard title="신고된 공고">
			<View className="flex-row flex-wrap gap-2">
				<Pill>{jobPostStatusLabel(jobPost.status)}</Pill>
			</View>
			<Text className="font-semibold text-foreground text-sm" selectable>
				{jobPost.title}
			</Text>
			<Text className="text-muted text-xs">
				{jobPost.organizationDisplayName}
			</Text>
			<Text
				className="text-foreground text-sm leading-5"
				numberOfLines={4}
				selectable
			>
				{jobPost.description}
			</Text>
			{jobPost.rejectionReason ? (
				<Text className="text-muted text-xs" selectable>
					반려 사유 · {jobPost.rejectionReason}
				</Text>
			) : null}
		</SectionCard>
	);
}

function ReviewTargetPanel({
	review,
}: {
	review: Extract<ReportTargetContext, { review: unknown }>["review"];
}) {
	return (
		<SectionCard title="신고된 후기">
			<View className="flex-row flex-wrap gap-2">
				<Pill tone="warning">{"★".repeat(review.rating)}</Pill>
				<Pill>{reviewStatusLabel(review.status)}</Pill>
			</View>
			<Text className="text-foreground text-sm leading-5" selectable>
				{review.body}
			</Text>
		</SectionCard>
	);
}

function UserTargetPanel({
	user,
}: {
	user: Extract<ReportTargetContext, { user: unknown }>["user"];
}) {
	return (
		<SectionCard title="신고된 계정">
			<View className="flex-row flex-wrap gap-2">
				<Pill>{userRoleLabel(user.role)}</Pill>
				<Pill tone="neutral">{accountStatusLabel(user.status)}</Pill>
			</View>
			<Text className="font-semibold text-foreground text-sm" selectable>
				{user.displayName}
			</Text>
			<Text className="text-muted text-xs">
				전화 인증 {user.isPhoneVerified ? "인증됨" : "미인증"}
			</Text>
		</SectionCard>
	);
}

function TargetContextSection({
	community,
	onCommunityAction,
	onToggleBlock,
	report,
}: {
	community: CommunityTargetView | null;
	onCommunityAction: (action: CommunityAction) => void;
	onToggleBlock: (next: boolean) => void;
	report: ModerationReport;
}) {
	const ctx = report.targetContext;

	if (community) {
		return (
			<CommunityTargetPanel onAction={onCommunityAction} target={community} />
		);
	}
	if (report.targetUnavailable || !ctx) {
		return (
			<StateCard
				description="대상이 삭제됐거나 조회할 수 없어요. 신고 내용만 보고 판단해 주세요."
				title="대상을 찾을 수 없어요"
			/>
		);
	}
	if ("jobPost" in ctx) {
		return <JobPostTargetPanel jobPost={ctx.jobPost} />;
	}
	if ("review" in ctx) {
		return <ReviewTargetPanel review={ctx.review} />;
	}
	if ("user" in ctx) {
		return <UserTargetPanel user={ctx.user} />;
	}
	if ("chatRoom" in ctx) {
		return (
			<ChatRoomTargetPanel
				chatRoom={ctx.chatRoom}
				onToggleBlock={onToggleBlock}
			/>
		);
	}
	if ("chatMessage" in ctx && ctx.chatMessage) {
		return (
			<SectionCard title="신고된 메시지">
				<Text className="text-foreground text-sm leading-5" selectable>
					{ctx.chatMessage.body}
				</Text>
				<Text className="text-muted text-xs">
					{formatDateTime(ctx.chatMessage.createdAt)}
				</Text>
			</SectionCard>
		);
	}
	return null;
}

function ReportActionBar({
	canResolve,
	isUserTarget,
	onDismiss,
	onResolve,
	onSanction,
}: {
	canResolve: boolean;
	isUserTarget: boolean;
	onDismiss: () => void;
	onResolve: () => void;
	onSanction: () => void;
}) {
	return (
		<View className="flex-row gap-2">
			<View className="flex-1">
				<Button onPress={onDismiss} variant="secondary">
					<Button.Label>기각</Button.Label>
				</Button>
			</View>
			{isUserTarget ? (
				<View className="flex-1">
					<Button onPress={onSanction} variant="danger">
						<Button.Label>제재 적용</Button.Label>
					</Button>
				</View>
			) : null}
			{!isUserTarget && canResolve ? (
				<View className="flex-1">
					<Button onPress={onResolve} variant="primary">
						<Button.Label>조치 완료</Button.Label>
					</Button>
				</View>
			) : null}
		</View>
	);
}

function ReportDetail({ report }: { report: ModerationReport }) {
	const sequence = useRef(createFollowupAction());
	const [pendingResolution, setPendingResolution] = useState<string | null>(
		null
	);
	const [dialog, setDialog] = useState<DialogState>(null);
	const [confirming, setConfirming] = useState<CommunityAction | null>(null);
	const invalidate = useInvalidateModeration();
	const targetParty = useReportTargetParty(report);
	const { toast } = useToast();
	const setReportStatus = useMutation(
		orpc.bambi.moderation.setReportStatus.mutationOptions()
	);
	const setUserStatus = useMutation(
		orpc.bambi.moderation.setUserStatus.mutationOptions()
	);
	const setChatRoomBlocked = useMutation(
		orpc.bambi.moderation.setChatRoomBlocked.mutationOptions()
	);
	const setPostStatus = useMutation(
		orpc.bambi.community.setPostStatusByAdmin.mutationOptions()
	);
	const setCommentStatus = useMutation(
		orpc.bambi.community.setCommentStatusByAdmin.mutationOptions()
	);

	const ctx = report.targetContext;
	const community = communityTargetView(ctx);
	const isOpen = OPEN_REPORT_STATUSES.has(report.status);
	const isUserTarget = Boolean(ctx && "user" in ctx && report.targetUserId);
	const closeDialog = (open: boolean) => {
		if (!open) {
			setDialog(null);
		}
	};

	// 실패는 던진 채로 둔다 — 다이얼로그가 서버 메시지를 그대로 보인다.
	const resolveReport = async (
		status: "dismissed" | "resolved",
		reason: string
	) => {
		await setReportStatus.mutateAsync({ reason, reportId: report.id, status });
		await invalidate.reports();
		toast.show({ label: REPORT_TOASTS[status] });
		setDialog(null);
		returnToModeratorList("/(moderator)/(tabs)/reports" as Href);
		return true;
	};

	const handleSanction = async (status: SanctionStatus, reason: string) => {
		const targetUserId = report.targetUserId;

		if (!targetUserId) {
			return false;
		}
		return await sequence.current.run({
			primary: () =>
				setUserStatus.mutateAsync({ reason, status, targetUserId }),
			onPrimaryDone: () => setPendingResolution(REPORT_RESOLVE_DEFAULT_REASON),
			followup: async () => {
				await invalidate.users(targetUserId);
				return await resolveReport("resolved", REPORT_RESOLVE_DEFAULT_REASON);
			},
		});
	};

	// 서버가 차단과 함께 관련 미처리 신고를 종료한다. 중복 종료 요청은 보내지 않는다.
	const handleBlock = async (reason: string) => {
		if (dialog?.kind !== "block") {
			return false;
		}
		const { isBlocked } = dialog;

		await setChatRoomBlocked.mutateAsync({
			chatRoomId: report.targetId,
			isBlocked,
			reason,
		});
		await invalidate.reports();
		toast.show({
			label: isBlocked
				? CHAT_ROOM_BLOCK_TOASTS.blocked
				: CHAT_ROOM_BLOCK_TOASTS.unblocked,
		});
		return true;
	};

	const handleCommunity = async (reason: string) => {
		if (dialog?.kind !== "community" || !community) {
			return false;
		}
		const { status } = dialog.action;
		return await sequence.current.run({
			primary: async () => {
				if (community.kind === "post") {
					await setPostStatus.mutateAsync({
						postId: community.id,
						reason,
						reportId: report.id,
						status,
					});
				} else {
					await setCommentStatus.mutateAsync({
						commentId: community.id,
						reason,
						reportId: report.id,
						status,
					});
				}
			},
			onPrimaryDone: () => {
				setPendingResolution(reason);
				toast.show({ label: communityActionToast(community.kind, status) });
			},
			followup: () => resolveReport("resolved", reason),
		});
	};

	// 즉시 호출형이라 다이얼로그가 없다 — 실패는 토스트로만 알린다.
	const handleResolveNow = async () => {
		try {
			await resolveReport("resolved", REPORT_RESOLVE_DEFAULT_REASON);
		} catch {
			toast.show({ label: REPORT_TOASTS.failed, variant: "danger" });
		}
	};

	const handleCommunityAction = (action: CommunityAction) => {
		if (action.confirm) {
			setConfirming(action);
			return;
		}
		setDialog({ action, kind: "community" });
	};

	return (
		<>
			<BambiScreen
				stickyFooter={
					isOpen && !pendingResolution ? (
						<ReportActionBar
							canResolve={!CONTENT_ACTION_TARGET_TYPES.has(report.targetType)}
							isUserTarget={isUserTarget}
							onDismiss={() => setDialog({ kind: "dismiss" })}
							onResolve={handleResolveNow}
							onSanction={() => setDialog({ kind: "sanction" })}
						/>
					) : null
				}
			>
				<ReportHeaderCard report={report} />
				{pendingResolution ? (
					<StateCard
						action={
							<Button
								isDisabled={setReportStatus.isPending}
								onPress={async () => {
									try {
										await resolveReport("resolved", pendingResolution);
									} catch (error) {
										toast.show({
											label:
												error instanceof Error
													? error.message
													: REPORT_TOASTS.failed,
											variant: "danger",
										});
									}
								}}
							>
								<Button.Label>신고 종료 재시도</Button.Label>
							</Button>
						}
						description="신고 종료가 남아 있어요. 아래 버튼은 신고 종료만 재시도합니다."
						title="대상 조치는 적용됐어요"
					/>
				) : null}
				<ReportParties report={report} />
				<TargetContextSection
					community={community}
					onCommunityAction={(action) => {
						if (!pendingResolution) {
							handleCommunityAction(action);
						}
					}}
					onToggleBlock={(next) =>
						setDialog({ isBlocked: next, kind: "block" })
					}
					report={report}
				/>
				{report.details ? (
					<SectionCard title="신고 내용">
						<Text className="text-foreground text-sm leading-5" selectable>
							{report.details}
						</Text>
					</SectionCard>
				) : null}
				{isOpen ? null : (
					<StateCard
						description={report.resolutionReason ?? "처리 사유가 없어요."}
						title="처리된 신고예요"
					/>
				)}
			</BambiScreen>
			<ReasonDialog
				confirmLabel="기각하기"
				danger
				defaultReason=""
				description="신고를 종료하고 대상에는 조치하지 않아요. 사유는 처리 기록에 남아요."
				isOpen={dialog?.kind === "dismiss"}
				onConfirm={(reason) => resolveReport("dismissed", reason)}
				onOpenChange={closeDialog}
				title="신고 기각"
			/>
			<SanctionDialog
				isOpen={dialog?.kind === "sanction"}
				onConfirm={handleSanction}
				onOpenChange={closeDialog}
				targetName={targetParty.name}
			/>
			{dialog?.kind === "block" ? (
				<ReasonDialog
					confirmLabel={dialog.isBlocked ? "차단하기" : "차단 해제"}
					danger={dialog.isBlocked}
					defaultReason=""
					description={
						dialog.isBlocked
							? "차단하면 두 사람 모두 이 방에서 새 메시지를 보낼 수 없어요."
							: "차단을 풀면 두 사람이 다시 대화할 수 있어요."
					}
					isOpen
					onConfirm={handleBlock}
					onOpenChange={closeDialog}
					title={dialog.isBlocked ? "대화방 차단" : "대화방 차단 해제"}
				/>
			) : null}
			{dialog?.kind === "community" ? (
				<ReasonDialog
					confirmLabel={dialog.action.label}
					danger={dialog.action.danger}
					defaultReason=""
					description="조치 사유는 작성자 알림과 처리 기록에 남고, 신고는 조치 완료로 종료돼요."
					isOpen
					onConfirm={handleCommunity}
					onOpenChange={closeDialog}
					title={`${community?.kind === "post" ? "글" : "댓글"} ${dialog.action.label}`}
				/>
			) : null}
			<ConfirmDialog
				confirmLabel="계속"
				danger
				description="삭제하면 작성자에게 알림이 가고 적립 포인트도 회수돼요. 다음 단계에서 사유를 작성해요."
				isOpen={confirming !== null}
				onConfirm={() => {
					if (confirming) {
						setDialog({ action: confirming, kind: "community" });
					}
					setConfirming(null);
				}}
				onOpenChange={(open) => {
					if (!open) {
						setConfirming(null);
					}
				}}
				title="정말 삭제할까요?"
			/>
		</>
	);
}

export default function ModeratorReportDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const reportsQuery = useQuery(reportListOptions());
	// 상세는 목록 캐시에서 항목을 찾는다 — 목록을 거쳐야 닿는 화면이라 별도 조회가 없다.
	const report = reportsQuery.data?.find((row) => row.id === id);

	if (reportsQuery.isLoading) {
		return <LoadingState label="신고 정보를 불러오고 있습니다." />;
	}

	if (reportsQuery.isError) {
		return <ErrorState onRetry={() => reportsQuery.refetch()} />;
	}

	if (!report) {
		return (
			<BambiScreen>
				<StateCard
					action={
						<Button
							onPress={() =>
								returnToModeratorList("/(moderator)/(tabs)/reports" as Href)
							}
							size="sm"
						>
							<Button.Label>목록으로</Button.Label>
						</Button>
					}
					description="목록에서 사라졌거나 다른 탭에 있는 신고예요."
					title="신고를 찾을 수 없어요"
				/>
			</BambiScreen>
		);
	}

	return <ReportDetail key={report.id} report={report} />;
}
