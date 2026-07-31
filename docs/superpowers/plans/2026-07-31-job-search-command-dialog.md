# 공고 검색 CommandDialog 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 헤더·본문 검색창을 shadcn CommandDialog 모달로 전환하고, 모달 안에서 서버 전체 공고(자체+수집)를 검색해 보여준다.

**Architecture:** 신규 `bambi.jobs.search` publicProcedure(자체 job_post + 수집 crawled_job_post 각각 ilike 검색 후 자체→수집 순 결합, 기존 `JobFeedRow` 모양 재사용) + packages/ui `command.tsx`에 `CommandInput`·`CommandDialog` 추가(base-ui Dialog 조합) + apps/web `JobSearchCommand` 컴포넌트(디바운스 → react-query → 결과 행)로 트리거 3곳 교체, 로컬 `query` 필터 제거.

**Tech Stack:** oRPC(publicProcedure)·drizzle(ilike)·cmdk·base-ui Dialog·react-query(useQuery)·Tailwind v4

**스펙:** `docs/superpowers/specs/2026-07-31-job-search-command-dialog-design.md`

## Global Constraints

- 인라인 `style` 금지, Tailwind 클래스만. 임의 px(`px-[18px]` 류) 금지 — 스케일 토큰 사용
- `rounded-none` 금지, 반경 토큰(`rounded-md`/`lg`/`xl`) 사용. 오버레이 수동 z-index 금지
- base-ui: 커스텀 트리거는 `asChild`가 아니라 `render` prop. render가 `<Button>`이면 `nativeButton` 생략
- enum 원값 화면 노출 금지(단, `job.type`은 기존 카드들이 그대로 렌더하는 표시 안전 값)
- 새 npm 의존성 추가 금지. DB 마이그레이션 없음. 빌드/실행 금지(HMR·시각 확인은 사용자)
- native 무영향이어야 함: 기존 `list` 프로시저·응답 불변, `search`는 신규 추가만
- 커밋은 컨트롤러(메인 세션)가 순차 수행 — 서브에이전트는 git 명령 금지

---

### Task 1: 서버 — `searchJobFeed` 서비스 + `bambi.jobs.search` 프로시저

**Files:**
- Modify: `packages/api/src/services/bambi-job-feed.ts` (검색 함수 추가)
- Modify: `packages/api/src/routers/bambi/jobs.ts` (`search` 프로시저 — `list:` 핸들러 뒤, `legacyList` 앞에 추가)

**Interfaces:**
- Consumes: 기존 `jobPostFeedSelection`·`crawledJobFeedSelection`·`jobPostFeedConditions`·`crawledJobFeedConditions`·`isCrawledJobFeedEnabled`·`JobFeedRow` (모두 bambi-job-feed.ts에 이미 존재)
- Produces: `searchJobFeed(input: { limit: number; query: string }): Promise<JobFeedRow[]>`, 라우터 응답 `{ items: Array<JobFeedRow & { isPromoted: false; promotionLabel: null; performance: { detailViews: 0; impressions: 0 } }> }` — Task 3의 웹 훅이 `orpc.bambi.jobs.search`로 이 모양을 소비

- [ ] **Step 1: bambi-job-feed.ts에 검색 함수 추가** (파일 끝에)

```ts
// 사용자가 친 검색어가 LIKE 와일드카드로 동작하지 않게 이스케이프한다("%"·"_"·"\").
const LIKE_SPECIALS_RE = /[%_\\]/g;

export const escapeLikePattern = (value: string): string =>
	value.replace(LIKE_SPECIALS_RE, "\\$&");

export interface JobSearchInput {
	limit: number;
	query: string;
}

// 검색 모달용 전체 코퍼스 검색. 목록과 같은 자격 조건(빌더 재사용) 위에 ilike만 얹는다 —
// 목록에 없는 공고가 검색에만 뜨거나 그 반대가 되지 않는다. 우선순위 규칙(자체 → 수집)도
// 목록과 동일하게 이어붙이고 블록 안은 최신순이다.
export const searchJobFeed = async (
	input: JobSearchInput
): Promise<JobFeedRow[]> => {
	const includeCrawled = await isCrawledJobFeedEnabled();
	const pattern = `%${escapeLikePattern(input.query)}%`;
	const [own, crawled] = await Promise.all([
		db
			.select(jobPostFeedSelection)
			.from(jobPost)
			.innerJoin(
				employerOrganizationProfile,
				eq(jobPost.organizationId, employerOrganizationProfile.organizationId)
			)
			.leftJoin(
				employerTeamProfile,
				eq(jobPost.teamId, employerTeamProfile.teamId)
			)
			.where(
				and(
					...jobPostFeedConditions({ limit: input.limit }),
					or(
						ilike(jobPost.title, pattern),
						ilike(employerOrganizationProfile.displayName, pattern),
						ilike(jobPost.region, pattern),
						ilike(jobPost.district, pattern)
					)
				)
			)
			.orderBy(desc(jobPost.publishedAt), desc(jobPost.id))
			.limit(input.limit),
		db
			.select(crawledJobFeedSelection)
			.from(crawledJobPost)
			.where(
				and(
					...crawledJobFeedConditions({ limit: input.limit }, includeCrawled),
					or(
						ilike(crawledJobPost.title, pattern),
						ilike(crawledJobPost.shopName, pattern),
						ilike(crawledJobPost.region, pattern),
						ilike(crawledJobPost.district, pattern),
						ilike(crawledJobPost.industryRaw, pattern)
					)
				)
			)
			.orderBy(
				desc(
					sql`coalesce(${crawledJobPost.sourcePostedAt}, ${crawledJobPost.firstSeenAt})`
				),
				desc(crawledJobPost.id)
			)
			.limit(input.limit),
	]);

	return [...own, ...crawled].slice(0, input.limit);
};
```

주의: `ilike`·`or`가 아직 import에 없으면 기존 drizzle-orm import 줄에 추가. `crawledJobFeedConditions`는 `includeCrawled=false`일 때 `[sql\`false\`]`를 돌려주므로 별도 분기 불필요.

- [ ] **Step 2: jobs.ts에 search 프로시저 추가** (`list:` 핸들러 종료 `}),` 바로 뒤)

```ts
	search: publicProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(20).default(20),
				query: z.string().trim().min(1).max(100),
			})
		)
		.handler(async ({ input }) => {
			const rows = await searchJobFeed(input);

			return {
				// list 항목과 같은 모양으로 내려 클라이언트 매퍼(toMarketplaceJob)를 재사용한다.
				// 검색 결과 노출은 유료 자리도 성과 집계 대상도 아니다 — impression을 기록하지
				// 않고 성과 칸은 0으로 채운다(수집 행이 목록에서 받는 값과 같다).
				items: rows.map((row) => ({
					...row,
					isPromoted: false,
					performance: { detailViews: 0, impressions: 0 },
					promotionLabel: null,
				})),
			};
		}),
```

`searchJobFeed`를 기존 `../../services/bambi-job-feed` import 줄에 추가.

- [ ] **Step 3: 타입체크로 검증**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS (기존 오류 없던 상태 유지)

- [ ] **Step 4: 컨트롤러 커밋** (컨트롤러가 수행)

---

### Task 2: packages/ui — `CommandInput`·`CommandDialog` 추가

**Files:**
- Modify: `packages/ui/src/components/command.tsx`

**Interfaces:**
- Consumes: 같은 패키지 `dialog.tsx`의 `Dialog`·`DialogContent`·`DialogDescription`·`DialogTitle` (intra-package import 경로는 기존 컴포넌트 간 import 패턴 확인 — 없으면 상대경로 `./dialog`)
- Produces: `CommandInput` (cmdk Input + 검색 아이콘 래퍼), `CommandDialog({ children, className, description?, title?, ...DialogRootProps })` — Task 3이 `@bambi-app/ui/components/command`에서 소비

- [ ] **Step 1: CommandInput 추가** (shadcn 원본 포팅, 밤비 밀도·토큰)

```tsx
function CommandInput({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div
			className="flex items-center gap-2 border-border border-b px-4"
			data-slot="command-input-wrapper"
		>
			<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
			<CommandPrimitive.Input
				className={cn(
					"flex h-12 w-full bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
					className
				)}
				data-slot="command-input"
				{...props}
			/>
		</div>
	);
}
```

`SearchIcon`은 lucide-react에서 import(파일에 이미 `CheckIcon` import 있음 — 같은 줄에 추가).

- [ ] **Step 2: CommandDialog 추가** (base-ui Dialog 조합, a11y 제목·설명은 sr-only)

```tsx
function CommandDialog({
	children,
	className,
	description = "검색어를 입력하세요.",
	title = "검색",
	...props
}: React.ComponentProps<typeof Dialog> & {
	className?: string;
	description?: string;
	title?: string;
}) {
	return (
		<Dialog {...props}>
			<DialogContent className={cn("gap-0 overflow-hidden p-0", className)}>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">{description}</DialogDescription>
				<Command className="**:data-[slot=command-input-wrapper]:h-12">
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 3: export 목록에 CommandDialog·CommandInput 추가** (알파벳 순 유지)

- [ ] **Step 4: 타입체크로 검증**

Run: `pnpm --filter @bambi-app/ui check-types` (스크립트 없으면 web 타입체크가 대신 잡는다 — Task 5에서 확인)
Expected: PASS

- [ ] **Step 5: 컨트롤러 커밋** (컨트롤러가 수행)

---

### Task 3: 웹 — `useJobSearch` 훅 + `JobSearchCommand` 컴포넌트

**Files:**
- Modify: `apps/web/src/lib/bambi/api-jobs.ts` (훅 추가)
- Create: `apps/web/src/components/bambi/job-search-command.tsx`

**Interfaces:**
- Consumes: Task 1의 `orpc.bambi.jobs.search`(입력 `{ query }`, 응답 `{ items }`), Task 2의 `CommandDialog`·`CommandInput` 외 command 컴포넌트들, 기존 `toMarketplaceJob`·`JobCoverImage`(`visual-job-card.tsx`가 쓰는 것과 동일 컴포넌트 — 실제 export 위치 확인)·`Job` 타입·`Search2` 아이콘·`Button`
- Produces: `useJobSearch(query: string): { isError: boolean; isFetching: boolean; jobs: Job[]; refetch: () => void }`, `JobSearchCommand({ onSelectJob: (job: Job) => void; trigger: "field" | "header"; triggerClassName?: string; withHotkey?: boolean })` — Task 4의 트리거 3곳이 소비

- [ ] **Step 1: api-jobs.ts에 useJobSearch 추가**

```ts
// 검색 모달 전용. 빈 검색어는 조회하지 않고, 타이핑 사이 이전 결과를 유지해 깜빡임을 줄인다.
export function useJobSearch(query: string): {
	isError: boolean;
	isFetching: boolean;
	jobs: Job[];
	refetch: () => void;
} {
	const trimmed = query.trim();
	const searchQuery = useQuery({
		...orpc.bambi.jobs.search.queryOptions({ input: { query: trimmed } }),
		enabled: trimmed.length > 0,
		placeholderData: keepPreviousData,
	});

	return {
		isError: searchQuery.isError,
		isFetching: searchQuery.isFetching,
		jobs:
			trimmed.length > 0
				? (searchQuery.data?.items ?? []).map(toMarketplaceJob)
				: [],
		refetch: () => {
			searchQuery.refetch().catch(() => undefined);
		},
	};
}
```

`keepPreviousData`를 `@tanstack/react-query` import에 추가.

- [ ] **Step 2: job-search-command.tsx 작성**

구성(모두 이 파일 안, `"use client"`):
- `useDebouncedValue(value: string, delayMs = 250)` — `useState`+`useEffect` 타이머 4줄짜리 로컬 훅
- `JobSearchCommand` — `open`·`query` state, `useJobSearch(open ? debounced : "")`, `withHotkey`면 Ctrl/Cmd+K로 토글하는 keydown 리스너 1개
- 트리거 버튼 2종(같은 컴포넌트 안 조건 렌더):
  - `trigger="header"`: 현재 헤더 검색창과 같은 룩 — `w-48`·`h-10`·`rounded-lg`·`bg-secondary`, `Search2` 아이콘 + "검색" `text-muted-foreground`. `aria-label="업종, 지역, 공고 제목 검색"` `type="button"`
  - `trigger="field"`: 현재 본문 검색 필드와 같은 룩 — `h-14 w-full rounded-lg bg-secondary px-4`, 아이콘 + "업종, 지역, 공고 제목 검색"
- 다이얼로그:

```tsx
<CommandDialog
	className="w-[560px]"
	description="업종, 지역, 공고 제목으로 검색하세요."
	onOpenChange={setOpen}
	open={open}
	title="공고 검색"
>
	<div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4">
		<div className="flex flex-col gap-1">
			<span className="font-extrabold text-lg">공고 검색</span>
			<span className="text-muted-foreground text-sm">
				업종, 지역, 공고 제목으로 검색하세요.
			</span>
		</div>
		<DialogClose
			render={
				<Button aria-label="닫기" size="icon" variant="ghost">
					<XIcon />
				</Button>
			}
		/>
	</div>
	<CommandInput
		onValueChange={setQuery}
		placeholder="업종, 지역, 공고 제목 검색"
		value={query}
	/>
	<CommandList className="max-h-96">{/* 상태별 본문 */}</CommandList>
</CommandDialog>
```

- `CommandList` 본문 상태 분기(모두 조건 렌더 — `shouldFilter` 기본 cmdk 필터에 걸리지 않게 `Command`는 ui의 `CommandDialog`가 감싸므로, 이 파일의 `CommandDialog` 사용부에서 결과를 직접 조건 렌더한다. cmdk 자동 필터가 서버 결과를 다시 거르는 문제가 보이면 ui `CommandDialog`의 `Command`에 `shouldFilter={false}`를 prop으로 열어 전달):
  - 검색어 비어 있음 → `py-6 text-center text-muted-foreground text-sm` 안내 "검색어를 입력해 주세요"
  - `isError` → 같은 스타일 안내 "검색에 실패했어요" + `Button variant="link"` 재시도(`refetch`)
  - `isFetching && jobs.length === 0` → `Skeleton` 행 3개(`h-12`)
  - 결과 없음 → "검색 결과가 없어요"
  - 결과 있음 → `CommandGroup heading="검색 결과"` 안에 행:

```tsx
<CommandItem
	className="gap-3 px-4 py-3"
	key={job.id}
	onSelect={() => {
		setOpen(false);
		onSelectJob(job);
	}}
	value={job.id}
>
	{job.coverImage ? (
		<JobCoverImage
			className="h-12 w-16 shrink-0 rounded-md object-cover"
			height={48}
			media={job.coverImage}
			width={64}
		/>
	) : (
		<div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
			<span className="inline-flex size-4">
				<Search2 />
			</span>
		</div>
	)}
	<div className="flex min-w-0 flex-1 flex-col">
		<span className="truncate font-bold text-sm">{job.title}</span>
		<span className="truncate text-muted-foreground text-xs">
			{job.type} · {job.location}
		</span>
	</div>
	<span className="shrink-0 font-extrabold text-sm">{job.pay}</span>
</CommandItem>
```

주의: `JobCoverImage`의 실제 props·export 위치는 `visual-job-card.tsx`에서 확인해 동일하게 사용. 수집 공고 썸네일은 `coverImageUrl`(thumbnailUrl)이 매퍼에서 `coverImage`로 접혀 들어오므로 별도 분기 불필요. `DialogClose`는 `@bambi-app/ui/components/dialog`에서 import(render가 `<Button>`이라 `nativeButton` 생략 — base-ui 규칙).

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter web check-types`
Expected: PASS

- [ ] **Step 4: 컨트롤러 커밋** (컨트롤러가 수행)

---

### Task 4: 웹 — 트리거 3곳 교체 + 로컬 query 필터 제거

**Files:**
- Modify: `apps/web/src/components/bambi/seeker-app-shell.tsx` (SeekerHeaderSearch 교체)
- Modify: `apps/web/src/components/bambi/screens/public-marketplace.tsx` (headerSearch 교체)
- Modify: `apps/web/src/components/bambi/marketplace.tsx` (MarketplaceSearch 검색 필드 교체, `onSelectJob` prop 추가)
- Modify: `apps/web/src/components/bambi/screens/seeker-marketplace.tsx` (MarketplaceSearch에 `onSelectJob={openJob}` 전달)
- Modify: `apps/web/src/lib/bambi/marketplace.ts` (query 제거)
- Modify: `apps/web/src/lib/bambi/api-jobs.ts` (hasLocalOnlyFilters에서 query 제거)
- Test: `apps/web/src/lib/bambi/marketplace.test.ts` (query 픽스처·테스트 정리)

**Interfaces:**
- Consumes: Task 3의 `JobSearchCommand`
- Produces: 없음(말단 배선)

- [ ] **Step 1: seeker-app-shell.tsx** — `SeekerHeaderSearch` 본문을 `JobSearchCommand`로 교체

```tsx
function SeekerHeaderSearch() {
	const router = useRouter();
	const { isGuest } = useBambiAuth();

	return (
		<JobSearchCommand
			onSelectJob={(job) => {
				// 마켓플레이스 카드 클릭과 같은 규칙: 게스트는 가입 유도, 수집 공고는 수집 상세로.
				if (isGuest) {
					router.push("/seeker?auth=signup");
					return;
				}
				if (job.crawled) {
					router.push(`/seeker/jobs/crawled/${job.id}` as Route);
					return;
				}
				router.push(`/seeker/jobs/${job.id}` as Route);
			}}
			trigger="header"
			withHotkey
		/>
	);
}
```

`useSeekerFilters`의 filters/setFilters는 이제 헤더에서 안 쓰므로 이 함수에서 제거(컨텍스트 자체는 빠른 탐색·필터 시트가 계속 쓴다 — 유지). `Input`·`Search2` import가 다른 데서 안 쓰이면 정리. `useBambiAuth`는 `./auth-client-provider`, `useRouter`는 `next/navigation`, `Route`는 `next`.

- [ ] **Step 2: public-marketplace.tsx** — `headerSearch` 상수를 교체

```tsx
const headerSearch = (
	<JobSearchCommand onSelectJob={openJob} trigger="header" withHotkey />
);
```

`openJob` 선언을 `headerSearch`보다 위로 이동(이미 위에 있음 — 확인만). 안 쓰게 된 `Input`·`Search` import 정리.

- [ ] **Step 3: marketplace.tsx** — `MarketplaceSearch`의 `<label>` 검색 필드를 교체

`MarketplaceSearchProps`에 `onSelectJob: (job: Job) => void;` 추가. `<label className="flex h-14 ...">...</label>` 블록을 다음으로 교체(옆의 "필터" 버튼과 quick filter Tag 줄은 유지):

```tsx
<JobSearchCommand
	onSelectJob={onSelectJob}
	trigger="field"
	triggerClassName="flex-1"
/>
```

- [ ] **Step 4: 두 마켓플레이스 화면에서 prop 전달**

`seeker-marketplace.tsx`·`public-marketplace.tsx`의 `<MarketplaceSearch ...>`에 `onSelectJob={openJob}` 추가.

- [ ] **Step 5: 로컬 query 필터 제거**

- `marketplace.ts`: `MarketplaceFilters.query`·`DEFAULT_MARKETPLACE_FILTERS.query`·`jobMatchesQuery`(+ 이제 안 쓰이면 `normalizeSearchValue`)·`filterMarketplaceJobs`의 query 분기 제거
- `api-jobs.ts`: `hasLocalOnlyFilters`에서 `filters.query.trim() !== "" ||` 줄 제거(주석의 query 언급도 정리)
- `marketplace.test.ts`: 픽스처의 `query: ""`(217행)·검색어 테스트(278행 근방 `query: "청담"`) 제거 — 검색어 매칭 동작 자체가 사라졌으므로 해당 it 블록 삭제

- [ ] **Step 6: 테스트·타입체크**

Run: `pnpm --filter web exec vitest run src/lib/bambi/marketplace.test.ts` + `pnpm --filter web check-types`
Expected: 둘 다 PASS

- [ ] **Step 7: 컨트롤러 커밋** (컨트롤러가 수행)

---

### Task 5: 검증·매뉴얼 동기화 (컨트롤러 주도)

**Files:**
- Modify: `docs/manual/seeker-manual.md` (검색 설명 갱신)

- [ ] **Step 1: 매뉴얼** — 검색 관련 항목을 "검색창(헤더·목록 위)을 클릭하면 공고 검색 창이 열리고, 전체 공고에서 업종·지역·공고 제목으로 검색됩니다(Ctrl+K / ⌘K). 결과를 클릭하면 해당 공고 상세로 이동합니다."로 갱신
- [ ] **Step 2: 린트** — `pnpm dlx ultracite fix <변경 파일들>` (경로 인자 필수)
- [ ] **Step 3: 전체 확인** — `pnpm --filter @bambi-app/api check-types`, `pnpm --filter web check-types`, `pnpm --filter web exec vitest run src/lib/bambi` (기저 실패 `bambi-job-blocks.test.ts` 1건은 무시), `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-ad-exposure.test.ts`
- [ ] **Step 4: 컨트롤러 커밋 → no-ff 병합** (`merge:` 제목, 사용자 확인 없이 로컬 병합까지 — push 금지)
