import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { resolveAccountRestoreDecision } from "@bambi-app/api/services/bambi-account-restore";
import {
	ACCOUNT_RESTORE_DEFAULT_REASON,
	accountStatusLabel,
	CONTENT_STATUS_LABELS,
	LEGAL_ADVISOR_ASSIGN_REASON,
	LEGAL_ADVISOR_RELEASE_REASON,
	moderationActionLabel,
	SANCTION_CHOICES,
	type SanctionStatus,
	USER_RESTORE_ACTIVE_REASON,
	USER_TOASTS,
	userRoleLabel,
	WARNING_REVERT_DEFAULT_REASON,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { isUserOnline } from "@bambi-app/api/services/bambi-user-presence";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, useLocalSearchParams } from "expo-router";
import { Button, Surface, useToast } from "heroui-native";
import type { ReactNode } from "react";
import { useState } from "react";
import { Text, View } from "react-native";
import {
	BambiScreen,
	ErrorState,
	formatDateTime,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { PresenceIndicator } from "@/src/components/moderation/presence-indicator";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { SanctionDialog } from "@/src/components/moderation/sanction-dialog";
import { accountStatusBadge } from "@/src/lib/bambi-native";
import { returnToModeratorList } from "@/src/lib/moderation/navigation";
import {
	resolveLivePresence,
	useModeratorPresence,
} from "@/src/lib/moderation/presence-stream";
import {
	useInvalidateModeration,
	userListOptions,
} from "@/src/lib/moderation/queries";
import { orpc } from "@/src/lib/orpc";

type ModeratorUser = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listUsers"]>
>[number];

type ContentFilter = "all" | "comment" | "post";

// 이력은 한 번에 5건씩 "더 보기"로 이어 붙인다(웹 콘솔과 같은 페이지 크기).
const HISTORY_PAGE_SIZE = 5;

const CONTENT_FILTER_OPTIONS = [
	{ label: "전체", value: "all" },
	{ label: "글", value: "post" },
	{ label: "댓글", value: "comment" },
] as const satisfies readonly { label: string; value: ContentFilter }[];

interface LegalAdvisorChoice {
	confirmLabel: string;
	defaultReason: string;
	description: string;
	role: "job_seeker" | "legal_advisor";
	title: string;
	toast: string;
}

// 무료 법률 자문 계정은 구직자 ↔ 법률자문만 오간다(서버 assertLegalAdvisorRoleSwitch).
// 그 외 역할(구인자·운영자)에는 버튼 자체를 띄우지 않는다.
const legalAdvisorChoice = (role: string): LegalAdvisorChoice | null => {
	if (role === "legal_advisor") {
		return {
			confirmLabel: "법률자문 해제",
			defaultReason: LEGAL_ADVISOR_RELEASE_REASON,
			description: "무료 법률 자문 글 열람·답변 권한을 거둬요.",
			role: "job_seeker",
			title: "법률자문 해제",
			toast: USER_TOASTS.legalAdvisorReleased,
		};
	}
	if (role === "job_seeker") {
		return {
			confirmLabel: "법률자문 지정",
			defaultReason: LEGAL_ADVISOR_ASSIGN_REASON,
			description: "무료 법률 자문의 비밀글을 열람하고 답변할 수 있게 해요.",
			role: "legal_advisor",
			title: "법률자문 지정",
			toast: USER_TOASTS.legalAdvisorAssigned,
		};
	}
	return null;
};

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<View className="flex-row items-start justify-between gap-3">
			<Text className="text-muted text-xs">{label}</Text>
			<Text className="flex-1 text-right text-foreground text-sm" selectable>
				{value}
			</Text>
		</View>
	);
}

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

function ProfileCard({ user }: { user: ModeratorUser }) {
	const badge = accountStatusBadge(user.status);
	const presence = useModeratorPresence();
	const live = resolveLivePresence(presence.users.get(user.userId), user);
	const online = isUserOnline({
		...live,
		now: new Date(presence.now),
		offlineAfterMinutes: presence.policyMinutes ?? user.offlineAfterMinutes,
	});

	return (
		<Surface className="gap-3 rounded-lg p-4" variant="secondary">
			<Text className="font-extrabold text-foreground text-xl" selectable>
				{user.name || user.email}
			</Text>
			<View className="flex-row flex-wrap gap-2">
				<View className="flex-row items-center gap-2">
					<PresenceIndicator isOnline={online} />
					<Text className="text-muted text-xs">
						{online ? "온라인" : "오프라인"}
					</Text>
				</View>
				<Pill tone={badge.tone}>{accountStatusLabel(user.status)}</Pill>
				{user.deletedAt ? <Pill tone="neutral">탈퇴</Pill> : null}
				<Pill>{userRoleLabel(user.role)}</Pill>
			</View>
			<View className="gap-2">
				<InfoRow label="로그인 아이디" value={user.loginId ?? "미설정"} />
				<InfoRow label="이메일" value={user.email} />
				<InfoRow
					label="전화 인증"
					value={user.isPhoneVerified ? "인증됨" : "미인증"}
				/>
				<InfoRow label="인증 번호" value={user.phoneNumber ?? "미인증"} />
				<InfoRow label="생년월일" value={user.birthDate ?? "미등록"} />
				<InfoRow
					label="마지막 활동"
					value={
						live.lastActivityAt
							? formatDateTime(live.lastActivityAt)
							: "마지막 활동 기록 없음"
					}
				/>
				<InfoRow label="가입일" value={formatDateTime(user.createdAt)} />
				{user.organizationNames.length > 0 ? (
					<InfoRow
						label="소속 업소"
						value={user.organizationNames.join(", ")}
					/>
				) : null}
				<InfoRow
					label="누적"
					value={`신고 ${user.reportsCount}건 · 경고 ${user.warningsCount}회 · 차단 ${user.blockedByCount}회`}
				/>
				{user.deletedAt ? (
					<InfoRow label="탈퇴 시각" value={formatDateTime(user.deletedAt)} />
				) : null}
			</View>
			<Button
				onPress={() =>
					router.push({
						pathname: "/(moderator)/(tabs)/reports",
						params: { user: user.userId },
					} as never)
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>이 사용자 신고 내역 보기</Button.Label>
			</Button>
		</Surface>
	);
}

function MoreButton({
	isFetching,
	onPress,
}: {
	isFetching: boolean;
	onPress: () => void;
}) {
	return (
		<Button isDisabled={isFetching} onPress={onPress} size="sm" variant="ghost">
			<Button.Label>{isFetching ? "불러오는 중…" : "더 보기"}</Button.Label>
		</Button>
	);
}

// 이력 섹션의 로딩·실패·빈 상태 문구. 목록 화면과 달리 카드 안이라 한 줄로만 알린다.
function HistoryStatus({
	emptyLabel,
	isEmpty,
	isError,
	isPending,
	loadingLabel,
}: {
	emptyLabel: string;
	isEmpty: boolean;
	isError: boolean;
	isPending: boolean;
	loadingLabel: string;
}) {
	if (isPending) {
		return <Text className="text-muted text-sm">{loadingLabel}</Text>;
	}
	if (isError) {
		return <Text className="text-danger text-sm">불러오지 못했어요.</Text>;
	}
	if (isEmpty) {
		return <Text className="text-muted text-sm">{emptyLabel}</Text>;
	}
	return null;
}

function ModerationHistorySection({ userId }: { userId: string }) {
	const query = useInfiniteQuery(
		orpc.bambi.moderation.listUserModerationActions.infiniteOptions({
			getNextPageParam: (lastPage) =>
				lastPage.page * lastPage.pageSize < lastPage.totalCount
					? lastPage.page + 1
					: undefined,
			initialPageParam: 1,
			input: (page: number) => ({
				page,
				pageSize: HISTORY_PAGE_SIZE,
				targetUserId: userId,
			}),
		})
	);
	const items = query.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<SectionCard title="제재 이력">
			<HistoryStatus
				emptyLabel="제재 이력이 없어요."
				isEmpty={items.length === 0}
				isError={query.isError}
				isPending={query.isPending}
				loadingLabel="제재 이력을 불러오고 있어요."
			/>
			{items.map((item) => (
				<View className="gap-1 border-border border-t pt-3" key={item.id}>
					<View className="flex-row items-center justify-between gap-2">
						<Text className="font-semibold text-foreground text-sm">
							{moderationActionLabel(item.action)}
						</Text>
						<Text className="text-muted text-xs">
							{formatDateTime(item.createdAt)}
						</Text>
					</View>
					<Text className="text-foreground text-sm leading-5" selectable>
						{item.reason}
					</Text>
					<Text className="text-muted text-xs">처리자 {item.adminName}</Text>
				</View>
			))}
			{query.hasNextPage ? (
				<MoreButton
					isFetching={query.isFetchingNextPage}
					onPress={() => query.fetchNextPage()}
				/>
			) : null}
		</SectionCard>
	);
}

function ContentHistorySection({ userId }: { userId: string }) {
	const [filter, setFilter] = useState<ContentFilter>("all");
	const query = useInfiniteQuery(
		orpc.bambi.contentHistory.listAdminMemberContent.infiniteOptions({
			getNextPageParam: (lastPage) =>
				lastPage.page * lastPage.pageSize < lastPage.totalCount
					? lastPage.page + 1
					: undefined,
			initialPageParam: 1,
			input: (page: number) => ({
				filter,
				page,
				pageSize: HISTORY_PAGE_SIZE,
				userId,
			}),
		})
	);
	const items = query.data?.pages.flatMap((page) => page.items) ?? [];

	return (
		<SectionCard title="작성 콘텐츠 이력">
			<FilterChips
				onChange={setFilter}
				options={CONTENT_FILTER_OPTIONS}
				value={filter}
			/>
			<HistoryStatus
				emptyLabel="작성한 글·댓글이 없어요."
				isEmpty={items.length === 0}
				isError={query.isError}
				isPending={query.isPending}
				loadingLabel="작성 콘텐츠를 불러오고 있어요."
			/>
			{items.map((item) => (
				<View
					className="gap-1 border-border border-t pt-3"
					key={`${item.kind}-${item.id}`}
				>
					<View className="flex-row items-center justify-between gap-2">
						<Text className="font-semibold text-foreground text-sm">
							{item.kind === "post" ? "글" : "댓글"} · {item.title}
						</Text>
						<Text className="text-muted text-xs">
							{CONTENT_STATUS_LABELS[item.status]}
						</Text>
					</View>
					<Text
						className="text-foreground text-sm leading-5"
						numberOfLines={3}
						selectable
					>
						{item.body}
					</Text>
					<Text className="text-muted text-xs">
						{formatDateTime(item.createdAt)}
					</Text>
				</View>
			))}
			{query.hasNextPage ? (
				<MoreButton
					isFetching={query.isFetchingNextPage}
					onPress={() => query.fetchNextPage()}
				/>
			) : null}
		</SectionCard>
	);
}

// 탈퇴 계정 안내. 파기 배치가 지나간 계정은 되살릴 수단이 없어(비밀번호·본인인증 해시
// 삭제) 서버와 같은 판정 함수로 버튼 대신 사유만 남긴다.
function WithdrawalPanel({
	onRestore,
	user,
}: {
	onRestore: () => void;
	user: ModeratorUser;
}) {
	const decision = resolveAccountRestoreDecision(user);

	return (
		<SectionCard title="탈퇴 계정">
			<Text className="text-muted text-sm leading-5">
				{decision.canRestore
					? "복구하면 본인이 기존 아이디로 다시 로그인할 수 있어요. 팀 소속과 내려간 공고는 함께 돌아오지 않아요."
					: decision.message}
			</Text>
			{decision.canRestore ? (
				<Button onPress={onRestore} variant="secondary">
					<Button.Label>탈퇴 복구</Button.Label>
				</Button>
			) : null}
		</SectionCard>
	);
}

function UserDetail({ user }: { user: ModeratorUser }) {
	const [dialog, setDialog] = useState<
		"legal" | "restore" | "revert" | "sanction" | null
	>(null);
	const invalidate = useInvalidateModeration();
	const { toast } = useToast();
	const setUserStatus = useMutation(
		orpc.bambi.moderation.setUserStatus.mutationOptions()
	);
	const revertWarning = useMutation(
		orpc.bambi.moderation.revertLatestWarning.mutationOptions()
	);
	const setUserRole = useMutation(
		orpc.bambi.moderation.setUserRole.mutationOptions()
	);
	const restoreAccount = useMutation(
		orpc.bambi.accountRecovery.restoreWithdrawnAccount.mutationOptions()
	);
	const targetUserId = user.userId;
	const legal = legalAdvisorChoice(user.role);
	const closeDialog = (open: boolean) => {
		if (!open) {
			setDialog(null);
		}
	};

	// 성공하면 목록·제재 이력을 다시 읽고 토스트를 띄운다. 실패는 그대로 던져
	// 다이얼로그가 서버 메시지를 보이게 둔다(즉시 호출형만 토스트로 알린다).
	const run = async (
		call: () => Promise<unknown>,
		successToast: string,
		after?: () => void
	) => {
		await call();
		await invalidate.users(targetUserId);
		toast.show({ label: successToast });
		after?.();
		return true;
	};

	const handleSanction = (status: SanctionStatus, reason: string) => {
		const label =
			SANCTION_CHOICES.find((choice) => choice.status === status)?.label ??
			"제재";

		// 제재는 목록으로 돌아간다(웹 콘솔과 같은 흐름). 화면을 떠나기 전에 다이얼로그를
		// 먼저 닫아 오버레이가 뜬 채로 언마운트되지 않게 한다.
		return run(
			() => setUserStatus.mutateAsync({ reason, status, targetUserId }),
			`${label} 처리했어요`,
			() => {
				setDialog(null);
				returnToModeratorList("/(moderator)/(tabs)/users" as Href);
			}
		);
	};

	const handleRestoreActive = async () => {
		try {
			await run(
				() =>
					setUserStatus.mutateAsync({
						reason: USER_RESTORE_ACTIVE_REASON,
						status: "active",
						targetUserId,
					}),
				USER_RESTORE_ACTIVE_REASON
			);
		} catch {
			toast.show({ label: USER_TOASTS.failed, variant: "danger" });
		}
	};

	return (
		<BambiScreen>
			<ProfileCard user={user} />
			{user.deletedAt ? null : (
				<SectionCard title="계정 조치">
					<Button onPress={() => setDialog("sanction")} variant="danger">
						<Button.Label>제재 적용</Button.Label>
					</Button>
					{user.status === "active" ? null : (
						<Button onPress={handleRestoreActive} variant="secondary">
							<Button.Label>정상으로 복구</Button.Label>
						</Button>
					)}
					{user.warningsCount > 0 ? (
						<Button onPress={() => setDialog("revert")} variant="secondary">
							<Button.Label>최근 경고 1회 되돌리기</Button.Label>
						</Button>
					) : null}
					{legal ? (
						<Button onPress={() => setDialog("legal")} variant="secondary">
							<Button.Label>{legal.title}</Button.Label>
						</Button>
					) : null}
				</SectionCard>
			)}
			<ModerationHistorySection userId={targetUserId} />
			<ContentHistorySection userId={targetUserId} />
			{user.deletedAt ? (
				<WithdrawalPanel onRestore={() => setDialog("restore")} user={user} />
			) : null}
			<SanctionDialog
				isOpen={dialog === "sanction"}
				onConfirm={handleSanction}
				onOpenChange={closeDialog}
				targetName={user.name || user.email}
			/>
			<ReasonDialog
				confirmLabel="되돌리기"
				defaultReason={WARNING_REVERT_DEFAULT_REASON}
				description="가장 최근에 부여했고 아직 되돌리지 않은 경고 1회만 취소해요."
				isOpen={dialog === "revert"}
				onConfirm={(reason) =>
					run(
						() => revertWarning.mutateAsync({ reason, targetUserId }),
						USER_TOASTS.warningReverted
					)
				}
				onOpenChange={closeDialog}
				title="경고 되돌리기"
			/>
			{legal ? (
				<ReasonDialog
					confirmLabel={legal.confirmLabel}
					defaultReason={legal.defaultReason}
					description={legal.description}
					isOpen={dialog === "legal"}
					onConfirm={(reason) =>
						run(
							() =>
								setUserRole.mutateAsync({
									reason,
									role: legal.role,
									targetUserId,
								}),
							legal.toast
						)
					}
					onOpenChange={closeDialog}
					title={legal.title}
				/>
			) : null}
			<ReasonDialog
				confirmLabel="탈퇴 복구"
				defaultReason={ACCOUNT_RESTORE_DEFAULT_REASON}
				description={`${user.name || user.email} 님의 계정을 다시 이용 가능한 상태로 되돌려요.`}
				isOpen={dialog === "restore"}
				onConfirm={(reason) =>
					run(
						() => restoreAccount.mutateAsync({ reason, targetUserId }),
						USER_TOASTS.restored
					)
				}
				onOpenChange={closeDialog}
				title="탈퇴 복구"
			/>
		</BambiScreen>
	);
}

export default function ModeratorUserDetailScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const usersQuery = useQuery(userListOptions());
	// 상세는 목록 캐시에서 항목을 찾는다 — 목록을 거쳐야 닿는 화면이라 별도 조회가 없다.
	const user = usersQuery.data?.find((row) => row.userId === id);

	if (usersQuery.isLoading) {
		return <LoadingState label="사용자 정보를 불러오고 있습니다." />;
	}

	if (usersQuery.isError) {
		return <ErrorState onRetry={() => usersQuery.refetch()} />;
	}

	if (!user) {
		return (
			<BambiScreen>
				<StateCard
					action={
						<Button
							onPress={() =>
								returnToModeratorList("/(moderator)/(tabs)/users" as Href)
							}
							size="sm"
						>
							<Button.Label>목록으로</Button.Label>
						</Button>
					}
					description="목록에서 사라졌거나 다른 필터에 있는 계정이에요."
					title="사용자를 찾을 수 없어요"
				/>
			</BambiScreen>
		);
	}

	return <UserDetail user={user} />;
}
