import {
	userGenderLabel,
	userRoleLabel,
} from "@bambi-app/api/services/bambi-moderation-labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Surface, TextField, useToast } from "heroui-native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { FilterChips } from "@/src/components/moderation/filter-chips";
import { useForeground } from "@/src/lib/moderation/use-foreground";
import { orpc } from "@/src/lib/orpc";

const STATUS = [
	{ label: "진행 중", value: "open" },
	{ label: "종료", value: "closed" },
] as const;

function Room({ roomId, onBack }: { roomId: string; onBack: () => void }) {
	const foreground = useForeground();
	const [reply, setReply] = useState("");
	const client = useQueryClient();
	const { toast } = useToast();
	const query = useQuery({
		...orpc.bambi.supportChat.admin.getRoom.queryOptions({ input: { roomId } }),
		refetchInterval: foreground ? 5000 : false,
	});
	const invalidate = useCallback(
		() =>
			client.invalidateQueries({
				queryKey: orpc.bambi.supportChat.admin.key(),
			}),
		[client]
	);
	const markRead = useMutation(
		orpc.bambi.supportChat.admin.markRead.mutationOptions()
	);
	const send = useMutation(
		orpc.bambi.supportChat.admin.sendMessage.mutationOptions()
	);
	const blocked = useMutation(
		orpc.bambi.supportChat.admin.setBlocked.mutationOptions()
	);
	const closed = useMutation(
		orpc.bambi.supportChat.admin.setClosed.mutationOptions()
	);
	useEffect(() => {
		if (foreground && (query.data?.unreadCount ?? 0) > 0) {
			markRead.mutate({ roomId }, { onSuccess: invalidate });
		}
	}, [
		query.data?.unreadCount,
		roomId,
		foreground,
		markRead.mutate,
		invalidate,
	]);
	const act = async (action: () => Promise<unknown>, message: string) => {
		try {
			await action();
			await invalidate();
			toast.show({ label: message });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	if (query.isError) {
		return (
			<StateCard
				action={
					<Button onPress={() => query.refetch()}>
						<Button.Label>다시 시도</Button.Label>
					</Button>
				}
				description="입력한 답변은 유지됩니다."
				title="대화를 불러오지 못했어요"
			/>
		);
	}
	if (!query.data) {
		return (
			<StateCard
				description="잠시만 기다려 주세요."
				title="대화를 불러오는 중이에요"
			/>
		);
	}
	const data = query.data;
	return (
		<View className="gap-3">
			<Button onPress={onBack} size="sm" variant="secondary">
				<Button.Label>목록으로</Button.Label>
			</Button>
			<Surface className="gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">문의자 정보</Text>
				{data.inquirer.kind === "member" ? (
					<Text className="text-muted text-xs">
						{userGenderLabel(data.inquirer.gender ?? "")} · 가입{" "}
						{new Date(data.inquirer.joinedAt).toLocaleDateString("ko-KR")}
					</Text>
				) : (
					<Text className="text-muted text-xs">
						최초 문의{" "}
						{new Date(data.inquirer.firstContactAt).toLocaleDateString("ko-KR")}
					</Text>
				)}
				<Text className="text-muted text-sm">
					{data.inquirer.kind === "member"
						? `${data.inquirer.name} · ${userRoleLabel(data.inquirer.role)}${data.inquirer.organizationName ? ` · ${data.inquirer.organizationName}` : ""}`
						: "비회원 문의"}
				</Text>
				<View className="flex-row gap-2">
					<Button
						isDisabled={blocked.isPending}
						onPress={() =>
							act(
								() =>
									blocked.mutateAsync({
										isBlocked: !data.room.isBlocked,
										roomId,
									}),
								data.room.isBlocked
									? "발신 잠금을 해제했어요."
									: "문의자 발신을 잠갔어요."
							)
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{data.room.isBlocked ? "잠금 해제" : "발신 잠금"}
						</Button.Label>
					</Button>
					<Button
						isDisabled={closed.isPending}
						onPress={() =>
							act(
								() =>
									closed.mutateAsync({
										closed: data.room.status !== "closed",
										roomId,
									}),
								data.room.status === "closed"
									? "대화를 재개했어요."
									: "대화를 종료했어요."
							)
						}
						size="sm"
						variant="secondary"
					>
						<Button.Label>
							{data.room.status === "closed" ? "대화 재개" : "대화 종료"}
						</Button.Label>
					</Button>
				</View>
			</Surface>
			{data.messages.map((message) => (
				<View
					className={`max-w-[85%] gap-1 rounded-2xl p-3 ${message.senderType === "admin" ? "self-end bg-accent" : "self-start bg-surface-secondary"}`}
					key={message.id}
				>
					<Text
						className={
							message.senderType === "admin"
								? "text-accent-foreground"
								: "text-foreground"
						}
					>
						{message.body}
					</Text>
					<Text className="text-muted text-xs">
						{new Date(message.createdAt).toLocaleString("ko-KR")}
					</Text>
				</View>
			))}
			{data.room.isBlocked ? (
				<Text className="text-muted text-sm">
					문의자의 발신이 잠겨 있어요. 운영자 답변은 보낼 수 있습니다.
				</Text>
			) : null}
			<TextField>
				<Input
					maxLength={1000}
					onChangeText={setReply}
					placeholder="답변을 입력하세요"
					value={reply}
				/>
			</TextField>
			<Button
				isDisabled={!reply.trim() || send.isPending}
				onPress={() =>
					act(async () => {
						await send.mutateAsync({ body: reply.trim(), roomId });
						setReply("");
					}, "답변을 보냈어요.")
				}
			>
				<Button.Label>답변 보내기</Button.Label>
			</Button>
		</View>
	);
}

export default function ModeratorSupportChatsScreen() {
	const foreground = useForeground();
	const [status, setStatus] = useState<"open" | "closed">("open");
	const [page, setPage] = useState(1);
	const [roomId, setRoomId] = useState<string | null>(null);
	const query = useQuery({
		...orpc.bambi.supportChat.admin.listRooms.queryOptions({
			input: { page, status },
		}),
		refetchInterval: foreground ? 5000 : false,
	});
	return (
		<BambiScreen>
			<BambiHeader
				description="실시간 문의에 답변하고 대화를 종료하거나 발신을 잠급니다."
				title="문의 채팅"
			/>
			{roomId ? (
				<Room onBack={() => setRoomId(null)} roomId={roomId} />
			) : (
				<>
					<FilterChips
						onChange={(next) => {
							setStatus(next);
							setPage(1);
						}}
						options={STATUS}
						value={status}
					/>
					{query.isError ? (
						<StateCard
							description="잠시 후 다시 시도해 주세요."
							title="문의 목록을 불러오지 못했어요"
						/>
					) : null}
					{query.data?.items.map((room) => (
						<Surface
							className="gap-2 rounded-lg p-4"
							key={room.id}
							variant="secondary"
						>
							<Button onPress={() => setRoomId(room.id)} variant="ghost">
								<Button.Label>{room.displayName}</Button.Label>
							</Button>
							<View className="flex-row gap-2">
								<Pill>{room.isMember ? "회원" : "비회원"}</Pill>
								{room.unreadCount ? (
									<Pill tone="warning">안읽음 {room.unreadCount}</Pill>
								) : null}
								{room.isBlocked ? <Pill>잠김</Pill> : null}
							</View>
							<Text className="text-muted text-sm" numberOfLines={2}>
								{room.lastMessagePreview || "메시지 없음"}
							</Text>
						</Surface>
					))}
					{query.data && query.data.totalCount > query.data.pageSize ? (
						<View className="flex-row justify-between">
							<Button
								isDisabled={page <= 1}
								onPress={() => setPage((v) => v - 1)}
								size="sm"
								variant="secondary"
							>
								<Button.Label>이전</Button.Label>
							</Button>
							<Text className="text-muted">
								{page} /{" "}
								{Math.ceil(query.data.totalCount / query.data.pageSize)}
							</Text>
							<Button
								isDisabled={page * query.data.pageSize >= query.data.totalCount}
								onPress={() => setPage((v) => v + 1)}
								size="sm"
								variant="secondary"
							>
								<Button.Label>다음</Button.Label>
							</Button>
						</View>
					) : null}
				</>
			)}
		</BambiScreen>
	);
}
