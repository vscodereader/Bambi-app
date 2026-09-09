import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Button,
	Checkbox,
	Input,
	Surface,
	Switch,
	TextArea,
	TextField,
	useToast,
} from "heroui-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { parseBannedWordCsv } from "@/src/lib/moderation/banned-word-csv";
import { orpc } from "@/src/lib/orpc";

type Scope = "content" | "display_name";
type Row = Awaited<
	ReturnType<AppRouterClient["bambi"]["bannedWords"]["list"]>
>["items"][number];

function Manager({
	description,
	itemLabel,
	scope,
	title,
}: {
	description: string;
	itemLabel: string;
	scope: Scope;
	title: string;
}) {
	const [term, setTerm] = useState("");
	const [bulk, setBulk] = useState("");
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const query = useQuery(
		orpc.bambi.bannedWords.list.queryOptions({
			input: { includeInactive: true, scope },
		})
	);
	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.bannedWords.key(),
		});
	};
	const create = useMutation(
		orpc.bambi.bannedWords.create.mutationOptions({
			onSuccess: async () => {
				setTerm("");
				await invalidate();
				toast.show({ label: `${itemLabel}를 등록했어요.` });
			},
		})
	);
	const createMany = useMutation(
		orpc.bambi.bannedWords.createMany.mutationOptions({
			onSuccess: async (result) => {
				setBulk("");
				await invalidate();
				toast.show({
					label: `추가 ${result.added}건 · 제외 ${result.skipped.length}건`,
				});
			},
		})
	);
	const active = useMutation(
		orpc.bambi.bannedWords.setActive.mutationOptions({ onSuccess: invalidate })
	);
	const remove = useMutation(
		orpc.bambi.bannedWords.remove.mutationOptions({
			onSuccess: async (result) => {
				setSelected(new Set());
				await invalidate();
				toast.show({ label: `${result.removed}건을 삭제했어요.` });
			},
		})
	);
	const removeAll = useMutation(
		orpc.bambi.bannedWords.removeAll.mutationOptions({
			onSuccess: async () => {
				setSelected(new Set());
				await invalidate();
				toast.show({ label: `${itemLabel}를 모두 삭제했어요.` });
			},
		})
	);
	const rows = useMemo(() => {
		const value = search.trim().toLowerCase();
		return (query.data?.items ?? []).filter(
			(row) =>
				!value ||
				row.term.toLowerCase().includes(value) ||
				row.normalizedTerm.toLowerCase().includes(value)
		);
	}, [query.data, search]);
	const toggle = (id: string) =>
		setSelected((current) => {
			const next = new Set(current);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	const confirmRemoveAll = () =>
		Alert.alert(
			`${itemLabel}를 전부 삭제할까요?`,
			`등록된 ${query.data?.items.length ?? 0}건이 모두 사라지며 되돌릴 수 없어요.`,
			[
				{ style: "cancel", text: "취소" },
				{
					style: "destructive",
					text: "전부 삭제",
					onPress: () => removeAll.mutate({ scope }),
				},
			]
		);
	const renderRow = (row: Row) => (
		<Surface
			className="flex-row items-center gap-3 rounded-lg p-3"
			key={row.id}
			variant="secondary"
		>
			<Pressable
				accessibilityLabel={`${row.term} 선택`}
				accessibilityRole="checkbox"
				accessibilityState={{ checked: selected.has(row.id) }}
				className="p-2"
				onPress={() => toggle(row.id)}
			>
				<Checkbox
					isSelected={selected.has(row.id)}
					onSelectedChange={() => toggle(row.id)}
				/>
			</Pressable>
			<View className="flex-1">
				<Text className="font-semibold text-foreground">{row.term}</Text>
				<Text className="text-muted text-xs">{row.normalizedTerm}</Text>
			</View>
			<Switch
				isSelected={row.isActive}
				onSelectedChange={(value) =>
					active.mutate({ id: row.id, isActive: value })
				}
			/>
			<Button
				onPress={() => remove.mutate({ ids: [row.id] })}
				size="sm"
				variant="danger-soft"
			>
				<Button.Label>삭제</Button.Label>
			</Button>
		</Surface>
	);

	return (
		<View className="gap-3">
			<View>
				<Text className="font-bold text-foreground text-xl">{title}</Text>
				<Text className="text-muted text-sm leading-5">{description}</Text>
			</View>
			<View className="flex-row gap-2">
				<TextField className="flex-1">
					<Input
						maxLength={100}
						onChangeText={setTerm}
						placeholder={`추가할 ${itemLabel}`}
						value={term}
					/>
				</TextField>
				<Button
					isDisabled={!term.trim() || create.isPending}
					onPress={() => create.mutate({ scope, term })}
				>
					<Button.Label>추가</Button.Label>
				</Button>
			</View>
			<TextField>
				<TextArea
					onChangeText={setBulk}
					placeholder="CSV 내용 또는 쉼표·줄바꿈으로 구분한 여러 단어"
					value={bulk}
				/>
			</TextField>
			<Button
				isDisabled={
					parseBannedWordCsv(bulk).length === 0 || createMany.isPending
				}
				onPress={() =>
					createMany.mutate({ scope, terms: parseBannedWordCsv(bulk) })
				}
				variant="secondary"
			>
				<Button.Label>여러 단어 추가</Button.Label>
			</Button>
			<TextField>
				<Input
					onChangeText={setSearch}
					placeholder={`${itemLabel}·정규화형 검색`}
					value={search}
				/>
			</TextField>
			{selected.size > 0 ? (
				<Button
					onPress={() => remove.mutate({ ids: [...selected] })}
					variant="danger"
				>
					<Button.Label>선택 {selected.size}건 삭제</Button.Label>
				</Button>
			) : null}
			<Button
				isDisabled={(query.data?.items.length ?? 0) === 0}
				onPress={confirmRemoveAll}
				variant="tertiary"
			>
				<Button.Label>전체 삭제</Button.Label>
			</Button>
			{query.isError ? (
				<StateCard
					action={
						<Button onPress={() => query.refetch()} size="sm">
							<Button.Label>다시 시도</Button.Label>
						</Button>
					}
					description="네트워크 연결을 확인해 주세요."
					title="목록을 불러오지 못했어요"
				/>
			) : null}
			{query.isSuccess && rows.length === 0 ? (
				<StateCard
					description="검색 조건에 맞는 항목이 없어요."
					title={`등록된 ${itemLabel}가 없어요`}
				/>
			) : null}
			{rows.map(renderRow)}
		</View>
	);
}

export default function ModeratorBannedWordsScreen() {
	return (
		<BambiScreen>
			<BambiHeader
				description="콘텐츠와 표시 이름에 사용할 수 없는 단어를 관리합니다."
				title="금칙어 관리"
			/>
			<Manager
				description="커뮤니티·고객센터 제목과 본문을 검사합니다. 공백과 특수문자를 무시하고 비교합니다."
				itemLabel="금칙어"
				scope="content"
				title="콘텐츠 금칙어"
			/>
			<Manager
				description="회원가입·프로필·게시글 작성인의 표시 이름을 검사합니다."
				itemLabel="닉네임 금칙어"
				scope="display_name"
				title="닉네임 금칙어"
			/>
		</BambiScreen>
	);
}
