# 광고 상품 카탈로그 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영자(admin)가 광고 노출 위치와 상품(가격·이용기간)을 관리하고, 구인자 광고 안내 페이지(`/employer/ad-guide`)가 이를 DB에서 동적으로 렌더한다.

**Architecture:** 신규 2테이블(`ad_placement` 1—N `ad_product`, 가격은 상품의 JSON 옵션 배열)을 추가하고, oRPC `bambi.adProducts` 라우터(공개 읽기 + admin CRUD)를 만든다. 운영자 콘솔에 `/moderator/ad-products` 관리 페이지를 추가하고, 안내 페이지를 `getCatalog` 쿼리 기반 client 컴포넌트로 전환한다.

**Tech Stack:** Drizzle(Postgres) · oRPC + zod · TanStack Query · Next.js RSC(web) · shadcn(base-ui)/Tailwind v4 · Vitest.

## Global Constraints

- **DB 스크립트 금지 범위:** Claude/서브에이전트는 `db:*`(generate/migrate/push) **직접 실행 금지**. 마이그레이션 생성·적용은 **사용자가** 수행한다. `db:push`는 **절대 금지**(generate → migrate만).
- **빌드/실행 금지:** `npm/pnpm run build`·dev 서버 기동 금지. 검증은 **타입체크 + 린트 + Vitest**만. UI 시각 확인은 사용자가 한다.
- **API 테스트는 실제 Postgres 필요:** `packages/api`의 vitest 테스트는 `apps/server/.env`의 `DATABASE_URL`로 실 DB에 붙어 실행된다(모킹 없음). 스키마 마이그레이션이 적용된 뒤에만 통과한다.
- **가격 단위:** `amount`는 **원(정수, 주단위)**. `days`는 정수(이용기간).
- **UI 규칙(`apps/web/CLAUDE.md`):** 인라인 `style` 금지, shadcn 컴포넌트 + Tailwind 시맨틱 토큰만, `rounded-none` 금지, base는 **base-ui**(커스텀 트리거는 `render` prop). 간격은 `flex/grid`+`gap-*`, `size-*`, 조건부 클래스는 `cn()`.
- **shadcn 가용:** `card,input,textarea,switch,select,label,badge,separator,empty,skeleton,button` 존재. `field`/`alert-dialog`는 **미설치** → 사용하지 말고 기존 패턴(plain `Input`/`Label` + 인라인 확인 버튼 + `sonner` toast)을 따른다.
- **커밋 메시지:** 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음). 커밋 전 워크트리에서 `pnpm install` 필요(lefthook biome 훅).
- **import 규약:** `db`는 `@bambi-app/db`, bambi 테이블/enum은 `@bambi-app/db/schema/bambi`, auth 테이블은 `@bambi-app/db/schema/auth`. `z`는 `import z from "zod"`(default). UI는 `@bambi-app/ui/components/<name>`, `cn`은 `@bambi-app/ui/lib/utils`, web orpc는 `@/utils/orpc`.

---

### Task 1: DB 스키마 — `ad_placement` + `ad_product` 테이블·enum·relations·barrel

**Files:**
- Modify: `packages/db/src/schema/bambi.ts` (enum + 2테이블 + 2 relations 추가)
- Modify: `packages/db/src/index.ts` (import + `schema` 객체에 테이블·relations 추가)

**Interfaces:**
- Produces: `adPlacement`, `adProduct`, `adPlacementKind`(pgEnum), `adPlacementRelations`, `adProductRelations`. `adProduct.priceOptions` 타입 `{ amount: number; days: number }[]`, `adProduct.benefits` 타입 `string[]`.

- [ ] **Step 1: `bambi.ts`에 enum·테이블·relations 추가**

`packages/db/src/schema/bambi.ts`의 enum 블록(기존 `promotionStatus` enum 아래)에 추가:

```ts
export const adPlacementKind = pgEnum("ad_placement_kind", [
	"listing",
	"banner",
]);
```

파일의 테이블 정의 영역(예: `jobPromotionBoostEvent` 이후) 및 relations 영역 끝에 추가:

```ts
export const adPlacement = pgTable(
	"ad_placement",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		name: text("name").notNull(),
		description: text("description"),
		kind: adPlacementKind("kind").default("listing").notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("ad_placement_active_sort_idx").on(table.isActive, table.sortOrder),
	]
);

export const adProduct = pgTable(
	"ad_product",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		placementId: uuid("placement_id")
			.notNull()
			.references(() => adPlacement.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		tagline: text("tagline"),
		benefits: jsonb("benefits").$type<string[]>().default([]).notNull(),
		priceOptions: jsonb("price_options")
			.$type<{ amount: number; days: number }[]>()
			.default([])
			.notNull(),
		sortOrder: integer("sort_order").default(0).notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("ad_product_placement_idx").on(
			table.placementId,
			table.isActive,
			table.sortOrder
		),
	]
);

export const adPlacementRelations = relations(adPlacement, ({ many }) => ({
	products: many(adProduct),
}));

export const adProductRelations = relations(adProduct, ({ one }) => ({
	placement: one(adPlacement, {
		fields: [adProduct.placementId],
		references: [adPlacement.id],
	}),
}));
```

- [ ] **Step 2: `packages/db/src/index.ts` barrel 배선**

`./schema/bambi` import 목록에 `adPlacement, adPlacementRelations, adProduct, adProductRelations`를 추가하고, 동일 이름들을 `const schema = { ... }` 객체에도 추가한다. (enum `adPlacementKind`는 schema 객체에 넣지 않는다 — 테이블·relations만.)

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: PASS (에러 없음)

- [ ] **Step 4: 커밋**

```bash
cd .claude/worktrees/ad-product-catalog
git add packages/db/src/schema/bambi.ts packages/db/src/index.ts
git commit -m "feat: 광고 상품 카탈로그 DB 스키마(ad_placement·ad_product) 추가"
```

- [ ] **Step 5: 【사용자 수행】 마이그레이션 생성·적용**

> Claude/서브에이전트는 실행하지 말 것. 사용자에게 아래를 요청한다:
> `pnpm --filter @bambi-app/db db:generate` → 생성된 `packages/db/src/migrations/000X_*.sql` 검토 → `pnpm --filter @bambi-app/db db:migrate`. (`db:push` 금지)
> 생성된 마이그레이션 SQL 파일은 별도 커밋한다: `git add packages/db/src/migrations && git commit -m "chore: 광고 상품 카탈로그 마이그레이션 생성"`

---

### Task 2: API 읽기 — `adProducts.getCatalog` · `listCatalogAdmin` + 라우터 등록

**Files:**
- Create: `packages/api/src/routers/bambi/ad-products.ts`
- Modify: `packages/api/src/routers/bambi/index.ts` (등록)
- Test: `packages/api/src/routers/bambi/ad-products.test.ts`

**Interfaces:**
- Produces: `adProductsRouter` with `getCatalog`(no input, protected) 및 `listCatalogAdmin`(no input, admin). 반환: `Array<{ id, name, description, kind, sortOrder, isActive, createdAt, updatedAt, products: Array<{ id, placementId, name, tagline, benefits: string[], priceOptions: {amount,days}[], sortOrder, isActive }> }>`. `getCatalog`은 `isActive` placement/상품만, `listCatalogAdmin`은 전체.
- Consumes: Task 1의 `adPlacement`, `adProduct`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/ad-products.test.ts`:

```ts
import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { adProductsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./ad-products"),
	]);

const { user } = authSchema;
const { bambiProfile, adPlacement, adProduct } = bambiSchema;

const createContextForUser = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const expectOrpcCode = async (promise: Promise<unknown>, code: string) => {
	await expect(promise).rejects.toMatchObject({ code });
};

type CatalogFixture = {
	adminUserId: string;
	employerUserId: string;
	activePlacementId: string;
	inactivePlacementId: string;
	userIds: string[];
	placementIds: string[];
};

const createCatalogFixture = async (): Promise<CatalogFixture> => {
	const adminUserId = `user_test_admin_${randomUUID()}`;
	const employerUserId = `user_test_employer_${randomUUID()}`;
	const activePlacementId = randomUUID();
	const inactivePlacementId = randomUUID();

	await db.insert(user).values([
		{ id: adminUserId, name: "운영자", email: `admin-${randomUUID()}@bambi.test` },
		{ id: employerUserId, name: "구인자", email: `emp-${randomUUID()}@bambi.test` },
	]);
	await db.insert(bambiProfile).values([
		{ displayName: "운영자", isPhoneVerified: true, role: "admin", status: "active", userId: adminUserId },
		{ displayName: "구인자", isPhoneVerified: true, role: "employer", status: "active", userId: employerUserId },
	]);
	await db.insert(adPlacement).values([
		{ id: activePlacementId, name: "상단 프리미엄 배너", kind: "banner", sortOrder: 0, isActive: true },
		{ id: inactivePlacementId, name: "숨김 위치", kind: "listing", sortOrder: 1, isActive: false },
	]);
	await db.insert(adProduct).values([
		{ placementId: activePlacementId, name: "프리미엄 배너", benefits: ["상단 노출"], priceOptions: [{ amount: 330_000, days: 30 }], sortOrder: 0, isActive: true },
		{ placementId: activePlacementId, name: "숨김 상품", benefits: [], priceOptions: [{ amount: 1000, days: 7 }], sortOrder: 1, isActive: false },
	]);

	return {
		adminUserId,
		employerUserId,
		activePlacementId,
		inactivePlacementId,
		userIds: [adminUserId, employerUserId],
		placementIds: [activePlacementId, inactivePlacementId],
	};
};

const cleanupCatalogFixture = async (fixture: CatalogFixture) => {
	await db.delete(adProduct).where(inArray(adProduct.placementId, fixture.placementIds));
	await db.delete(adPlacement).where(inArray(adPlacement.id, fixture.placementIds));
	await db.delete(bambiProfile).where(inArray(bambiProfile.userId, fixture.userIds));
	await db.delete(user).where(inArray(user.id, fixture.userIds));
};

describe("adProducts read", () => {
	it("getCatalog returns only active placements and active products", async () => {
		const fixture = await createCatalogFixture();
		try {
			const getCatalog = createProcedureClient(adProductsRouter.getCatalog, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "getCatalog"],
			});
			const catalog = await getCatalog({});
			const ids = catalog.map((p) => p.id);
			expect(ids).toContain(fixture.activePlacementId);
			expect(ids).not.toContain(fixture.inactivePlacementId);
			const active = catalog.find((p) => p.id === fixture.activePlacementId);
			expect(active?.products).toHaveLength(1);
			expect(active?.products[0]?.name).toBe("프리미엄 배너");
			expect(active?.products[0]?.priceOptions).toEqual([{ amount: 330_000, days: 30 }]);
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});

	it("listCatalogAdmin requires an admin profile", async () => {
		const fixture = await createCatalogFixture();
		try {
			const listAsEmployer = createProcedureClient(adProductsRouter.listCatalogAdmin, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "listCatalogAdmin"],
			});
			await expectOrpcCode(listAsEmployer({}), "FORBIDDEN");

			const listAsAdmin = createProcedureClient(adProductsRouter.listCatalogAdmin, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "listCatalogAdmin"],
			});
			const all = await listAsAdmin({});
			expect(all.map((p) => p.id)).toEqual(
				expect.arrayContaining([fixture.activePlacementId, fixture.inactivePlacementId])
			);
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test ad-products`
Expected: FAIL — `Cannot find module "./ad-products"` (라우터 미존재).

- [ ] **Step 3: 라우터 구현(읽기)**

`packages/api/src/routers/bambi/ad-products.ts`:

```ts
import { db } from "@bambi-app/db";
import { adPlacement, adProduct } from "@bambi-app/db/schema/bambi";
import { asc } from "drizzle-orm";
import { eq } from "drizzle-orm";

import { protectedProcedure } from "../../index";
import { requireAdminProfile } from "../../services/bambi-authz";

export const adProductsRouter = {
	getCatalog: protectedProcedure.handler(async () => {
		return await db.query.adPlacement.findMany({
			where: eq(adPlacement.isActive, true),
			orderBy: [asc(adPlacement.sortOrder), asc(adPlacement.createdAt)],
			with: {
				products: {
					where: eq(adProduct.isActive, true),
					orderBy: [asc(adProduct.sortOrder), asc(adProduct.createdAt)],
				},
			},
		});
	}),

	listCatalogAdmin: protectedProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);
		return await db.query.adPlacement.findMany({
			orderBy: [asc(adPlacement.sortOrder), asc(adPlacement.createdAt)],
			with: {
				products: {
					orderBy: [asc(adProduct.sortOrder), asc(adProduct.createdAt)],
				},
			},
		});
	}),
};
```

- [ ] **Step 4: `bambi/index.ts`에 등록**

`packages/api/src/routers/bambi/index.ts`에 `import { adProductsRouter } from "./ad-products";` 추가하고 `bambiRouter` 객체에 `adProducts: adProductsRouter,` 키 추가.

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test ad-products`
Expected: PASS (2 tests). (실 DB + Task 1 마이그레이션 적용 필요.)

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/routers/bambi/ad-products.ts packages/api/src/routers/bambi/index.ts packages/api/src/routers/bambi/ad-products.test.ts
git commit -m "feat: 광고 카탈로그 읽기 API(getCatalog·listCatalogAdmin) 추가"
```

---

### Task 3: API — 노출 위치(placement) admin 뮤테이션

**Files:**
- Modify: `packages/api/src/routers/bambi/ad-products.ts`
- Test: `packages/api/src/routers/bambi/ad-products.test.ts` (describe 추가)

**Interfaces:**
- Produces: `createPlacement({ name, description?, kind, sortOrder? })`→row, `updatePlacement({ id, name?, description?, kind?, sortOrder?, isActive? })`→row, `deletePlacement({ id })`→`{ id }`, `reorderPlacements({ ids })`→`{ ok: true }`. 모두 admin 전용. `kind`는 `"listing"|"banner"`.

- [ ] **Step 1: 실패하는 테스트 추가**

`ad-products.test.ts`에 describe 블록 추가(상단 fixture 재사용):

```ts
describe("adProducts placement mutations", () => {
	it("blocks non-admins and creates/updates/deletes placements for admins", async () => {
		const fixture = await createCatalogFixture();
		let createdId: string | undefined;
		try {
			const asEmployer = createProcedureClient(adProductsRouter.createPlacement, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "createPlacement"],
			});
			await expectOrpcCode(
				asEmployer({ name: "권한 테스트", kind: "listing" }),
				"FORBIDDEN"
			);

			const create = createProcedureClient(adProductsRouter.createPlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createPlacement"],
			});
			const created = await create({ name: "사이드 배너", kind: "banner" });
			createdId = created.id;
			expect(created.name).toBe("사이드 배너");
			expect(created.isActive).toBe(true);

			const update = createProcedureClient(adProductsRouter.updatePlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "updatePlacement"],
			});
			const updated = await update({ id: created.id, isActive: false, name: "사이드 배너(중단)" });
			expect(updated.isActive).toBe(false);
			expect(updated.name).toBe("사이드 배너(중단)");

			const remove = createProcedureClient(adProductsRouter.deletePlacement, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "deletePlacement"],
			});
			const removed = await remove({ id: created.id });
			expect(removed).toEqual({ id: created.id });
			createdId = undefined;
		} finally {
			if (createdId) {
				await db.delete(adPlacement).where(eq(adPlacement.id, createdId));
			}
			await cleanupCatalogFixture(fixture);
		}
	});
});
```

(테스트 파일 상단 import에 `eq`가 이미 있음 — 없으면 `import { eq, inArray } from "drizzle-orm";` 확인.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test ad-products`
Expected: FAIL — `createPlacement is not a function`.

- [ ] **Step 3: placement 뮤테이션 구현**

`ad-products.ts` 상단 import를 확장하고(zod·drizzle helpers) 라우터 객체에 아래 procedure를 추가한다. import 블록을 다음으로 교체:

```ts
import { db } from "@bambi-app/db";
import { adPlacement, adProduct } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { requireAdminProfile } from "../../services/bambi-authz";

const placementKindSchema = z.enum(["listing", "banner"]);

const createPlacementInput = z.object({
	name: z.string().min(1).max(120),
	description: z.string().max(500).optional(),
	kind: placementKindSchema.default("listing"),
	sortOrder: z.number().int().min(0).default(0),
});

const updatePlacementInput = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	description: z.string().max(500).nullish(),
	kind: placementKindSchema.optional(),
	sortOrder: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
});
```

라우터 객체(`getCatalog`/`listCatalogAdmin` 이후)에 추가:

```ts
	createPlacement: protectedProcedure
		.input(createPlacementInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [created] = await db.insert(adPlacement).values(input).returning();
			return created;
		}),

	updatePlacement: protectedProcedure
		.input(updatePlacementInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const { id, ...patch } = input;
			const [updated] = await db
				.update(adPlacement)
				.set(patch)
				.where(eq(adPlacement.id, id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}
			return updated;
		}),

	deletePlacement: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [deleted] = await db
				.delete(adPlacement)
				.where(eq(adPlacement.id, input.id))
				.returning({ id: adPlacement.id });
			if (!deleted) {
				throw new ORPCError("NOT_FOUND");
			}
			return deleted;
		}),

	reorderPlacements: protectedProcedure
		.input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			await db.transaction(async (tx) => {
				for (let i = 0; i < input.ids.length; i++) {
					await tx
						.update(adPlacement)
						.set({ sortOrder: i })
						.where(eq(adPlacement.id, input.ids[i]));
				}
			});
			return { ok: true as const };
		}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test ad-products`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/ad-products.ts packages/api/src/routers/bambi/ad-products.test.ts
git commit -m "feat: 광고 노출 위치 admin CRUD API 추가"
```

---

### Task 4: API — 광고 상품(product) admin 뮤테이션

**Files:**
- Modify: `packages/api/src/routers/bambi/ad-products.ts`
- Test: `packages/api/src/routers/bambi/ad-products.test.ts` (describe 추가)

**Interfaces:**
- Produces: `createProduct({ placementId, name, tagline?, benefits, priceOptions, sortOrder? })`→row, `updateProduct({ id, name?, tagline?, benefits?, priceOptions?, sortOrder?, isActive? })`→row, `deleteProduct({ id })`→`{ id }`, `reorderProducts({ placementId, ids })`→`{ ok: true }`. `priceOptions`는 최소 1개, 각 `{ amount≥0, days≥1 }` 정수. admin 전용.

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
describe("adProducts product mutations", () => {
	it("validates priceOptions and creates products for admins", async () => {
		const fixture = await createCatalogFixture();
		try {
			const create = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.adminUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});

			// 빈 priceOptions는 거부
			await expect(
				create({
					placementId: fixture.activePlacementId,
					name: "잘못된 상품",
					benefits: [],
					priceOptions: [],
				})
			).rejects.toBeTruthy();

			const created = await create({
				placementId: fixture.activePlacementId,
				name: "추천 광고",
				tagline: "추천 섹션 노출",
				benefits: ["추천 섹션 상단"],
				priceOptions: [
					{ amount: 220_000, days: 30 },
					{ amount: 400_000, days: 60 },
				],
			});
			expect(created.name).toBe("추천 광고");
			expect(created.priceOptions).toHaveLength(2);

			const asEmployer = createProcedureClient(adProductsRouter.createProduct, {
				context: createContextForUser(fixture.employerUserId),
				path: ["bambi", "adProducts", "createProduct"],
			});
			await expectOrpcCode(
				asEmployer({
					placementId: fixture.activePlacementId,
					name: "권한 테스트",
					benefits: [],
					priceOptions: [{ amount: 1000, days: 7 }],
				}),
				"FORBIDDEN"
			);
			// createProduct로 만든 행은 placement cascade로 fixture cleanup 시 함께 삭제됨
		} finally {
			await cleanupCatalogFixture(fixture);
		}
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test ad-products`
Expected: FAIL — `createProduct is not a function`.

- [ ] **Step 3: product 뮤테이션 구현**

`ad-products.ts`의 입력 스키마 영역에 추가:

```ts
const priceOptionSchema = z.object({
	amount: z.number().int().min(0),
	days: z.number().int().min(1),
});

const createProductInput = z.object({
	placementId: z.string().uuid(),
	name: z.string().min(1).max(120),
	tagline: z.string().max(200).optional(),
	benefits: z.array(z.string().min(1)).default([]),
	priceOptions: z.array(priceOptionSchema).min(1),
	sortOrder: z.number().int().min(0).default(0),
});

const updateProductInput = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	tagline: z.string().max(200).nullish(),
	benefits: z.array(z.string().min(1)).optional(),
	priceOptions: z.array(priceOptionSchema).min(1).optional(),
	sortOrder: z.number().int().min(0).optional(),
	isActive: z.boolean().optional(),
});
```

라우터 객체에 추가:

```ts
	createProduct: protectedProcedure
		.input(createProductInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [created] = await db.insert(adProduct).values(input).returning();
			return created;
		}),

	updateProduct: protectedProcedure
		.input(updateProductInput)
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const { id, ...patch } = input;
			const [updated] = await db
				.update(adProduct)
				.set(patch)
				.where(eq(adProduct.id, id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND");
			}
			return updated;
		}),

	deleteProduct: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			const [deleted] = await db
				.delete(adProduct)
				.where(eq(adProduct.id, input.id))
				.returning({ id: adProduct.id });
			if (!deleted) {
				throw new ORPCError("NOT_FOUND");
			}
			return deleted;
		}),

	reorderProducts: protectedProcedure
		.input(z.object({ placementId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1) }))
		.handler(async ({ context, input }) => {
			await requireAdminProfile(context.session);
			await db.transaction(async (tx) => {
				for (let i = 0; i < input.ids.length; i++) {
					await tx
						.update(adProduct)
						.set({ sortOrder: i })
						.where(eq(adProduct.id, input.ids[i]));
				}
			});
			return { ok: true as const };
		}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test ad-products`
Expected: PASS (전체 4 describe).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/ad-products.ts packages/api/src/routers/bambi/ad-products.test.ts
git commit -m "feat: 광고 상품 admin CRUD API 추가"
```

---

### Task 5: web 공용 — 가격 포맷·카탈로그 타입 유틸

**Files:**
- Create: `apps/web/src/lib/bambi/ad-catalog.ts`
- Test: `apps/web/src/lib/bambi/ad-catalog.test.ts`

**Interfaces:**
- Produces: `formatAdPrice(amount: number): string` (예: `330,000원`), `formatAdDuration(days: number): string` (예: `30일`), 타입 `AdCatalogPlacement`/`AdCatalogProduct`(oRPC 반환 타입 파생).

- [ ] **Step 1: 실패하는 테스트 작성**

`apps/web/src/lib/bambi/ad-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatAdDuration, formatAdPrice } from "./ad-catalog";

describe("ad-catalog format helpers", () => {
	it("formats KRW amount with thousands separator and 원", () => {
		expect(formatAdPrice(330_000)).toBe("330,000원");
	});
	it("formats duration days", () => {
		expect(formatAdDuration(30)).toBe("30일");
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter web test ad-catalog`
Expected: FAIL — `Cannot find module "./ad-catalog"`.

- [ ] **Step 3: 유틸 구현**

`apps/web/src/lib/bambi/ad-catalog.ts`:

```ts
import type { AppRouterClient } from "@bambi-app/api/routers/index";

// oRPC 반환 타입에서 카탈로그 타입 파생(단일 소스).
export type AdCatalogPlacement = Awaited<
	ReturnType<AppRouterClient["bambi"]["adProducts"]["getCatalog"]>
>[number];
export type AdCatalogProduct = AdCatalogPlacement["products"][number];

const wonFormatter = new Intl.NumberFormat("ko-KR");

export function formatAdPrice(amount: number): string {
	return `${wonFormatter.format(amount)}원`;
}

export function formatAdDuration(days: number): string {
	return `${days}일`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter web test ad-catalog`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi/ad-catalog.ts apps/web/src/lib/bambi/ad-catalog.test.ts
git commit -m "feat: 광고 카탈로그 가격·기간 포맷 유틸 추가"
```

---

### Task 6: 운영자 콘솔 — nav 배선 + 카탈로그 목록/토글/삭제 페이지

**Files:**
- Create: `apps/web/src/app/moderator/ad-products/page.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx` (nav 항목)
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (`MOD_ROUTES` + tab 분기)
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx` (`ModTabs` items)
- Test: `apps/web/src/components/bambi/visual-job-components.test.ts` (문자열 스냅샷 추가)

**Interfaces:**
- Consumes: `orpc.bambi.adProducts.listCatalogAdmin`, `updatePlacement`, `deletePlacement`, `updateProduct`, `deleteProduct` (Task 2–4). `AdCatalogPlacement`/`AdCatalogProduct` (Task 5).
- Produces: 라우트 `/moderator/ad-products`; export `default ModeratorAdProductsPage`.

- [ ] **Step 1: nav 3곳 배선**

`apps/web/src/app/moderator/layout.tsx`의 `MODERATOR_NAV_ITEMS`에 `업소 승인` 다음 줄로 추가:

```tsx
	{ href: "/moderator/ad-products", label: "광고 상품" },
```

`apps/web/src/components/bambi/persona-nav.tsx`의 `MOD_ROUTES`에 키 추가:

```tsx
const MOD_ROUTES: Record<string, Route> = {
	queue: "/moderator",
	reports: "/moderator/reports",
	employers: "/moderator/employers",
	users: "/moderator/users",
	adProducts: "/moderator/ad-products",
};
```

같은 파일 `ModeratorShell`의 tab 파생 분기에 추가(`users` 분기 다음):

```tsx
	} else if (path.startsWith("/moderator/ad-products")) {
		tab = "adProducts";
	}
```

`apps/web/src/components/bambi/screens/moderator.tsx`의 `ModTabs` `items` 배열에 추가(`users` 앞 또는 뒤). 아이콘은 이미 import된 `StoreIcon` 재사용 대신 `Megaphone`가 없으므로 기존 `../icons`의 `ClipboardListIcon`을 사용:

```tsx
		{ v: "adProducts", label: "광고 상품", icon: <ClipboardListIcon /> },
```

(`ClipboardListIcon`이 `moderator.tsx` import에 없으면 상단 `../icons` import 목록에 추가한다.)

- [ ] **Step 2: 콘솔 페이지 구현(목록 + active 토글 + 삭제)**

`apps/web/src/app/moderator/ad-products/page.tsx`:

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Switch } from "@bambi-app/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/bambi/empty-state";
import { formatAdDuration, formatAdPrice } from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

export default function ModeratorAdProductsPage() {
	const queryClient = useQueryClient();
	const [confirmingId, setConfirmingId] = useState<null | string>(null);
	const catalogQuery = useQuery(
		orpc.bambi.adProducts.listCatalogAdmin.queryOptions()
	);
	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.adProducts.listCatalogAdmin.queryKey(),
		});

	const togglePlacement = useMutation(
		orpc.bambi.adProducts.updatePlacement.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		})
	);
	const deletePlacement = useMutation(
		orpc.bambi.adProducts.deletePlacement.mutationOptions({
			onSuccess: async () => {
				toast.success("위치를 삭제했어요.");
				setConfirmingId(null);
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const toggleProduct = useMutation(
		orpc.bambi.adProducts.updateProduct.mutationOptions({
			onSuccess: invalidate,
			onError: (error) => toast.error(error.message),
		})
	);
	const deleteProduct = useMutation(
		orpc.bambi.adProducts.deleteProduct.mutationOptions({
			onSuccess: async () => {
				toast.success("상품을 삭제했어요.");
				await invalidate();
			},
			onError: (error) => toast.error(error.message),
		})
	);

	const placements = catalogQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-6">
			<div className="flex items-center justify-between">
				<h1 className="m-0 font-extrabold text-2xl">광고 상품 관리</h1>
				<Button render={<a href="/moderator/ad-products/new" />}>위치 추가</Button>
			</div>
			{placements.length === 0 ? (
				<EmptyState
					description="노출 위치를 추가하면 그 아래 광고 상품을 등록할 수 있어요."
					title="등록된 광고 위치가 없어요"
				/>
			) : null}
			{placements.map((placement) => (
				<Card key={placement.id}>
					<CardHeader className="flex flex-row items-center justify-between gap-3">
						<CardTitle className="flex items-center gap-2">
							{placement.name}
							<Badge variant={placement.kind === "banner" ? "secondary" : "success"}>
								{placement.kind === "banner" ? "배너" : "리스팅"}
							</Badge>
						</CardTitle>
						<div className="flex items-center gap-3">
							<Switch
								checked={placement.isActive}
								onCheckedChange={(next) =>
									togglePlacement.mutate({ id: placement.id, isActive: next })
								}
							/>
							{confirmingId === placement.id ? (
								<div className="flex gap-1">
									<Button
										disabled={deletePlacement.isPending}
										onClick={() => deletePlacement.mutate({ id: placement.id })}
										size="sm"
										variant="destructive"
									>
										삭제 확인
									</Button>
									<Button onClick={() => setConfirmingId(null)} size="sm" variant="ghost">
										취소
									</Button>
								</div>
							) : (
								<Button onClick={() => setConfirmingId(placement.id)} size="sm" variant="ghost">
									삭제
								</Button>
							)}
						</div>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{placement.description ? (
							<p className="m-0 text-muted-foreground text-sm">{placement.description}</p>
						) : null}
						{placement.products.length === 0 ? (
							<p className="m-0 text-muted-foreground text-sm">등록된 상품이 없어요.</p>
						) : null}
						{placement.products.map((product) => (
							<div
								className="flex flex-col gap-1 rounded-lg border border-border p-3"
								key={product.id}
							>
								<div className="flex items-center justify-between gap-2">
									<span className="font-bold">{product.name}</span>
									<div className="flex items-center gap-2">
										<Switch
											checked={product.isActive}
											onCheckedChange={(next) =>
												toggleProduct.mutate({ id: product.id, isActive: next })
											}
										/>
										<Button
											onClick={() => deleteProduct.mutate({ id: product.id })}
											size="sm"
											variant="ghost"
										>
											삭제
										</Button>
									</div>
								</div>
								<div className="flex flex-wrap gap-2 text-muted-foreground text-sm">
									{product.priceOptions.map((option) => (
										<span key={`${product.id}-${option.days}`}>
											{formatAdDuration(option.days)} · {formatAdPrice(option.amount)}
										</span>
									))}
								</div>
							</div>
						))}
						<Button
							render={<a href={`/moderator/ad-products/${placement.id}/new`} />}
							size="sm"
							variant="secondary"
						>
							이 위치에 상품 추가
						</Button>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
```

> 참고: `Button`의 커스텀 트리거는 base-ui `render` prop 사용(위 `render={<a .../>}`). `variant="destructive"`가 button 컴포넌트에 없으면 `variant="secondary"`로 대체.

- [ ] **Step 3: 문자열 스냅샷 테스트 추가**

`apps/web/src/components/bambi/visual-job-components.test.ts`에 추가:

```ts
	it("wires the moderator ad-products console and nav", () => {
		const page = readComponent("../../app/moderator/ad-products/page.tsx");
		const layout = readComponent("../../app/moderator/layout.tsx");
		const nav = readComponent("persona-nav.tsx");
		expect(page).toContain("listCatalogAdmin");
		expect(layout).toContain("/moderator/ad-products");
		expect(nav).toContain("adProducts");
	});
```

- [ ] **Step 4: 테스트·타입체크·린트**

Run: `pnpm --filter web test visual-job-components`
Expected: PASS.
Run: `pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/moderator/ad-products/page.tsx apps/web/src/app/moderator/layout.tsx apps/web/src/components/bambi/persona-nav.tsx apps/web/src/components/bambi/screens/moderator.tsx apps/web/src/components/bambi/visual-job-components.test.ts
git commit -m "feat: 운영자 광고 상품 콘솔 목록·nav 배선"
```

---

### Task 7: 운영자 콘솔 — 위치/상품 생성·수정 폼

**Files:**
- Create: `apps/web/src/app/moderator/ad-products/new/page.tsx` (위치 생성)
- Create: `apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx` (상품 생성)
- Create: `apps/web/src/components/bambi/ad-product-form.tsx` (`PriceOptionsEditor`·`BenefitsEditor` 포함)
- Test: `apps/web/src/components/bambi/visual-job-components.test.ts` (스냅샷 추가)

**Interfaces:**
- Consumes: `orpc.bambi.adProducts.createPlacement`, `createProduct` (Task 3–4). `formatAdPrice` (Task 5).
- Produces: 위치 생성 라우트, 상품 생성 라우트. `AdProductForm`(재사용 가능한 상품 입력 폼).

- [ ] **Step 1: 위치 생성 페이지**

`apps/web/src/app/moderator/ad-products/new/page.tsx`:

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@bambi-app/ui/components/select";
import { Textarea } from "@bambi-app/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

export default function NewAdPlacementPage() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [kind, setKind] = useState<"banner" | "listing">("listing");
	const create = useMutation(
		orpc.bambi.adProducts.createPlacement.mutationOptions({
			onSuccess: () => {
				toast.success("노출 위치를 만들었어요.");
				router.push("/moderator/ad-products");
			},
			onError: (error) => toast.error(error.message),
		})
	);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
			<h1 className="m-0 font-extrabold text-2xl">노출 위치 추가</h1>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="name">위치명</Label>
				<Input id="name" onChange={(e) => setName(e.target.value)} value={name} />
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="description">안내 문구</Label>
				<Textarea id="description" onChange={(e) => setDescription(e.target.value)} value={description} />
			</div>
			<div className="flex flex-col gap-1.5">
				<Label>유형</Label>
				<Select onValueChange={(v) => setKind(v as "banner" | "listing")} value={kind}>
					<SelectTrigger><SelectValue /></SelectTrigger>
					<SelectContent>
						<SelectItem value="listing">리스팅 노출</SelectItem>
						<SelectItem value="banner">배너 광고</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="flex gap-2">
				<Button
					disabled={create.isPending || name.trim().length === 0}
					onClick={() =>
						create.mutate({ name: name.trim(), description: description.trim() || undefined, kind })
					}
				>
					만들기
				</Button>
				<Button onClick={() => router.push("/moderator/ad-products")} variant="ghost">
					취소
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: 상품 폼 컴포넌트(`AdProductForm` + 에디터)**

`apps/web/src/components/bambi/ad-product-form.tsx`:

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useState } from "react";

export type PriceOption = { amount: number; days: number };

export type AdProductDraft = {
	name: string;
	tagline: string;
	benefits: string[];
	priceOptions: PriceOption[];
};

const EMPTY: AdProductDraft = {
	name: "",
	tagline: "",
	benefits: [""],
	priceOptions: [{ amount: 0, days: 30 }],
};

export function AdProductForm({
	onSubmit,
	pending,
}: {
	onSubmit: (draft: AdProductDraft) => void;
	pending: boolean;
}) {
	const [draft, setDraft] = useState<AdProductDraft>(EMPTY);

	const setPrice = (i: number, patch: Partial<PriceOption>) =>
		setDraft((d) => ({
			...d,
			priceOptions: d.priceOptions.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
		}));
	const setBenefit = (i: number, value: string) =>
		setDraft((d) => ({ ...d, benefits: d.benefits.map((b, idx) => (idx === i ? value : b)) }));

	const submit = () =>
		onSubmit({
			...draft,
			name: draft.name.trim(),
			tagline: draft.tagline.trim(),
			benefits: draft.benefits.map((b) => b.trim()).filter((b) => b.length > 0),
			priceOptions: draft.priceOptions.filter((p) => p.days > 0),
		});

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-name">상품명</Label>
				<Input id="p-name" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} value={draft.name} />
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="p-tagline">한 줄 소개</Label>
				<Input id="p-tagline" onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))} value={draft.tagline} />
			</div>

			<div className="flex flex-col gap-2">
				<Label>서비스 내용</Label>
				{draft.benefits.map((benefit, i) => (
					<div className="flex gap-2" key={`benefit-${i}`}>
						<Input onChange={(e) => setBenefit(i, e.target.value)} value={benefit} />
						<Button
							onClick={() => setDraft((d) => ({ ...d, benefits: d.benefits.filter((_, idx) => idx !== i) }))}
							size="sm"
							variant="ghost"
						>
							삭제
						</Button>
					</div>
				))}
				<Button onClick={() => setDraft((d) => ({ ...d, benefits: [...d.benefits, ""] }))} size="sm" variant="secondary">
					내용 추가
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<Label>가격 옵션(이용기간 · 금액)</Label>
				{draft.priceOptions.map((option, i) => (
					<div className="flex items-center gap-2" key={`price-${i}`}>
						<Input
							className="w-24"
							onChange={(e) => setPrice(i, { days: Number(e.target.value) })}
							type="number"
							value={option.days}
						/>
						<span className="text-muted-foreground text-sm">일</span>
						<Input
							className="w-40"
							onChange={(e) => setPrice(i, { amount: Number(e.target.value) })}
							type="number"
							value={option.amount}
						/>
						<span className="text-muted-foreground text-sm">원</span>
						<Button
							onClick={() => setDraft((d) => ({ ...d, priceOptions: d.priceOptions.filter((_, idx) => idx !== i) }))}
							size="sm"
							variant="ghost"
						>
							삭제
						</Button>
					</div>
				))}
				<Button
					onClick={() => setDraft((d) => ({ ...d, priceOptions: [...d.priceOptions, { amount: 0, days: 30 }] }))}
					size="sm"
					variant="secondary"
				>
					가격 옵션 추가
				</Button>
			</div>

			<Button disabled={pending || draft.name.trim().length === 0} onClick={submit}>
				저장
			</Button>
		</div>
	);
}
```

- [ ] **Step 3: 상품 생성 페이지**

`apps/web/src/app/moderator/ad-products/[placementId]/new/page.tsx`:

```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdProductForm } from "@/components/bambi/ad-product-form";
import { orpc } from "@/utils/orpc";

export default function NewAdProductPage() {
	const router = useRouter();
	const params = useParams<{ placementId: string }>();
	const create = useMutation(
		orpc.bambi.adProducts.createProduct.mutationOptions({
			onSuccess: () => {
				toast.success("광고 상품을 만들었어요.");
				router.push("/moderator/ad-products");
			},
			onError: (error) => toast.error(error.message),
		})
	);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-6">
			<h1 className="m-0 font-extrabold text-2xl">광고 상품 추가</h1>
			<AdProductForm
				onSubmit={(draft) =>
					create.mutate({
						placementId: params.placementId,
						name: draft.name,
						tagline: draft.tagline || undefined,
						benefits: draft.benefits,
						priceOptions: draft.priceOptions,
					})
				}
				pending={create.isPending}
			/>
		</div>
	);
}
```

- [ ] **Step 4: 스냅샷 테스트 추가**

`visual-job-components.test.ts`에 추가:

```ts
	it("wires ad-product create forms to catalog mutations", () => {
		const placementNew = readComponent("../../app/moderator/ad-products/new/page.tsx");
		const productNew = readComponent("../../app/moderator/ad-products/[placementId]/new/page.tsx");
		expect(placementNew).toContain("createPlacement");
		expect(productNew).toContain("createProduct");
		expect(productNew).toContain("AdProductForm");
	});
```

- [ ] **Step 5: 테스트·타입체크·린트**

Run: `pnpm --filter web test visual-job-components`
Expected: PASS.
Run: `pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/app/moderator/ad-products apps/web/src/components/bambi/ad-product-form.tsx apps/web/src/components/bambi/visual-job-components.test.ts
git commit -m "feat: 운영자 광고 위치·상품 생성 폼 추가"
```

---

### Task 8: 안내 페이지 동적화 (`/employer/ad-guide`)

**Files:**
- Modify: `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` (client + getCatalog)
- Modify: `apps/web/src/lib/bambi/ad-products.ts` (하드코딩 `AD_PRODUCTS` 제거, `formatAdPrice`는 `ad-catalog.ts`로 대체)
- Test: `apps/web/src/components/bambi/visual-job-components.test.ts` (스냅샷 갱신)

**Interfaces:**
- Consumes: `orpc.bambi.adProducts.getCatalog` (Task 2). `formatAdPrice`/`formatAdDuration`/`AdCatalogPlacement` (Task 5). 기존 `AdPlacementDiagram`.

- [ ] **Step 1: 안내 스크린을 client + 쿼리로 전환**

`apps/web/src/components/bambi/screens/employer-ad-guide.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { Badge } from "@bambi-app/ui/components/badge";
import { buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { cn } from "@bambi-app/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check, Megaphone } from "lucide-react";
import Link from "next/link";
import { AdPlacementDiagram } from "@/components/bambi/ad-placement-diagram";
import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import {
	type AdCatalogPlacement,
	formatAdDuration,
	formatAdPrice,
} from "@/lib/bambi/ad-catalog";
import { orpc } from "@/utils/orpc";

const APPLY_HREF = "/employer/new";

function PlacementSection({ placement }: { placement: AdCatalogPlacement }) {
	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2">
					<Badge variant={placement.kind === "banner" ? "secondary" : "success"}>
						{placement.kind === "banner" ? "배너 광고" : "리스팅 노출"}
					</Badge>
					<h2 className="m-0 font-extrabold text-xl">{placement.name}</h2>
				</div>
				{placement.description ? (
					<p className="m-0 text-muted-foreground text-sm">{placement.description}</p>
				) : null}
			</div>
			{placement.kind === "listing" ? <AdPlacementDiagram /> : null}
			<div className="flex flex-col gap-3">
				{placement.products.map((product) => (
					<Card key={product.id}>
						<CardContent className="flex flex-col gap-3">
							<div className="flex flex-col gap-1">
								<span className="font-extrabold text-lg">{product.name}</span>
								{product.tagline ? (
									<span className="text-muted-foreground text-sm">{product.tagline}</span>
								) : null}
							</div>
							{product.benefits.length > 0 ? (
								<ul className="m-0 flex flex-col gap-1.5 p-0">
									{product.benefits.map((benefit) => (
										<li className="flex items-center gap-2 text-sm" key={benefit}>
											<span className="inline-flex size-4 text-primary">
												<Check size={16} />
											</span>
											{benefit}
										</li>
									))}
								</ul>
							) : null}
							<Separator />
							<div className="flex flex-wrap gap-2">
								{product.priceOptions.map((option) => (
									<span
										className="rounded-lg bg-secondary px-3 py-1.5 font-bold text-sm"
										key={`${product.id}-${option.days}`}
									>
										{formatAdDuration(option.days)} · {formatAdPrice(option.amount)}
									</span>
								))}
							</div>
							<Link className={cn(buttonVariants({ variant: "secondary" }), "no-underline")} href={APPLY_HREF}>
								신청하기
							</Link>
						</CardContent>
					</Card>
				))}
			</div>
		</section>
	);
}

export function EmployerAdGuideScreen() {
	const catalogQuery = useQuery(orpc.bambi.adProducts.getCatalog.queryOptions());
	const placements = catalogQuery.data ?? [];

	return (
		<PageShell description="원하는 노출 위치와 광고 상품을 확인하고 신청하세요." title="광고 상품 안내">
			<Card>
				<CardContent className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<span className="inline-flex size-5 text-primary">
							<Megaphone size={20} />
						</span>
						<span className="font-bold">광고 등록 문의</span>
					</div>
					<Link className={cn(buttonVariants({ variant: "default" }), "no-underline")} href={APPLY_HREF}>
						공고 등록하기
					</Link>
				</CardContent>
			</Card>

			{catalogQuery.isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-40 w-full rounded-xl" />
					<Skeleton className="h-40 w-full rounded-xl" />
				</div>
			) : null}

			{!catalogQuery.isLoading && placements.length === 0 ? (
				<EmptyState description="곧 다양한 광고 상품을 선보일 예정이에요." title="준비 중인 광고 상품" />
			) : null}

			{placements.map((placement) => (
				<PlacementSection key={placement.id} placement={placement} />
			))}
		</PageShell>
	);
}
```

> `AdPlacementDiagram`가 필수 props를 요구하면(기존 시그니처 확인), listing 미리보기는 생략하거나 기본 props를 전달한다. `buttonVariants`의 `variant` 이름(`default`/`secondary`)이 실제와 다르면 맞춘다.

- [ ] **Step 2: 하드코딩 상수 제거**

`apps/web/src/lib/bambi/ad-products.ts`에서 `AD_PRODUCTS` 상수와 그 타입(`AdProduct`, `AdProductPrice` 등)을 제거한다. `formatAdPrice`는 `ad-catalog.ts`로 이전됐으므로 이 파일에서 삭제한다. 파일 내 다른 곳(그 외 참조)이 없으면 파일 자체를 삭제하고, `AdPlacementDiagram` 등에서 남은 타입 참조가 있으면 `ad-catalog.ts` 타입으로 교체한다.

Run: `pnpm --filter web check-types`
Expected: PASS (남은 `AD_PRODUCTS`/`formatAdPrice` 참조가 있으면 여기서 에러로 드러남 → 모두 교체).

- [ ] **Step 3: 스냅샷 테스트 갱신**

`visual-job-components.test.ts`에 추가:

```ts
	it("renders the employer ad guide from the dynamic catalog", () => {
		const source = readComponent("screens/employer-ad-guide.tsx");
		expect(source).toContain("adProducts.getCatalog");
		expect(source).not.toContain("AD_PRODUCTS");
	});
```

- [ ] **Step 4: 테스트·타입체크·린트**

Run: `pnpm --filter web test visual-job-components`
Expected: PASS.
Run: `pnpm --filter web check-types`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/screens/employer-ad-guide.tsx apps/web/src/lib/bambi/ad-products.ts apps/web/src/components/bambi/visual-job-components.test.ts
git commit -m "feat: 광고 안내 페이지를 동적 카탈로그로 전환"
```

---

### Task 9: 초기 카탈로그 시드(선택, 사용자 실행)

**Files:**
- Create: `packages/db/scripts/seed-ad-catalog.ts`

**Interfaces:**
- Consumes: `db`, `adPlacement`, `adProduct` (Task 1).

- [ ] **Step 1: 멱등 시드 스크립트 작성**

`packages/db/scripts/seed-ad-catalog.ts`:

```ts
import { db } from "../src/index";
import { adPlacement, adProduct } from "../src/schema/bambi";
import { eq } from "drizzle-orm";

const SEED: {
	name: string;
	description: string;
	kind: "banner" | "listing";
	products: { name: string; tagline: string; benefits: string[]; priceOptions: { amount: number; days: number }[] }[];
}[] = [
	{
		name: "스페셜 채용(프리미엄 노출)",
		description: "채용 마켓 최상단 스페셜 섹션에 노출됩니다.",
		kind: "listing",
		products: [
			{ name: "프리미엄 광고", tagline: "스페셜 섹션 상단 고정", benefits: ["스페셜 채용 섹션 노출", "상단 고정"], priceOptions: [{ amount: 330_000, days: 30 }, { amount: 600_000, days: 60 }, { amount: 850_000, days: 90 }] },
		],
	},
	{
		name: "추천 채용",
		description: "추천 채용 섹션에 노출됩니다.",
		kind: "listing",
		products: [
			{ name: "추천 광고", tagline: "추천 섹션 노출", benefits: ["추천 채용 섹션 노출"], priceOptions: [{ amount: 220_000, days: 30 }, { amount: 400_000, days: 60 }, { amount: 560_000, days: 90 }] },
		],
	},
	{
		name: "상단 프리미엄 배너",
		description: "채용 마켓 상단 프리미엄 배너 4칸 중 1칸.",
		kind: "banner",
		products: [
			{ name: "프리미엄 배너", tagline: "상단 배너 노출", benefits: ["상단 프리미엄 배너"], priceOptions: [{ amount: 500_000, days: 30 }] },
		],
	},
];

async function main() {
	for (let i = 0; i < SEED.length; i++) {
		const entry = SEED[i];
		const existing = await db.select({ id: adPlacement.id }).from(adPlacement).where(eq(adPlacement.name, entry.name)).limit(1);
		if (existing.length > 0) {
			continue;
		}
		const [placement] = await db
			.insert(adPlacement)
			.values({ name: entry.name, description: entry.description, kind: entry.kind, sortOrder: i })
			.returning();
		await db.insert(adProduct).values(
			entry.products.map((p, idx) => ({ ...p, placementId: placement.id, sortOrder: idx }))
		);
	}
	// biome-ignore lint/suspicious/noConsole: 시드 스크립트 로그
	console.log("ad catalog seeded");
}

main().then(() => process.exit(0));
```

- [ ] **Step 2: 타입체크·커밋**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: PASS.

```bash
git add packages/db/scripts/seed-ad-catalog.ts
git commit -m "chore: 광고 카탈로그 초기 시드 스크립트 추가"
```

- [ ] **Step 3: 【사용자 수행】 시드 실행(선택)**

> 사용자에게 요청: `pnpm --filter @bambi-app/db exec tsx scripts/seed-ad-catalog.ts` (또는 admin 콘솔에서 직접 입력). 멱등이므로 재실행해도 중복 생성되지 않는다.

---

## Self-Review

**1. Spec coverage** — 스펙 각 절 대응:
- §5 데이터 모델 → Task 1. §6 API(읽기/placement/product) → Task 2/3/4. §7 admin 콘솔 → Task 6/7. §8 안내 페이지 → Task 8. §10 마이그레이션 → Task 1 Step 5(사용자), 시드 → Task 9. §11 권한 → Task 2–4 테스트(FORBIDDEN). §12 테스트 → 각 API Task 실 DB 테스트 + web 문자열 스냅샷. §13 파일 변경 → 각 Task Files. 누락 없음.

**2. Placeholder scan** — "TBD/이후/적절히 처리" 없음. 모든 코드 스텝에 실제 코드 포함. `AdPlacementDiagram`/`buttonVariants` variant 이름은 실제 시그니처 확인 후 맞추라는 명시적 조건부 지시(플레이스홀더 아님).

**3. Type consistency** — 절차명 일관: `getCatalog`, `listCatalogAdmin`, `createPlacement`, `updatePlacement`, `deletePlacement`, `reorderPlacements`, `createProduct`, `updateProduct`, `deleteProduct`, `reorderProducts`. 타입 `AdCatalogPlacement`/`AdCatalogProduct`(Task 5)를 Task 6/8이 소비. `priceOptions: {amount,days}[]`·`benefits: string[]`가 스키마(Task 1)·API(Task 4)·web(Task 5/7/8) 전반 일치.

## Execution Handoff

계획 저장 완료. 실행 방식은 아래에서 사용자가 선택.
