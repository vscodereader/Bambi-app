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
}: {
	columns: DataColumn<T>[];
	data: T[];
	getRowKey: (row: T) => string;
	emptyMessage?: string;
}): React.JSX.Element {
	const [sorting, setSorting] = useState<SortState>(null);

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

	const toggleSort = (id: string) => {
		setSorting((current) => {
			if (current?.id !== id) {
				return { id, dir: "asc" };
			}

			return { id, dir: current.dir === "asc" ? "desc" : "asc" };
		});
	};

	return (
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
					sortedData.map((row) => (
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
	);
}
