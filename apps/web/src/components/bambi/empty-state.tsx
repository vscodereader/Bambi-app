import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@bambi-app/ui/components/empty";

interface EmptyStateProps {
	action?: React.ReactNode;
	description: string;
	title: string;
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
	return (
		<Empty className="min-h-48">
			<EmptyHeader>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	);
}
