"use client";

import { Button } from "@bambi-app/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useEffect, useState } from "react";

export function PageNumberInput({
	disabled = false,
	onPageChange,
	page,
	pageCount,
}: {
	disabled?: boolean;
	onPageChange: (page: number) => void;
	page: number;
	pageCount: number;
}): React.JSX.Element {
	const safePage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
	const [pageInput, setPageInput] = useState(String(safePage));

	useEffect(() => {
		setPageInput(String(safePage));
	}, [safePage]);

	const submit = () => {
		if (!pageInput) {
			setPageInput(String(safePage));
			return;
		}

		const nextPage = Math.min(
			Math.max(Number.parseInt(pageInput, 10), 1),
			Math.max(pageCount, 1)
		);
		setPageInput(String(nextPage));
		onPageChange(nextPage);
	};

	return (
		<input
			aria-label="이동할 페이지"
			className="h-8 w-12 rounded-md border border-input bg-background px-1 text-center text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
			disabled={disabled}
			inputMode="numeric"
			onBlur={submit}
			onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.currentTarget.blur();
				}
			}}
			pattern="[0-9]*"
			value={pageInput}
		/>
	);
}

export function PageControls({
	disabled = false,
	onPageChange,
	page,
	pageCount,
	showPageInput = true,
}: {
	disabled?: boolean;
	onPageChange: (page: number) => void;
	page: number;
	pageCount: number;
	showPageInput?: boolean;
}): React.JSX.Element {
	const safePage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
	const safePageCount = Math.max(pageCount, 1);

	return (
		<div className="flex items-center gap-1">
			<Button
				aria-label="이전 페이지"
				disabled={disabled || safePage <= 1}
				onClick={() => onPageChange(safePage - 1)}
				size="icon-sm"
				type="button"
				variant="outline"
			>
				<ChevronLeftIcon />
			</Button>
			{showPageInput ? (
				<>
					<PageNumberInput
						disabled={disabled}
						onPageChange={onPageChange}
						page={safePage}
						pageCount={safePageCount}
					/>
					<span className="whitespace-nowrap text-muted-foreground text-sm">
						/ {safePageCount}
						<span className="sr-only">페이지</span>
					</span>
				</>
			) : null}
			<Button
				aria-label="다음 페이지"
				disabled={disabled || safePage >= safePageCount}
				onClick={() => onPageChange(safePage + 1)}
				size="icon-sm"
				type="button"
				variant="outline"
			>
				<ChevronRightIcon />
			</Button>
		</div>
	);
}
