# 포인트몰 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 적립 포인트로 아이템을 구매하는 포인트몰(공개 목록·회원 구매·운영자 아이템/주문 관리)을 추가한다.

**Architecture:** 기존 포인트 원장(`bambi_point_transaction`)에 구매(−)/환불(+) reason 2종을 추가하고 아이템·주문 테이블 2개를 신설한다. 등급 산식은 포인트몰 reason 제외 합계로 분리한다. 페이지는 `/seeker/*` 게이트 제약 때문에 최상위 `/point-shop`(공개, `/support` layout 선례)으로 두고, 운영자 콘솔에 `/moderator/point-shop`을 신설한다.

**Tech Stack:** Drizzle(pg) · oRPC · Next.js App Router · shadcn(base-ui)+Tailwind · vitest

**Spec:** `docs/superpowers/specs/2026-08-19-point-shop-design.md`

## Global Constraints

- UI는 shadcn(`@bambi-app/ui/components`)+Tailwind만, 인라인 style 금지, raw hex 금지, `space-*` 금지(`gap-*`), 임의 px(`[Npx]`) 금지 — 크기는 스케일 토큰·aspect·grid로.
- base-ui 레포: 커스텀 트리거는 `asChild`가 아니라 `render` prop. `render`가 `<Button>`이면 `nativeButton` 생략, Link/Input 등 비-button 렌더에만 `nativeButton={false}`.
- DB enum/status 원값 화면 노출 금지 — 라벨 맵(`*Label()` + 중립 폴백) 경유.
- 운영자 가드는 `adminProcedure`(`packages/api/src/index.ts`) — `moderatorProcedure`는 존재하지 않는다.
- `db:push` 절대 금지. 마이그레이션은 `pnpm --filter @bambi-app/db db:generate` → SQL 검토 → dev `db:migrate` → 적용 검증.
- 라우터 테스트 신설 금지(dev DB 파괴 함정). api 테스트는 `packages/api/test/services`만, web 테스트는 `apps/web/test` 미러 구조 + `srcPath` 헬퍼.
- 빌드·dev 서버 기동·스크린샷 금지. 검증은 lint(ultracite, **경로 인자 필수**)+typecheck+유닛 테스트.
- pnpm 필터명: db/api는 `@bambi-app/db`·`@bambi-app/api`, web은 스코프 없는 `web`.
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(빈 줄 없음). 커밋은 컨트롤러가 순차 수행 — 서브에이전트는 git 조작 금지.
- 파일 줄바꿈 LF.

---

### Task 1: DB 스키마 + 마이그레이션 (0096)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (bambiMemberGrade 정의 블록 뒤, 약 L1905 이후)
- Create(generate): `packages/db/src/migrations/0096_*.sql` + meta 스냅샷

**Interfaces:**
- Produces: `bambiPointShopItem`, `bambiPointShopOrder` 테이블 객체 (`@bambi-app/db/schema/bambi`에서 import 가능)

- [ ] **Step 1: 스키마 추가**

`bambi.ts`의 `bambiMemberGrade` 테이블 정의 블록(주석 포함) 바로 아래에 추가:

```ts
// 포인트몰 판매 아이템. 재고 수량은 두지 않는다 — 주문이 운영자 수동 이행이라 품절 시
// 노출을 끄거나 주문을 취소하면 되고, 필요해지면 후속으로 추가한다.
export const bambiPointShopItem = pgTable("bambi_point_shop_item", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	imageUrl: text("image_url"),
	pricePoints: integer("price_points").notNull(),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 포인트몰 주문. 아이템이 삭제돼도 주문·차감 근거가 남아야 해서 이름·가격을 구매 시점
// 스냅샷으로 저장하고 item_id는 set null로 둔다. status는 pending → completed | canceled
// (취소 시 원장에 환불 + 행). 전이 가드는 라우터의 resolveOrderTransition이 담당한다.
export const bambiPointShopOrder = pgTable(
	"bambi_point_shop_order",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		itemId: uuid("item_id").references(() => bambiPointShopItem.id, {
			onDelete: "set null",
		}),
		itemName: text("item_name").notNull(),
		pricePoints: integer("price_points").notNull(),
		status: text("status").notNull().default("pending"),
		operatorMemo: text("operator_memo"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		processedAt: timestamp("processed_at"),
	},
	(table) => [
		// 내 구매 내역(사용자별 최신순)과 운영자 대기 필터가 각각 훑는다.
		index("bambi_point_shop_order_user_id_idx").on(table.userId),
		index("bambi_point_shop_order_status_idx").on(table.status),
	]
);
```

`pgTable`·`uuid`·`text`·`integer`·`boolean`·`timestamp`·`index`·`user` import는 파일 상단에 이미 있다(없는 것만 추가).

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: `0096_*.sql` 생성 — CREATE TABLE 2건 + 인덱스 2건 + FK. SQL을 열어 컬럼·인덱스가 위 스키마와 일치하는지 검토.

- [ ] **Step 3: dev DB 적용 + 검증**

Run: `pnpm --filter @bambi-app/db db:migrate`
Expected: 0096 적용 로그, exit 0. 이어 `pnpm --filter @bambi-app/db db:generate` 재실행 시 "No schema changes" 확인(스키마-마이그레이션 정합).

- [ ] **Step 4: typecheck**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: PASS

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 포인트몰 아이템·주문 테이블 추가 (0096)`

---

### Task 2: 포인트 규칙 — 등급 산식 분리

**Files:**
- Modify: `packages/api/src/services/bambi-member-points.ts`
- Modify: `packages/api/src/routers/bambi/attendance.ts` (getMine의 등급 인자만)

**Interfaces:**
- Produces: `POINT_SHOP_REASONS = { purchase: "point_shop_purchase", refund: "point_shop_refund" }`, `getGradeBasisPoints(userIds: string[]): Promise<Map<string, number>>`
- 불변: `getPointBalances`(잔액=전체 합계)·`loadGradeBadges` 시그니처 유지(내부만 교체), attendance 응답 필드 유지

- [ ] **Step 1: reason 상수 + 등급 기준 합계 함수**

`bambi-member-points.ts`의 `POINT_REASONS` 아래에 추가:

```ts
// 포인트몰 구매·환불 reason. 등급 계산에서 제외한다 — 구매(−)·환불(+)이 등급에 중립이어야
// 하고, 글/댓글 회수(*_revoke, 음수)는 기존대로 등급에서 빠진다("양수만 합산"이면 회수가
// 등급에 반영되지 않는 함정이 있어 reason 제외 방식을 쓴다).
export const POINT_SHOP_REASONS = {
	purchase: "point_shop_purchase",
	refund: "point_shop_refund",
} as const;

const GRADE_EXCLUDED_REASONS = [
	POINT_SHOP_REASONS.purchase,
	POINT_SHOP_REASONS.refund,
];
```

`getPointBalances` 아래에 추가(drizzle `and`·`notInArray` import 추가):

```ts
// DB: 여러 회원의 등급 기준 포인트 = 포인트몰 reason 제외 원장 합계. 잔액(전체 합계)과
// 구분된다. 결과에 없는 userId는 0으로 취급한다.
export async function getGradeBasisPoints(
	userIds: string[]
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	const unique = [...new Set(userIds)];
	if (unique.length === 0) {
		return map;
	}
	const rows = await db
		.select({
			userId: bambiPointTransaction.userId,
			basis: sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`,
		})
		.from(bambiPointTransaction)
		.where(
			and(
				inArray(bambiPointTransaction.userId, unique),
				notInArray(bambiPointTransaction.reason, GRADE_EXCLUDED_REASONS)
			)
		)
		.groupBy(bambiPointTransaction.userId);
	for (const row of rows) {
		map.set(row.userId, row.basis);
	}
	return map;
}
```

- [ ] **Step 2: loadGradeBadges 내부 교체**

`loadGradeBadges`의 `getPointBalances(unique)` 호출을 `getGradeBasisPoints(unique)`로 교체(변수명 `balances`는 `basisPoints`로 정리). `resolveGrade(basisPoints.get(userId) ?? 0, grades)`.

- [ ] **Step 3: attendance getMine 등급 인자 교체**

`attendance.ts`에서 `resolveGrade(`·`nextGrade(` 호출부를 전수 grep. getMine이 잔액(`pointBalanceSql`)을 등급 인자로 쓰고 있으면, 같은 select에 컬럼 추가:

```ts
// 등급 기준 합계 — 포인트몰 구매·환불 제외(bambi-member-points GRADE_EXCLUDED_REASONS와 동일 규칙).
const gradeBasisSql = sql<number>`coalesce(sum(${bambiPointTransaction.amount}) filter (where ${bambiPointTransaction.reason} not in (${POINT_SHOP_REASONS.purchase}, ${POINT_SHOP_REASONS.refund})), 0)::int`;
```

`resolveGrade`/`nextGrade`/`pointsToNext` 계산 인자만 gradeBasis로 교체하고, 응답의 `pointBalance`는 기존 잔액 그대로 둔다. `POINT_SHOP_REASONS`를 `../../services/bambi-member-points`에서 import. (moderation.ts 회원 목록은 잔액=`getPointBalances`·등급=`loadGradeBadges`라 Step 2로 자동 반영 — 수정 금지. community.ts 뱃지도 동일.)

- [ ] **Step 4: typecheck**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 등급 산식을 포인트몰 제외 합계로 분리`

---

### Task 3: point-shop 순수 서비스 (TDD)

**Files:**
- Create: `packages/api/src/services/bambi-point-shop.ts`
- Test: `packages/api/test/services/bambi-point-shop.test.ts`

**Interfaces:**
- Produces: `POINT_SHOP_LOCK_NAMESPACE: number`, `acquirePointShopUserLock(executor, userId)`, `POINT_SHOP_PURCHASE_ROLES: Set<string>`, `resolvePurchase({ balance, isActive, pricePoints })`, `POINT_SHOP_ORDER_STATUSES`, `type PointShopOrderStatus`, `resolveOrderTransition(current, action)`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, it, vi } from "vitest";
import {
	acquirePointShopUserLock,
	POINT_SHOP_LOCK_NAMESPACE,
	resolveOrderTransition,
	resolvePurchase,
} from "../../src/services/bambi-point-shop";

describe("resolvePurchase", () => {
	it("잔액이 가격 이상이고 노출 중이면 허용한다", () => {
		expect(
			resolvePurchase({ balance: 100, isActive: true, pricePoints: 100 })
		).toEqual({ ok: true });
	});
	it("비노출 아이템은 잔액과 무관하게 거부한다", () => {
		expect(
			resolvePurchase({ balance: 999, isActive: false, pricePoints: 10 })
		).toEqual({ code: "inactive", ok: false });
	});
	it("잔액 부족이면 거부한다", () => {
		expect(
			resolvePurchase({ balance: 99, isActive: true, pricePoints: 100 })
		).toEqual({ code: "insufficient", ok: false });
	});
});

describe("resolveOrderTransition", () => {
	it("pending → complete는 환불 없이 completed", () => {
		expect(resolveOrderTransition("pending", "complete")).toEqual({
			next: "completed",
			refund: false,
		});
	});
	it("pending → cancel은 환불 동반 canceled", () => {
		expect(resolveOrderTransition("pending", "cancel")).toEqual({
			next: "canceled",
			refund: true,
		});
	});
	it("이미 처리된 주문은 재전이를 거부한다(멱등 가드)", () => {
		expect(resolveOrderTransition("completed", "cancel")).toBeNull();
		expect(resolveOrderTransition("canceled", "complete")).toBeNull();
	});
});

describe("acquirePointShopUserLock", () => {
	it("네임스페이스+사용자 해시 2-인자 advisory lock SQL을 실행한다", async () => {
		const execute = vi.fn().mockResolvedValue(undefined);
		await acquirePointShopUserLock({ execute }, "user-1");
		expect(execute).toHaveBeenCalledTimes(1);
		const query = execute.mock.calls[0][0];
		const sqlText = JSON.stringify(query);
		expect(sqlText).toContain("pg_advisory_xact_lock");
		expect(sqlText).toContain("hashtext");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

```ts
import type { db } from "@bambi-app/db";
import { sql } from "drizzle-orm";

// pg_advisory_xact_lock(int4, int4) 네임스페이스 키. 프리미엄(918_273_645)·리스팅
// (918_273_646·647)과 겹치지 않는 다음 값. 두 번째 인자는 hashtext(user_id) — 잔액이
// 원장 합산이라 FOR UPDATE를 걸 단일 행이 없어 계정 단위로 구매를 직렬화한다
// (attendance.ts adminAdjustPoints 주석이 예고한 "자동 차감" 케이스가 이것이다).
export const POINT_SHOP_LOCK_NAMESPACE = 918_273_648;

type QueryExecutor = Pick<typeof db, "execute">;

// xact 스코프라 반드시 트랜잭션 안에서 호출해야 커밋 시 해제된다(정원 락과 동일 패턴).
export const acquirePointShopUserLock = async (
	executor: QueryExecutor,
	userId: string
): Promise<void> => {
	await executor.execute(
		sql`select pg_advisory_xact_lock(${POINT_SHOP_LOCK_NAMESPACE}, hashtext(${userId}))`
	);
};

// 구매 가능 역할 허용 목록(attendance와 같은 화이트리스트 관례 — 새 역할은 기본 거부).
export const POINT_SHOP_PURCHASE_ROLES = new Set<string>([
	"job_seeker",
	"employer",
]);

export type PurchaseDenial = "inactive" | "insufficient";

// 순수: 아이템 노출 상태·잔액으로 구매 가부 판정.
export function resolvePurchase(args: {
	balance: number;
	isActive: boolean;
	pricePoints: number;
}): { ok: true } | { code: PurchaseDenial; ok: false } {
	if (!args.isActive) {
		return { code: "inactive", ok: false };
	}
	if (args.balance < args.pricePoints) {
		return { code: "insufficient", ok: false };
	}
	return { ok: true };
}

export const POINT_SHOP_ORDER_STATUSES = [
	"pending",
	"completed",
	"canceled",
] as const;
export type PointShopOrderStatus = (typeof POINT_SHOP_ORDER_STATUSES)[number];

// 순수: 주문 전이 가드 — pending에서만 완료/취소 가능. 취소는 환불 원장(+)을 동반한다.
// pending이 아니면 null(멱등 — 완료↔취소 재전이 금지).
export function resolveOrderTransition(
	current: string,
	action: "cancel" | "complete"
): { next: PointShopOrderStatus; refund: boolean } | null {
	if (current !== "pending") {
		return null;
	}
	if (action === "complete") {
		return { next: "completed", refund: false };
	}
	return { next: "canceled", refund: true };
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit** (컨트롤러) — `feat: 포인트몰 구매·주문 전이 순수 로직 + 사용자 락`

---

### Task 4: point-shop 라우터 + 등록

**Files:**
- Create: `packages/api/src/routers/bambi/point-shop.ts`
- Modify: `packages/api/src/routers/bambi/index.ts` (import·타입 주석·객체 리터럴 3곳, 알파벳순 organizations 뒤/promotions 앞)

**Interfaces:**
- Produces(클라이언트에서 `orpc.bambi.pointShop.*`):
  - `listItems()` public → `{ id, name, description, imageUrl, pricePoints }[]` (active만, sortOrder asc·createdAt asc)
  - `getMyBalance()` protected → `{ pointBalance: number }`
  - `purchase({ itemId: uuid })` protected(job_seeker·employer) → `{ orderId, pointBalance }`
  - `myOrders()` protected → `{ id, itemName, pricePoints, status, operatorMemo, createdAt, processedAt }[]` 최신순
  - `adminListItems()` admin → 아이템 전체(비노출 포함)
  - `createItem / updateItem / removeItem` admin
  - `adminListOrders({ status? })` admin → 주문 + `{ buyerName, buyerEmail }`
  - `completeOrder({ orderId })` / `cancelOrder({ orderId, memo? })` admin

- [ ] **Step 1: 라우터 작성**

```ts
import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	bambiPointShopItem,
	bambiPointShopOrder,
	bambiPointTransaction,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure, publicProcedure } from "../../index";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "../../services/bambi-authz";
import { POINT_SHOP_REASONS } from "../../services/bambi-member-points";
import {
	acquirePointShopUserLock,
	POINT_SHOP_ORDER_STATUSES,
	POINT_SHOP_PURCHASE_ROLES,
	resolveOrderTransition,
	resolvePurchase,
} from "../../services/bambi-point-shop";

// 잔액은 원장 합산(잔액 컬럼 없음 — attendance.ts와 동일 규칙).
const pointBalanceSql = sql<number>`coalesce(sum(${bambiPointTransaction.amount}), 0)::int`;

const PURCHASE_DENIAL_MESSAGES = {
	inactive: "판매가 종료된 아이템입니다.",
	insufficient: "보유 포인트가 부족합니다.",
} as const;

const requirePurchaseProfile = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);
	if (!POINT_SHOP_PURCHASE_ROLES.has(profile.role)) {
		throw new ORPCError("FORBIDDEN", {
			message: "포인트몰 구매는 구직자·업소 회원만 이용할 수 있어요.",
		});
	}
	return profile;
};

const itemFields = {
	id: bambiPointShopItem.id,
	name: bambiPointShopItem.name,
	description: bambiPointShopItem.description,
	imageUrl: bambiPointShopItem.imageUrl,
	pricePoints: bambiPointShopItem.pricePoints,
};

const itemInput = z.object({
	description: z.string().trim().max(500).nullable().optional(),
	imageUrl: z.string().trim().url().max(600).nullable().optional(),
	isActive: z.boolean(),
	name: z.string().trim().min(1).max(60),
	pricePoints: z.number().int().min(1).max(10_000_000),
	sortOrder: z.number().int().min(0).max(100_000),
});

export const pointShopRouter = {
	listItems: publicProcedure.handler(async () =>
		db
			.select(itemFields)
			.from(bambiPointShopItem)
			.where(eq(bambiPointShopItem.isActive, true))
			.orderBy(asc(bambiPointShopItem.sortOrder), asc(bambiPointShopItem.createdAt))
	),

	getMyBalance: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		const [row] = await db
			.select({ pointBalance: pointBalanceSql })
			.from(bambiPointTransaction)
			.where(eq(bambiPointTransaction.userId, profile.userId));
		return { pointBalance: row?.pointBalance ?? 0 };
	}),

	purchase: protectedProcedure
		.input(z.object({ itemId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const profile = await requirePurchaseProfile(context.session);
			return await db.transaction(async (tx) => {
				// 잔액이 원장 합산이라 FOR UPDATE 불가 — 계정 단위 advisory lock으로
				// "합산 조회→검증→차감"을 한 번에 한 구매만 진행시킨다.
				await acquirePointShopUserLock(tx, profile.userId);
				const [item] = await tx
					.select()
					.from(bambiPointShopItem)
					.where(eq(bambiPointShopItem.id, input.itemId))
					.limit(1);
				if (!item) {
					throw new ORPCError("NOT_FOUND", {
						message: "아이템을 찾을 수 없습니다.",
					});
				}
				const [balanceRow] = await tx
					.select({ pointBalance: pointBalanceSql })
					.from(bambiPointTransaction)
					.where(eq(bambiPointTransaction.userId, profile.userId));
				const balance = balanceRow?.pointBalance ?? 0;
				const verdict = resolvePurchase({
					balance,
					isActive: item.isActive,
					pricePoints: item.pricePoints,
				});
				if (!verdict.ok) {
					throw new ORPCError("BAD_REQUEST", {
						message: PURCHASE_DENIAL_MESSAGES[verdict.code],
					});
				}
				const [order] = await tx
					.insert(bambiPointShopOrder)
					.values({
						itemId: item.id,
						itemName: item.name,
						pricePoints: item.pricePoints,
						userId: profile.userId,
					})
					.returning({ id: bambiPointShopOrder.id });
				await tx.insert(bambiPointTransaction).values({
					amount: -item.pricePoints,
					reason: POINT_SHOP_REASONS.purchase,
					userId: profile.userId,
				});
				return {
					orderId: order?.id,
					pointBalance: balance - item.pricePoints,
				};
			});
		}),

	myOrders: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireActiveBambiProfile(context.session);
		return db
			.select({
				id: bambiPointShopOrder.id,
				itemName: bambiPointShopOrder.itemName,
				pricePoints: bambiPointShopOrder.pricePoints,
				status: bambiPointShopOrder.status,
				operatorMemo: bambiPointShopOrder.operatorMemo,
				createdAt: bambiPointShopOrder.createdAt,
				processedAt: bambiPointShopOrder.processedAt,
			})
			.from(bambiPointShopOrder)
			.where(eq(bambiPointShopOrder.userId, profile.userId))
			.orderBy(desc(bambiPointShopOrder.createdAt));
	}),

	adminListItems: adminProcedure.handler(async () =>
		db
			.select()
			.from(bambiPointShopItem)
			.orderBy(asc(bambiPointShopItem.sortOrder), asc(bambiPointShopItem.createdAt))
	),

	createItem: adminProcedure.input(itemInput).handler(async ({ input }) => {
		const [created] = await db
			.insert(bambiPointShopItem)
			.values({
				description: input.description ?? null,
				imageUrl: input.imageUrl ?? null,
				isActive: input.isActive,
				name: input.name,
				pricePoints: input.pricePoints,
				sortOrder: input.sortOrder,
			})
			.returning({ id: bambiPointShopItem.id });
		return created;
	}),

	updateItem: adminProcedure
		.input(itemInput.extend({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			const [updated] = await db
				.update(bambiPointShopItem)
				.set({
					description: input.description ?? null,
					imageUrl: input.imageUrl ?? null,
					isActive: input.isActive,
					name: input.name,
					pricePoints: input.pricePoints,
					sortOrder: input.sortOrder,
					updatedAt: new Date(),
				})
				.where(eq(bambiPointShopItem.id, input.id))
				.returning({ id: bambiPointShopItem.id });
			if (!updated) {
				throw new ORPCError("NOT_FOUND", {
					message: "아이템을 찾을 수 없습니다.",
				});
			}
			return updated;
		}),

	removeItem: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ input }) => {
			// 주문은 스냅샷(item_name·price_points)을 들고 있고 FK가 set null이라 삭제해도
			// 구매 내역·환불 근거가 남는다.
			const [removed] = await db
				.delete(bambiPointShopItem)
				.where(eq(bambiPointShopItem.id, input.id))
				.returning({ id: bambiPointShopItem.id });
			if (!removed) {
				throw new ORPCError("NOT_FOUND", {
					message: "아이템을 찾을 수 없습니다.",
				});
			}
			return removed;
		}),

	adminListOrders: adminProcedure
		.input(
			z.object({ status: z.enum(POINT_SHOP_ORDER_STATUSES).optional() })
		)
		.handler(async ({ input }) => {
			const base = db
				.select({
					id: bambiPointShopOrder.id,
					itemName: bambiPointShopOrder.itemName,
					pricePoints: bambiPointShopOrder.pricePoints,
					status: bambiPointShopOrder.status,
					operatorMemo: bambiPointShopOrder.operatorMemo,
					createdAt: bambiPointShopOrder.createdAt,
					processedAt: bambiPointShopOrder.processedAt,
					buyerName: user.name,
					buyerEmail: user.email,
				})
				.from(bambiPointShopOrder)
				.leftJoin(user, eq(bambiPointShopOrder.userId, user.id))
				.orderBy(desc(bambiPointShopOrder.createdAt));
			if (input.status) {
				return base.where(eq(bambiPointShopOrder.status, input.status));
			}
			return base;
		}),

	completeOrder: adminProcedure
		.input(z.object({ orderId: z.string().uuid() }))
		.handler(async ({ input }) =>
			db.transaction(async (tx) => {
				const [order] = await tx
					.select()
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1)
					.for("update");
				if (!order) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				const transition = resolveOrderTransition(order.status, "complete");
				if (!transition) {
					throw new ORPCError("CONFLICT", {
						message: "이미 처리된 주문입니다.",
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({ processedAt: new Date(), status: transition.next })
					.where(eq(bambiPointShopOrder.id, order.id));
				return { id: order.id, status: transition.next };
			})
		),

	cancelOrder: adminProcedure
		.input(
			z.object({
				memo: z.string().trim().max(300).optional(),
				orderId: z.string().uuid(),
			})
		)
		.handler(async ({ input }) =>
			db.transaction(async (tx) => {
				// 주문 행 FOR UPDATE로 완료/취소 동시 처리를 직렬화한다(중복 환불 방지).
				const [order] = await tx
					.select()
					.from(bambiPointShopOrder)
					.where(eq(bambiPointShopOrder.id, input.orderId))
					.limit(1)
					.for("update");
				if (!order) {
					throw new ORPCError("NOT_FOUND", {
						message: "주문을 찾을 수 없습니다.",
					});
				}
				const transition = resolveOrderTransition(order.status, "cancel");
				if (!transition) {
					throw new ORPCError("CONFLICT", {
						message: "이미 처리된 주문입니다.",
					});
				}
				await tx
					.update(bambiPointShopOrder)
					.set({
						operatorMemo: input.memo ?? null,
						processedAt: new Date(),
						status: transition.next,
					})
					.where(eq(bambiPointShopOrder.id, order.id));
				if (transition.refund) {
					await tx.insert(bambiPointTransaction).values({
						amount: order.pricePoints,
						reason: POINT_SHOP_REASONS.refund,
						userId: order.userId,
					});
				}
				return { id: order.id, status: transition.next };
			})
		),
};
```

- [ ] **Step 2: index.ts 등록**

`packages/api/src/routers/bambi/index.ts` 세 곳(알파벳순 위치): `import { pointShopRouter } from "./point-shop";` / 타입 주석 `pointShop: typeof pointShopRouter;` / 객체 `pointShop: pointShopRouter,`.

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: PASS

- [ ] **Step 4: Commit** (컨트롤러) — `feat: 포인트몰 라우터(목록·구매·내역·운영자 CRUD/주문 처리)`

---

### Task 5: 미들웨어 게이트 공개 경로 (TDD)

**Files:**
- Modify: `apps/web/src/lib/bambi/resolve-gate.ts` (`PUBLIC_PREFIXES`)
- Test: `apps/web/test/lib/bambi/resolve-gate.test.ts` (기존 파일에 케이스 추가)

- [ ] **Step 1: 실패하는 테스트 추가** — 기존 테스트 스타일에 맞춰:

```ts
it("포인트몰은 세션 없는 방문자(anon·guest)도 통과한다", () => {
	expect(
		resolveGate({
			hasSession: false,
			isCommunityGuest: false,
			isGuest: false,
			pathname: "/point-shop",
		})
	).toEqual({ type: "next" });
	expect(
		resolveGate({
			hasSession: false,
			isCommunityGuest: false,
			isGuest: true,
			pathname: "/point-shop",
		})
	).toEqual({ type: "next" });
});
```

- [ ] **Step 2: 실패 확인** — Run: `cd apps/web && pnpm vitest run test/lib/bambi/resolve-gate.test.ts` → FAIL(redirect 반환)

- [ ] **Step 3: 구현** — `PUBLIC_PREFIXES` 배열에 `"/point-shop"` 추가(주석: `// 포인트몰 — 목록 공개, 구매만 로그인(버튼에서 유도)`).

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. `apps/web/test/app/seeker/auth-gate-routing.test.ts`도 실행해 회귀 없음 확인.

- [ ] **Step 5: Commit** (컨트롤러) — `feat: /point-shop 공개 경로 개방`

---

### Task 6: SupportChatWidget 외부 열기 이벤트

**Files:**
- Modify: `apps/web/src/components/bambi/support-chat/support-chat-widget.tsx`

**Interfaces:**
- Produces: `export const SUPPORT_CHAT_OPEN_EVENT = "bambi:support-chat-open"` — `window.dispatchEvent(new Event(SUPPORT_CHAT_OPEN_EVENT))`로 패널 열기

- [ ] **Step 1: 구현** — `CHAT_ROOM_PATH` 상수(L37-40) 근처에 이벤트명 export, `openPanel`(useCallback, L229-233) 바로 아래에 리스너 추가(기존 `SUPPORT_CHAT_ANCHOR_EVENT` 선례와 동일 패턴):

```tsx
// 외부(포인트몰 1:1 상담 버튼 등)에서 위젯 패널을 여는 커스텀 이벤트.
export const SUPPORT_CHAT_OPEN_EVENT = "bambi:support-chat-open";
```

```tsx
	useEffect(() => {
		window.addEventListener(SUPPORT_CHAT_OPEN_EVENT, openPanel);
		return () => window.removeEventListener(SUPPORT_CHAT_OPEN_EVENT, openPanel);
	}, [openPanel]);
```

주의: hidden 화면(운영자·/board·/jobs·채팅방·?auth=)에선 dispatch해도 패널이 안 뜬다 — `/point-shop`은 hidden 조건에 해당하지 않아 문제없다.

- [ ] **Step 2: typecheck** — Run: `pnpm --filter web check-types` (워크트리 오탐 시 해당 파일 무관 오류인지 확인)

- [ ] **Step 3: Commit** (컨트롤러) — `feat: 문의 위젯 외부 열기 이벤트 추가`

---

### Task 7: /point-shop 라우트·layout·nav (UI)

**Files:**
- Create: `apps/web/src/app/point-shop/layout.tsx`
- Create: `apps/web/src/app/point-shop/page.tsx`
- Create: `apps/web/src/components/bambi/point-shop/point-balance-chip.tsx`
- Create: `apps/web/src/components/bambi/point-shop/consult-button.tsx`
- Modify: `apps/web/src/components/bambi/seeker-app-shell.tsx` (`SeekerHeaderSearch`에 `export` 추가)
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx` (`DEFAULT_NAV_ITEMS` 수다방·고객센터 사이에 `{ href: "/point-shop" as Route, label: "포인트몰" }`)
- Modify: `apps/web/src/components/bambi/mobile-tab-bar.tsx` (`value = "none"` 분기 조건에 `|| path.startsWith("/point-shop")` 추가)

**Interfaces:**
- Consumes: `orpc.bambi.pointShop.getMyBalance`(Task 4), `SUPPORT_CHAT_OPEN_EVENT`(Task 6)
- Produces: layout이 Task 8의 `PointShopScreen`(children)을 3컬럼 골격·헤더 슬롯과 함께 렌더

- [ ] **Step 1: layout 작성** — `apps/web/src/app/support/layout.tsx`를 열어 그 구조(ResponsiveAppShell `variant="seeker"` + `contentWidthClassName={APP_CONTENT_MAX_W}` + 좌/우 rail aside + `MobileTabBar homeHref="/seeker"`)를 그대로 따르되:
  - promotionSurface는 `point_shop_left`/`point_shop_right`
  - `headerSlot={<div className="flex w-full items-center gap-3"><PointBalanceChip /><SeekerHeaderSearch withHotkey /></div>}`, `mobileHeaderSlot={<PointBalanceChip />}` (모바일 헤더는 공간이 좁아 칩만; 검색은 데스크톱 전용)
  - 우측 aside의 `AdBannerRail` 바로 아래 `<PointShopConsultButton />`
  - 중앙 컨텐츠 폭은 `SEEKER_CONTENT_WIDTH`
- [ ] **Step 2: 칩·상담 버튼 작성**

`point-balance-chip.tsx` — 회원에게만: `authClient.useSession()`으로 세션 없으면 null 반환; `useQuery({ ...orpc.bambi.pointShop.getMyBalance.queryOptions(), enabled: Boolean(session) })`; 렌더는 `Badge`(shadcn)로 `{data.pointBalance.toLocaleString("ko-KR")}P`, 로딩 중 `Skeleton`.

`consult-button.tsx` — `"use client"`; `Button variant="outline" className="w-full"` + 클릭 시 `window.dispatchEvent(new Event(SUPPORT_CHAT_OPEN_EVENT))`; 라벨 "1:1 상담".

- [ ] **Step 3: page.tsx** — RSC, Task 8의 `<PointShopScreen />`만 렌더(Task 8 전까지는 임시로 `null` 반환 후 Task 8에서 교체하지 말고, Task 8과 같은 브랜치에서 이어서 작업하므로 바로 import 해도 된다 — 순서상 Task 8을 같은 에이전트가 이어서 구현).
- [ ] **Step 4: nav 2곳 수정** — DEFAULT_NAV_ITEMS 삽입, mobile-tab-bar "none" 분기.
- [ ] **Step 5: Commit** (컨트롤러) — Task 8과 합쳐 커밋

---

### Task 8: 포인트몰 화면 (UI)

**Files:**
- Create: `apps/web/src/components/bambi/point-shop/point-shop-screen.tsx`
- Create: `apps/web/src/components/bambi/point-shop/item-card.tsx` (screen 파일이 커지면 분리, 아니면 screen 내 함수 컴포넌트)
- Modify: `apps/web/test/components/bambi/ga-promotion-wiring.test.ts` (`SURFACES`에 point_shop 3면 항목 추가 — 선택이 아닌 포함으로 계측 고정)

**Interfaces:**
- Consumes: `orpc.bambi.pointShop.listItems / purchase / getMyBalance`, `useAdBannerJobs().premiumBanner`, `PremiumAdBannerSection`(promotionSurface `point_shop_center`), `useBambiAuth`

- [ ] **Step 1: 화면 구현** — `"use client"`. 구성(위→아래):
  1. `PremiumAdBannerSection`(`items={adBanners.premiumBanner}`, `promotionSurface="point_shop_center"`, `className="mb-6"`)
  2. 섹션 헤더: `<h2 className="m-0 font-extrabold text-lg">포인트 아이템</h2>` (잔액은 헤더 칩으로 일원화 — 여기 중복 표시 금지)
  3. 아이템 그리드: `grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4` — 카드는 `aspect-square` 정사각(임의 px 금지; xl 4열이면 자연히 약 259×259). 카드 내용: 이미지(`imageUrl` 있으면 cover, 없으면 브랜드 톤 자리표시), 이름(truncate), 가격 `Badge`(`{pricePoints.toLocaleString("ko-KR")}P`).
  4. 로딩: 그리드 한 행 `Skeleton` aspect-square 4장(모바일 1·lg 3·xl 4 — visual-job-exposure-sections.tsx의 `cardPlaceholderClass` breakpoint 규칙 참고). 빈 상태: `Empty`(shadcn) — "준비 중인 아이템이 없어요".
  5. 구매 Dialog: 카드 클릭 → `Dialog`(이미지·이름·설명·가격·내 잔액) → 확인 버튼. 잔액 부족 시 버튼 disabled + "포인트가 {부족분}P 부족해요" 안내. 성공 시 `toast.success` + `queryClient.invalidateQueries({ queryKey: orpc.bambi.pointShop.key() })`.
  6. 비회원 처리: `authClient.useSession()` 세션 없음(anon·guest 공통) 상태에서 카드 클릭 시 `router.push("/seeker?auth=login")`.
- [ ] **Step 2: GA 계측 테스트 갱신** — `ga-promotion-wiring.test.ts` `SURFACES`에 layout(left/right)·screen(center) 파일 경로와 `promotionSurface="point_shop_*"` 리터럴 3건 추가. Run: `cd apps/web && pnpm vitest run test/components/bambi/ga-promotion-wiring.test.ts` → PASS
- [ ] **Step 3: lint+typecheck** — `pnpm dlx ultracite fix apps/web/src/app/point-shop apps/web/src/components/bambi/point-shop apps/web/src/components/bambi/responsive-shell.tsx apps/web/src/components/bambi/mobile-tab-bar.tsx apps/web/src/components/bambi/seeker-app-shell.tsx` / `pnpm --filter web check-types`
- [ ] **Step 4: Commit** (컨트롤러) — `feat: 포인트몰 공개 페이지(3컬럼 배너·정사각 아이템 그리드·구매 다이얼로그·헤더 잔액 칩)`

---

### Task 9: 마이페이지 구매 내역 (UI)

**Files:**
- Create: `apps/web/src/app/seeker/me/point-orders/page.tsx`
- Create: `apps/web/src/components/bambi/screens/point-orders-screen.tsx`
- Create: `apps/web/src/lib/bambi/point-shop-labels.ts`
- Modify: `apps/web/src/components/bambi/my-page-shell.tsx` (`NAV_ITEMS`에 항목 + `HIDDEN_MY_PAGE_HREFS.admin`에 href 추가)
- Modify: `apps/web/src/components/bambi/screens/seeker.tsx` (`seekerMeSections`에 항목 추가)
- Modify: `apps/web/test/components/bambi/my-page-menu-roles.test.ts` (admin 숨김 검사 목록에 새 href 추가 — 형식은 정확히 `\t\t"/seeker/me/point-orders",`)

**Interfaces:**
- Consumes: `orpc.bambi.pointShop.myOrders`(Task 4)
- Produces: `pointShopOrderStatusLabel(status: string): string`

- [ ] **Step 1: 라벨 맵**

```ts
// 포인트몰 주문 상태(bambi_point_shop_order.status) 표시 라벨. 원값 화면 노출 금지 —
// 표시 텍스트 전용, 필터 값·API 입력은 원값 유지(moderation-labels.ts 관례).
const POINT_SHOP_ORDER_STATUS_LABELS: Record<string, string> = {
	canceled: "취소·환불",
	completed: "지급 완료",
	pending: "처리 대기",
};

export function pointShopOrderStatusLabel(status: string): string {
	return POINT_SHOP_ORDER_STATUS_LABELS[status] ?? "상태 확인 필요";
}
```

- [ ] **Step 2: 페이지 + 스크린** — page.tsx는 reports 패턴 그대로(`RequireAuth`로 감싼 스크린). 스크린은 `MyPageShell title="포인트 구매 내역"` 안에서 `myOrders` 목록: 카드 리스트 또는 심플 테이블 — 아이템명·차감 포인트(`-1,000P`)·상태 `Badge`(라벨 맵, canceled면 환불 안내 문구 포함)·주문일·처리일·운영자 메모(있으면). 빈 상태 `Empty`("아직 구매한 아이템이 없어요"), 로딩 `Skeleton`.
- [ ] **Step 3: 메뉴 2곳 + admin 숨김 + 테스트 갱신** — `NAV_ITEMS`(출석체크 항목 앞, icon `StoreIcon` — `./icons`에 이미 존재, persona-nav.tsx가 사용 중)·`seekerMeSections`(description: "포인트로 구매한 아이템의 처리 상태를 확인해요.")·`HIDDEN_MY_PAGE_HREFS.admin` 추가, 테스트의 admin 숨김 href 목록에 추가.
- [ ] **Step 4: 검증** — `cd apps/web && pnpm vitest run test/components/bambi/my-page-menu-roles.test.ts` PASS, ultracite fix(수정 파일 경로들), `pnpm --filter web check-types`.
- [ ] **Step 5: Commit** (컨트롤러) — `feat: 마이페이지 포인트 구매 내역`

---

### Task 10: 운영자 포인트몰 관리 (UI)

**Files:**
- Create: `apps/web/src/app/moderator/point-shop/page.tsx`
- Modify: `apps/web/src/lib/bambi/moderator-navigation.ts` (광고·결제 그룹, 결제 관리 뒤에 `{ href: "/moderator/point-shop" as Route, label: "포인트몰" }` — `MODERATOR_MORE_GROUPS`는 flatMap이라 자동 반영)

**Interfaces:**
- Consumes: `orpc.bambi.pointShop.adminListItems / createItem / updateItem / removeItem / adminListOrders / completeOrder / cancelOrder`, `orpc.bambi.community.createMediaUpload`(이미지 인텐트 — admin은 requireCommunityMember를 통과하는 기존 동작), `uploadFileToSignedUrl`(`@/lib/bambi-job-form`), `jobMediaPublicUrl`(`@/lib/bambi/api-job-mapper`), `pointShopOrderStatusLabel`(Task 9)

- [ ] **Step 1: 페이지 구현** — `"use client"`, member-grades 페이지(`apps/web/src/app/moderator/member-grades/page.tsx`)의 쿼리·invalidate·뮤테이션·Dialog·AlertDialog 패턴을 그대로 따른다. 골격:
  - 루트 `mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6`, `h1` "포인트몰", 설명 문단.
  - `Tabs`(`@bambi-app/ui/components/tabs`) 2개: **아이템 관리** / **주문 관리**.
  - **아이템 관리 탭**: `DataTable`(`@/components/bambi/data-table`) 컬럼 — 이미지 썸네일(`imageUrl` 있으면 `size-10 rounded-md object-cover`, 없으면 자리표시), 이름, 가격(`tabular-nums` + `toLocaleString()`P), 노출(`Badge` — 노출/숨김), 정렬값, 관리(수정 outline·삭제 destructive — member-grades 액션 컬럼 verbatim 패턴). 상단 "아이템 추가" 버튼 → 추가/수정 공용 폼 Dialog(대상 `key`로 재마운트): 이름 `Input`, 설명 `Textarea`, 가격 `Input type="number"`, 정렬 `Input type="number"`, 노출 `Switch`, 이미지 파일 선택(account-settings-screen.tsx `handleProfileImageChange` verbatim 흐름: 클라 사전검증(JPG·PNG·WebP, 10MB) → `community.createMediaUpload` 인텐트 → `uploadFileToSignedUrl` → `jobMediaPublicUrl(intent.storageKey)`를 imageUrl로 저장, 미리보기 표시). 삭제는 `AlertDialog`("주문 내역은 스냅샷으로 보존됩니다" 설명).
  - **주문 관리 탭**: `ToggleGroup`(전체/처리 대기/지급 완료/취소·환불, 기본 "처리 대기") → `adminListOrders({ status })` 쿼리(전체면 status 생략). `DataTable` 컬럼 — 주문일(`formatDateTime`), 구매자(이름 + 이메일 `text-muted-foreground text-xs`), 아이템명, 포인트, 상태(`pointShopOrderStatusLabel` Badge), 메모, 관리(pending에만: "지급 완료" 버튼 → `AlertDialog` 확인 → `completeOrder`; "취소·환불" destructive 버튼 → `AlertDialog` + 사유 `Textarea` → `cancelOrder({ orderId, memo })`). 성공 toast + `orpc.bambi.pointShop.key()` invalidate. 에러는 member-grades의 `localizedGradeError` 관례처럼 한글 포함 메시지만 그대로, 그 외 한국어 폴백.
- [ ] **Step 2: nav 등록** — moderator-navigation.ts 광고·결제 그룹에 항목 추가.
- [ ] **Step 3: 검증** — ultracite fix(수정 파일 경로), `pnpm --filter web check-types`.
- [ ] **Step 4: Commit** (컨트롤러) — `feat: 운영자 포인트몰 아이템·주문 관리`

---

### Task 11: 매뉴얼 동기화

**Files:**
- Modify: `docs/manual/seeker-manual.md` — 포인트몰 이용 섹션(진입 경로: 상단 메뉴 수다방·고객센터 사이 / 포인트 적립 경로 요약 / 구매 방법·잔액 칩 / 구매 내역 확인: 내 정보 → 포인트 구매 내역 / 취소·환불은 운영자 처리)
- Modify: `docs/manual/moderator-manual.md` — 포인트몰 관리 섹션(콘솔 위치: 광고·결제 → 포인트몰 / 아이템 등록·수정·노출·이미지 / 주문 처리: 처리 대기 → 지급 완료 또는 취소·환불(자동 포인트 환불) / 등급은 구매와 무관하다는 산식 설명)

- [ ] **Step 1: 두 매뉴얼에 섹션 추가** — 각 문서의 기존 목차·헤딩 레벨·문체를 따른다.
- [ ] **Step 2: Commit** (컨트롤러) — `docs: 포인트몰 매뉴얼 반영`

---

### Task 12: 통합 검증

- [ ] **Step 1: lint** — `pnpm dlx ultracite fix <이번 브랜치에서 수정/생성한 모든 경로>` (경로 인자 없이 실행하면 0파일 — 금지)
- [ ] **Step 2: typecheck 전체** — `pnpm --filter @bambi-app/db check-types && pnpm --filter @bambi-app/api check-types && pnpm --filter web check-types`
- [ ] **Step 3: 대상 테스트** — `cd packages/api && pnpm vitest run test/services/bambi-point-shop.test.ts` / `cd apps/web && pnpm vitest run test/lib/bambi/resolve-gate.test.ts test/components/bambi/my-page-menu-roles.test.ts test/components/bambi/ga-promotion-wiring.test.ts test/app/seeker/auth-gate-routing.test.ts`
- [ ] **Step 4: 결과 보고** — 실패가 있으면 수정 후 재실행. 성공 출력 확인 전에 완료 선언 금지.

---

## Self-Review 기록

- 스펙 커버리지: 스키마(T1)·등급 분리(T2)·구매 락(T3·T4)·공개 게이트(T5)·1:1 상담(T6·T7)·nav/배너/그리드/구매(T7·T8)·헤더 칩(T7)·마이페이지(T9)·운영자(T10)·매뉴얼(T11) — 스펙 전 섹션 대응 확인.
- 타입 일관성: `resolvePurchase`/`resolveOrderTransition`/`POINT_SHOP_REASONS`/`pointShopOrderStatusLabel` 명칭이 T3·T4·T9·T10에서 동일.
- 배포 체크리스트(스펙 §9): 운영 DB 0096 migrate는 배포 시점 별도 — 이 계획 범위 아님.
