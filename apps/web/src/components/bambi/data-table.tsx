"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@bambi-app/ui/components/table";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import { useState } from "react";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	emptyMessage?: string;
}

function SortIndicator({ direction }: { direction: false | "asc" | "desc" }) {
	if (direction === "asc") {
		return <ArrowUpIcon className="size-3.5 text-muted-foreground" />;
	}
	if (direction === "desc") {
		return <ArrowDownIcon className="size-3.5 text-muted-foreground" />;
	}
	return <ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	emptyMessage = "결과 없음",
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);

	const table = useReactTable({
		columns,
		data,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onSortingChange: setSorting,
		state: { sorting },
	});

	return (
		<Table>
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow key={headerGroup.id}>
						{headerGroup.headers.map((header) => {
							if (header.isPlaceholder) {
								return <TableHead key={header.id} />;
							}
							const content = flexRender(
								header.column.columnDef.header,
								header.getContext()
							);
							if (!header.column.getCanSort()) {
								return <TableHead key={header.id}>{content}</TableHead>;
							}
							return (
								<TableHead key={header.id}>
									<button
										className="-mx-2 flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-muted/50"
										onClick={header.column.getToggleSortingHandler()}
										type="button"
									>
										{content}
										<SortIndicator direction={header.column.getIsSorted()} />
									</button>
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
			<TableBody>
				{table.getRowModel().rows.length ? (
					table.getRowModel().rows.map((row) => (
						<TableRow
							data-state={row.getIsSelected() && "selected"}
							key={row.id}
						>
							{row.getVisibleCells().map((cell) => (
								<TableCell key={cell.id}>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
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
	);
}
