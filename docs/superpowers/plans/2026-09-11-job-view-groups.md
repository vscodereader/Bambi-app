# 최근 본 공고 업소 그룹화·크롤 공고 로그·운영자 계정 제외 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 크롤 공고 상세 조회도 `job_view_log`에 남기고, 운영자 "최근 본 공고"를 업소 단위로 묶어 연락처와 함께 보여준다. (2) 운영자 사용자 목록에서 운영자(admin) 계정을 뺀다.

**Architecture:** `job_view_log`에 `source`('member'|'crawled')·`business_key`·`business_phone`을 추가하고 `organization_id`를 nullable로 바꾼다(0119, 기존 행 백필). `recordJobView`가 확장 입력을 받고, `crawledJobs.getById`에서도 세션이 있으면 기록한다. 운영자 프로시저는 사용자의 로그 전체를 읽어 `business_key`로 묶어 업소 페이지 단위로 반환하고, UI는 업소 카드 + 하위 공고 목록으로 교체한다. `moderation.listUsers`에 admin 제외 조건을 추가한다.

**Tech Stack:** drizzle-orm(pg), oRPC, zod, React Query, shadcn Accordion/Badge, vitest.

**Spec:** 채팅에서 제안·지시된 설계(업소 그룹 + 공고 줄 링크, admin 제외). 이 문서가 정본. 이전 계획: `docs/superpowers/plans/2026-09-11-job-view-logs.md`.

## Global Constraints

- 작업 위치: `C:\Users\user\projects\bambi-app\.claude\worktrees\job-view-groups` (브랜치 `worktree-job-view-groups`). 다른 경로 편집 금지.
- 빌드·dev 서버 실행 금지. `db:push` 절대 금지. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate`로 0119를 생성한 뒤 **SQL만 손으로 보강**(백필 UPDATE 삽입, 아래 Task 1). 스냅샷·journal은 손대지 않는다.
- 새 npm 의존성 금지. 서브에이전트 커밋·`git stash` 금지.
- `business_phone`은 운영자 전용 화면에만 노출한다(연락처 비공개 원칙의 "전화번호 축 예외" 범위). 공개 API 응답에 싣지 않는다.
- 비회원(세션 없음)은 기록하지 않는다. 크롤 공고도 동일.
- UI 문구 한국어, `source` 원값을 화면에 그대로 찍지 않는다(라벨 맵 사용). px 임의값 금지, 기존 shadcn 컴포넌트만.
- 린트: `pnpm dlx ultracite fix <경로...>`(경로 필수). 타입: `pnpm --filter @bambi-app/db check-types`, `pnpm --filter @bambi-app/api check-types`, `pnpm --filter web check-types`.
- 테스트: `packages/api`를 cwd로 `pnpm vitest run test/services/bambi-job-view-log.test.ts`만 실행. 다른 스위트 금지.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `packages/db/src/schema/bambi.ts` (`jobViewLog`, ≈1698행) | 컬럼 추가·nullable 변경·인덱스 |
| `packages/db/src/migrations/0119_*.sql` (생성 후 보강) | ALTER + 백필 |
| `packages/api/src/services/bambi-analytics.ts` (`recordJobView`, 파일 끝) | 확장 입력 upsert |
| `packages/api/test/services/bambi-job-view-log.test.ts` | 테스트 입력 갱신 + 크롤 케이스 |
| `packages/api/src/routers/bambi/jobs.ts` (`getById` ≈2056행) | `recordJobView` 호출을 creatorProfile 조회 뒤로 옮기고 확장 입력 |
| `packages/api/src/routers/bambi/crawled-jobs.ts` (`getById` 48행) | 세션 있을 때 기록 |
| `packages/api/src/routers/bambi/content-history.ts` (`listAdminMemberJobViews`) | 업소 그룹 응답으로 교체 |
| `packages/api/src/routers/bambi/moderation.ts` (`listUsers` ≈2203행) | admin 제외 |
| `apps/web/src/components/bambi/screens/moderator.tsx` (`UserJobViewHistory`) | 그룹 UI |
| `docs/manual/moderator-manual.md` (355행 "최근 본 공고" 항목, 사용자 목록 설명) | 문구 갱신 |

---

### Task 1: 스키마 확장 + 0119 마이그레이션(백필 포함)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (`export const jobViewLog`)
- Create(생성 후 편집): `packages/db/src/migrations/0119_*.sql`

**Interfaces:**
- Produces: `jobViewLog` 컬럼 `source: text NOT NULL`, `businessKey: text NOT NULL`, `businessPhone: text NULL`, `organizationId: text NULL`(기존 NOT NULL 해제). 인덱스 `job_view_log_user_business_idx (user_id, business_key)` 추가.

- [ ] **Step 1: 스키마 수정**

`jobViewLog` 정의를 아래로 교체한다(주석 포함):

```ts
// 회원이 공고 상세를 연 기록. 사용자×공고 1행에 누적(view_count)하며,
// 공고·업소가 삭제돼도 아웃바운드 근거로 남도록 제목·업소명·연락처를 스냅샷하고
// job_post/organization에는 FK를 걸지 않는다. 탈퇴 시(user cascade)만 지운다.
// source: 'member'(우리 회원 업소 공고, organization_id 있음) | 'crawled'(수집 공고, organization_id 없음).
// business_key: 운영자 화면에서 업소 단위로 묶는 키. member → `org:<organization_id>`,
// crawled → 전화번호가 있으면 `phone:<숫자만>`, 없으면 `shop:<shop_name>`.
// business_phone: 운영자 전용 아웃바운드 연락처 스냅샷. 공개 API에 싣지 않는다.
export const jobViewLog = pgTable(
	"job_view_log",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobPostId: uuid("job_post_id").notNull(),
		source: text("source").notNull(),
		businessKey: text("business_key").notNull(),
		organizationId: text("organization_id"),
		jobTitle: text("job_title").notNull(),
		organizationName: text("organization_name").notNull(),
		businessPhone: text("business_phone"),
		viewCount: integer("view_count").default(1).notNull(),
		firstViewedAt: timestamp("first_viewed_at").defaultNow().notNull(),
		lastViewedAt: timestamp("last_viewed_at").defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex("job_view_log_user_job_uidx").on(table.userId, table.jobPostId),
		index("job_view_log_user_last_viewed_idx").on(
			table.userId,
			table.lastViewedAt
		),
		index("job_view_log_user_business_idx").on(
			table.userId,
			table.businessKey
		),
		index("job_view_log_organization_id_idx").on(table.organizationId),
	]
);
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: `0119_*.sql` 1개. 내용은 `job_view_log`에 대한 ALTER(ADD COLUMN source/business_key/business_phone, DROP NOT NULL organization_id)와 CREATE INDEX 1개뿐이어야 한다. 다른 테이블이 섞이면 중단·보고.

- [ ] **Step 3: SQL 백필 보강(손 편집, 이 파일만)**

생성된 SQL에서 `ADD COLUMN "source" text NOT NULL`·`ADD COLUMN "business_key" text NOT NULL`은 기존 행 때문에 실패한다. 두 줄을 각각 `ADD COLUMN ... text;`(NOT NULL 제거)로 바꾸고, 그 직후에 아래 문장을 `--> statement-breakpoint`로 구분해 삽입한 뒤 SET NOT NULL을 붙인다. 최종 SQL의 형태:

```sql
ALTER TABLE "job_view_log" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "job_view_log" ADD COLUMN "business_key" text;--> statement-breakpoint
ALTER TABLE "job_view_log" ADD COLUMN "business_phone" text;--> statement-breakpoint
UPDATE "job_view_log" SET "source" = 'member', "business_key" = 'org:' || "organization_id";--> statement-breakpoint
ALTER TABLE "job_view_log" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_view_log" ALTER COLUMN "business_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_view_log" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "job_view_log_user_business_idx" ON "job_view_log" USING btree ("user_id","business_key");
```

생성된 문장 순서가 다르면 의미가 같도록만 맞춘다(ADD → UPDATE → SET NOT NULL → DROP NOT NULL → INDEX). 스냅샷 JSON·journal은 수정하지 않는다.

- [ ] **Step 4: 적용·검증**

Run: `pnpm --filter @bambi-app/db db:migrate` 그리고 `pnpm --filter @bambi-app/db check-types`
Expected: migrations applied. 이어서 `pnpm --filter @bambi-app/db db:generate`를 한 번 더 실행해 "No schema changes"가 나오는지 확인(스냅샷과 스키마 일치 검증).

---

### Task 2: `recordJobView` 확장 + 테스트

**Files:**
- Modify: `packages/api/src/services/bambi-analytics.ts` (파일 끝 `RecordJobViewInput`/`recordJobView`)
- Modify: `packages/api/test/services/bambi-job-view-log.test.ts`

**Interfaces:**
- Produces:
```ts
export type JobViewSource = "crawled" | "member";
export interface RecordJobViewInput {
	businessPhone?: null | string;
	jobPostId: string;
	jobTitle: string;
	organizationId?: null | string;
	organizationName: string;
	source: JobViewSource;
	userId: string;
}
export const recordJobView: (input: RecordJobViewInput) => Promise<void>;
export const buildJobViewBusinessKey: (input: { organizationId?: null | string; organizationName: string; phone?: null | string; source: JobViewSource }) => string;
```

- [ ] **Step 1: 테스트 갱신(실패 상태로)**

기존 테스트의 두 `recordJobView` 호출에 `source: "member"`를 추가하고, 단언에 `expect(rows[0]?.businessKey).toBe(\`org:${organizationId}\`)`를 추가한다. 같은 `describe` 안에 케이스를 하나 더 추가:

```ts
	it("keys crawled views by phone digits and falls back to shop name", async () => {
		const userId = `user_test_${randomUUID()}`;
		await db.insert(user).values({
			email: `job-view-${randomUUID()}@bambi.test`,
			id: userId,
			name: "크롤 조회 로그 테스트 유저",
		});
		try {
			const withPhone = randomUUID();
			const withoutPhone = randomUUID();
			await recordJobView({
				businessPhone: "010-1234-5678",
				jobPostId: withPhone,
				jobTitle: "크롤 공고 A",
				organizationName: "루나클럽",
				source: "crawled",
				userId,
			});
			await recordJobView({
				jobPostId: withoutPhone,
				jobTitle: "크롤 공고 B",
				organizationName: "루나클럽",
				source: "crawled",
				userId,
			});
			const rows = await db
				.select()
				.from(jobViewLog)
				.where(eq(jobViewLog.userId, userId));
			const byJob = new Map(rows.map((row) => [row.jobPostId, row]));
			expect(byJob.get(withPhone)?.businessKey).toBe("phone:01012345678");
			expect(byJob.get(withPhone)?.businessPhone).toBe("010-1234-5678");
			expect(byJob.get(withPhone)?.organizationId).toBeNull();
			expect(byJob.get(withoutPhone)?.businessKey).toBe("shop:루나클럽");
		} finally {
			await db.delete(user).where(inArray(user.id, [userId]));
		}
	});
```

Run (cwd `packages/api`): `pnpm vitest run test/services/bambi-job-view-log.test.ts` → FAIL(타입/undefined).

- [ ] **Step 2: 서비스 구현**

파일 끝 기존 `RecordJobViewInput`·`recordJobView`를 아래로 교체:

```ts
export type JobViewSource = "crawled" | "member";

export interface RecordJobViewInput {
	businessPhone?: null | string;
	jobPostId: string;
	jobTitle: string;
	organizationId?: null | string;
	organizationName: string;
	source: JobViewSource;
	userId: string;
}

// 운영자 화면에서 업소 단위로 묶는 키. 회원 업소는 조직 id, 수집 공고는 조직이 없어
// 전화번호(숫자만)로 같은 업소를 모으고, 번호도 없으면 상호로 묶는다.
export const buildJobViewBusinessKey = ({
	organizationId,
	organizationName,
	phone,
	source,
}: {
	organizationId?: null | string;
	organizationName: string;
	phone?: null | string;
	source: JobViewSource;
}): string => {
	if (source === "member" && organizationId) {
		return `org:${organizationId}`;
	}
	const digits = (phone ?? "").replace(/\D/g, "");
	return digits ? `phone:${digits}` : `shop:${organizationName}`;
};

// 회원의 공고 상세 조회를 사용자×공고 1행에 누적한다. 제목·업소명·연락처는 최신값으로
// 덮어써 운영자 화면이 현재 값을 보이게 한다. FK는 user뿐이라 삼킬 오류가 없다.
export const recordJobView = async ({
	businessPhone,
	jobPostId,
	jobTitle,
	organizationId,
	organizationName,
	source,
	userId,
}: RecordJobViewInput): Promise<void> => {
	const businessKey = buildJobViewBusinessKey({
		organizationId,
		organizationName,
		phone: businessPhone,
		source,
	});
	await db
		.insert(jobViewLog)
		.values({
			businessKey,
			businessPhone: businessPhone ?? null,
			jobPostId,
			jobTitle,
			organizationId: organizationId ?? null,
			organizationName,
			source,
			userId,
		})
		.onConflictDoUpdate({
			set: {
				businessKey,
				businessPhone: businessPhone ?? null,
				jobTitle,
				lastViewedAt: sql`now()`,
				organizationName,
				source,
				viewCount: sql`${jobViewLog.viewCount} + 1`,
			},
			target: [jobViewLog.userId, jobViewLog.jobPostId],
		});
};
```

- [ ] **Step 3: 통과·린트·타입**

Run (cwd `packages/api`): `pnpm vitest run test/services/bambi-job-view-log.test.ts` → PASS 2.
Run: `pnpm dlx ultracite fix packages/api/src/services/bambi-analytics.ts packages/api/test/services/bambi-job-view-log.test.ts`, `pnpm --filter @bambi-app/api check-types` → 이 시점엔 `jobs.ts`가 `source` 누락으로 타입 오류가 나는 것이 정상(Task 3에서 해소). 그 외 오류는 없어야 한다.

---

### Task 3: 기록 지점 2곳 + 운영자 그룹 프로시저 + admin 제외

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts` (`getById`)
- Modify: `packages/api/src/routers/bambi/crawled-jobs.ts` (`getById`)
- Modify: `packages/api/src/routers/bambi/content-history.ts` (`listAdminMemberJobViews`)
- Modify: `packages/api/src/routers/bambi/moderation.ts` (`listUsers`)

**Interfaces:**
- Consumes: `recordJobView`, `JobViewSource` (Task 2).
- Produces: `contentHistory.listAdminMemberJobViews` — input `{ userId, page?, pageSize? }`, output:
```ts
{
	items: Array<{
		businessKey: string;
		businessName: string;
		businessPhone: null | string;
		jobs: Array<{ id: string; jobPostId: string; jobTitle: string; lastViewedAt: Date; source: "crawled" | "member"; viewCount: number }>;
		lastViewedAt: Date;
		organizationId: null | string;
		source: "crawled" | "member";
		totalViews: number;
	}>;
	page: number; pageSize: number; totalCount: number; // totalCount = 업소 수
}
```

- [ ] **Step 1: `jobs.getById` 호출 이동·확장**

기존 `if (context.session?.user.id) { await recordJobView({...}) }` 블록을 **`creatorProfile` 조회 뒤, `return` 앞**으로 옮기고 내용을 아래로 교체:

```ts
			// 회원의 조회만 사용자×공고 로그에 누적한다(비회원 제외). 업소 아웃바운드 근거.
			// 연락처는 작성자의 인증된 번호(운영자 화면 전용 스냅샷).
			if (context.session?.user.id) {
				await recordJobView({
					businessPhone: creatorProfile?.isPhoneVerified
						? (creatorProfile.phoneNumber ?? null)
						: null,
					jobPostId: post.id,
					jobTitle: post.title,
					organizationId: post.organizationId,
					organizationName: post.employerDisplayName ?? "",
					source: "member",
					userId: context.session.user.id,
				});
			}
```

- [ ] **Step 2: `crawledJobs.getById` 기록 추가**

import에 `import { recordJobView } from "../../services/bambi-analytics";` 추가. 핸들러 시그니처를 `async ({ context, input })`로 바꾸고, `if (!post) throw` 직후에:

```ts
			// 회원의 조회만 로그에 남긴다(비회원 제외). 수집 공고는 조직이 없어 전화번호로 묶는다.
			if (context.session?.user.id) {
				await recordJobView({
					businessPhone: post.contactPhone ?? null,
					jobPostId: post.id,
					jobTitle: post.title,
					organizationName: post.shopName ?? "",
					source: "crawled",
					userId: context.session.user.id,
				});
			}
```

`publicProcedure`의 context에 `session`이 optional로 있는지는 `jobs.getById`가 같은 방식으로 쓰고 있으므로 동일하다.

- [ ] **Step 3: 그룹 프로시저로 교체**

`content-history.ts`의 `listAdminMemberJobViews` 핸들러를 아래로 교체(입력 스키마 `adminJobViewInput` 유지):

```ts
	listAdminMemberJobViews: adminProcedure
		.input(adminJobViewInput)
		.handler(async ({ input }) => {
			// 한 사용자의 로그는 많아야 수백 행이라 전부 읽어 업소별로 묶고 업소 단위로 페이지를 낸다.
			// ponytail: 사용자당 행이 수천을 넘기면 business_key 기준 SQL 집계로 바꾼다.
			const rows = await db
				.select({
					businessKey: jobViewLog.businessKey,
					businessPhone: jobViewLog.businessPhone,
					id: jobViewLog.id,
					jobPostId: jobViewLog.jobPostId,
					jobTitle: jobViewLog.jobTitle,
					lastViewedAt: jobViewLog.lastViewedAt,
					organizationId: jobViewLog.organizationId,
					organizationName: jobViewLog.organizationName,
					source: jobViewLog.source,
					viewCount: jobViewLog.viewCount,
				})
				.from(jobViewLog)
				.where(eq(jobViewLog.userId, input.userId))
				.orderBy(desc(jobViewLog.lastViewedAt));
			const groups = new Map<
				string,
				{
					businessKey: string;
					businessName: string;
					businessPhone: null | string;
					jobs: {
						id: string;
						jobPostId: string;
						jobTitle: string;
						lastViewedAt: Date;
						source: "crawled" | "member";
						viewCount: number;
					}[];
					lastViewedAt: Date;
					organizationId: null | string;
					source: "crawled" | "member";
					totalViews: number;
				}
			>();
			for (const row of rows) {
				const source = row.source === "crawled" ? "crawled" : "member";
				const group = groups.get(row.businessKey) ?? {
					businessKey: row.businessKey,
					businessName: row.organizationName,
					businessPhone: row.businessPhone,
					jobs: [],
					lastViewedAt: row.lastViewedAt,
					organizationId: row.organizationId,
					source,
					totalViews: 0,
				};
				group.jobs.push({
					id: row.id,
					jobPostId: row.jobPostId,
					jobTitle: row.jobTitle,
					lastViewedAt: row.lastViewedAt,
					source,
					viewCount: row.viewCount,
				});
				group.totalViews += row.viewCount;
				groups.set(row.businessKey, group);
			}
			// rows가 lastViewedAt 내림차순이라 Map 삽입 순서가 곧 업소의 최근순이다.
			const ordered = [...groups.values()];
			const start = (input.page - 1) * input.pageSize;
			return {
				items: ordered.slice(start, start + input.pageSize),
				page: input.page,
				pageSize: input.pageSize,
				totalCount: ordered.length,
			};
		}),
```

`count` import가 이 파일에서 더 이상 안 쓰이면 제거하지 말 것 — 다른 프로시저(`listMineAuthored`)가 쓴다. 실제로 미사용 import가 생기면 ultracite가 알려준다.

- [ ] **Step 4: `listUsers` admin 제외**

`moderation.ts` `listUsers`에서 `const rows = input.status ? await query.where(...) : await query;` 부분을 아래로 교체:

```ts
			// 운영자 계정은 사용자 관리 대상이 아니다 — 목록·집계에서 뺀다.
			const notAdmin = sql`coalesce(${bambiProfile.role}, 'job_seeker')::text <> 'admin'`;
			const rows = await query.where(
				input.status
					? // 프로필이 없는(온보딩 전) 계정도 목록 표시와 동일하게 active로 취급한다 —
						// 컬럼을 그대로 비교하면 NULL이라 'active' 필터에서 통째로 사라진다.
						and(
							notAdmin,
							sql`coalesce(${bambiProfile.status}, 'active')::text = ${input.status}`
						)
					: notAdmin
			);
```

`and`가 이 파일에 이미 import돼 있는지 확인하고 없으면 `drizzle-orm` import에 추가한다.

- [ ] **Step 5: 린트·타입**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/crawled-jobs.ts packages/api/src/routers/bambi/content-history.ts packages/api/src/routers/bambi/moderation.ts`, `pnpm --filter @bambi-app/api check-types` → 오류 없음.

---

### Task 4: 그룹 UI + 매뉴얼

**Files:**
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx` (`UserJobViewHistory` 전체 교체)
- Modify: `docs/manual/moderator-manual.md`

**Interfaces:**
- Consumes: Task 3 프로시저 출력.

- [ ] **Step 1: `UserJobViewHistory` 교체**

기존 함수를 아래로 교체한다(`Badge`는 `../ds`에서 이미 import됨 — `Badge` 사용 형태는 파일 내 다른 사용처와 동일하게 맞춘다. `Link`, `Route`, `formatPhone`, `formatDateTime`, `PageControls`, `Accordion*`, `useQuery`, `orpc`, `useState`는 이미 import됨):

```tsx
const JOB_VIEW_SOURCE_LABEL = {
	crawled: "수집 공고",
	member: "회원 업소",
} as const;

// 회원이 상세를 연 공고를 업소 단위로 묶어 보여준다. 업소 아웃바운드 근거로 쓰므로
// 헤더에 연락처를 두고, 아래에 그 업소의 어떤 공고를 몇 번 봤는지 붙인다.
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
					<ul className="grid list-none gap-3 p-0">
						{query.data?.items.map((group) => (
							<li className="rounded-lg border p-3" key={group.businessKey}>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="min-w-0">
										<strong className="block truncate">
											{group.businessName || "업소명 없음"}
										</strong>
										<span className="text-muted-foreground text-xs">
											{JOB_VIEW_SOURCE_LABEL[group.source]}
											{group.businessPhone
												? ` · ${formatPhone(group.businessPhone)}`
												: " · 연락처 없음"}
										</span>
									</div>
									<span className="shrink-0 text-muted-foreground text-xs">
										총 {group.totalViews}회 · 마지막 조회{" "}
										{formatDateTime(group.lastViewedAt)}
									</span>
								</div>
								<ul className="mt-2 grid list-none gap-1 border-t p-0 pt-2">
									{group.jobs.map((job) => (
										<li
											className="flex items-center justify-between gap-3 text-sm"
											key={job.id}
										>
											{job.source === "member" ? (
												<Link
													className="min-w-0 truncate underline-offset-2 hover:underline"
													href={`/moderator/jobs/${job.jobPostId}/edit` as Route}
												>
													{job.jobTitle}
												</Link>
											) : (
												<span className="min-w-0 truncate">{job.jobTitle}</span>
											)}
											<span className="shrink-0 text-muted-foreground text-xs">
												{job.viewCount}회 · {formatDateTime(job.lastViewedAt)}
											</span>
										</li>
									))}
								</ul>
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

`formatPhone`이 문자열 하나를 받는지 시그니처를 확인해 맞춘다(`@/lib/bambi-format`). 수집 공고는 운영자용 상세 화면이 없어 링크를 두지 않는다(제목만).

- [ ] **Step 2: 매뉴얼 갱신**

`docs/manual/moderator-manual.md`의 "6. **최근 본 공고** ..." 항목을 아래로 교체:

```
6. **최근 본 공고** 영역에서 이 회원이 상세까지 열어 본 공고를 **업소 단위로 묶어** 봅니다. 업소 줄에는 업소명·구분(회원 업소/수집 공고)·연락처·총 조회 횟수·마지막 조회 시각이 있고, 그 아래에 그 업소의 어떤 공고를 몇 번 봤는지가 붙습니다. 회원 업소 공고 제목을 누르면 운영자 공고 편집 화면으로 이동하고, 수집 공고는 제목만 보입니다. 같은 공고를 여러 번 열면 횟수만 올라가고, 최근에 본 업소 순으로 5개 업소씩 페이지를 넘깁니다. 비회원 상태에서 본 공고는 남지 않습니다. 업소에 광고 제안(아웃바운드)을 할 때 누구에게 연락할지 정하는 용도이며, 연락처는 이 화면에서만 보입니다.
```

사용자 목록 설명부(같은 파일에서 "사용자 관리" 목록을 설명하는 첫 단락, 약 345~350행)에 한 문장 추가: `운영자 계정은 이 목록에 나오지 않습니다.`

- [ ] **Step 3: 린트·타입**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/screens/moderator.tsx`, `pnpm --filter web check-types` → 오류 없음.

---

## Self-Review

- 커버리지: 크롤 기록(T3-2) · 업소 그룹(T3-3, T4-1) · 연락처(T1, T2, T3-1/2, T4-1) · 공고 링크(T4-1, 회원만) · admin 제외(T3-4) · 매뉴얼(T4-2) · 백필(T1-3) · 테스트(T2).
- 키 일관성: `recordJobView` 입력 7키가 T2 정의·T2 테스트·T3-1·T3-2에서 동일. 프로시저 출력 `businessKey/businessName/businessPhone/source/totalViews/lastViewedAt/jobs[]{id,jobPostId,jobTitle,source,viewCount,lastViewedAt}`가 T4에서 그대로 사용.
- 알려진 한계: 수집 공고 줄에 원문 링크 없음(sourceUrl 스냅샷은 후속). 그룹화는 JS 메모리(사용자당 수백 행 가정, ponytail 주석).
