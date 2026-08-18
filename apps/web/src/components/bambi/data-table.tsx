"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { PageControls } from "@/components/bambi/page-controls";

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

// 행 클릭(상세 이동)으로 치지 않을 셀 내부 요소. base-ui Checkbox는 숨은 <input>을 루트의
// **형제**로 렌더하고 클릭을 그 input에 재발행하므로, 체크박스 쪽 stopPropagation만으로는
// 재발행된 클릭이 행까지 올라오는 걸 막지 못한다(신고 목록에서 체크만 하려다 상세로 이동).
const ROW_CLICK_IGNORE_SELECTOR = "a, button, input, label, [role='checkbox']";

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
	onRowClick,
	onPageChange,
	page: controlledPage,
	pageSize,
	reservePageRows = false,
	reservedPageRowHeight,
	rowClassName,
	showPageInput = false,
	tableClassName,
}: {
	columns: DataColumn<T>[];
	data: T[];
	getRowKey: (row: T) => string;
	emptyMessage?: string;
	// 지정하면 데이터 행 전체가 클릭 가능해진다. 키보드 경로는 행 안의 액션 버튼이 담당하므로
	// 행 자체에 role/tabIndex는 붙이지 않는다.
	onRowClick?: (row: T) => void;
	onPageChange?: (page: number) => void;
	page?: number;
	// 지정하면 해당 행 수 단위로 페이징한다(미지정 시 전체 표시).
	pageSize?: number;
	// 마지막 페이지도 pageSize만큼의 행 공간을 유지해 페이지네이션 위치를 고정한다.
	reservePageRows?: boolean;
	reservedPageRowHeight?: string;
	rowClassName?: string;
	showPageInput?: boolean;
	tableClassName?: string;
}): React.JSX.Element {
	const [sorting, setSorting] = useState<SortState>(null);
	const [internalPage, setInternalPage] = useState(0);
	const page = controlledPage ?? internalPage;
	const setPage = (nextPage: number) => {
		if (controlledPage === undefined) {
			setInternalPage(nextPage);
		}
		onPageChange?.(nextPage);
	};

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
	const reservedRowCount =
		reservePageRows && paginationEnabled
			? Math.max(0, effectivePageSize - pageRows.length)
			: 0;

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
			<div className={tableClassName}>
				<Table>
					<TableHeader>
						<TableRow>
							{columns.map((column) => {
								if (!column.sortValue) {
									return (
										<TableHead
											className={column.headerClassName}
											key={column.id}
										>
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
							<>
								{pageRows.map((row) => (
									<TableRow
										className={
											[rowClassName, onRowClick ? "cursor-pointer" : null]
												.filter(Boolean)
												.join(" ") || undefined
										}
										key={getRowKey(row)}
										onClick={
											onRowClick
												? (event) => {
														if (
															(event.target as HTMLElement).closest?.(
																ROW_CLICK_IGNORE_SELECTOR
															)
														) {
															return;
														}

														onRowClick(row);
													}
												: undefined
										}
									>
										{columns.map((column) => (
											<TableCell
												className={column.cellClassName}
												key={column.id}
											>
												{column.cell(row)}
											</TableCell>
										))}
									</TableRow>
								))}
								{reservedRowCount > 0 && reservedPageRowHeight ? (
									<TableRow
										aria-hidden="true"
										style={{
											height: `calc(${reservedRowCount} * ${reservedPageRowHeight})`,
										}}
									>
										<TableCell colSpan={columns.length} />
									</TableRow>
								) : null}
							</>
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
			</div>
			{paginationEnabled && sortedData.length > 0 ? (
				<div className="grid grid-cols-[auto_1fr] items-center gap-3 px-1 md:grid-cols-[1fr_auto_1fr]">
					<span className="text-muted-foreground text-sm">
						전체 {sortedData.length}건 · {safePage + 1} / {pageCount} 페이지
					</span>
					<PageControls
						onPageChange={(nextPage) => setPage(nextPage - 1)}
						page={safePage + 1}
						pageCount={pageCount}
						showPageInput={showPageInput}
					/>
				</div>
			) : null}
		</div>
	);
}
