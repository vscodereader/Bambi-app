import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";
import { cn } from "@bambi-app/ui/lib/utils";

interface EmptyStateProps {
	action?: React.ReactNode;
	className?: string;
	description: string;
	title: string;
}

export function EmptyState({
	action,
	className,
	description,
	title,
}: EmptyStateProps) {
	return (
		<Empty className={cn("min-h-48", className)}>
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
