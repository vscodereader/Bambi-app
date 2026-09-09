import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";
import { FieldSelect } from "@/src/components/field-select";
import { orpc } from "@/src/lib/orpc";

type Board = Awaited<
	ReturnType<AppRouterClient["bambi"]["communityBoards"]["list"]>
>[number];
const ICONS = {
	Briefcase: "서류가방",
	Coffee: "커피",
	MessageSquareLock: "잠긴 말풍선",
	Heart: "하트",
	Megaphone: "확성기",
	MessageCircle: "말풍선",
	Moon: "달",
	Music: "음표",
	Newspaper: "신문",
	Scale: "저울",
	ShoppingBag: "쇼핑백",
	Sparkles: "반짝임",
	Star: "별",
	Users: "사람들",
} as const;
type Icon = keyof typeof ICONS;
const iconValue = (value: string | null): Icon | null =>
	value && value in ICONS ? (value as Icon) : null;
const ICON_OPTIONS = [
	{ value: "", label: "아이콘 없음" },
	...Object.entries(ICONS).map(([value, label]) => ({ value, label })),
];

export function BoardEdit({ board }: { board: Board }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(board.label);
	const [description, setDescription] = useState(board.description);
	const [sort, setSort] = useState(String(board.sortOrder));
	const [post, setPost] = useState(String(board.postPoints));
	const [comment, setComment] = useState(String(board.commentPoints));
	const [icon, setIcon] = useState(iconValue(board.icon));
	const mutation = useMutation(
		orpc.bambi.communityBoards.update.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	return (
		<View className="gap-2">
			<Button onPress={() => setOpen(!open)} size="sm" variant="secondary">
				<Button.Label>게시판 수정</Button.Label>
			</Button>
			{open ? (
				<>
					<TextField>
						<Input
							accessibilityLabel="게시판 이름"
							maxLength={30}
							onChangeText={setName}
							value={name}
						/>
					</TextField>
					<TextField>
						<Input
							accessibilityLabel="게시판 설명"
							maxLength={200}
							onChangeText={setDescription}
							value={description}
						/>
					</TextField>
					<FieldSelect
						label="게시판 아이콘"
						onChange={(value) => setIcon(iconValue(value))}
						options={ICON_OPTIONS}
						placeholder="선택해 주세요"
						value={icon ?? ""}
					/>
					<TextField>
						<Input
							accessibilityLabel="게시판 정렬값"
							keyboardType="number-pad"
							onChangeText={setSort}
							value={sort}
						/>
					</TextField>
					{board.key === "notice" ? null : (
						<TextField>
							<Input
								accessibilityLabel="글 작성 포인트"
								keyboardType="number-pad"
								onChangeText={setPost}
								value={post}
							/>
						</TextField>
					)}
					<TextField>
						<Input
							accessibilityLabel="댓글 작성 포인트"
							keyboardType="number-pad"
							onChangeText={setComment}
							value={comment}
						/>
					</TextField>
					<Button
						isDisabled={mutation.isPending || !name.trim()}
						onPress={async () => {
							try {
								await mutation.mutateAsync({
									key: board.key,
									label: name.trim(),
									description: description.trim(),
									icon,
									sortOrder: Number(sort),
									postPoints: board.key === "notice" ? undefined : Number(post),
									commentPoints: Number(comment),
								});
								await client.invalidateQueries({
									queryKey: orpc.bambi.communityBoards.key(),
								});
								setOpen(false);
							} catch (error) {
								toast.show({
									label:
										error instanceof Error
											? error.message
											: "수정하지 못했어요.",
									variant: "danger",
								});
							}
						}}
					>
						<Button.Label>게시판 저장</Button.Label>
					</Button>
				</>
			) : null}
		</View>
	);
}

export function BoardLayouts({ boards }: { boards: Board[] }) {
	const [surface, setSurface] = useState<"main" | "community">("main");
	const query = useQuery(
		orpc.bambi.communityBoards.getHomeLayout.queryOptions({
			input: { surface },
		})
	);
	const best = useQuery(
		orpc.bambi.communityBoards.getBestBoardIcon.queryOptions()
	);
	const bestMutation = useMutation(
		orpc.bambi.communityBoards.updateBestBoardIcon.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	return (
		<View className="gap-3">
			<Text className="font-bold text-foreground">홈 게시판 배치</Text>
			<Button
				onPress={() => setSurface(surface === "main" ? "community" : "main")}
				size="sm"
				variant="secondary"
			>
				<Button.Label>{surface === "main" ? "메인" : "수다방 홈"}</Button.Label>
			</Button>
			{query.data ? (
				<LayoutEditor
					boards={boards}
					initial={query.data}
					key={surface}
					surface={surface}
				/>
			) : null}
			<FieldSelect
				label="베스트글 아이콘"
				onChange={async (value) => {
					try {
						await bestMutation.mutateAsync({ icon: iconValue(value) });
						await client.invalidateQueries({
							queryKey: orpc.bambi.communityBoards.key(),
						});
					} catch (error) {
						toast.show({
							label:
								error instanceof Error
									? error.message
									: "아이콘을 저장하지 못했어요.",
							variant: "danger",
						});
					}
				}}
				options={ICON_OPTIONS}
				placeholder="선택해 주세요"
				value={best.data?.icon ?? ""}
			/>
		</View>
	);
}

function LayoutEditor({
	initial,
	boards,
	surface,
}: {
	initial: Awaited<
		ReturnType<AppRouterClient["bambi"]["communityBoards"]["getHomeLayout"]>
	>;
	boards: Board[];
	surface: "main" | "community";
}) {
	const [rows, setRows] = useState<string[][]>(() => {
		const result: string[][] = [];
		for (const item of initial) {
			const row = result[item.rowIndex] ?? [];
			row.push(item.boardKey);
			result[item.rowIndex] = row;
		}
		return result.filter(Boolean);
	});
	const mutation = useMutation(
		orpc.bambi.communityBoards.updateHomeLayout.mutationOptions()
	);
	const client = useQueryClient();
	const { toast } = useToast();
	const labels = new Map([
		...boards.map((board) => [board.key, board.label] as const),
		["best", "베스트글"],
	]);
	const options = [...labels]
		.filter(([key]) => !rows.flat().includes(key))
		.map(([value, label]) => ({ value, label }));
	return (
		<View className="gap-3">
			{rows.map((row, index) => (
				<View
					className="gap-2 rounded-lg border border-border p-3"
					key={row.join("|") || "empty"}
				>
					<Text className="text-foreground">{index + 1}행</Text>
					{row.map((key, position) => (
						<View className="flex-row flex-wrap items-center gap-2" key={key}>
							<Text className="text-foreground">{labels.get(key) ?? key}</Text>
							<Button
								isDisabled={position === 0}
								onPress={() =>
									setRows((current) =>
										current.map((value, rowIndex) => {
											if (rowIndex !== index) {
												return value;
											}
											const next = [...value];
											next.splice(position, 1);
											next.splice(position - 1, 0, key);
											return next;
										})
									)
								}
								size="sm"
								variant="secondary"
							>
								<Button.Label>앞으로</Button.Label>
							</Button>
							<Button
								onPress={() =>
									setRows((current) =>
										current
											.map((value) => value.filter((item) => item !== key))
											.filter((value) => value.length)
									)
								}
								size="sm"
								variant="danger-soft"
							>
								<Button.Label>배치 제거</Button.Label>
							</Button>
						</View>
					))}
					{options.length ? (
						<FieldSelect
							label={`${index + 1}행에 게시판 추가`}
							onChange={(key) =>
								setRows((current) =>
									current.map((value, rowIndex) =>
										rowIndex === index ? [...value, key] : value
									)
								)
							}
							options={options}
							placeholder="선택해 주세요"
							value=""
						/>
					) : null}
				</View>
			))}
			<Button
				isDisabled={rows.some((row) => !row.length)}
				onPress={() => setRows((current) => [...current, []])}
				size="sm"
				variant="secondary"
			>
				<Button.Label>행 추가</Button.Label>
			</Button>
			<Button
				isDisabled={mutation.isPending || rows.some((row) => !row.length)}
				onPress={async () => {
					try {
						await mutation.mutateAsync({ surface, rows });
						await client.invalidateQueries({
							queryKey: orpc.bambi.communityBoards.key(),
						});
						toast.show({ label: "홈 배치를 저장했어요." });
					} catch (error) {
						toast.show({
							label:
								error instanceof Error
									? error.message
									: "배치를 저장하지 못했어요.",
							variant: "danger",
						});
					}
				}}
			>
				<Button.Label>배치 저장</Button.Label>
			</Button>
		</View>
	);
}
