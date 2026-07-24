"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { parseBannedWordsCsv } from "@/lib/bambi/banned-words-csv";
import { orpc } from "@/utils/orpc";

type BannedWordRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["bannedWords"]["list"]>
>["items"][number];

function getBannedWordColumns(
	onToggleActive: (id: string, isActive: boolean) => void,
	onRemove: (id: string) => void
): DataColumn<BannedWordRow>[] {
	return [
		{
			id: "term",
			header: "금칙어",
			sortValue: (row) => row.term,
			cell: (row) => <span className="font-bold">{row.term}</span>,
		},
		{
			id: "normalizedTerm",
			header: "정규화형",
			cell: (row) => <Badge variant="outline">{row.normalizedTerm}</Badge>,
		},
		{
			id: "isActive",
			header: "사용",
			cell: (row) => (
				<Switch
					checked={row.isActive}
					onCheckedChange={(checked) => onToggleActive(row.id, checked)}
				/>
			),
		},
		{
			id: "actions",
			header: "삭제",
			headerClassName: "text-right",
			cellClassName: "text-right",
			cell: (row) => (
				<Button
					onClick={() => onRemove(row.id)}
					size="sm"
					variant="destructive"
				>
					삭제
				</Button>
			),
		},
	];
}

export default function ModeratorBannedWordsPage() {
	const queryClient = useQueryClient();
	const [term, setTerm] = useState("");
	const [keyword, setKeyword] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const listQuery = useQuery(
		orpc.bambi.bannedWords.list.queryOptions({
			input: { includeInactive: true },
		})
	);

	const invalidate = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.bannedWords.key(),
		});
	};

	const createMutation = useMutation(
		orpc.bambi.bannedWords.create.mutationOptions({
			onError: (error) => toast(error.message || "금칙어를 등록하지 못했어요."),
			onSuccess: async () => {
				toast("금칙어를 등록했어요.");
				setTerm("");
				await invalidate();
			},
		})
	);

	const createManyMutation = useMutation(
		orpc.bambi.bannedWords.createMany.mutationOptions({
			onError: (error) => toast(error.message || "일괄 추가하지 못했어요."),
			onSuccess: async (result) => {
				toast(`추가 ${result.added}건 · 제외 ${result.skipped.length}건`);
				await invalidate();
			},
		})
	);

	const setActiveMutation = useMutation(
		orpc.bambi.bannedWords.setActive.mutationOptions({
			onError: (error) => toast(error.message || "상태를 바꾸지 못했어요."),
			onSuccess: invalidate,
		})
	);

	const removeMutation = useMutation(
		orpc.bambi.bannedWords.remove.mutationOptions({
			onError: (error) => toast(error.message || "삭제하지 못했어요."),
			onSuccess: async () => {
				toast("금칙어를 삭제했어요.");
				await invalidate();
			},
		})
	);

	const items = listQuery.data?.items ?? [];

	const visibleItems = useMemo(() => {
		const query = keyword.trim().toLowerCase();

		if (!query) {
			return items;
		}

		return items.filter(
			(item) =>
				item.term.toLowerCase().includes(query) ||
				item.normalizedTerm.toLowerCase().includes(query)
		);
	}, [items, keyword]);

	const handleCsvChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// 같은 파일을 다시 선택해도 onChange가 발생하도록 값을 비운다.
		event.target.value = "";

		if (!file) {
			return;
		}

		const parsed = parseBannedWordsCsv(await file.text());

		if (parsed.length === 0) {
			toast("CSV에서 추가할 단어를 찾지 못했어요.");
			return;
		}

		createManyMutation.mutate({ terms: parsed });
	};

	const columns = getBannedWordColumns(
		(id, isActive) => setActiveMutation.mutate({ id, isActive }),
		(id) => removeMutation.mutate({ id })
	);

	return (
		<div className="flex flex-col gap-5 px-5 py-6 md:px-6">
			<header className="flex flex-col gap-2">
				<h1 className="m-0 font-extrabold text-xl">금칙어 관리</h1>
				<p className="m-0 text-muted-foreground text-sm">
					등록된 단어가 제목·본문에 있으면 커뮤니티·고객센터 글이 게시되지
					않습니다. 공백과 특수문자는 무시하고 비교하므로 "성 매매"처럼 띄어
					써도 걸립니다.
				</p>
			</header>

			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="max-w-80"
					maxLength={100}
					onChange={(event) => setTerm(event.target.value)}
					placeholder="추가할 금칙어"
					value={term}
				/>
				<Button
					disabled={term.trim().length === 0 || createMutation.isPending}
					onClick={() => createMutation.mutate({ term })}
				>
					추가
				</Button>
				<Button
					disabled={createManyMutation.isPending}
					onClick={() => fileInputRef.current?.click()}
					variant="outline"
				>
					<UploadIcon data-icon="inline-start" />
					CSV로 추가
				</Button>
				<input
					accept=".csv,text/csv"
					className="hidden"
					onChange={handleCsvChange}
					ref={fileInputRef}
					type="file"
				/>
			</div>

			<Input
				className="max-w-80"
				onChange={(event) => setKeyword(event.target.value)}
				placeholder="금칙어·정규화형 검색"
				value={keyword}
			/>

			<div className="w-full overflow-x-auto">
				<DataTable
					columns={columns}
					data={visibleItems}
					emptyMessage={
						keyword.trim()
							? "검색 조건에 맞는 금칙어가 없어요."
							: "등록된 금칙어가 없어요."
					}
					getRowKey={(row) => row.id}
					pageSize={20}
				/>
			</div>
		</div>
	);
}
