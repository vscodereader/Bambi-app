import { cn } from "@bambi-app/ui/lib/utils";
import type { ManualHeading } from "@/lib/bambi/manual-parse";

// 파싱된 h2/h3 목록을 앵커 링크로 렌더한다. 배치(사이드바/접이식)는 부모가 결정.
// key는 slug 하나면 충분하다 — 매뉴얼 3종 모두 파일 내 h2/h3 제목이 유일함을 확인했다.
export function ManualToc({ headings }: { headings: ManualHeading[] }) {
	return (
		<nav aria-label="목차" className="flex flex-col gap-1 text-sm">
			{headings.map((heading) => (
				<a
					className={cn(
						"text-muted-foreground no-underline transition-colors hover:text-foreground",
						heading.depth === 3 && "pl-4"
					)}
					href={`#${heading.slug}`}
					key={heading.slug}
				>
					{heading.text}
				</a>
			))}
		</nav>
	);
}
