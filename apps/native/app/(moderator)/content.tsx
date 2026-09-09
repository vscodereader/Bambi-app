import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	CONTENT_STATUS_LABELS,
	type CommunityContentStatus,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Surface, Switch, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FieldSelect } from "@/src/components/field-select";
import { MessageBody } from "@/src/components/message-body";
import { useBulkSelection } from "@/src/components/moderation/bulk-actions";
import { ContentBatchActions } from "@/src/components/moderation/content-batch-actions";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { orpc } from "@/src/lib/orpc";

type Target = "community_comment" | "community_post" | "support_inquiry";
type Page = Awaited<
	ReturnType<AppRouterClient["bambi"]["moderation"]["listModeratableContent"]>
>;
const TARGETS = [
	{ label: "커뮤니티 글", value: "community_post" },
	{ label: "커뮤니티 댓글", value: "community_comment" },
	{ label: "고객센터 문의", value: "support_inquiry" },
] as const;
const STATUS = [
	{ label: "전체 상태", value: "all" },
	{ label: "게시중", value: "published" },
	{ label: "숨김", value: "hidden" },
	{ label: "삭제됨", value: "deleted" },
] as const;

export default function ModeratorContentScreen() {
	const [targetType, setTargetType] = useState<Target>("community_post");
	const [status, setStatus] = useState("all");
	const [page, setPage] = useState(1);
	const [board, setBoard] = useState("");
	const selection = useBulkSelection(
		`${targetType}-${status}-${page}-${board}`
	);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [pending, setPending] = useState<null | {
		id: string;
		status: CommunityContentStatus;
	}>(null);
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.moderation.listModeratableContent.queryOptions({
			input: {
				page,
				board: targetType === "community_post" ? board || undefined : undefined,
				status:
					status === "all" ? undefined : (status as CommunityContentStatus),
				targetType,
			},
		})
	);
	const boardsQuery = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const boardLabels = Object.fromEntries(
		(boardsQuery.data ?? []).map((board) => [board.key, board.label])
	);
	const detail = useQuery({
		...orpc.bambi.moderation.getModeratableContentDetail.queryOptions({
			input: { id: expanded ?? "", targetType },
		}),
		enabled: expanded !== null,
	});
	const setPost = useMutation(
		orpc.bambi.community.setPostStatusByAdmin.mutationOptions()
	);
	const setComment = useMutation(
		orpc.bambi.community.setCommentStatusByAdmin.mutationOptions()
	);
	const setInquiry = useMutation(
		orpc.bambi.moderation.setInquiryStatusByAdmin.mutationOptions()
	);
	const purge = useMutation(
		orpc.bambi.moderation.hardDeleteCommunityPost.mutationOptions()
	);
	const data: Page | undefined = query.data;
	const rows = data?.items ?? [];
	const pages = Math.max(
		1,
		Math.ceil((data?.totalCount ?? 0) / (data?.pageSize ?? 20))
	);
	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.moderation.listModeratableContent.key(),
		});
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.moderation.getModeratableContentDetail.key(),
		});
	};
	const applyStatus = async (
		id: string,
		status: CommunityContentStatus,
		reason: string
	) => {
		if (targetType === "community_post") {
			return await setPost.mutateAsync({ postId: id, status, reason });
		}
		if (targetType === "community_comment") {
			return await setComment.mutateAsync({ commentId: id, status, reason });
		}
		return await setInquiry.mutateAsync({ inquiryId: id, status, reason });
	};
	const apply = async (reason: string) => {
		if (!pending) {
			return false;
		}
		const input = { reason, status: pending.status };
		if (targetType === "community_post") {
			await setPost.mutateAsync({ ...input, postId: pending.id });
		} else if (targetType === "community_comment") {
			await setComment.mutateAsync({ ...input, commentId: pending.id });
		} else {
			await setInquiry.mutateAsync({ ...input, inquiryId: pending.id });
		}
		await refresh();
		setPending(null);
		toast.show({ label: "게시물 상태를 변경했어요." });
		return true;
	};
	const hardDelete = (id: string, title: string) =>
		Alert.alert(
			"영구 삭제할까요?",
			`${title}과 댓글·추천을 DB에서 제거하며 되돌릴 수 없어요.`,
			[
				{ style: "cancel", text: "취소" },
				{
					style: "destructive",
					text: "영구 삭제",
					onPress: async () => {
						try {
							await purge.mutateAsync({ postId: id });
							await refresh();
							toast.show({ label: "글을 영구 삭제했어요." });
						} catch (error) {
							toast.show({
								label:
									error instanceof Error
										? error.message
										: "영구 삭제하지 못했어요.",
								variant: "danger",
							});
						}
					},
				},
			]
		);
	const switchTarget = (next: Target) => {
		setTargetType(next);
		setPage(1);
		setExpanded(null);
	};
	return (
		<BambiScreen>
			<BambiHeader
				description="커뮤니티 글·댓글·고객센터 문의의 상태를 관리합니다."
				title="게시물 조치"
			/>
			<FilterChips
				onChange={switchTarget}
				options={TARGETS}
				value={targetType}
			/>
			<FieldSelect
				isLabelHidden
				label="상태"
				onChange={(value) => {
					setStatus(value);
					setPage(1);
				}}
				options={STATUS}
				placeholder="전체 상태"
				value={status}
			/>
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="게시물을 불러오지 못했어요"
				/>
			) : null}
			{targetType === "community_post" ? (
				<FieldSelect
					label="게시판"
					onChange={(value) => {
						setBoard(value);
						setPage(1);
						setExpanded(null);
					}}
					options={[
						{ value: "", label: "전체 게시판" },
						...(boardsQuery.data ?? []).map((row) => ({
							value: row.key,
							label: row.label,
						})),
					]}
					placeholder="전체 게시판"
					value={board}
				/>
			) : null}
			<ContentBatchActions
				onPurge={
					targetType === "community_post"
						? (id) => purge.mutateAsync({ postId: id })
						: undefined
				}
				onRefresh={refresh}
				onSelected={selection.setIds}
				onStatus={applyStatus}
				rows={rows}
				selected={selection.ids}
			/>
			{query.isSuccess && rows.length === 0 ? (
				<StateCard
					description="선택한 유형과 상태에 해당하는 항목이 없어요."
					title="표시할 게시물이 없어요"
				/>
			) : null}
			{/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each row exposes status-dependent moderation actions and one expanded detail. */}
			{rows.map((row) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={row.id}
					variant="secondary"
				>
					<View className="flex-row flex-wrap gap-2">
						<Switch
							accessibilityLabel="게시물 선택"
							isSelected={selection.ids.includes(row.id)}
							onSelectedChange={() => selection.toggle(row.id)}
						/>
						<Pill>{CONTENT_STATUS_LABELS[row.status]}</Pill>
						{row.board ? (
							<Pill>{boardLabels[row.board] ?? "삭제된 게시판"}</Pill>
						) : null}
					</View>
					<Text className="font-bold text-foreground">{row.title}</Text>
					<Text
						className="text-muted text-sm"
						numberOfLines={expanded === row.id ? undefined : 2}
					>
						{row.excerpt}
					</Text>
					<Button
						onPress={() =>
							setExpanded((current) => (current === row.id ? null : row.id))
						}
						size="sm"
						variant="tertiary"
					>
						<Button.Label>
							{expanded === row.id ? "상세 접기" : "전체 내용 보기"}
						</Button.Label>
					</Button>
					{expanded === row.id && detail.isPending ? (
						<Text className="text-muted text-sm">
							전체 내용을 불러오고 있어요.
						</Text>
					) : null}
					{expanded === row.id && detail.data ? (
						<Surface className="gap-2 rounded-lg p-3">
							<Text className="font-semibold text-foreground">
								{detail.data.title}
							</Text>
							<Text className="text-muted text-xs">
								{detail.data.authorName}
								{detail.data.category ? ` · ${detail.data.category}` : ""}
							</Text>
							<MessageBody body={detail.data.body} />
						</Surface>
					) : null}
					<View className="flex-row flex-wrap gap-2">
						{row.status === "hidden" ? null : (
							<Button
								onPress={() => setPending({ id: row.id, status: "hidden" })}
								size="sm"
								variant="secondary"
							>
								<Button.Label>숨김</Button.Label>
							</Button>
						)}
						{row.status === "published" ? null : (
							<Button
								onPress={() => setPending({ id: row.id, status: "published" })}
								size="sm"
								variant="secondary"
							>
								<Button.Label>복구</Button.Label>
							</Button>
						)}
						{row.status === "deleted" ? null : (
							<Button
								onPress={() => setPending({ id: row.id, status: "deleted" })}
								size="sm"
								variant="danger"
							>
								<Button.Label>삭제</Button.Label>
							</Button>
						)}
						{targetType === "community_post" && row.status === "deleted" ? (
							<Button
								onPress={() => hardDelete(row.id, row.title)}
								size="sm"
								variant="danger"
							>
								<Button.Label>영구 삭제</Button.Label>
							</Button>
						) : null}
					</View>
				</Surface>
			))}
			{data && data.totalCount > 0 ? (
				<View className="flex-row items-center justify-between">
					<Button
						isDisabled={page <= 1}
						onPress={() => setPage((value) => value - 1)}
						size="sm"
						variant="tertiary"
					>
						<Button.Label>이전</Button.Label>
					</Button>
					<Text className="text-muted text-sm">
						{page} / {pages}
					</Text>
					<Button
						isDisabled={page >= pages}
						onPress={() => setPage((value) => value + 1)}
						size="sm"
						variant="tertiary"
					>
						<Button.Label>다음</Button.Label>
					</Button>
				</View>
			) : null}
			{pending ? (
				<ReasonDialog
					confirmLabel="적용"
					danger={pending.status === "deleted"}
					defaultReason=""
					description="조치 사유는 작성자 알림과 감사 기록에 남아요."
					isOpen
					onConfirm={apply}
					onOpenChange={(open) => {
						if (!open) {
							setPending(null);
						}
					}}
					title="게시물 상태 변경"
				/>
			) : null}
		</BambiScreen>
	);
}
