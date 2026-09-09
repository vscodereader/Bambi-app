import {
	useInfiniteQuery,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextField,
	useToast,
} from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { MessageBody } from "@/src/components/message-body";
import { ContentDocumentEditor } from "@/src/components/moderation/content-document-editor";
import { useUnsavedChanges } from "@/src/lib/moderation/use-unsaved-changes";
import { orpc } from "@/src/lib/orpc";

export default function ModeratorMessagesScreen() {
	const { to } = useLocalSearchParams<{ to?: string }>();
	const presetApplied = useRef(false);
	const [jobSeeker, setJobSeeker] = useState(false);
	const [employer, setEmployer] = useState(false);
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<{ id: string; name: string }[]>([]);
	const [title, setTitle] = useState("");
	const [editorKey, setEditorKey] = useState(0);
	const [order, setOrder] = useState<"newest" | "oldest">("newest");
	const [body, setBody] = useState({ json: "", text: "" });
	const [detailId, setDetailId] = useState<string | null>(null);
	const client = useQueryClient();
	const { toast } = useToast();
	const users = useQuery(
		orpc.bambi.moderation.listUsers.queryOptions({ input: { limit: 1000 } })
	);
	useEffect(() => {
		if (!to || presetApplied.current || !users.data) {
			return;
		}
		const target = users.data.find(
			(user) =>
				user.userId === to &&
				user.deletedAt === null &&
				user.role !== "admin" &&
				user.role !== "guest"
		);
		presetApplied.current = true;
		if (target) {
			setSelected([{ id: target.userId, name: target.name }]);
		}
	}, [to, users.data]);
	const sent = useInfiniteQuery(
		orpc.bambi.directMessages.listSent.infiniteOptions({
			initialPageParam: null as { createdAt: string; messageId: string } | null,
			getNextPageParam: (page) => page.nextCursor ?? undefined,
			input: (cursor: { createdAt: string; messageId: string } | null) => ({
				limit: 20,
				order,
				cursor: cursor ?? undefined,
			}),
		})
	);
	const detail = useQuery(
		orpc.bambi.directMessages.sentDetail.queryOptions({
			input: { messageId: detailId ?? "" },
			enabled: detailId !== null,
		})
	);
	const send = useMutation(orpc.bambi.directMessages.send.mutationOptions());
	useUnsavedChanges(
		Boolean(title || body.text || selected.length || jobSeeker || employer),
		send.isPending
	);
	const candidates = useMemo(() => {
		const keyword = search.trim().toLowerCase();
		if (!keyword) {
			return [];
		}
		return (users.data ?? []).filter(
			(user) =>
				user.deletedAt === null &&
				!["admin", "guest"].includes(user.role) &&
				!selected.some((item) => item.id === user.userId) &&
				[user.name, user.loginId ?? ""].some((field) =>
					field.toLowerCase().includes(keyword)
				)
		);
	}, [search, selected, users.data]);
	const submit = () =>
		Alert.alert("쪽지 발송", "선택한 대상에게 쪽지를 발송할까요?", [
			{ style: "cancel", text: "취소" },
			{
				text: "발송",
				onPress: async () => {
					try {
						const result = await send.mutateAsync({
							body: body.json,
							recipientUserIds: selected.map((item) => item.id),
							roles: [
								...(jobSeeker ? ["job_seeker" as const] : []),
								...(employer ? ["employer" as const] : []),
							],
							title: title.trim(),
						});
						setTitle("");
						setBody({ json: "", text: "" });
						setEditorKey((current) => current + 1);
						setSelected([]);
						setJobSeeker(false);
						setEmployer(false);
						await client.invalidateQueries({
							queryKey: orpc.bambi.directMessages.listSent.key(),
						});
						toast.show({ label: `${result.recipientCount}명에게 발송했어요.` });
					} catch (error) {
						toast.show({
							label:
								error instanceof Error ? error.message : "발송하지 못했어요.",
							variant: "danger",
						});
					}
				},
			},
		]);
	return (
		<BambiScreen>
			<BambiHeader
				description="역할 또는 특정 회원에게 쪽지를 보내고 읽음 상태를 확인합니다."
				title="쪽지"
			/>
			<Surface className="gap-3 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">새 쪽지</Text>
				<View className="flex-row items-center justify-between">
					<Text className="text-foreground">구직자 전체</Text>
					<Switch isSelected={jobSeeker} onSelectedChange={setJobSeeker} />
				</View>
				<View className="flex-row items-center justify-between">
					<Text className="text-foreground">구인자 전체</Text>
					<Switch isSelected={employer} onSelectedChange={setEmployer} />
				</View>
				<TextField>
					<Input
						onChangeText={setSearch}
						placeholder="이름·로그인 아이디로 수신자 검색"
						value={search}
					/>
				</TextField>
				{candidates.map((user) => (
					<Pressable
						className="rounded-lg bg-background p-3"
						key={user.userId}
						onPress={() => {
							setSelected((items) => [
								...items,
								{ id: user.userId, name: user.name },
							]);
							setSearch("");
						}}
					>
						<Text className="text-foreground">
							{user.name} · {user.loginId ?? "아이디 없음"}
						</Text>
					</Pressable>
				))}
				<View className="flex-row flex-wrap gap-2">
					{selected.map((item) => (
						<Pressable
							key={item.id}
							onPress={() =>
								setSelected((items) =>
									items.filter((value) => value.id !== item.id)
								)
							}
						>
							<Pill>{item.name} ×</Pill>
						</Pressable>
					))}
				</View>
				<TextField>
					<Input
						maxLength={100}
						onChangeText={setTitle}
						placeholder="제목"
						value={title}
					/>
				</TextField>
				<ContentDocumentEditor key={editorKey} onChange={setBody} />
				<Text className="text-muted text-xs">
					{body.text.trim().length} / 2,000
				</Text>
				<Button
					isDisabled={
						send.isPending ||
						(!(jobSeeker || employer) && selected.length === 0) ||
						!title.trim() ||
						!body.text.trim() ||
						body.text.trim().length > 2000
					}
					onPress={submit}
				>
					<Button.Label>발송</Button.Label>
				</Button>
			</Surface>
			<Text className="font-bold text-foreground">발송 이력</Text>
			<Button
				onPress={() =>
					setOrder((current) => (current === "newest" ? "oldest" : "newest"))
				}
				size="sm"
				variant="secondary"
			>
				<Button.Label>
					{order === "newest" ? "최신순" : "오래된순"}
				</Button.Label>
			</Button>
			{sent.isError ? (
				<StateCard
					description="잠시 후 다시 시도해 주세요."
					title="이력을 불러오지 못했어요"
				/>
			) : null}
			{sent.data?.pages
				.flatMap((page) => page.items)
				.map((item) => (
					<Surface
						className="gap-2 rounded-lg p-4"
						key={item.messageId}
						variant="secondary"
					>
						<Pressable
							onPress={() =>
								setDetailId(detailId === item.messageId ? null : item.messageId)
							}
						>
							<Text className="font-bold text-foreground">{item.title}</Text>
							<Text className="text-muted text-xs">
								읽음 {item.readCount}/{item.recipientCount} ·{" "}
								{new Date(item.createdAt).toLocaleString("ko-KR")}
							</Text>
						</Pressable>
						{detailId === item.messageId && detail.data ? (
							<View className="gap-2 border-border border-t pt-2">
								<MessageBody body={detail.data.message.body} />
								{detail.data.recipients.map((recipient) => (
									<Text
										className="text-muted text-xs"
										key={recipient.recipientUserId}
									>
										{recipient.recipientName} ·{" "}
										{recipient.readAt
											? `${new Date(recipient.readAt).toLocaleString("ko-KR")} 읽음`
											: "안읽음"}
									</Text>
								))}
							</View>
						) : null}
					</Surface>
				))}
			{sent.hasNextPage ? (
				<Button
					isDisabled={sent.isFetchingNextPage}
					onPress={() => sent.fetchNextPage()}
					variant="secondary"
				>
					<Button.Label>더 보기</Button.Label>
				</Button>
			) : null}
		</BambiScreen>
	);
}
