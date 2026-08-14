# 게시판 회원 등급 & 등급별 포인트 지급 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커뮤니티 게시판 글/댓글 작성에 게시판별 포인트를 적립하고, 누적 포인트 순합계로 회원 등급을 산정해 게시판·마이페이지·운영자 화면에 뱃지로 노출하며, 등급표와 게시판별 적립 금액을 운영자가 편집한다.

**Architecture:** 기존 `bambi_point_transaction` 원장을 그대로 재사용한다(잔액 = `SUM(amount)`). 적립 상태는 글/댓글의 `points_awarded` 스냅샷으로 추적하고, published 진입/이탈 상태 전이에서 순수 함수 `reconcilePoints`가 원장 델타를 계산해 같은 트랜잭션에 쌓는다. 등급은 신규 `bambi_member_grade`(운영자 CRUD) 임계값과 잔액을 읽기 시점에 매핑한다.

**Tech Stack:** TypeScript, Drizzle ORM(PostgreSQL), oRPC, Next.js(App Router, RSC) + shadcn/ui(base-ui) + Tailwind v4, Vitest.

## Global Constraints

- **DB 워크플로**: `db:push` 절대 금지. `drizzle-kit generate`/`migrate`는 **사용자 명시 지시 시에만** 실행(적용 검증 필수). 스키마 편집·마이그레이션 SQL 작성까지는 진행하되 적용은 사용자 확인 후.
- **라우터 테스트 실행 금지**: `packages/api/test/routers/bambi` 스위트는 dev DB를 지운다. 절대 실행하지 않는다. 자동 검증은 **순수 단위 테스트(`test/services`) + `check-types` + `ultracite`** 로만 한다. 라우터 핸들러 배선의 end-to-end는 사용자가 dev에서 수동 확인.
- **워크트리 사전조건**: 이 워크트리(`board-member-grades-points`)에는 node_modules가 없다. 첫 작업 전 `pnpm install`(워크트리 루트에서) 1회. 서비스 테스트가 `@bambi-app/db`를 정적 import하므로 `apps/server/.env`가 워크트리에 있어야 한다(없으면 메인 리포에서 복사).
- **적립 대상은 회원만**: 게스트(비회원, `author_user_id` null)는 적립 제외. 적립 상태는 `published`에서만 유지(작성 +N / 삭제·숨김 −N / 복구 재적립). 소급 없음.
- **웹 UI**: `apps/web`은 shadcn 컴포넌트 + Tailwind만. 인라인 style·raw hex 금지. 뱃지=`Badge`, 색은 시맨틱/브랜드 토큰. base-ui는 `render` prop(asChild 아님).
- **enum 원값 UI 노출 금지**: 등급명은 운영자 입력 라벨이라 그대로 노출 OK. reason 문자열 등 내부값은 화면에 직접 렌더 금지.
- **커밋**: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿 본문. 커밋 전 `pnpm dlx ultracite fix <바뀐 파일>`.
- **베이스 브랜치**: 작업 브랜치 `worktree-board-member-grades-points`. 통합은 `feat/board-member-grades-points`로 no-ff 병합 후 develop PR(직접 병합 금지).

## 검증 커맨드 (반복 사용)

```bash
# 타입체크 (워크트리 packages/api에서)
cd packages/api && pnpm check-types
# 서비스 단위 테스트만 (라우터 스위트 제외!)
cd packages/api && pnpm exec vitest run test/services/bambi-member-points.test.ts
# 린트/포맷 (경로 인자 필수)
pnpm dlx ultracite fix packages/api/src/services/bambi-member-points.ts
```

---

## 파일 구조

**신규**
- `packages/api/src/services/bambi-member-points.ts` — 순수 로직(`reconcilePoints`/`resolveGrade`/`nextGrade`) + DB 헬퍼(`reconcileContentPoints`/`getBoardContentPoints`/`getPointBalances`/`loadGradeBadges`) + reason 상수·타입.
- `packages/api/test/services/bambi-member-points.test.ts` — 순수 로직 단위 테스트.
- `packages/api/src/routers/bambi/member-grades.ts` — 등급 CRUD(adminProcedure).
- `apps/web/src/components/bambi/grade-badge.tsx` — 등급 뱃지(shadcn `Badge`).
- `apps/web/src/app/moderator/member-grades/page.tsx` — 등급 관리 화면.

**수정**
- `packages/db/src/schema/bambi.ts` — 컬럼 3종 + `bambiMemberGrade` 테이블.
- `packages/db/src/migrations/0091_*.sql` — 생성물 + 시드(등급 5행, free 게시판 100/50).
- `packages/api/src/routers/bambi/community.ts` — 6개 핸들러 적립·회수 배선.
- `packages/api/src/routers/bambi/community-boards.ts` — 입력·create·update에 포인트.
- `packages/api/src/routers/bambi/moderation.ts` — `listUsers`에 잔액·등급.
- `packages/api/src/routers/bambi/index.ts` — `memberGrades` 등록.
- `apps/web/src/lib/bambi/moderator-navigation.ts` — 등급 관리 메뉴.
- `apps/web/src/app/moderator/community-boards/page.tsx` — 포인트 입력 필드.
- `apps/web/src/app/moderator/users/page.tsx` — 등급 컬럼.
- 게시판 글/댓글 렌더 컴포넌트(작성자명 옆) — 뱃지.
- `apps/web/src/app/seeker/attendance/page.tsx` + `apps/web/src/components/bambi/attendance-panel.tsx` — 잔액·등급·다음 등급까지 남은 포인트.

---

## Task 1: 스키마 + 마이그레이션 + 시드

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (communityBoard 203-220, communityPost/Comment, 신규 테이블 근처 1855 이후)
- Modify/Create: `packages/db/src/migrations/0091_*.sql` (generate 산출물 + 시드 append)

**Interfaces:**
- Produces: `communityBoard.postPoints`, `communityBoard.commentPoints`(int, default 0); `communityPost.pointsAwarded`, `communityComment.pointsAwarded`(int, default 0); `bambiMemberGrade`(테이블: `id`, `name`, `minPoints`, `color`, `createdAt`, `updatedAt`).

- [ ] **Step 1: communityBoard에 포인트 컬럼 추가**

`packages/db/src/schema/bambi.ts`의 `communityBoard`(203-220), `sortOrder` 줄 다음에:

```ts
	sortOrder: integer("sort_order").notNull(),
	// 이 게시판에 회원이 글/댓글을 쓸 때 적립할 포인트(0=미지급). 운영자가 게시판별 편집.
	postPoints: integer("post_points").default(0).notNull(),
	commentPoints: integer("comment_points").default(0).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
```

- [ ] **Step 2: communityPost / communityComment에 스냅샷 컬럼 추가**

`communityPost`의 `commentCount` 정의 다음 줄(1908 부근)에:

```ts
	commentCount: integer("comment_count").default(0).notNull(),
	// 이 글에 현재 적립돼 있는 포인트(회수·재적립 금액 기준). 게스트·0포인트 게시판은 0.
	pointsAwarded: integer("points_awarded").default(0).notNull(),
```

`communityComment`에도 동일하게 컬럼을 추가한다(적절한 컬럼 뒤, `status` 근처):

```ts
	// 이 댓글에 현재 적립돼 있는 포인트(회수·재적립 기준). 게스트는 0.
	pointsAwarded: integer("points_awarded").default(0).notNull(),
```

- [ ] **Step 3: bambiMemberGrade 테이블 추가**

`bambiPointTransaction` 정의(1871) 다음에:

```ts
// 회원 등급 정의. 운영자가 편집한다(CRUD). 등급 = min_points ≤ 포인트 잔액(원장 순합계)인
// 최상위 등급. min_points=0 기본 등급이 항상 하나 있어야 모든 회원이 등급을 갖는다(시드로 보장,
// 삭제 API가 마지막 0 등급을 막는다). min_points UNIQUE로 구간 경계 중복을 DB가 거른다.
export const bambiMemberGrade = pgTable("bambi_member_grade", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	minPoints: integer("min_points").notNull().unique(),
	// 뱃지 색(hex). null이면 화면 기본색.
	color: text("color"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});
```

- [ ] **Step 4: 타입체크**

Run: `cd packages/api && pnpm check-types`
Expected: PASS (스키마 참조가 아직 없으므로 통과)

- [ ] **Step 5: 마이그레이션 생성 (사용자 지시 시)**

Run: `cd packages/db && pnpm exec drizzle-kit generate`
Expected: `packages/db/src/migrations/0091_<random>.sql` 생성. 파일을 열어 DDL(ALTER TABLE 2·ADD COLUMN 3, CREATE TABLE 1)이 스키마와 일치하는지 확인.

> DB 워크플로: generate/migrate는 사용자 명시 지시 시에만. 지시가 없으면 Step 5·6은 보류하고 Step 1~4만 커밋한다.

- [ ] **Step 6: 시드 SQL append**

생성된 `0091_*.sql` 맨 끝에 `--> statement-breakpoint`로 구분해 추가:

```sql
--> statement-breakpoint
INSERT INTO "bambi_member_grade" ("name", "min_points") VALUES
	('새싹', 0),
	('일반', 1000),
	('우수회원', 5000),
	('열혈회원', 20000),
	('VIP', 50000);
--> statement-breakpoint
UPDATE "community_board" SET "post_points" = 100, "comment_points" = 50 WHERE "key" = 'free';
```

- [ ] **Step 7: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations/
git commit -m "feat: 게시판 포인트·등급 스키마와 시드 추가"
```

---

## Task 2: member-points 서비스 (순수 로직 + DB 헬퍼)

**Files:**
- Create: `packages/api/src/services/bambi-member-points.ts`
- Test: `packages/api/test/services/bambi-member-points.test.ts`

**Interfaces:**
- Produces:
  - `reconcilePoints(currentAwarded: number, targetAmount: number): { delta: number; nextAwarded: number }`
  - `resolveGrade(balance: number, grades: MemberGrade[]): MemberGrade | null`
  - `nextGrade(balance: number, grades: MemberGrade[]): MemberGrade | null`
  - `POINT_REASONS`(적립/회수 reason 문자열)
  - `type MemberGrade = { id: string; name: string; minPoints: number; color: string | null }`
  - `type GradeBadge = { name: string; color: string | null }`
  - `reconcileContentPoints(tx, args): Promise<number /* nextAwarded */>`
  - `getBoardContentPoints(board: string): Promise<{ postPoints: number; commentPoints: number }>`
  - `getPointBalances(userIds: string[]): Promise<Map<string, number>>`
  - `loadGradeBadges(userIds: string[]): Promise<Map<string, GradeBadge>>`
- Consumes: `bambiPointTransaction`, `bambiMemberGrade`, `communityBoard` (Task 1).

- [ ] **Step 1: 실패 테스트 작성**

`packages/api/test/services/bambi-member-points.test.ts`:

```ts
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// 모듈이 @bambi-app/db를 정적 import하므로 env 먼저 로드(다른 서비스 테스트와 동일 패턴).
dotenv.config({ path: "../../apps/server/.env" });

const { reconcilePoints, resolveGrade, nextGrade } = await import(
	"@/services/bambi-member-points"
);

const GRADES = [
	{ id: "g0", name: "새싹", minPoints: 0, color: null },
	{ id: "g1", name: "일반", minPoints: 1000, color: null },
	{ id: "g2", name: "우수회원", minPoints: 5000, color: null },
];

describe("reconcilePoints", () => {
	it("작성: 0에서 목표 N으로 가면 +N 적립하고 스냅샷 N", () => {
		expect(reconcilePoints(0, 100)).toEqual({ delta: 100, nextAwarded: 100 });
	});
	it("삭제/숨김: 목표 0이면 −현재 회수하고 스냅샷 0", () => {
		expect(reconcilePoints(100, 0)).toEqual({ delta: -100, nextAwarded: 0 });
	});
	it("복구: 0에서 다시 N이면 재적립", () => {
		expect(reconcilePoints(0, 50)).toEqual({ delta: 50, nextAwarded: 50 });
	});
	it("이미 적립됨(목표=현재): 델타 0(중복 지급 없음)", () => {
		expect(reconcilePoints(100, 100)).toEqual({ delta: 0, nextAwarded: 100 });
	});
	it("음수 목표는 0으로 클램프", () => {
		expect(reconcilePoints(0, -5)).toEqual({ delta: 0, nextAwarded: 0 });
	});
});

describe("resolveGrade", () => {
	it("경계값 정확히 min_points면 그 등급", () => {
		expect(resolveGrade(1000, GRADES)?.name).toBe("일반");
	});
	it("구간 안이면 하위 등급 유지", () => {
		expect(resolveGrade(999, GRADES)?.name).toBe("새싹");
		expect(resolveGrade(4999, GRADES)?.name).toBe("일반");
	});
	it("최고 등급 초과면 최고 등급", () => {
		expect(resolveGrade(999_999, GRADES)?.name).toBe("우수회원");
	});
	it("음수 잔액은 기본(0) 등급으로 클램프", () => {
		expect(resolveGrade(-10, GRADES)?.name).toBe("새싹");
	});
	it("등급이 없으면 null", () => {
		expect(resolveGrade(100, [])).toBeNull();
	});
});

describe("nextGrade", () => {
	it("현재 잔액보다 큰 첫 등급을 돌려준다", () => {
		expect(nextGrade(500, GRADES)?.name).toBe("일반");
	});
	it("최고 등급이면 null(다음 없음)", () => {
		expect(nextGrade(6000, GRADES)).toBeNull();
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-member-points.test.ts`
Expected: FAIL (`Cannot find module '@/services/bambi-member-points'`)

- [ ] **Step 3: 서비스 구현**

`packages/api/src/services/bambi-member-points.ts`:

```ts
import { db } from "@bambi-app/db";
import {
	bambiMemberGrade,
	bambiPointTransaction,
	communityBoard,
} from "@bambi-app/db/schema/bambi";
import { asc, eq, inArray, sql } from "drizzle-orm";

export type MemberGrade = {
	id: string;
	name: string;
	minPoints: number;
	color: string | null;
};

export type GradeBadge = { name: string; color: string | null };

// 원장 reason(현재 text). 미래의 채팅/채용 적립도 여기 키만 추가해 재사용한다.
export const POINT_REASONS = {
	post: { award: "community_post", revoke: "community_post_revoke" },
	comment: { award: "community_comment", revoke: "community_comment_revoke" },
} as const;

// 순수: 현재 적립 스냅샷과 목표 적립액으로 원장 델타·새 스냅샷을 계산한다.
// 목표는 caller가 (회원 && 게시판 포인트)일 때만 양수로, 그 외엔 0으로 넘긴다.
export function reconcilePoints(
	currentAwarded: number,
	targetAmount: number
): { delta: number; nextAwarded: number } {
	const target = Math.max(0, targetAmount);
	return { delta: target - currentAwarded, nextAwarded: target };
}

// 순수: 잔액(순합계)에 해당하는 최상위 등급. grades는 minPoints 오름차순 전제.
export function resolveGrade(
	balance: number,
	grades: MemberGrade[]
): MemberGrade | null {
	let result: MemberGrade | null = grades[0] ?? null;
	for (const grade of grades) {
		if (grade.minPoints <= balance) {
			result = grade;
		} else {
			break;
		}
	}
	return result;
}

// 순수: 잔액보다 높은 첫 등급(다음 목표). 없으면 null(최고 등급).
export function nextGrade(
	balance: number,
	grades: MemberGrade[]
): MemberGrade | null {
	return grades.find((grade) => grade.minPoints > balance) ?? null;
}

// DB: 상태 전이에서 원장 델타 한 행을 쌓고 새 스냅샷을 돌려준다. userId 없으면(게스트)·델타 0이면
// 원장은 건드리지 않는다. reason은 델타 부호로 적립/회수를 가른다.
export async function reconcileContentPoints(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	args: {
		userId: string | null;
		currentAwarded: number;
		targetAmount: number;
		reasons: { award: string; revoke: string };
	}
): Promise<number> {
	const { delta, nextAwarded } = reconcilePoints(
		args.currentAwarded,
		args.targetAmount
	);
	if (delta !== 0 && args.userId) {
		await tx.insert(bambiPointTransaction).values({
			amount: delta,
			reason: delta > 0 ? args.reasons.award : args.reasons.revoke,
			userId: args.userId,
		});
	}
	return nextAwarded;
}

// DB: 게시판의 글/댓글 적립 금액. 없으면 0/0. 설정 읽기라 트랜잭션 밖 db로 충분하다.
export async function getBoardContentPoints(
	board: string
): Promise<{ postPoints: number; commentPoints: number }> {
	const [row] = await db
		.select({
			postPoints: communityBoard.postPoints,
			commentPoints: communityBoard.commentPoints,
		})
		.from(communityBoard)
		.where(eq(communityBoard.key, board))
		.limit(1);
	return {
		postPoints: row?.postPoints ?? 0,
		commentPoints: row?.commentPoints ?? 0,
	};
}

// DB: 여러 회원의 포인트 잔액(순합계). 결과에 없는 userId는 0으로 취급한다.
export async function getPointBalances(
	userIds: string[]
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	if (userIds.length === 0) {
		return map;
	}
	const rows = await db
		.select({
			userId: bambiPointTransaction.userId,
			balance: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
		})
		.from(bambiPointTransaction)
		.where(inArray(bambiPointTransaction.userId, userIds))
		.groupBy(bambiPointTransaction.userId);
	for (const row of rows) {
		map.set(row.userId, row.balance);
	}
	return map;
}

// DB: 여러 회원의 등급 뱃지(이름·색). 등급표를 한 번 읽고 잔액→등급으로 매핑한다.
export async function loadGradeBadges(
	userIds: string[]
): Promise<Map<string, GradeBadge>> {
	const badges = new Map<string, GradeBadge>();
	const unique = [...new Set(userIds)];
	if (unique.length === 0) {
		return badges;
	}
	const [grades, balances] = await Promise.all([
		db
			.select({
				id: bambiMemberGrade.id,
				name: bambiMemberGrade.name,
				minPoints: bambiMemberGrade.minPoints,
				color: bambiMemberGrade.color,
			})
			.from(bambiMemberGrade)
			.orderBy(asc(bambiMemberGrade.minPoints)),
		getPointBalances(unique),
	]);
	if (grades.length === 0) {
		return badges;
	}
	for (const userId of unique) {
		const grade = resolveGrade(balances.get(userId) ?? 0, grades);
		if (grade) {
			badges.set(userId, { name: grade.name, color: grade.color });
		}
	}
	return badges;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-member-points.test.ts`
Expected: PASS (순수 함수 13 케이스)

- [ ] **Step 5: 린트 + 커밋**

```bash
pnpm dlx ultracite fix packages/api/src/services/bambi-member-points.ts packages/api/test/services/bambi-member-points.test.ts
git add packages/api/src/services/bambi-member-points.ts packages/api/test/services/bambi-member-points.test.ts
git commit -m "feat: 포인트 적립·회수·등급 산정 서비스와 단위 테스트 추가"
```

---

## Task 3: 글/댓글 작성 시 적립 (createPost, createComment)

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts` (createPost 1505-1628, createComment 1874-1960)

**Interfaces:**
- Consumes: `reconcileContentPoints`, `getBoardContentPoints`, `POINT_REASONS` (Task 2); `communityPost.pointsAwarded`, `communityComment.pointsAwarded`, `communityBoard.postPoints/commentPoints` (Task 1).

> 라우터 배선이라 자동 테스트는 없다(router 스위트 금지). 게이트 = `check-types` 통과 + 코드 리뷰 + 사용자 dev 수동 확인. 핵심 계산은 Task 2의 `reconcilePoints`로 이미 단위 검증됨.

- [ ] **Step 1: import 추가**

`community.ts` 상단 import에 추가:

```ts
import {
	getBoardContentPoints,
	POINT_REASONS,
	reconcileContentPoints,
} from "../../services/bambi-member-points";
```

- [ ] **Step 2: createPost 적립 배선**

`createPost`의 insert 블록(1578-1606)을 트랜잭션으로 감싸 원장 적립을 원자화한다. `actorUserId(actor)`가 회원 userId(게스트 null)다. 기존 `try { [created] = await db.insert(...)... }`를 다음으로 교체:

```ts
			const authorUserId = actorUserId(actor);
			const { postPoints } = await getBoardContentPoints(input.board);
			// 회원이고 게시판 적립 금액이 있으면 그만큼, 아니면 0(게스트·0포인트 게시판).
			const target = authorUserId ? postPoints : 0;

			let created: { board: string; id: string } | undefined;
			try {
				created = await db.transaction(async (tx) => {
					const [row] = await tx
						.insert(communityPost)
						.values({
							authorDisplayName: authorName,
							authorGuestId: actorGuestId(actor),
							authorRole: role,
							authorUserId,
							board: input.board,
							body: input.body,
							contactPhone: input.contactPhone || null,
							commentsDisabled: input.commentsDisabled,
							isLocked,
							isEvent: input.isEvent,
							isAnonymous: input.isAnonymous,
							isPromotion: input.isPromotion,
							passwordHash: input.password
								? hashCommunityPassword(input.password)
								: "",
							pointsAwarded: target,
							title: input.title,
						})
						.returning({ board: communityPost.board, id: communityPost.id });
					await reconcileContentPoints(tx, {
						userId: authorUserId,
						currentAwarded: 0,
						targetAmount: target,
						reasons: POINT_REASONS.post,
					});
					return row;
				});
			} catch (error) {
				releaseWriteRateLimit(writeRateLimit);
				throw error;
			}
```

> 주의: 기존 코드의 `let created` 선언을 이 블록으로 대체한다(중복 선언 금지). 이후 `postActorUserId`·알림·`return created` 로직은 그대로 둔다.

- [ ] **Step 3: createComment 적립 배선**

`createComment`의 트랜잭션(1914-1948) 안, 댓글 insert에 `pointsAwarded`를 싣고 원장 적립을 추가한다. 트랜잭션 진입 직후 게시판 적립액을 읽는다:

```ts
			const commentAuthorUserId = actorUserId(actor);
			const { commentPoints } = await getBoardContentPoints(post.board);
			const commentTarget = commentAuthorUserId ? commentPoints : 0;

			const created = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select ${communityPost.id} from ${communityPost} where ${communityPost.id} = ${input.postId} for share`
				);
				const [currentPost] = await tx
					.select({ commentsDisabled: communityPost.commentsDisabled })
					.from(communityPost)
					.where(eq(communityPost.id, input.postId))
					.limit(1);
				if (currentPost?.commentsDisabled) {
					throw new ORPCError("FORBIDDEN", {
						message: "이 글은 댓글을 작성할 수 없습니다.",
					});
				}
				const [row] = await tx
					.insert(communityComment)
					.values({
						authorGuestId: actorGuestId(actor),
						authorRole: actorRole(actor),
						authorUserId: commentAuthorUserId,
						body: input.body,
						parentCommentId: input.parentCommentId ?? null,
						passwordHash: guestPassword
							? hashCommunityPassword(guestPassword)
							: "",
						pointsAwarded: commentTarget,
						postId: input.postId,
					})
					.returning({ id: communityComment.id });
				await tx
					.update(communityPost)
					.set({ commentCount: sql`${communityPost.commentCount} + 1` })
					.where(eq(communityPost.id, input.postId));
				await reconcileContentPoints(tx, {
					userId: commentAuthorUserId,
					currentAwarded: 0,
					targetAmount: commentTarget,
					reasons: POINT_REASONS.comment,
				});
				return row;
			});
```

- [ ] **Step 4: 타입체크**

Run: `cd packages/api && pnpm check-types`
Expected: PASS

- [ ] **Step 5: 린트 + 커밋**

```bash
pnpm dlx ultracite fix packages/api/src/routers/bambi/community.ts
git add packages/api/src/routers/bambi/community.ts
git commit -m "feat: 회원 글·댓글 작성 시 게시판 포인트 적립"
```

---

## Task 4: 글/댓글 삭제 시 회수 (deletePost, deleteComment)

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts` (deletePost 1729-1756, deleteComment 2058-2106)

**Interfaces:**
- Consumes: `reconcileContentPoints`, `POINT_REASONS` (Task 2).

> deletePost/deleteComment는 `findPublishedPost`로 published만 대상 → `wasVisible` 항상 참 → 회수만 발생. 현재 bare update라 트랜잭션으로 감싼다.

- [ ] **Step 1: deletePost 회수 배선**

`deletePost`의 update 블록(1750-1753)에서, 대상 글의 `authorUserId`·`pointsAwarded`가 필요하다. `findPublishedPost`가 두 값을 포함하는지 확인하고(없으면 select에 추가), update를 트랜잭션으로 교체:

```ts
			await db.transaction(async (tx) => {
				await tx
					.update(communityPost)
					.set({ status: "deleted", pointsAwarded: 0, updatedAt: new Date() })
					.where(eq(communityPost.id, input.postId));
				await reconcileContentPoints(tx, {
					userId: post.authorUserId,
					currentAwarded: post.pointsAwarded,
					targetAmount: 0,
					reasons: POINT_REASONS.post,
				});
			});
```

> `findPublishedPost`의 select에 `authorUserId: communityPost.authorUserId, pointsAwarded: communityPost.pointsAwarded`가 없으면 추가한다(파일 내 `findPublishedPost` 정의를 열어 확인).

- [ ] **Step 2: deleteComment 회수 배선**

`deleteComment`(2058-2106)의 소프트 삭제(`status:"deleted"` set)를 트랜잭션으로 감싸고, 대상 댓글의 `authorUserId`·`pointsAwarded`를 조회해 회수한다. 삭제 대상 댓글 로드 부분에서 두 컬럼을 함께 select한 뒤:

```ts
			await db.transaction(async (tx) => {
				await tx
					.update(communityComment)
					.set({ status: "deleted", pointsAwarded: 0, updatedAt: new Date() })
					.where(eq(communityComment.id, input.commentId));
				await reconcileContentPoints(tx, {
					userId: comment.authorUserId,
					currentAwarded: comment.pointsAwarded,
					targetAmount: 0,
					reasons: POINT_REASONS.comment,
				});
			});
```

> `deleteComment`가 소유권 확인용으로 로드하는 댓글 row에 `authorUserId`·`pointsAwarded`가 없으면 그 select에 추가한다. commentCount 감소 등 기존 부수효과가 있으면 같은 트랜잭션 안에 유지한다.

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/community.ts
git add packages/api/src/routers/bambi/community.ts
git commit -m "feat: 글·댓글 삭제 시 적립 포인트 회수"
```

---

## Task 5: 운영자 상태 변경 시 회수·재적립 (setPostStatusByAdmin, setCommentStatusByAdmin)

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts` (setPostStatusByAdmin 2141-2212, setCommentStatusByAdmin 2216-2318)

**Interfaces:**
- Consumes: `reconcileContentPoints`, `getBoardContentPoints`, `POINT_REASONS` (Task 2).

> 두 핸들러는 이미 `db.transaction`이다. `wasVisible = 이전==='published'`, `willVisible = 다음==='published'` 전이 가드에 포인트를 얹는다. 이탈이면 회수(target 0), 진입이면 재적립(target = 회원 && 게시판 포인트).

- [ ] **Step 1: setPostStatusByAdmin 배선**

`existing` select(2149-2157)에 `authorUserId`, `pointsAwarded`, `board`를 추가(이미 `board` 있음). update로 상태 변경 후, adminModerationAction insert 앞에 다음을 추가:

```ts
				const wasVisible = existing.status === "published";
				const willVisible = input.status === "published";
				if (wasVisible !== willVisible) {
					const { postPoints } = willVisible
						? await getBoardContentPoints(existing.board)
						: { postPoints: 0 };
					const nextAwarded = await reconcileContentPoints(tx, {
						userId: existing.authorUserId,
						currentAwarded: existing.pointsAwarded,
						targetAmount: existing.authorUserId ? postPoints : 0,
						reasons: POINT_REASONS.post,
					});
					await tx
						.update(communityPost)
						.set({ pointsAwarded: nextAwarded })
						.where(eq(communityPost.id, input.postId));
				}
```

> `existing` select에 `authorUserId: communityPost.authorUserId, pointsAwarded: communityPost.pointsAwarded`를 추가한다. `getBoardContentPoints`는 `tx`도 받도록 첫 인자 타입이 `Pick<typeof db, "select">`라 트랜잭션 핸들에 그대로 쓸 수 있다.

- [ ] **Step 2: setCommentStatusByAdmin 배선**

`existing` select(2222-2238)에 `authorUserId: communityComment.authorUserId`, `pointsAwarded: communityComment.pointsAwarded`를 추가. 기존 commentCount 전이 분기(2269-2284) 바로 다음에:

```ts
				if (wasVisible !== willVisible) {
					const { commentPoints } = willVisible
						? await getBoardContentPoints(existing.board ?? "")
						: { commentPoints: 0 };
					const nextAwarded = await reconcileContentPoints(tx, {
						userId: existing.authorUserId,
						currentAwarded: existing.pointsAwarded,
						targetAmount: existing.authorUserId ? commentPoints : 0,
						reasons: POINT_REASONS.comment,
					});
					await tx
						.update(communityComment)
						.set({ pointsAwarded: nextAwarded })
						.where(eq(communityComment.id, input.commentId));
				}
```

> 기존 코드가 이미 `wasVisible`/`willVisible`를 계산해 두었으면 재사용한다(중복 선언 금지). 수집 글 댓글(`board` null)은 회원 글이 아니므로 적립 대상이 아니지만, `authorUserId`가 있으면 재적립 target은 board 포인트(0)로 계산돼 안전하다.

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/community.ts
git add packages/api/src/routers/bambi/community.ts
git commit -m "feat: 운영자 글·댓글 숨김/삭제/복구 시 포인트 회수·재적립"
```

---

## Task 6: 게시판별 적립 금액 운영자 편집 (community-boards 라우터)

**Files:**
- Modify: `packages/api/src/routers/bambi/community-boards.ts` (createBoardInput 55-60, updateBoardInput 62-80, create 129-176, update 180-199)

**Interfaces:**
- Produces: `communityBoards.create`/`update` 입력에 `postPoints`/`commentPoints`(int ≥0); `communityBoards.list`(select all)는 자동 포함.

- [ ] **Step 1: 입력 스키마 확장**

`createBoardInput`에 추가:

```ts
const createBoardInput = z.object({
	commentPoints: z.number().int().min(0).max(100_000).default(0),
	description: z.string().trim().max(200).default(""),
	icon: boardIconSchema.optional(),
	label: z.string().trim().min(1).max(30),
	postPoints: z.number().int().min(0).max(100_000).default(0),
	slug: z.string().trim().min(2).max(30),
});
```

`updateBoardInput`에 `commentPoints`/`postPoints`를 optional로 추가하고, refine 조건에도 넣는다:

```ts
const updateBoardInput = boardKeyInput
	.extend({
		commentPoints: z.number().int().min(0).max(100_000).optional(),
		description: z.string().trim().max(200).optional(),
		icon: boardIconSchema.nullable().optional(),
		isWritable: z.boolean().optional(),
		label: z.string().trim().min(1).max(30).optional(),
		postPoints: z.number().int().min(0).max(100_000).optional(),
		sortOrder: z.number().int().min(0).max(10_000).optional(),
	})
	.refine(
		(value) =>
			value.commentPoints !== undefined ||
			value.description !== undefined ||
			value.icon !== undefined ||
			value.isWritable !== undefined ||
			value.label !== undefined ||
			value.postPoints !== undefined ||
			value.sortOrder !== undefined,
		{ message: "바꿀 값을 하나 이상 보내야 합니다." }
	);
```

- [ ] **Step 2: create/update 핸들러에 반영**

`create`의 insert `.values({...})`에 추가: `commentPoints: input.commentPoints, postPoints: input.postPoints,`.
`update`의 `.set({...})`에 추가: `commentPoints: input.commentPoints, postPoints: input.postPoints,` (undefined는 drizzle이 set에서 제외).

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/community-boards.ts
git add packages/api/src/routers/bambi/community-boards.ts
git commit -m "feat: 게시판별 글·댓글 적립 포인트 운영자 편집"
```

---

## Task 7: 등급 CRUD 라우터 (member-grades)

**Files:**
- Create: `packages/api/src/routers/bambi/member-grades.ts`
- Modify: `packages/api/src/routers/bambi/index.ts` (import 목록, `bambiRouter` 타입·값에 `memberGrades`)
- Test: `packages/api/test/services/bambi-member-points.test.ts`에 `assertGradeDeletable` 케이스 추가

**Interfaces:**
- Produces: `memberGrades.list`(admin) / `create` / `update` / `remove`.
- Consumes: `bambiMemberGrade` (Task 1); `assertGradeDeletable`(신규 순수 가드, 아래).

- [ ] **Step 1: 삭제 가드 순수 함수 실패 테스트**

`bambi-member-points.test.ts` 동적 import에 `assertGradeDeletable` 추가하고:

```ts
describe("assertGradeDeletable", () => {
	it("마지막 min_points=0 기본 등급은 삭제 불가", () => {
		expect(assertGradeDeletable({ minPoints: 0 }, 1)).toBe(false);
	});
	it("0 등급이라도 다른 0 등급이 또 있으면 삭제 가능", () => {
		expect(assertGradeDeletable({ minPoints: 0 }, 2)).toBe(true);
	});
	it("0이 아닌 등급은 언제나 삭제 가능", () => {
		expect(assertGradeDeletable({ minPoints: 1000 }, 1)).toBe(true);
	});
});
```

- [ ] **Step 2: 삭제 가드 구현 (bambi-member-points.ts)**

```ts
// 순수: 기본(min_points=0) 등급이 마지막 하나면 삭제하면 안 된다(모든 회원의 등급이 사라짐).
export function assertGradeDeletable(
	grade: { minPoints: number },
	zeroPointGradeCount: number
): boolean {
	if (grade.minPoints === 0 && zeroPointGradeCount <= 1) {
		return false;
	}
	return true;
}
```

Run: `cd packages/api && pnpm exec vitest run test/services/bambi-member-points.test.ts` → PASS.

- [ ] **Step 3: 라우터 구현**

`packages/api/src/routers/bambi/member-grades.ts`:

```ts
import { db } from "@bambi-app/db";
import { bambiMemberGrade } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure } from "../../index";
import { assertGradeDeletable } from "../../services/bambi-member-points";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const createGradeInput = z.object({
	color: z.string().trim().regex(HEX_COLOR).nullable().optional(),
	minPoints: z.number().int().min(0).max(10_000_000),
	name: z.string().trim().min(1).max(20),
});

const updateGradeInput = createGradeInput.extend({ id: z.string().uuid() });

const gradeIdInput = z.object({ id: z.string().uuid() });

const DUP_MIN_POINTS = "이미 같은 기준 포인트의 등급이 있습니다.";

export const memberGradesRouter = {
	list: adminProcedure.handler(async () =>
		db
			.select()
			.from(bambiMemberGrade)
			.orderBy(asc(bambiMemberGrade.minPoints))
	),

	create: adminProcedure.input(createGradeInput).handler(async ({ input }) => {
		try {
			const [created] = await db
				.insert(bambiMemberGrade)
				.values({
					color: input.color ?? null,
					minPoints: input.minPoints,
					name: input.name,
				})
				.returning({ id: bambiMemberGrade.id });
			return created;
		} catch {
			// min_points UNIQUE 위반을 사용자 문구로 바꾼다.
			throw new ORPCError("CONFLICT", { message: DUP_MIN_POINTS });
		}
	}),

	update: adminProcedure.input(updateGradeInput).handler(async ({ input }) => {
		try {
			const [updated] = await db
				.update(bambiMemberGrade)
				.set({
					color: input.color ?? null,
					minPoints: input.minPoints,
					name: input.name,
				})
				.where(eq(bambiMemberGrade.id, input.id))
				.returning({ id: bambiMemberGrade.id });
			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "등급을 찾을 수 없습니다." });
			}
			return updated;
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			throw new ORPCError("CONFLICT", { message: DUP_MIN_POINTS });
		}
	}),

	remove: adminProcedure.input(gradeIdInput).handler(async ({ input }) => {
		return await db.transaction(async (tx) => {
			const [grade] = await tx
				.select({ minPoints: bambiMemberGrade.minPoints })
				.from(bambiMemberGrade)
				.where(eq(bambiMemberGrade.id, input.id))
				.limit(1);
			if (!grade) {
				throw new ORPCError("NOT_FOUND", { message: "등급을 찾을 수 없습니다." });
			}
			const [{ count }] = await tx
				.select({ count: sql<number>`count(*)::int` })
				.from(bambiMemberGrade)
				.where(eq(bambiMemberGrade.minPoints, 0));
			if (!assertGradeDeletable(grade, count)) {
				throw new ORPCError("BAD_REQUEST", {
					message: "기본 등급(0포인트)은 최소 하나 남아 있어야 합니다.",
				});
			}
			await tx
				.delete(bambiMemberGrade)
				.where(eq(bambiMemberGrade.id, input.id));
			return { id: input.id };
		});
	}),
};
```

- [ ] **Step 4: index.ts에 등록**

`packages/api/src/routers/bambi/index.ts`에 import 추가(알파벳 순 `mainPopups` 앞):

```ts
import { memberGradesRouter } from "./member-grades";
```

`bambiRouter` 타입 선언과 값 양쪽에 `memberGrades: typeof memberGradesRouter,` / `memberGrades: memberGradesRouter,`를 추가한다(기존 항목과 같은 위치 규칙).

- [ ] **Step 5: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/member-grades.ts packages/api/src/routers/bambi/index.ts packages/api/src/services/bambi-member-points.ts packages/api/test/services/bambi-member-points.test.ts
git add packages/api/src/routers/bambi/member-grades.ts packages/api/src/routers/bambi/index.ts packages/api/src/services/bambi-member-points.ts packages/api/test/services/bambi-member-points.test.ts
git commit -m "feat: 회원 등급 CRUD 라우터와 기본 등급 삭제 가드 추가"
```

---

## Task 8: 글/댓글 응답에 작성자 등급 싣기

**Files:**
- Modify: `packages/api/src/routers/bambi/community.ts` (toCommentItems 874~, 글 목록/상세 응답 빌더 1268·1328·1381 부근, CommentRow 870)

**Interfaces:**
- Consumes: `loadGradeBadges`, `GradeBadge` (Task 2).
- Produces: 글/댓글 응답 item에 `authorGrade: GradeBadge | null`.

> `author_user_id`는 익명성 때문에 응답에서 계속 제외한다. 등급(이름·색)은 신원이 아니므로 노출 OK. 게스트 작성자는 등급 없음(null).

- [ ] **Step 1: 댓글 응답에 등급 추가**

`selectVisibleCommentRows`가 이미 `authorUserId`를 select하는지 확인(canDelete 계산에 쓰므로 대개 포함). `toCommentItems`가 rows→items로 매핑할 때 `gradeBadges: Map<string, GradeBadge>`를 인자로 받아 각 item에 `authorGrade`를 싣도록 시그니처를 확장한다:

```ts
const toCommentItems = (
	rows: CommentRow[],
	policy: /* 기존 정책 타입 */,
	gradeBadges: Map<string, GradeBadge>
) =>
	rows.map((row) => ({
		// ...기존 필드...
		authorGrade: row.authorUserId
			? (gradeBadges.get(row.authorUserId) ?? null)
			: null,
	}));
```

`toCommentItems` 호출부(getPost 1472 등)에서 호출 직전에 뱃지를 로드해 넘긴다:

```ts
const gradeBadges = await loadGradeBadges(
	rows.map((row) => row.authorUserId).filter((id): id is string => id != null)
);
return toCommentItems(rows, /* policy */, gradeBadges);
```

- [ ] **Step 2: 글 목록/상세 응답에 등급 추가**

글 목록·상세를 만드는 빌더에서 응답 행이 `authorUserId`를 갖는지 확인하고(select에 내부용으로 포함, 응답에는 미노출), 페이지의 작성자 id로 `loadGradeBadges`를 한 번 호출해 각 글 item에 `authorGrade`를 싣는다. 예(목록 핸들러):

```ts
const posts = /* 기존 조회 결과(내부에 authorUserId 포함) */;
const badges = await loadGradeBadges(
	posts.map((p) => p.authorUserId).filter((id): id is string => id != null)
);
return posts.map(({ authorUserId, ...rest }) => ({
	...rest,
	authorGrade: authorUserId ? (badges.get(authorUserId) ?? null) : null,
}));
```

> 각 응답 빌더(listPosts·getPost·listPublicPosts·getPublicPost)마다 동일 패턴을 적용한다. 이미 `authorUserId`를 응답에서 제거하고 있으므로, 제거 직전에 등급만 뽑아 싣는다.

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/community.ts
git add packages/api/src/routers/bambi/community.ts
git commit -m "feat: 게시판 글·댓글 응답에 작성자 등급 뱃지 정보 포함"
```

---

## Task 9: 등급 뱃지 컴포넌트 + 게시판 렌더

**Files:**
- Create: `apps/web/src/components/bambi/grade-badge.tsx`
- Modify: 게시판 글/댓글 작성자명 렌더 컴포넌트(글 카드·댓글 목록. `apps/web/src/components/bambi/community-post-detail-parts.tsx`, `apps/web/src/components/bambi/screens/community-board.tsx` 등 `authorName`/`authorDisplayName` 렌더 지점)

**Interfaces:**
- Consumes: 글/댓글 item의 `authorGrade: { name: string; color: string | null } | null` (Task 8).

- [ ] **Step 1: GradeBadge 컴포넌트**

`apps/web/src/components/bambi/grade-badge.tsx`:

```tsx
import { Badge } from "@bambi-app/ui/components/badge";

type Props = { grade: { name: string; color: string | null } | null };

// 작성자명 옆 회원 등급 뱃지. 등급 없음(게스트·미산정)이면 렌더하지 않는다.
// v1은 shadcn secondary 톤으로 통일한다(인라인 style·raw hex 금지 규칙 준수).
// color 컬럼은 보존하되 색 구동 스타일은 frontend-design 후속에서 토큰으로 매핑한다.
export function GradeBadge({ grade }: Props) {
	if (!grade) {
		return null;
	}
	return <Badge variant="secondary">{grade.name}</Badge>;
}
```

> `Badge` API는 `pnpm dlx shadcn@latest docs badge`로 확인. 색 구동 뱃지는 이 규칙(인라인 style 금지)을 지키려면 토큰 매핑이 필요해 frontend-design 후속으로 미룬다.

- [ ] **Step 2: 글/댓글 작성자명 옆에 렌더**

작성자 표시명을 그리는 지점마다 옆에 뱃지를 붙인다. 예(댓글 헤더):

```tsx
<div className="flex items-center gap-1.5">
	<span className="font-medium">{comment.authorName}</span>
	<GradeBadge grade={comment.authorGrade} />
</div>
```

글 카드·상세의 작성자 표시에도 동일하게 `<GradeBadge grade={post.authorGrade} />`를 추가한다.

- [ ] **Step 3: 타입체크(web) + 린트 + 커밋**

```bash
cd apps/web && pnpm check-types
pnpm dlx ultracite fix apps/web/src/components/bambi/grade-badge.tsx
git add apps/web/src/components/bambi/grade-badge.tsx apps/web/src/components/bambi/
git commit -m "feat: 게시판 글·댓글 작성자 등급 뱃지 표시"
```

---

## Task 10: 마이페이지/출석 화면 등급 표시

**Files:**
- Modify: `apps/web/src/app/seeker/attendance/page.tsx`, `apps/web/src/components/bambi/attendance-panel.tsx`
- Modify: `packages/api/src/routers/bambi/attendance.ts` (`getMine` 응답에 등급·다음 등급 추가)

**Interfaces:**
- Consumes: `loadGradeBadges`·`resolveGrade`·`nextGrade`·`getPointBalances` (Task 2).
- Produces: `attendance.getMine` 응답에 `grade: GradeBadge | null`, `nextGrade: { name: string; minPoints: number } | null`, `pointsToNext: number | null`.

- [ ] **Step 1: getMine에 등급 정보 추가**

`attendance.ts`의 `getMine` 핸들러에서 본인 잔액(`pointBalance`)을 이미 계산한다. 등급표를 읽어 현재/다음 등급을 파생해 응답에 싣는다:

```ts
import { bambiMemberGrade } from "@bambi-app/db/schema/bambi";
import { nextGrade, resolveGrade } from "../../services/bambi-member-points";
// ...
const grades = await db
	.select({
		id: bambiMemberGrade.id,
		name: bambiMemberGrade.name,
		minPoints: bambiMemberGrade.minPoints,
		color: bambiMemberGrade.color,
	})
	.from(bambiMemberGrade)
	.orderBy(asc(bambiMemberGrade.minPoints));
const current = resolveGrade(pointBalance, grades);
const upcoming = nextGrade(pointBalance, grades);
// 응답에 추가:
//   grade: current ? { name: current.name, color: current.color } : null,
//   nextGrade: upcoming ? { name: upcoming.name, minPoints: upcoming.minPoints } : null,
//   pointsToNext: upcoming ? upcoming.minPoints - pointBalance : null,
```

- [ ] **Step 2: 출석 패널에 등급·다음 등급 표시**

`attendance-panel.tsx`에서 잔액 옆에 현재 등급 뱃지와 "다음 등급까지 N포인트"를 렌더한다:

```tsx
<div className="flex items-center gap-2">
	<span className="text-2xl font-bold">{data.pointBalance.toLocaleString()}P</span>
	<GradeBadge grade={data.grade} />
</div>
{data.nextGrade ? (
	<p className="text-sm text-muted-foreground">
		{data.nextGrade.name}까지 {data.pointsToNext?.toLocaleString()}P
	</p>
) : (
	<p className="text-sm text-muted-foreground">최고 등급입니다</p>
)}
```

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types && cd ../../apps/web && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/attendance.ts apps/web/src/components/bambi/attendance-panel.tsx
git add packages/api/src/routers/bambi/attendance.ts apps/web/src/app/seeker/attendance/page.tsx apps/web/src/components/bambi/attendance-panel.tsx
git commit -m "feat: 마이페이지 출석 화면에 회원 등급·다음 등급 표시"
```

---

## Task 11: 운영자 등급 관리 페이지

**Files:**
- Create: `apps/web/src/app/moderator/member-grades/page.tsx`
- Modify: `apps/web/src/lib/bambi/moderator-navigation.ts` (회원 관리 그룹 24행 근처)

**Interfaces:**
- Consumes: `orpc.bambi.memberGrades.list/create/update/remove` (Task 7).

- [ ] **Step 1: 네비게이션 메뉴 추가**

`moderator-navigation.ts` 회원 관리 그룹 `items`에 추가(출석 관리 다음):

```ts
			{ href: "/moderator/attendance" as Route, label: "출석 관리" },
			{ href: "/moderator/member-grades" as Route, label: "등급 관리" },
```

- [ ] **Step 2: 등급 관리 페이지**

`apps/web/src/app/moderator/member-grades/page.tsx` — 기존 운영자 CRUD 페이지(예: `community-boards/page.tsx`)의 패턴을 따라 `useQuery`/`useMutation` + shadcn `Table`/`Dialog`/`Field`/`Input`으로 구성한다. 목록은 `minPoints` 오름차순. 추가/수정 폼 필드: `name`(텍스트), `minPoints`(숫자 ≥0), `color`(선택, hex). 삭제 버튼(기본 등급 삭제 시 서버가 막고 toast로 안내).

```tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/lib/orpc"; // 프로젝트의 orpc 클라이언트 경로 확인
// shadcn: Table, Dialog, Field/FieldGroup, Input, Button, Badge

// 목록 조회
const gradesQuery = useQuery(orpc.bambi.memberGrades.list.queryOptions());
// create/update/remove mutation은 community-boards/page.tsx의 mutationOptions 패턴 그대로.
// onSuccess에서 queryClient.invalidateQueries({ queryKey: orpc.bambi.memberGrades.key() }).
// remove onError에서 toast.error(error.message)로 기본 등급 보호 메시지 노출.
```

> 정확한 shadcn 컴포넌트 import 경로·orpc 클라이언트 경로·mutationOptions 시그니처는 `apps/web/src/app/moderator/community-boards/page.tsx`를 참조해 동일 패턴으로 작성한다. 새 raw 컴포넌트 재발명 금지, 기존 운영자 페이지 룩 재사용.

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd apps/web && pnpm check-types
pnpm dlx ultracite fix apps/web/src/app/moderator/member-grades/page.tsx apps/web/src/lib/bambi/moderator-navigation.ts
git add apps/web/src/app/moderator/member-grades/ apps/web/src/lib/bambi/moderator-navigation.ts
git commit -m "feat: 운영자 등급 관리 페이지와 메뉴 추가"
```

---

## Task 12: 운영자 게시판 관리에 적립 포인트 입력

**Files:**
- Modify: `apps/web/src/app/moderator/community-boards/page.tsx` (게시판 추가/수정 폼 391·405 mutation 부근)

**Interfaces:**
- Consumes: `orpc.bambi.communityBoards.create/update`가 받는 `postPoints`/`commentPoints` (Task 6).

- [ ] **Step 1: 폼에 포인트 입력 추가**

게시판 추가/수정 다이얼로그의 폼에 "글 포인트"·"댓글 포인트" 숫자 입력을 추가한다(shadcn `Field` + `Input type="number"`). 제출 payload에 `postPoints`·`commentPoints`(number)를 실어 `create`/`update` mutation에 넘긴다. 수정 시 기존 값으로 초기화(`board.postPoints`/`board.commentPoints`, `list`가 select all이라 이미 내려옴).

```tsx
<Field>
	<FieldLabel htmlFor="post-points">글 작성 포인트</FieldLabel>
	<Input id="post-points" type="number" min={0} value={postPoints}
		onChange={(e) => setPostPoints(Number(e.target.value))} />
</Field>
<Field>
	<FieldLabel htmlFor="comment-points">댓글 작성 포인트</FieldLabel>
	<Input id="comment-points" type="number" min={0} value={commentPoints}
		onChange={(e) => setCommentPoints(Number(e.target.value))} />
</Field>
```

- [ ] **Step 2: 타입체크 + 린트 + 커밋**

```bash
cd apps/web && pnpm check-types
pnpm dlx ultracite fix apps/web/src/app/moderator/community-boards/page.tsx
git add apps/web/src/app/moderator/community-boards/page.tsx
git commit -m "feat: 운영자 게시판 관리에 글·댓글 적립 포인트 입력"
```

---

## Task 13: 운영자 사용자 목록에 등급 표시

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts` (`listUsers` 1780~, 반환 매핑)
- Modify: `apps/web/src/app/moderator/users/page.tsx`

**Interfaces:**
- Consumes: `loadGradeBadges`·`getPointBalances` (Task 2).
- Produces: `listUsers` 각 행에 `pointBalance: number`, `grade: GradeBadge | null`.

- [ ] **Step 1: listUsers 응답에 잔액·등급 추가**

`moderation.ts`의 `listUsers` 핸들러가 페이지의 사용자 행을 만든 뒤, 그 userId들로 잔액·등급을 배치 조회해 각 행에 싣는다:

```ts
import {
	getPointBalances,
	loadGradeBadges,
} from "../../services/bambi-member-points";
// ...핸들러 안, 행 조회 후:
const userIds = rows.map((row) => row.userId);
const [balances, badges] = await Promise.all([
	getPointBalances(userIds),
	loadGradeBadges(userIds),
]);
return rows.map((row) => ({
	...row,
	pointBalance: balances.get(row.userId) ?? 0,
	grade: badges.get(row.userId) ?? null,
}));
```

> `listUsers`의 행이 `userId` 필드를 갖는지 확인(대개 `bambiProfile`/`user` 조인). 없으면 select에 추가한다.

- [ ] **Step 2: 사용자 목록에 등급 컬럼**

`moderator/users/page.tsx`의 사용자 테이블에 "등급"·"포인트" 셀을 추가한다:

```tsx
<TableCell><GradeBadge grade={user.grade} /></TableCell>
<TableCell className="tabular-nums">{user.pointBalance.toLocaleString()}P</TableCell>
```

- [ ] **Step 3: 타입체크 + 린트 + 커밋**

```bash
cd packages/api && pnpm check-types && cd ../../apps/web && pnpm check-types
pnpm dlx ultracite fix packages/api/src/routers/bambi/moderation.ts apps/web/src/app/moderator/users/page.tsx
git add packages/api/src/routers/bambi/moderation.ts apps/web/src/app/moderator/users/page.tsx
git commit -m "feat: 운영자 사용자 목록에 회원 등급·포인트 표시"
```

---

## 마무리 검증 (모든 태스크 후)

- [ ] `cd packages/api && pnpm check-types` — PASS
- [ ] `cd apps/web && pnpm check-types` — PASS
- [ ] `cd packages/api && pnpm exec vitest run test/services/bambi-member-points.test.ts` — PASS
- [ ] `pnpm dlx ultracite fix <바뀐 파일 전체>` — clean
- [ ] **라우터 스위트는 실행하지 않는다.**
- [ ] 사용자 dev 수동 확인 항목: (1) free 게시판 회원 글 작성 → 잔액 +100, (2) 그 글 삭제 → 잔액 −100(순합계 0), (3) 운영자 숨김 → 회수, 복구 → 재적립, (4) 게스트 글은 적립 없음, (5) 누적 1000P 도달 시 '일반' 뱃지, (6) 운영자 등급 관리·게시판 포인트 편집 반영, (7) 사용자 목록 등급 컬럼.
- [ ] DB: 사용자 지시로 `drizzle-kit generate`(0091) 후 시드 append, `migrate` 적용 검증.

## 후속(이번 범위 밖)

- 구직자 채팅 시작 적립, 구인자 채용 성사 적립 — `reconcileContentPoints`/`applyPointDelta` 패턴에 `reason`만 추가.
- 등급 뱃지 시각(색·아이콘·대비) frontend-design 다듬기.
- 잔액→등급 캐시(성능 필요 시).
