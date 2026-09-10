import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Input,
	Surface,
	Switch,
	TextField,
	useToast,
} from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	BoardEdit,
	BoardLayouts,
} from "@/src/components/moderation/board-management";
import { orpc } from "@/src/lib/orpc";

const BUILTIN = new Set([
	"notice",
	"free",
	"work_talk",
	"market",
	"legal",
	"secret",
]);
const BOARD_SLUG = /^[a-z0-9_-]{2,30}$/;
export default function ModeratorCommunityBoardsScreen() {
	const [label, setLabel] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [postPoints, setPostPoints] = useState("0");
	const [commentPoints, setCommentPoints] = useState("0");
	const query = useQuery(orpc.bambi.communityBoards.list.queryOptions());
	const client = useQueryClient();
	const { toast } = useToast();
	const create = useMutation(
		orpc.bambi.communityBoards.create.mutationOptions()
	);
	const update = useMutation(
		orpc.bambi.communityBoards.update.mutationOptions()
	);
	const active = useMutation(
		orpc.bambi.communityBoards.setActive.mutationOptions()
	);
	const remove = useMutation(
		orpc.bambi.communityBoards.remove.mutationOptions()
	);
	const refresh = () =>
		client.invalidateQueries({ queryKey: orpc.bambi.communityBoards.key() });
	const act = async (action: () => Promise<unknown>, message: string) => {
		try {
			await action();
			await refresh();
			toast.show({ label: message });
		} catch (error) {
			toast.show({
				label: error instanceof Error ? error.message : "처리하지 못했어요.",
				variant: "danger",
			});
		}
	};
	return (
		<BambiScreen>
			<BambiHeader
				description="수다방 게시판을 추가하고 글쓰기·노출·적립 포인트를 관리합니다."
				title="게시판 관리"
			/>
			<Surface className="gap-2 rounded-lg p-4" variant="secondary">
				<Text className="font-bold text-foreground">게시판 추가</Text>
				<TextField>
					<Input
						maxLength={30}
						onChangeText={setLabel}
						placeholder="게시판 이름"
						value={label}
					/>
				</TextField>
				<TextField>
					<Input
						autoCapitalize="none"
						maxLength={30}
						onChangeText={setSlug}
						placeholder="주소: 영소문자·숫자·-_ 2~30자"
						value={slug}
					/>
				</TextField>
				<TextField>
					<Input
						maxLength={200}
						onChangeText={setDescription}
						placeholder="설명"
						value={description}
					/>
				</TextField>
				<View className="flex-row gap-2">
					<TextField className="flex-1">
						<Input
							keyboardType="number-pad"
							onChangeText={setPostPoints}
							placeholder="글 포인트"
							value={postPoints}
						/>
					</TextField>
					<TextField className="flex-1">
						<Input
							keyboardType="number-pad"
							onChangeText={setCommentPoints}
							placeholder="댓글 포인트"
							value={commentPoints}
						/>
					</TextField>
				</View>
				<Button
					isDisabled={
						create.isPending || !label.trim() || !BOARD_SLUG.test(slug)
					}
					onPress={() =>
						act(async () => {
							await create.mutateAsync({
								label: label.trim(),
								slug,
								description: description.trim(),
								postPoints: Number(postPoints),
								commentPoints: Number(commentPoints),
							});
							setLabel("");
							setSlug("");
							setDescription("");
						}, "게시판을 추가했어요.")
					}
				>
					<Button.Label>추가</Button.Label>
				</Button>
			</Surface>
			{query.isError ? (
				<StateCard
					description="잠시 후 다시 시도해 주세요."
					title="게시판을 불러오지 못했어요"
				/>
			) : null}
			{query.data?.map((board) => (
				<Surface
					className="gap-3 rounded-lg p-4"
					key={board.key}
					variant="secondary"
				>
					<View className="flex-row items-center justify-between">
						<View className="flex-1">
							<Text className="font-bold text-foreground">{board.label}</Text>
							<Text className="text-muted text-sm">
								/seeker/community/{board.slug}
							</Text>
						</View>
						<Switch
							isSelected={board.isActive}
							onSelectedChange={(isActive) =>
								act(
									() => active.mutateAsync({ key: board.key, isActive }),
									"노출 상태를 변경했어요."
								)
							}
						/>
					</View>
					<View className="flex-row flex-wrap gap-2">
						<Pill>글 {board.postPoints}P</Pill>
						<Pill>댓글 {board.commentPoints}P</Pill>
					</View>
					<View className="flex-row items-center justify-between">
						<Text className="text-foreground">글쓰기 허용</Text>
						<Switch
							isSelected={board.isWritable}
							onSelectedChange={(isWritable) =>
								act(
									() => update.mutateAsync({ key: board.key, isWritable }),
									"글쓰기 설정을 변경했어요."
								)
							}
						/>
					</View>
					{BUILTIN.has(board.key) ? null : (
						<Button
							onPress={() =>
								Alert.alert(
									"게시판 삭제",
									"글이 없는 게시판만 삭제할 수 있습니다. 삭제할까요?",
									[
										{ text: "취소", style: "cancel" },
										{
											text: "삭제",
											style: "destructive",
											onPress: () =>
												act(
													() => remove.mutateAsync({ key: board.key }),
													"게시판을 삭제했어요."
												),
										},
									]
								)
							}
							size="sm"
							variant="danger-soft"
						>
							<Button.Label>삭제</Button.Label>
						</Button>
					)}
					<BoardEdit board={board} />
				</Surface>
			))}
			{query.data ? <BoardLayouts boards={query.data} /> : null}
		</BambiScreen>
	);
}
