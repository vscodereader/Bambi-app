interface EmptyStateProps {
	action?: React.ReactNode;
	description: string;
	title: string;
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
	return (
		<div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center">
			<div>
				<h2 className="font-semibold text-base">{title}</h2>
				<p className="mt-1 text-muted-foreground text-sm">{description}</p>
			</div>
			{action}
		</div>
	);
}
