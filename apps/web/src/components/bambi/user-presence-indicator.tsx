"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@bambi-app/ui/components/tooltip";

export function UserPresenceIndicator({
	isOnline,
	withLabel = false,
}: {
	isOnline: boolean;
	withLabel?: boolean;
}) {
	const label = isOnline ? "온라인" : "오프라인";
	let className = isOnline ? undefined : "text-muted-foreground";
	if (!withLabel) {
		className = `size-4 gap-0 p-0 [&>span]:size-4 [&>span]:rounded-full [&>span]:bg-current ${className ?? ""}`;
	}
	const indicator = (
		<Badge
			aria-label={label}
			className={className}
			variant={isOnline ? "success" : "secondary"}
		>
			<span
				aria-hidden="true"
				className={withLabel ? "size-1.5 rounded-full bg-current" : undefined}
			/>
			{withLabel ? label : null}
		</Badge>
	);

	if (withLabel) {
		return indicator;
	}

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger render={indicator} />
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
