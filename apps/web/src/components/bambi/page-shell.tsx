interface PageShellProps {
	children: React.ReactNode;
	description?: string;
	title: string;
}

export function PageShell({ children, description, title }: PageShellProps) {
	return (
		<main className="mx-auto flex w-full max-w-[80%] flex-col gap-6 px-4 py-6 sm:px-6">
			<header className="flex flex-col gap-1">
				<h1 className="font-semibold text-2xl tracking-normal">{title}</h1>
				{description ? (
					<p className="text-muted-foreground text-sm">{description}</p>
				) : null}
			</header>
			{children}
		</main>
	);
}
