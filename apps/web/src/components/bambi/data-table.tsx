"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import {
	ArrowDownIcon,
	ArrowUpDownIcon,
	ArrowUpIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface DataColumn<T> {
	cell: (row: T) => React.ReactNode;
	cellClassName?: string;
	header: React.ReactNode;
	headerClassName?: string;
	id: string;
	sortValue?: (row: T) => number | string;
}

type SortState = { id: string; dir: "asc" | "desc" } | null;

function SortIndicator({ direction }: { direction: false | "asc" | "desc" }) {
	if (direction === "asc") {
		return <ArrowUpIcon className="size-3.5 text-muted-foreground" />;
	}
	if (direction === "desc") {
		return <ArrowDownIcon className="size-3.5 text-muted-foreground" />;
	}
	return <ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />;
}

function compareValues(a: number | string, b: number | string): number {
	if (typeof a === "number" && typeof b === "number") {
		return a - b;
	}

	return String(a).localeCompare(String(b));
}

export function DataTable<T>({
	columns,
	data,
	getRowKey,
	emptyMessage = "결과 없음",
	pageSize,
}: {
	columns: DataColumn<T>[];
	data: T[];
	getRowKey: (row: T) => string;
	emptyMessage?: string;
	// 지정하면 해당 행 수 단위로 페이징한다(미지정 시 전체 표시).
	pageSize?: number;
}): React.JSX.Element {
	const [sorting, setSorting] = useState<SortState>(null);
	const [page, setPage] = useState(0);

	const sortedData = useMemo(() => {
		if (!sorting) {
			return data;
		}

		const column = columns.find((candidate) => candidate.id === sorting.id);

		if (!column?.sortValue) {
			return data;
		}

		const { sortValue } = column;
		const factor = sorting.dir === "asc" ? 1 : -1;

		return [...data].sort(
			(a, b) => factor * compareValues(sortValue(a), sortValue(b))
		);
	}, [columns, data, sorting]);

	const effectivePageSize = pageSize && pageSize > 0 ? pageSize : 0;
	const paginationEnabled = effectivePageSize > 0;
	const pageCount = paginationEnabled
		? Math.max(1, Math.ceil(sortedData.length / effectivePageSize))
		: 1;
	// page 상태가 데이터 축소로 범위를 넘어도 안전하게 마지막 페이지로 보정한다.
	const safePage = Math.min(page, pageCount - 1);
	const pageRows = paginationEnabled
		? sortedData.slice(
				safePage * effectivePageSize,
				safePage * effectivePageSize + effectivePageSize
			)
		: sortedData;

	const toggleSort = (id: string) => {
		setPage(0);
		setSorting((current) => {
			if (current?.id !== id) {
				return { id, dir: "asc" };
			}

			return { id, dir: current.dir === "asc" ? "desc" : "asc" };
		});
	};

	return (
		<div className="flex flex-col gap-3">
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map((column) => {
							if (!column.sortValue) {
								return (
									<TableHead className={column.headerClassName} key={column.id}>
										{column.header}
									</TableHead>
								);
							}

							const direction =
								sorting?.id === column.id ? sorting.dir : (false as const);

							return (
								<TableHead className={column.headerClassName} key={column.id}>
									<button
										className="-mx-2 flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-muted/50"
										onClick={() => toggleSort(column.id)}
										type="button"
									>
										{column.header}
										<SortIndicator direction={direction} />
									</button>
								</TableHead>
							);
						})}
					</TableRow>
				</TableHeader>
				<TableBody>
					{sortedData.length ? (
						pageRows.map((row) => (
							<TableRow key={getRowKey(row)}>
								{columns.map((column) => (
									<TableCell className={column.cellClassName} key={column.id}>
										{column.cell(row)}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell
								className="h-24 text-center text-muted-foreground"
								colSpan={columns.length}
							>
								{emptyMessage}
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
			{paginationEnabled && sortedData.length > 0 ? (
				<div className="flex items-center justify-between gap-3 px-1">
					<span className="text-muted-foreground text-sm">
						전체 {sortedData.length}건 · {safePage + 1} / {pageCount} 페이지
					</span>
					<div className="flex items-center gap-1">
						<Button
							aria-label="이전 페이지"
							disabled={safePage <= 0}
							onClick={() => setPage(safePage - 1)}
							size="icon-sm"
							type="button"
							variant="outline"
						>
							<ChevronLeftIcon />
						</Button>
						<Button
							aria-label="다음 페이지"
							disabled={safePage >= pageCount - 1}
							onClick={() => setPage(safePage + 1)}
							size="icon-sm"
							type="button"
							variant="outline"
						>
							<ChevronRightIcon />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
