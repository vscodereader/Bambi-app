# 회원 공고 조회 로그(job_view_log) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 회원이 공고 상세를 열 때마다 "사용자×공고" 1행에 누적 기록하고, 운영자 사용자 상세 화면에서 그 목록을 보여준다(업소 아웃바운드 근거 자료).

**Architecture:** 새 테이블 `job_view_log`(user_id+job_post_id 유니크, view_count·first/last_viewed_at, 공고 제목·업소명 스냅샷). 기록은 web·native가 공유하는 oRPC `bambi.jobs.getById` 핸들러 안 한 곳에서 upsert. 조회는 `contentHistory.listAdminMemberJobViews` adminProcedure, UI는 moderator `UserDetail`의 기존 `UserContentHistory` 아코디언 패턴 복제.

**Tech Stack:** drizzle-orm(pg), oRPC, zod, React Query, shadcn(Accordion), vitest(dev DB 의존 서비스 테스트).

**Spec:** 채팅에서 승인된 설계(A안). 이 문서가 정본.

## Global Constraints

- 작업 위치: `C:\Users\user\projects\bambi-app\.claude\worktrees\job-view-logs` (브랜치 `worktree-job-view-logs`). 다른 경로 편집 금지.
- 빌드·dev 서버 실행 금지. 검증은 타입체크·ultracite·지정 테스트 1파일만.
- `db:push` 절대 금지. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate`로 생성(0118 예상)하고 SQL 내용을 검토한다. 손으로 마이그레이션 SQL을 쓰지 않는다.
- 새 npm 의존성 추가 금지.
- 서브에이전트는 커밋·`git stash` 금지. 커밋은 컨트롤러가 Task 단위로 순차 수행.
- 스냅샷 컬럼(`job_title`, `organization_name`)은 조회 시점 값을 저장하고 재조회 시 갱신한다. 공고·업소 삭제 후에도 아웃바운드 근거로 남아야 하므로 `job_post_id`·`organization_id`에는 FK를 걸지 않는다(기존 `communityPostLikeHistory.postId` 패턴). `user_id`만 FK cascade(탈퇴 시 삭제).
- 비회원(세션 없음)은 기록하지 않는다.
- UI 문구는 한국어, DB enum 원값 노출 없음(이 기능엔 enum 없음). px 임의값 금지, 기존 shadcn 컴포넌트만 사용.
- 린트: `pnpm dlx ultracite fix <경로...>` (경로 인자 필수), 타입: `pnpm --filter @bambi-app/db check-types`, `pnpm --filter @bambi-app/api check-types`, `pnpm --filter web check-types`.
- 테스트: `packages/api`를 cwd로 `pnpm vitest run test/services/bambi-job-view-log.test.ts`. 다른 스위트(특히 `src/routers/bambi`)는 실행 금지(dev DB 삭제 위험).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/db/src/schema/bambi.ts` (수정, `jobPerformanceEvent` 뒤 1697행 부근) | `jobViewLog` 테이블 정의 |
| `packages/db/src/migrations/0118_*.sql` + `meta/` (생성) | drizzle-kit generate 산출물 |
| `packages/api/src/services/bambi-analytics.ts` (수정) | `recordJobView` upsert 서비스 |
| `packages/api/test/services/bambi-job-view-log.test.ts` (생성) | upsert 동작 테스트 |
| `packages/api/src/routers/bambi/jobs.ts` (수정, `getById` 2048행 부근) | 세션 있을 때 `recordJobView` 호출 |
| `packages/api/src/routers/bambi/content-history.ts` (수정) | `listAdminMemberJobViews` adminProcedure |
| `apps/web/src/components/bambi/screens/moderator.tsx` (수정) | `UserJobViewHistory` 컴포넌트 + `UserDetail`에 배치 |
| `docs/manual/moderator-manual.md` (수정, 354행 뒤) | 운영자 매뉴얼 한 줄 |

`packages/db/src/index.ts`의 `schema` 객체 등록은 하지 않는다(`communityPostLikeHistory`도 미등록이며 relational query를 쓰지 않는다).

---

### Task 1: DB 스키마 + 마이그레이션

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (`jobPerformanceEvent` 정의가 끝나는 `);` 직후, `export const chatRoom` 앞)
- Create (생성 명령으로): `packages/db/src/migrations/0118_*.sql`, `packages/db/src/migrations/meta/0118_snapshot.json`, `meta/_journal.json` 갱신

**Interfaces:**
- Produces: `export const jobViewLog` (drizzle pgTable). 컬럼: `id uuid pk`, `userId text`, `jobPostId uuid`, `organizationId text`, `jobTitle text`, `organizationName text`, `viewCount integer`, `firstViewedAt timestamp`, `lastViewedAt timestamp`.

- [ ] **Step 1: 테이블 정의 추가**

`packages/db/src/schema/bambi.ts`에서 `jobPerformanceEvent`의 닫는 `);` 바로 뒤에 추가(파일 상단 import에 `integer`, `uniqueIndex`, `index`, `text`, `timestamp`, `uuid`는 이미 있음):

```ts
// 회원이 공고 상세를 연 기록. 사용자×공고 1행에 누적(view_count)하며,
// 공고·업소가 삭제돼도 아웃바운드 근거로 남도록 제목·업소명을 스냅샷하고
// job_post/organization에는 FK를 걸지 않는다. 탈퇴 시(user cascade)만 지운다.
export const jobViewLog = pgTable(
	"job_view_log",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobPostId: uuid("job_post_id").notNull(),
		organizationId: text("organization_id").notNull(),
		jobTitle: text("job_title").notNull(),
		organizationName: text("organization_name").notNull(),
		viewCount: integer("view_count").default(1).notNull(),
		firstViewedAt: timestamp("first_viewed_at").defaultNow().notNull(),
		lastViewedAt: timestamp("last_viewed_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("job_view_log_user_job_uidx").on(
			table.userId,
			table.jobPostId
		),
		index("job_view_log_user_last_viewed_idx").on(
			table.userId,
			table.lastViewedAt
		),
		index("job_view_log_organization_id_idx").on(table.organizationId),
	]
);
```

- [ ] **Step 2: 마이그레이션 생성**

Run (리포 루트): `pnpm --filter @bambi-app/db db:generate`
Expected: `packages/db/src/migrations/0118_<이름>.sql` 1개 생성. `cat`으로 내용 확인 — `CREATE TABLE "job_view_log"` 1개, FK 1개(user), 인덱스 3개만 있어야 한다. 다른 테이블의 CREATE/ALTER가 섞여 있으면 스냅샷 체인 문제이므로 중단하고 보고.

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: 오류 없음.

- [ ] **Step 4: 커밋(컨트롤러)**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations
git commit -F <msgfile>   # "feat(db): 회원 공고 조회 로그 테이블 추가" + 블릿 본문
```

---

### Task 2: `recordJobView` 서비스 + 테스트

**Files:**
- Modify: `packages/api/src/services/bambi-analytics.ts`
- Create: `packages/api/test/services/bambi-job-view-log.test.ts`

**Interfaces:**
- Consumes: `jobViewLog` (Task 1).
- Produces:
```ts
export interface RecordJobViewInput {
	jobPostId: string;
	jobTitle: string;
	organizationId: string;
	organizationName: string;
	userId: string;
}
export const recordJobView: (input: RecordJobViewInput) => Promise<void>;
```

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/test/services/bambi-job-view-log.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, analytics] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("@/services/bambi-analytics"),
]);

const { user } = authSchema;
const { jobViewLog } = bambiSchema;
const { recordJobView } = analytics;

describe("recordJobView", () => {
	it("creates one row per user+job and increments view_count on repeat views", async () => {
		const userId = `user_test_${randomUUID()}`;
		const jobPostId = randomUUID();
		const organizationId = `org_test_${randomUUID()}`;

		await db.insert(user).values({
			email: `job-view-${randomUUID()}@bambi.test`,
			id: userId,
			name: "공고 조회 로그 테스트 유저",
		});

		try {
			await recordJobView({
				jobPostId,
				jobTitle: "첫 제목",
				organizationId,
				organizationName: "첫 업소명",
				userId,
			});
			await recordJobView({
				jobPostId,
				jobTitle: "바뀐 제목",
				organizationId,
				organizationName: "바뀐 업소명",
				userId,
			});

			const rows = await db
				.select()
				.from(jobViewLog)
				.where(eq(jobViewLog.userId, userId));

			expect(rows).toHaveLength(1);
			expect(rows[0]?.viewCount).toBe(2);
			expect(rows[0]?.jobTitle).toBe("바뀐 제목");
			expect(rows[0]?.organizationName).toBe("바뀐 업소명");
			expect(rows[0]?.lastViewedAt.getTime()).toBeGreaterThanOrEqual(
				rows[0]?.firstViewedAt.getTime() ?? 0
			);
		} finally {
			// user cascade가 job_view_log를 지운다.
			await db.delete(user).where(inArray(user.id, [userId]));
		}
	});
});
```

- [ ] **Step 2: 실패 확인**

Run (cwd `packages/api`): `pnpm vitest run test/services/bambi-job-view-log.test.ts`
Expected: FAIL — `recordJobView is not a function` 또는 undefined.

- [ ] **Step 3: 서비스 구현**

`packages/api/src/services/bambi-analytics.ts`:
- import 블록의 `@bambi-app/db/schema/bambi` 항목에 `jobViewLog` 추가.
- 파일 끝에 추가:

```ts
export interface RecordJobViewInput {
	jobPostId: string;
	jobTitle: string;
	organizationId: string;
	organizationName: string;
	userId: string;
}

// 회원의 공고 상세 조회를 사용자×공고 1행에 누적한다. 제목·업소명은 최신값으로
// 덮어써 운영자 화면이 현재 이름을 보이게 한다. FK는 user뿐이라 삼킬 오류가 없다.
export const recordJobView = async ({
	jobPostId,
	jobTitle,
	organizationId,
	organizationName,
	userId,
}: RecordJobViewInput): Promise<void> => {
	await db
		.insert(jobViewLog)
		.values({ jobPostId, jobTitle, organizationId, organizationName, userId })
		.onConflictDoUpdate({
			set: {
				jobTitle,
				lastViewedAt: sql`now()`,
				organizationName,
				viewCount: sql`${jobViewLog.viewCount} + 1`,
			},
			target: [jobViewLog.userId, jobViewLog.jobPostId],
		});
};
```

- [ ] **Step 4: 통과 확인**

Run (cwd `packages/api`): `pnpm vitest run test/services/bambi-job-view-log.test.ts`
Expected: PASS 1.

- [ ] **Step 5: 린트·타입**

Run: `pnpm dlx ultracite fix packages/api/src/services/bambi-analytics.ts packages/api/test/services/bambi-job-view-log.test.ts` 그리고 `pnpm --filter @bambi-app/api check-types`
Expected: 오류 없음.

- [ ] **Step 6: 커밋(컨트롤러)** — "feat(api): 공고 조회 로그 upsert 서비스 추가"

---

### Task 3: `getById`에서 기록 + 운영자 조회 프로시저

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (`getById` 핸들러, `recordJobPerformanceEvent` 호출 직후 ≈2053행)
- Modify: `packages/api/src/routers/bambi/content-history.ts`

**Interfaces:**
- Consumes: `recordJobView` (Task 2), `jobViewLog` (Task 1).
- Produces: `contentHistoryRouter.listAdminMemberJobViews` — input `{ userId: string; page?: number; pageSize?: number }`, output `{ items: { id, jobPostId, jobTitle, organizationId, organizationName, viewCount, firstViewedAt, lastViewedAt }[]; page; pageSize; totalCount }`, `lastViewedAt` 내림차순.

- [ ] **Step 1: `getById`에 기록 호출 추가**

`jobs.ts` import: `../../services/bambi-analytics` 블록에 `recordJobView` 추가. `recordJobPerformanceEvent({...})` 호출 바로 뒤에:

```ts
			// 회원의 조회만 사용자×공고 로그에 누적한다(비회원 제외). 업소 아웃바운드 근거.
			if (context.session?.user.id) {
				await recordJobView({
					jobPostId: post.id,
					jobTitle: post.title,
					organizationId: post.organizationId,
					organizationName: post.employerDisplayName ?? "",
					userId: context.session.user.id,
				});
			}
```

`post.employerDisplayName`은 같은 핸들러의 select에 이미 있다(`employerDisplayName: employerOrganizationProfile.displayName`, leftJoin이라 null 가능). `post.title`은 select에 있는지 확인하고 없으면 select에 `title: jobPost.title`을 추가한다.

- [ ] **Step 2: 운영자 조회 프로시저 추가**

`content-history.ts`:
- import: `@bambi-app/db/schema/bambi`에 `jobViewLog` 추가.
- `adminInput` 아래에 `const adminJobViewInput = pageInput.extend({ userId: z.string().min(1) });`
- `contentHistoryRouter` 객체 마지막에:

```ts
	listAdminMemberJobViews: adminProcedure
		.input(adminJobViewInput)
		.handler(async ({ input }) => {
			const where = eq(jobViewLog.userId, input.userId);
			const [[total], items] = await Promise.all([
				db.select({ value: count() }).from(jobViewLog).where(where),
				db
					.select({
						firstViewedAt: jobViewLog.firstViewedAt,
						id: jobViewLog.id,
						jobPostId: jobViewLog.jobPostId,
						jobTitle: jobViewLog.jobTitle,
						lastViewedAt: jobViewLog.lastViewedAt,
						organizationId: jobViewLog.organizationId,
						organizationName: jobViewLog.organizationName,
						viewCount: jobViewLog.viewCount,
					})
					.from(jobViewLog)
					.where(where)
					.orderBy(desc(jobViewLog.lastViewedAt))
					.limit(input.pageSize)
					.offset((input.page - 1) * input.pageSize),
			]);
			return {
				items,
				page: input.page,
				pageSize: input.pageSize,
				totalCount: total?.value ?? 0,
			};
		}),
```

- [ ] **Step 3: 린트·타입**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/content-history.ts` 그리고 `pnpm --filter @bambi-app/api check-types`
Expected: 오류 없음.

- [ ] **Step 4: 커밋(컨트롤러)** — "feat(api): 공고 상세 조회 시 회원 로그 기록·운영자 조회 프로시저"

---

### Task 4: 운영자 사용자 상세 UI + 매뉴얼

**Files:**
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx` (`UserContentHistory` 함수 바로 뒤에 새 함수, `UserDetail` 내 `<UserContentHistory userId={item.id} />` 바로 아래에 배치)
- Modify: `docs/manual/moderator-manual.md` (354행 "작성 콘텐츠 이력" 항목 뒤)

**Interfaces:**
- Consumes: `orpc.bambi.contentHistory.listAdminMemberJobViews` (Task 3).

- [ ] **Step 1: `UserJobViewHistory` 컴포넌트 추가**

`UserContentHistory` 함수 정의가 끝난 직후에 추가(`Accordion*`, `PageControls`, `formatDateTime`, `useQuery`, `orpc`, `useState`는 이미 import됨):

```tsx
// 회원이 상세를 연 공고 목록(사용자×공고 누적). 업소 아웃바운드 근거로 쓴다.
function UserJobViewHistory({ userId }: { userId: string }) {
	const [page, setPage] = useState(1);
	const query = useQuery(
		orpc.bambi.contentHistory.listAdminMemberJobViews.queryOptions({
			input: { page, pageSize: 5, userId },
		})
	);
	const pageCount = Math.max(1, Math.ceil((query.data?.totalCount ?? 0) / 5));
	return (
		<Accordion>
			<AccordionItem value="job-view-history">
				<AccordionTrigger>최근 본 공고</AccordionTrigger>
				<AccordionContent>
					{query.data?.items.length === 0 ? (
						<p className="mb-0 text-muted-foreground text-sm">
							아직 본 공고가 없습니다.
						</p>
					) : null}
					<ul className="grid list-none gap-2 p-0">
						{query.data?.items.map((item) => (
							<li className="rounded-lg border p-3" key={item.id}>
								<div className="flex justify-between gap-3">
									<strong>
										{item.organizationName || "업소명 없음"} · {item.jobTitle}
									</strong>
									<span className="shrink-0 text-muted-foreground text-xs">
										{item.viewCount}회
									</span>
								</div>
								<span className="text-muted-foreground text-xs">
									마지막 조회 {formatDateTime(item.lastViewedAt)}
								</span>
							</li>
						))}
					</ul>
					<div className="mt-3 flex justify-end">
						<PageControls
							disabled={query.isFetching}
							onPageChange={setPage}
							page={page}
							pageCount={pageCount}
						/>
					</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
```

- [ ] **Step 2: `UserDetail`에 배치**

`<UserContentHistory userId={item.id} />` 바로 아래 줄에 `<UserJobViewHistory userId={item.id} />` 추가.

- [ ] **Step 3: 매뉴얼 갱신**

`docs/manual/moderator-manual.md` 354행(작성 콘텐츠 이력 항목) 뒤에 번호를 이어 추가:

```
6. **최근 본 공고** 영역에서 이 회원이 상세까지 열어 본 공고를 업소명·공고 제목·조회 횟수·마지막 조회 시각과 함께 봅니다. 같은 공고를 여러 번 열면 한 줄에 횟수만 올라가고, 최근에 본 순서로 5개씩 페이지를 넘깁니다. 비회원 상태에서 본 공고는 남지 않습니다. 업소에 광고 제안(아웃바운드)을 할 때 어느 회원이 어느 업소를 봤는지 확인하는 용도입니다.
```

이후 같은 목록에 항목이 더 있으면 번호를 하나씩 밀어 맞춘다.

- [ ] **Step 4: 린트·타입**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/screens/moderator.tsx` 그리고 `pnpm --filter web check-types`
Expected: 오류 없음(메인 리포의 낡은 .next 오탐과 무관하게 워크트리에서 실행).

- [ ] **Step 5: 커밋(컨트롤러)** — "feat(web): 운영자 사용자 상세에 최근 본 공고 섹션 추가"

---

## Self-Review

- 스펙 커버리지: 테이블(T1) · 기록(T3 Step1) · 운영자 UI(T4) · 검증 테스트(T2) · 매뉴얼(T4 Step3) 모두 대응. 업소 단위 역조회는 범위 밖(설계에서 명시 제외).
- 플레이스홀더 없음. 마이그레이션 파일명만 생성 결과에 따름.
- 타입 일관성: `recordJobView` 입력 키 5개(jobPostId, jobTitle, organizationId, organizationName, userId)가 T2 정의·T2 테스트·T3 호출에서 동일. 프로시저 출력 키가 T4의 `item.id/organizationName/jobTitle/viewCount/lastViewedAt` 사용과 일치.
