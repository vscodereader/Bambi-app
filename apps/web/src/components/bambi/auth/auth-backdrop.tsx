// 비로그인 화면 뒤의 장식용 배경. 데이터는 서버에서 이미 마스킹돼 실제 문자열이
// 없다(lib/bambi/auth-backdrop.ts). 블러는 연출일 뿐 가드가 아니다.
// aria-hidden + 네이티브 inert로 클릭·탭 이동·스크린리더 접근을 한 번에 막는다.

// biome-ignore-all lint/suspicious/noArrayIndexKey: 재정렬되지 않는 장식용 정적 목록이고, 마스킹된 값은 서로 같을 수 있어 인덱스 외에 안정적인 키가 없다

import { cn } from "@bambi-app/ui/lib/utils";
import type { BackdropJob } from "@/lib/bambi/auth-backdrop";
import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";

function BackdropCard({ job }: { job: BackdropJob }) {
	return (
		<article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
			<div className="h-32 w-full rounded-md bg-gradient-to-br from-secondary to-muted" />
			<p className="m-0 truncate font-bold text-sm">{job.title}</p>
			<p className="m-0 truncate text-muted-foreground text-xs">
				{job.company} · {job.location}
			</p>
			<p className="m-0 truncate font-semibold text-sm">{job.pay}</p>
			<div className="flex flex-wrap gap-1">
				{job.tags.map((tag, index) => (
					<span
						className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground text-xs"
						key={index}
					>
						{tag}
					</span>
				))}
			</div>
		</article>
	);
}

export function AuthBackdrop({ jobs }: { jobs: BackdropJob[] }) {
	return (
		// 모바일에서는 배경을 아예 감춘다 — 좁은 화면에서 카드 뒤에 깔아 봐야 보이지
		// 않고, 인증 카드가 문서 흐름에 남아 정상적으로 스크롤되게 하는 편이 낫다.
		<div aria-hidden className="hidden select-none blur-sm md:block" inert>
			{/* 헤더 목업 — 실제 셸을 쓰지 않고 형태만 흉내낸다. */}
			<div className="border-border border-b bg-background">
				<div
					className={cn(
						"mx-auto flex h-16 w-full items-center gap-4 px-6",
						SEEKER_CONTENT_MAX_W
					)}
				>
					<div className="h-8 w-24 rounded-md bg-secondary" />
					<div className="h-10 w-48 rounded-lg bg-secondary" />
					<div className="ml-auto h-10 w-28 rounded-lg bg-secondary" />
				</div>
			</div>
			<div
				className={cn(
					"mx-auto grid w-full grid-cols-3 gap-4 px-6 py-10 xl:grid-cols-4",
					SEEKER_CONTENT_MAX_W
				)}
			>
				{jobs.map((job, index) => (
					<BackdropCard job={job} key={index} />
				))}
			</div>
		</div>
	);
}
