import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, SearchField, Surface, Switch, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	formatDateTime,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { ChatModerationThread } from "@/src/components/moderation/chat-moderation-thread";
import { ReasonDialog } from "@/src/components/moderation/reason-dialog";
import { orpc } from "@/src/lib/orpc";
import { useDebouncedValue } from "@/src/lib/use-debounced-value";

type ChatPage = Awaited<
	ReturnType<
		AppRouterClient["bambi"]["moderation"]["listAllChatsForModeration"]
	>
>;

export default function ModeratorChatsScreen() {
	const [search, setSearch] = useState("");
	const [onlyFlagged, setOnlyFlagged] = useState(false);
	const [page, setPage] = useState(1);
	const [openId, setOpenId] = useState<string | null>(null);
	const [blocking, setBlocking] = useState<null | {
		id: string;
		next: boolean;
	}>(null);
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const keyword = useDebouncedValue(search).trim();
	const query = useQuery(
		orpc.bambi.moderation.listAllChatsForModeration.queryOptions({
			input: { onlyFlagged, page, search: keyword },
		})
	);
	const block = useMutation(
		orpc.bambi.moderation.setChatRoomBlocked.mutationOptions()
	);
	const remove = useMutation(
		orpc.bambi.moderation.hardDeleteChatRoom.mutationOptions()
	);
	const data: ChatPage | undefined = query.data;
	const rows = data?.items ?? [];
	const pages = Math.max(
		1,
		Math.ceil((data?.totalCount ?? 0) / (data?.pageSize ?? 10))
	);
	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.moderation.listAllChatsForModeration.key(),
		});
	};
	const confirmBlock = async (reason: string) => {
		if (!blocking) {
			return false;
		}
		await block.mutateAsync({
			chatRoomId: blocking.id,
			isBlocked: blocking.next,
			reason,
		});
		await refresh();
		toast.show({
			label: blocking.next
				? "대화방을 차단했어요."
				: "대화방 차단을 해제했어요.",
		});
		setBlocking(null);
		return true;
	};
	const deleteRoom = (id: string, title: string) =>
		Alert.alert(
			"채팅방을 삭제할까요?",
			`${title}의 메시지·첨부·면접·후기와 관련 기록이 삭제되며 되돌릴 수 없어요.`,
			[
				{ style: "cancel", text: "취소" },
				{
					style: "destructive",
					text: "삭제",
					onPress: async () => {
						await remove.mutateAsync({
							chatRoomId: id,
							reason: "운영자가 채팅방을 삭제했습니다.",
						});
						setOpenId(null);
						await refresh();
						toast.show({ label: "채팅방을 삭제했어요." });
					},
				},
			]
		);

	return (
		<BambiScreen>
			<BambiHeader
				description="참여자·공고 제목으로 찾고 방 상태와 대화를 확인합니다."
				title="채팅 관리"
			/>
			<SearchField
				onChange={(value) => {
					setSearch(value);
					setPage(1);
				}}
				value={search}
			>
				<SearchField.Group>
					<SearchField.SearchIcon />
					<SearchField.Input placeholder="구직자·구인자·공고 제목 검색" />
					<SearchField.ClearButton />
				</SearchField.Group>
			</SearchField>
			<View className="flex-row items-center gap-3">
				<Switch
					isSelected={onlyFlagged}
					onSelectedChange={(value) => {
						setOnlyFlagged(value);
						setPage(1);
					}}
				/>
				<Text className="text-foreground text-sm">조치 대상만 보기</Text>
			</View>
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="채팅방을 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && rows.length === 0 ? (
				<StateCard
					description="검색어나 필터를 바꿔 다시 확인해 주세요."
					title="표시할 채팅방이 없어요"
				/>
			) : null}
			{rows.map((row) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={row.chatRoomId}
					variant="secondary"
				>
					<View className="flex-row flex-wrap gap-2">
						{row.isReported ? <Pill tone="warning">신고됨</Pill> : null}
						{row.isBlocked ? <Pill tone="danger">차단됨</Pill> : null}
						{row.isDeleted ? <Pill tone="neutral">나감</Pill> : null}
						{row.isReported || row.isBlocked || row.isDeleted ? null : (
							<Pill tone="success">정상</Pill>
						)}
					</View>
					<Text className="font-bold text-foreground">{row.jobPostTitle}</Text>
					<Text className="text-muted text-sm">
						{row.jobSeekerName} · {row.employerName}
					</Text>
					<Text className="text-muted text-xs">
						{row.lastMessageAt
							? formatDateTime(row.lastMessageAt)
							: "메시지 없음"}
					</Text>
					<View className="flex-row flex-wrap gap-2">
						<Button
							onPress={() =>
								setOpenId((current) =>
									current === row.chatRoomId ? null : row.chatRoomId
								)
							}
							size="sm"
							variant="secondary"
						>
							<Button.Label>
								{openId === row.chatRoomId ? "대화 접기" : "대화 열람"}
							</Button.Label>
						</Button>
						<Button
							onPress={() =>
								setBlocking({ id: row.chatRoomId, next: !row.isBlocked })
							}
							size="sm"
							variant={row.isBlocked ? "secondary" : "danger-soft"}
						>
							<Button.Label>
								{row.isBlocked ? "차단 해제" : "차단"}
							</Button.Label>
						</Button>
						<Button
							onPress={() => deleteRoom(row.chatRoomId, row.jobPostTitle)}
							size="sm"
							variant="danger"
						>
							<Button.Label>삭제</Button.Label>
						</Button>
					</View>
					{openId === row.chatRoomId ? (
						<ChatModerationThread chatRoomId={row.chatRoomId} />
					) : null}
				</Surface>
			))}
			{data && data.totalCount > 0 ? (
				<View className="flex-row items-center justify-between">
					<Button
						isDisabled={page <= 1 || query.isFetching}
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
						isDisabled={page >= pages || query.isFetching}
						onPress={() => setPage((value) => value + 1)}
						size="sm"
						variant="tertiary"
					>
						<Button.Label>다음</Button.Label>
					</Button>
				</View>
			) : null}
			{blocking ? (
				<ReasonDialog
					confirmLabel={blocking.next ? "차단" : "차단 해제"}
					danger={blocking.next}
					defaultReason=""
					description="조치 사유는 감사 기록에 남고 관련 신고 상태도 서버 정책에 따라 갱신됩니다."
					isOpen
					onConfirm={confirmBlock}
					onOpenChange={(open) => {
						if (!open) {
							setBlocking(null);
						}
					}}
					title={blocking.next ? "대화방 차단" : "대화방 차단 해제"}
				/>
			) : null}
		</BambiScreen>
	);
}
