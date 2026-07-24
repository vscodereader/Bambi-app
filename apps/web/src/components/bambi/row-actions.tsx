import { Button } from "@bambi-app/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@bambi-app/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export interface RowAction {
	disabled?: boolean;
	// href가 있으면 링크 이동, 없으면 onSelect 실행.
	href?: Route;
	// 각 항목의 안정 키.
	key: string;
	label: string;
	onSelect?: () => void;
	variant?: "default" | "destructive";
}

// 데이터 테이블 "관리" 컬럼용 공용 행 액션 드롭다운(kebab 트리거).
export function RowActions({
	actions,
	ariaLabel = "관리 메뉴",
}: {
	actions: RowAction[];
	ariaLabel?: string;
}) {
	if (actions.length === 0) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						aria-label={ariaLabel}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				{actions.map((action) =>
					action.href ? (
						<DropdownMenuItem
							disabled={action.disabled}
							key={action.key}
							render={<Link href={action.href} />}
							variant={action.variant}
						>
							{action.label}
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							disabled={action.disabled}
							key={action.key}
							onClick={action.onSelect}
							variant={action.variant}
						>
							{action.label}
						</DropdownMenuItem>
					)
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
