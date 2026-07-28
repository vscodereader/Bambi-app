"use client";

import type { AppRouterClient } from "@bambi-app/api/routers/index";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import { Checkbox } from "@bambi-app/ui/components/checkbox";
import { Input } from "@bambi-app/ui/components/input";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon, UploadIcon } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type DataColumn, DataTable } from "@/components/bambi/data-table";
import { parseBannedWordsCsv } from "@/lib/bambi/banned-words-csv";
import { orpc } from "@/utils/orpc";

type BannedWordRow = Awaited<
	ReturnType<AppRouterClient["bambi"]["bannedWords"]["list"]>
>["items"][number];

// 선택 상태는 DataTable이 아니라 페이지가 들고 있다. 선택 기능을 쓰는 표가 여기뿐이라
// 공용 DataTable(사용처 9곳)을 건드리는 대신 컬럼 하나로 얹는다.
function getBannedWordColumns({
	allChecked,
	onRemove,
	onToggleActive,
	onToggleSelectAll,
	onToggleSelect,
	selectedIds,
	someChecked,
}: {
	allChecked: boolean;
	onRemove: (id: string) => void;
	onToggleActive: (id: string, isActive: boolean) => void;
	onToggleSelectAll: () => void;
	onToggleSelect: (id: string) => void;
	selectedIds: Set<string>;
	someChecked: boolean;
}): DataColumn<BannedWordRow>[] {
	return [
		{
			id: "select",
			header: (
				<Checkbox
					aria-label="검색된 금칙어 전체 선택"
					checked={allChecked}
					indeterminate={someChecked && !allChecked}
					onCheckedChange={onToggleSelectAll}
				/>
			),
			headerClassName: "w-10",
			cell: (row) => (
				<Checkbox
					aria-label={`${row.term} 선택`}
					checked={selectedIds.has(row.id)}
					onCheckedChange={() => onToggleSelect(row.id)}
				/>
			),
		},
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
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [isClearAllOpen, setIsClearAllOpen] = useState(false);
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
			onSuccess: async (result) => {
				toast(`금칙어 ${result.removed}건을 삭제했어요.`);
				setSelectedIds(new Set());
				await invalidate();
			},
		})
	);

	const removeAllMutation = useMutation(
		orpc.bambi.bannedWords.removeAll.mutationOptions({
			onError: (error) => toast(error.message || "전체 삭제하지 못했어요."),
			onSuccess: async (result) => {
				toast(`금칙어 ${result.removed}건을 모두 삭제했어요.`);
				setSelectedIds(new Set());
				setIsClearAllOpen(false);
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

	const allChecked =
		visibleItems.length > 0 &&
		visibleItems.every((item) => selectedIds.has(item.id));

	const toggleSelect = (id: string) => {
		setSelectedIds((current) => {
			const next = new Set(current);

			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}

			return next;
		});
	};

	// 전체 선택은 검색으로 걸러진 목록만 건드린다. 안 보이는 행까지 담기면 삭제 버튼의
	// 건수와 화면이 어긋난다.
	const toggleSelectAll = () => {
		setSelectedIds((current) => {
			const next = new Set(current);

			for (const item of visibleItems) {
				if (allChecked) {
					next.delete(item.id);
				} else {
					next.add(item.id);
				}
			}

			return next;
		});
	};

	const columns = getBannedWordColumns({
		allChecked,
		onRemove: (id) => removeMutation.mutate({ ids: [id] }),
		onToggleActive: (id, isActive) =>
			setActiveMutation.mutate({ id, isActive }),
		onToggleSelect: toggleSelect,
		onToggleSelectAll: toggleSelectAll,
		selectedIds,
		someChecked: selectedIds.size > 0,
	});

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

			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="max-w-80"
					onChange={(event) => setKeyword(event.target.value)}
					placeholder="금칙어·정규화형 검색"
					value={keyword}
				/>
				<Button
					disabled={selectedIds.size === 0 || removeMutation.isPending}
					onClick={() => removeMutation.mutate({ ids: [...selectedIds] })}
					variant="destructive"
				>
					<Trash2Icon data-icon="inline-start" />
					선택 {selectedIds.size}건 삭제
				</Button>
				<Button
					className="ml-auto"
					disabled={items.length === 0 || removeAllMutation.isPending}
					onClick={() => setIsClearAllOpen(true)}
					variant="outline"
				>
					전체 삭제
				</Button>
			</div>

			<AlertDialog onOpenChange={setIsClearAllOpen} open={isClearAllOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>금칙어를 전부 삭제할까요?</AlertDialogTitle>
						<AlertDialogDescription>
							등록된 {items.length}건이 모두 사라집니다. 되돌릴 수 없고,
							삭제하면 커뮤니티·고객센터 글에서 금칙어 검사가 사실상 꺼집니다.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							disabled={removeAllMutation.isPending}
							onClick={() => removeAllMutation.mutate({})}
							variant="destructive"
						>
							전부 삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
