import { cn } from "@bambi-app/ui/lib/utils";
import { APP_CONTENT_WIDTH } from "@/lib/bambi/layout";

interface PageShellProps {
	actions?: React.ReactNode;
	children: React.ReactNode;
	description?: string;
	title: string;
}

// 구인자 전용 페이지 shell. employer/* 라우트 공통 헤더·폭을 규격화한다.
export function PageShell({
	actions,
	children,
	description,
	title,
}: PageShellProps) {
	return (
		<main
			className={cn(
				// 구인자 본문 폭을 채용(/seeker) 헤더와 동일한 고정폭으로 맞춘다.
				"mx-auto flex w-full max-w-full flex-col gap-6 px-5 py-6 md:px-6",
				APP_CONTENT_WIDTH
			)}
		>
			<header className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="font-semibold text-2xl tracking-normal">{title}</h1>
					{description ? (
						<p className="text-muted-foreground text-sm">{description}</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex flex-wrap items-center gap-2">{actions}</div>
				) : null}
			</header>
			{children}
		</main>
	);
}
