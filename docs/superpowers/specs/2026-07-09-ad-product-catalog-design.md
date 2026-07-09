# 광고 상품 카탈로그 (admin 관리 → 안내 페이지 동적 노출) — 설계

- 날짜: 2026-07-09
- 브랜치(작업): `worktree-ad-product-catalog`
- 관련 기존 브랜치: `feat/seeker-page-fixed-width-ad-banners`

## 1. 목표

운영자(admin)가 **광고 노출 위치와 그 안의 광고 상품(가격·이용기간·설명)** 을 직접 생성·관리하고, 구인자용 **광고 등록 안내 페이지(`/employer/ad-guide`)** 가 이를 하드코딩이 아니라 DB에서 동적으로 렌더한다. 각 상품은 이용기간별 가격 옵션을 가지며 안내 페이지에 "이용기간 · 가격"으로 표시된다.

## 2. 배경 / 현재 상태

- 안내 페이지는 `apps/web/src/lib/bambi/ad-products.ts`의 **하드코딩 `AD_PRODUCTS`** (premium/recommended/standard 3종, 각 30/60/90일 가격)를 `screens/employer-ad-guide.tsx`(**server 컴포넌트**)가 렌더. 파일 주석에 "광고비는 아직 DB에 없음, 추후 실값 교체 지점"이라 명시.
- DB에는 공고 단위 `job_promotion_campaign`(tier/status/startsAt/endsAt, **가격 없음**)만 존재. **광고 상품/가격 카탈로그 테이블 없음.**
- `/seeker` 마켓플레이스의 광고 자리는 두 계열:
  - **리스팅 노출**: 스페셜(=promotionTier premium)·추천(=recommended)·일반(=standard) — DB 구동, 가격만 없음.
  - **배너 광고**: 상단 프리미엄 배너(4칸), 좌·우 사이드 배너(각 3칸) — 전부 하드코딩 샘플 gif, **DB 모델 전무**.
  - 급구 채용: 부스트 활동 파생 뷰.
- 운영자 콘솔(`/moderator/*`, role `admin`)은 존재. `/moderator/employers`가 폼+뮤테이션 CRUD 템플릿. 권한은 핸들러 내 `requireAdminProfile(context.session)`.
- 스키마 컨벤션(`packages/db/src/schema/bambi.ts`): id `uuid("id").defaultRandom().primaryKey()`, enum `pgEnum`, `jsonb`, `timestamp("...").defaultNow().notNull()` / `updatedAt` `$onUpdate(() => new Date())`, FK `references(() => x.id, { onDelete: "cascade" })`, `index()`/`uniqueIndex()`.
- **시드 인프라 없음**(seed 스크립트 부재). 마이그레이션: 사용자가 `db:generate` → `db:migrate` (본 레포 규칙상 Claude는 `db:*` 직접 실행 금지, `db:push` 금지).

## 3. 결정된 요구사항 (확정)

1. **만료기간 = 상품별 이용 기간** (예: 30/60/90일 옵션). 판매 종료일 아님.
2. **안내 페이지 카탈로그만** — 결제/구매 흐름 없음. 신청 CTA는 기존 `/employer/new`로 연결.
3. **/seeker 전 자리 포함** — 리스팅(스페셜/추천/일반) + 배너(프리미엄/사이드) 모두 카탈로그 대상.
4. **admin이 노출 위치까지 생성** — placement가 코드 고정 enum이 아니라 admin CRUD 대상(완전 동적).
5. **급구 채용 포함** — 하나의 광고 상품으로 카탈로그에 노출 가능.
6. **데이터 모델 = 2테이블**(`ad_placement` + `ad_product`), 가격은 상품의 JSON 옵션 배열.

## 4. 범위

**포함**: 신규 2테이블, admin CRUD API + 콘솔 페이지, 안내 페이지 동적화, 초기 시드, 테스트.

**범위 밖(YAGNI)**: 결제·구매 흐름 / 실제 배너 이미지 업로드 및 `/seeker` 실렌더 연동 / 광고 캠페인 노출 로직 / 급구 부스트 자동화 / 상품 판매 종료일. (모두 후속 과제)

## 5. 데이터 모델 (`packages/db/src/schema/bambi.ts`)

```ts
export const adPlacementKind = pgEnum("ad_placement_kind", [
  "listing", // 리스팅 노출(스페셜/추천/일반/급구) — 안내 페이지 리스팅 다이어그램 미리보기
  "banner",  // 배너 광고(프리미엄 상단·사이드) — 배너 프리뷰
]);

export const adPlacement = pgTable(
  "ad_placement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),            // 위치명: "상단 프리미엄 배너"
    description: text("description"),         // 위치 안내 문구(선택)
    kind: adPlacementKind("kind").notNull().default("listing"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index("ad_placement_active_sort_idx").on(t.isActive, t.sortOrder)]
);

export const adProduct = pgTable(
  "ad_product",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placementId: uuid("placement_id")
      .notNull()
      .references(() => adPlacement.id, { onDelete: "cascade" }),
    name: text("name").notNull(),            // 상품명: "프리미엄 배너"
    tagline: text("tagline"),                // 한 줄 소개(선택)
    benefits: jsonb("benefits").$type<string[]>().default([]).notNull(),        // 서비스 내용
    priceOptions: jsonb("price_options")     // 이용기간별 가격
      .$type<{ amount: number; days: number }[]>()
      .default([])
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index("ad_product_placement_idx").on(t.placementId, t.isActive, t.sortOrder)]
);

// relations: adPlacement 1—N adProduct
```

- `amount`는 **원(정수, 주단위)** — 기존 `payAmount` 컨벤션과 동일.
- `priceOptions`/`benefits`는 표시 전용이라 JSON으로 충분(정규화 불필요).

## 6. API (`packages/api/src/routers/bambi/ad-products.ts`, `bambi/index.ts`에 `adProducts` 등록)

zod 입력(공통): `name` min1, `description`/`tagline` optional, `kind` `z.enum(["listing","banner"])`, `sortOrder` int≥0, `benefits` `z.array(z.string().min(1))`, `priceOptions` `z.array(z.object({ amount: z.number().int().min(0), days: z.number().int().min(1) })).min(1)`.

**읽기**
- `getCatalog` — `protectedProcedure`(인증 구인자). `isActive` placement + 각 placement의 `isActive` product를 `sortOrder`로 정렬 반환. 안내 페이지용.
- `listCatalogAdmin` — `protectedProcedure` + `requireAdminProfile`. inactive 포함 전체. 콘솔용.

**admin 뮤테이션** (모두 `protectedProcedure` + `requireAdminProfile`, `moderation.ts` 패턴)
- placement: `createPlacement`, `updatePlacement`(부분 수정 + isActive 토글), `deletePlacement`(하위 product cascade), `reorderPlacements`(정렬 id 배열 → sortOrder 일괄).
- product: `createProduct`, `updateProduct`, `deleteProduct`, `reorderProducts`(placement 내 정렬).

에러: 검증 실패 시 zod 에러 → 클라이언트 toast. placement 삭제는 cascade(콘솔 확인창). 감사 로그(`adminModerationAction`)는 이 카탈로그 CRUD엔 **미적용**(후속 선택 과제로 명시).

## 7. Admin 콘솔 UI (`apps/web/src/app/moderator/ad-products/page.tsx`)

- 운영자 nav "광고 상품" 탭 추가: `apps/web/src/app/moderator/layout.tsx`(헤더 nav) + `components/bambi/persona-nav.tsx` `ModTabs`/`MOD_ROUTES`(하단 탭) 양쪽 배선. 라우트 `/moderator/ad-products`.
- 패턴: `/moderator/employers`와 동일 — `"use client"`, `@tanstack/react-query` `useQuery`/`useMutation` via `@/utils/orpc`, shadcn `Card`/`Input`/`Textarea`/`Switch`/`Select`(kind)/`Button`/`Field`/`FieldGroup`, `toast`(sonner), 성공 시 `invalidateQueries`.
- 컴포넌트 분리(각 단일 책임): `AdCatalogAdmin`(컨테이너/데이터), `AdPlacementForm`, `AdProductForm`, `PriceOptionsEditor`(옵션 행 추가/삭제), `BenefitsEditor`(문자열 목록). 순서변경 up/down(sortOrder), active `Switch` 토글, 삭제 확인창(`AlertDialog`).
- UI 규칙: 밤비 shadcn/Tailwind 지침 준수(인라인 style 금지, 시맨틱 토큰, `rounded-none` 금지, `Empty`/`Skeleton`).

## 8. 안내 페이지 개편 (`screens/employer-ad-guide.tsx` + `app/employer/ad-guide/page.tsx`)

- 하드코딩 `AD_PRODUCTS` 제거 → `orpc.bambi.adProducts.getCatalog` 사용. 스크린을 **client 컴포넌트**(`"use client"` + `useQuery`)로 전환(레포의 다른 screens·콘솔과 일관, `Skeleton` 로딩·`Empty` 빈 상태). page.tsx는 얇은 래퍼 유지.
- 렌더 구조: **위치별 섹션**(placement.name + description + `kind` 미리보기: listing→`AdPlacementDiagram` 재사용, banner→배너 프리뷰) → 그 아래 **상품 카드 목록**(상품명·태그라인·`benefits`·가격 옵션 표 "N일 · 000,000원"). CTA "신청하기" = 기존 `APPLY_HREF`(`/employer/new`).
- UI 개선: `/seeker` 시각 언어(배지/톤)와 정합, 위치별 그룹 정리. 기존 "광고 등록 문의" 콜아웃 카드 유지.
- 가격 포맷 `formatAdPrice`는 `lib/bambi/ad-products.ts`에서 공용 util(`lib/bambi/ad-catalog.ts` 또는 유지)로 정리해 admin·안내 페이지 공유. 하드코딩 `AD_PRODUCTS` 상수는 제거(타입은 API 파생 타입 사용).

## 9. 데이터 플로우

admin 콘솔 폼 → `adProducts.*` 뮤테이션 → `ad_placement`/`ad_product` DB → `getCatalog` 쿼리 → 안내 페이지 렌더. react-query invalidation으로 콘솔·안내 동기화.

## 10. 마이그레이션 & 시드

1. 스키마에 enum·2테이블·relations 추가. `drizzle.config.ts`는 이미 `bambi.ts` 포함.
2. **사용자가** `pnpm --filter @bambi-app/db db:generate` → 생성된 `000X_*.sql` 검토 → `pnpm --filter @bambi-app/db db:migrate`. (**Claude는 db:* 미실행, `db:push` 금지**.)
3. 초기 시드(선택): 시드 인프라가 없으므로 **데이터 마이그레이션 SQL 1개**(`000X_seed_ad_catalog.sql`, 수기 INSERT)로 현재 3개 리스팅 상품 + 배너 위치(프리미엄/사이드)를 이관. 대안: admin 콘솔에서 직접 입력(도그푸딩). 계획 단계에서 택1.

## 11. 에러 / 권한

- 뮤테이션: `requireAdminProfile` → 비어드민 `FORBIDDEN`. `/moderator/*`는 `enforceModeratorAccess()` 이미 적용.
- 입력 검증 실패 → toast. placement 삭제 cascade → 확인창. 빈 카탈로그 → 안내 페이지 `Empty`.

## 12. 테스트

- **API**: `adProducts` 입력 zod 검증(잘못된 priceOptions/빈 name 거부), authz(비어드민 뮤테이션 차단), `getCatalog`가 active만 반환. 기존 api 테스트 셋업 따름(계획 단계에서 위치 확인).
- **web**: 문자열 스냅샷(`visual-job-components.test.ts` 컨벤션) — `employer-ad-guide.tsx`가 `AD_PRODUCTS` 상수 대신 `adProducts.getCatalog`를 사용하는지, 운영자 nav에 `/moderator/ad-products`가 배선됐는지.

## 13. 주요 파일 변경 목록

- 신규: `packages/db/src/schema/bambi.ts`(테이블 추가), `packages/api/src/routers/bambi/ad-products.ts`, `apps/web/src/app/moderator/ad-products/page.tsx`, `components/bambi/screens/ad-catalog-admin*.tsx`(콘솔 컴포넌트), (선택) `000X_seed_ad_catalog.sql`.
- 수정: `packages/api/src/routers/bambi/index.ts`(등록), `apps/web/src/app/moderator/layout.tsx` + `components/bambi/persona-nav.tsx`(nav), `components/bambi/screens/employer-ad-guide.tsx`(동적화), `app/employer/ad-guide/page.tsx`, `lib/bambi/ad-products.ts`(상수 제거·util 정리), 테스트 파일.

## 14. 미해결 / 후속

- 감사 로그 연동(선택), 배너 이미지 실제 업로드·/seeker 연동, 결제·캠페인 생성, 급구 자동 부스트 — 모두 후속.
- 초기 시드 방식(데이터 마이그레이션 SQL vs admin 수기)은 계획 단계에서 확정.
