# 수다방(커뮤니티) 접근 제어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 여성회원과 광고 중인 업소(owner/admin) 회원만 수다방에 입장하도록 접근 자격 판정·광고 상태 동기화·탭 게이팅·안내 화면을 배선한다.

**Architecture:** 순수 판정 로직 `resolveCommunityAccess`(api 서비스, 단위 테스트)가 gender·라이브 광고 자격을 받아 canAccess/notice를 돌려준다. 광고 자격은 스케줄러 없이 `member(owner/admin)→조직→캠페인(active, startsAt≤now<endsAt)` 조인으로 **조회 시 파생 계산**(권위값)하고, `is_advertiser` 컬럼은 캠페인 activate/pause 이벤트에서 동기화되는 캐시다. `onboarding.getMine`이 `community` 플래그를 노출하고, 프론트는 `useBambiAuth` 컨텍스트로 소비해 탭 3곳·페이지 게이트를 제어한다. 회원 gender는 회원가입 시 클라이언트가 `adultsex` 쿠키(삭제 전)를 읽어 프로필 생성 input으로 전달한다.

**Tech Stack:** TypeScript, drizzle-orm(PostgreSQL), oRPC, Next.js(App Router, RSC), TanStack Query, shadcn/base-ui + Tailwind v4, vitest.

## Global Constraints

- **DB 마이그레이션:** `db:push` 금지. 스키마 수정 후 `db:generate`로 마이그레이션 파일 생성, 적용은 `db:migrate`. (이 계획은 generate까지만; migrate는 사용자 환경에서.)
- **빌드/실행 금지:** `build`·dev 서버 기동 금지. 검증은 타입체크·단위/통합테스트·`ultracite`만. 시각 확인은 사용자에게 요청.
- **web UI:** shadcn/base-ui 우선, 인라인 `style` 금지, 임의 px 금지(토큰), base-ui 커스텀 엘리먼트는 `render` prop(asChild 아님). 세로 스택 `flex flex-col gap-*`.
- **커밋 메시지:** 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(블릿 사이 빈 줄 없음).
- **푸시·PR 금지:** 사용자의 명시적 지시 전까지 `git push`·PR 생성 금지. 로컬 커밋까지만.
- **입장 자격 정의(verbatim):** `canAccess = status !== "suspended" AND (role === "admin" OR gender === "female" OR (role === "employer" AND isAdvertiser === true))`. `isAdvertiser`는 라이브 파생값.
- **광고 자격 범위(verbatim):** 조직 멤버 중 `role === "owner" || role === "admin"`만. 캠페인 활성 판정: `status === "active" AND startsAt <= now AND endsAt > now`.

## Prerequisites

- [ ] 워크트리(`.claude/worktrees/community-access-gate`, 브랜치 `feat/community-access-gate`)에서 작업.
- [ ] 최초 1회 `pnpm install` (워크트리 node_modules 필요).
- [ ] api 통합 테스트는 실 DB에 붙는다(`packages/api/src/routers/bambi/*.test.ts` 패턴, `.env` 로드). 통합 테스트 실행 전 `apps/server/.env`의 DB 연결이 유효해야 한다.

---

## File Structure

- **Modify** `packages/db/src/schema/bambi.ts` — `bambiProfile.isAdvertiser` 컬럼.
- **Create** `packages/db/src/migrations/0010_*.sql` (+ meta) — `db:generate` 산출.
- **Create** `packages/api/src/services/bambi-community-access.ts` — `resolveCommunityAccess` 순수 판정.
- **Create** `packages/api/src/services/bambi-community-access.test.ts`.
- **Create** `packages/api/src/services/bambi-advertiser.ts` — 광고 자격 라이브 판정·동기화.
- **Create** `packages/api/src/services/bambi-advertiser.test.ts` — 순수 + 통합 테스트.
- **Modify** `packages/api/src/services/bambi-authz.ts` — `BambiAccessProfile`·select에 `gender`.
- **Modify** `packages/api/src/routers/bambi/onboarding.ts` — `profileInput.gender`, `createBambiProfile` gender 기록, `getMine`에 `community`(라이브 advertiser).
- **Modify** `packages/api/src/routers/bambi/promotions.ts` — activate/pause 후 `is_advertiser` 동기화.
- **Modify** `apps/web/src/lib/bambi/guest.ts` — `readAdultGenderFromCookieString`.
- **Modify** `apps/web/src/components/bambi/screens/auth-screen.tsx` — 회원가입 시 gender 캡처·전달.
- **Modify** `apps/web/src/components/bambi/auth-client-provider.tsx` — `canAccessCommunity`·`communityNotice` 노출.
- **Modify** `apps/web/src/components/bambi/mobile-tab-bar.tsx` — 수다방 탭 조건부.
- **Modify** `apps/web/src/components/bambi/responsive-shell.tsx` — 데스크톱 nav 수다방 조건부.
- **Create** `apps/web/src/components/bambi/community-access-notice.tsx` — 미자격 안내 화면.
- **Create** `apps/web/src/components/bambi/require-community-access.tsx` — 페이지 게이트.
- **Modify** `apps/web/src/app/seeker/community/page.tsx` — 게이트 적용.

---

## Task 1: DB — `is_advertiser` 컬럼 + 마이그레이션

**Files:**
- Modify: `packages/db/src/schema/bambi.ts:133`
- Create: `packages/db/src/migrations/0010_*.sql` (+ `meta/_journal.json`, `meta/0010_snapshot.json`) — generate 산출

**Interfaces:**
- Produces: `bambiProfile.isAdvertiser` (boolean 컬럼 접근자).

- [ ] **Step 1: 스키마에 컬럼 추가**

`packages/db/src/schema/bambi.ts`의 `bambiProfile` 정의에서 `gender` 다음 줄에 추가:

```ts
		gender: bambiGender("gender"),
		// 광고(프로모션) 중인 업소(owner/admin) 표시 캐시. 진실값은 조회 시 캠페인 조인으로
		// 파생 계산하며(bambi-advertiser), 이 컬럼은 activate/pause 이벤트에서 동기화된다.
		isAdvertiser: boolean("is_advertiser").default(false).notNull(),
		displayName: text("display_name"),
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm --filter @bambi-app/db db:generate`
Expected: `0010_*.sql` 생성, `ALTER TABLE "bambi_profile" ADD COLUMN "is_advertiser" boolean DEFAULT false NOT NULL;` 포함. `meta/_journal.json`에 idx 10 항목 추가.

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
git add packages/db/src/schema/bambi.ts packages/db/src/migrations
git commit -m "feat: bambi_profile에 is_advertiser 컬럼 추가
- 광고 중 업소(owner/admin) 표시 캐시 컬럼(boolean, default false, notNull) 신설
- 진실값은 캠페인 조인 파생 계산, 컬럼은 activate/pause 이벤트에서 동기화
- drizzle generate로 0010 마이그레이션 생성"
```

---

## Task 2: 입장 자격 판정 헬퍼 (api 서비스, TDD)

**Files:**
- Create: `packages/api/src/services/bambi-community-access.ts`
- Test: `packages/api/src/services/bambi-community-access.test.ts`

**Interfaces:**
- Produces:
  - `type CommunityAccessNotice = "unverified" | "male_employer" | "male_seeker"`
  - `interface CommunityAccessProfile { gender: "male"|"female"|null; isAdvertiser: boolean; role: "job_seeker"|"employer"|"admin"; status: "active"|"warned"|"suspended" }`
  - `interface CommunityAccess { canAccess: boolean; notice: CommunityAccessNotice | null }`
  - `resolveCommunityAccess(profile: CommunityAccessProfile): CommunityAccess`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/services/bambi-community-access.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	type CommunityAccessProfile,
	resolveCommunityAccess,
} from "./bambi-community-access";

const base: CommunityAccessProfile = {
	gender: null,
	isAdvertiser: false,
	role: "job_seeker",
	status: "active",
};

describe("resolveCommunityAccess", () => {
	it("allows female members", () => {
		expect(resolveCommunityAccess({ ...base, gender: "female" })).toEqual({
			canAccess: true,
			notice: null,
		});
	});

	it("allows advertiser employers", () => {
		expect(
			resolveCommunityAccess({
				...base,
				gender: "male",
				isAdvertiser: true,
				role: "employer",
			})
		).toEqual({ canAccess: true, notice: null });
	});

	it("allows admins regardless of gender", () => {
		expect(resolveCommunityAccess({ ...base, role: "admin" })).toEqual({
			canAccess: true,
			notice: null,
		});
	});

	it("blocks non-advertiser employers", () => {
		expect(
			resolveCommunityAccess({ ...base, gender: "male", role: "employer" })
		).toEqual({ canAccess: false, notice: "male_employer" });
	});

	it("blocks male job seekers", () => {
		expect(resolveCommunityAccess({ ...base, gender: "male" })).toEqual({
			canAccess: false,
			notice: "male_seeker",
		});
	});

	it("returns unverified notice when gender is unknown", () => {
		expect(resolveCommunityAccess(base)).toEqual({
			canAccess: false,
			notice: "unverified",
		});
	});

	it("blocks suspended members even when female", () => {
		expect(
			resolveCommunityAccess({
				...base,
				gender: "female",
				status: "suspended",
			}).canAccess
		).toBe(false);
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test bambi-community-access`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 헬퍼 구현**

`packages/api/src/services/bambi-community-access.ts`:

```ts
import type {
	accountStatus,
	bambiGender,
	bambiUserRole,
} from "@bambi-app/db/schema/bambi";

type Role = (typeof bambiUserRole.enumValues)[number];
type Status = (typeof accountStatus.enumValues)[number];
type Gender = (typeof bambiGender.enumValues)[number];

export type CommunityAccessNotice =
	| "unverified"
	| "male_employer"
	| "male_seeker";

export interface CommunityAccessProfile {
	gender: Gender | null;
	isAdvertiser: boolean;
	role: Role;
	status: Status;
}

export interface CommunityAccess {
	canAccess: boolean;
	notice: CommunityAccessNotice | null;
}

// 수다방 입장 자격: 정지 계정이 아니고 (관리자 | 여성회원 | 광고 중 업소).
// 미자격자에게는 상황별 안내(notice)를 함께 돌려준다. isAdvertiser는 호출부가
// 라이브 파생 계산해 넘긴다(저장 컬럼을 신뢰하지 않음).
export const resolveCommunityAccess = (
	profile: CommunityAccessProfile
): CommunityAccess => {
	const active = profile.status !== "suspended";
	const canAccess =
		active &&
		(profile.role === "admin" ||
			profile.gender === "female" ||
			(profile.role === "employer" && profile.isAdvertiser));

	if (canAccess) {
		return { canAccess: true, notice: null };
	}

	let notice: CommunityAccessNotice;
	if (profile.gender === null) {
		notice = "unverified";
	} else if (profile.role === "employer") {
		notice = "male_employer";
	} else {
		notice = "male_seeker";
	}

	return { canAccess: false, notice };
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test bambi-community-access`
Expected: PASS (7 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/services/bambi-community-access.ts packages/api/src/services/bambi-community-access.test.ts
git commit -m "feat: 수다방 입장 자격 판정 헬퍼 resolveCommunityAccess 추가
- 정지 아님 AND (관리자|여성회원|광고 중 업소) 자격 규칙을 순수 함수로 구현
- 미자격 사유별 notice(unverified|male_employer|male_seeker) 함께 반환
- isAdvertiser는 호출부의 라이브 파생값을 입력받는 구조로 분리
- 여성/광고업소/관리자/정지/미인증/남성 조합 단위 테스트 7건 추가"
```

---

## Task 3: 광고 자격 라이브 판정·동기화 서비스 (api, TDD)

**Files:**
- Create: `packages/api/src/services/bambi-advertiser.ts`
- Test: `packages/api/src/services/bambi-advertiser.test.ts`

**Interfaces:**
- Consumes: `member`(auth 스키마), `bambiProfile`·`jobPromotionCampaign`(bambi 스키마), Task 1의 `isAdvertiser` 컬럼.
- Produces:
  - `isAdvertiserEligibleRole(role: string | null | undefined): boolean`
  - `hasActiveAdvertiserCampaign({ userId: string; now: Date }): Promise<boolean>`
  - `syncAdvertiserFlagForOrganization({ organizationId: string; now: Date }): Promise<void>`

- [ ] **Step 1: 순수 헬퍼 실패 테스트 작성**

`packages/api/src/services/bambi-advertiser.test.ts` (우선 순수 함수만; 통합 테스트는 Step 5에서 추가):

```ts
import { describe, expect, it } from "vitest";

import { isAdvertiserEligibleRole } from "./bambi-advertiser";

describe("isAdvertiserEligibleRole", () => {
	it("allows owner and admin", () => {
		expect(isAdvertiserEligibleRole("owner")).toBe(true);
		expect(isAdvertiserEligibleRole("admin")).toBe(true);
	});

	it("rejects member and unknown roles", () => {
		expect(isAdvertiserEligibleRole("member")).toBe(false);
		expect(isAdvertiserEligibleRole(null)).toBe(false);
		expect(isAdvertiserEligibleRole(undefined)).toBe(false);
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter @bambi-app/api test bambi-advertiser`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 서비스 구현**

`packages/api/src/services/bambi-advertiser.ts`:

```ts
import { db } from "@bambi-app/db";
import { member } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	jobPromotionCampaign,
} from "@bambi-app/db/schema/bambi";
import { and, eq, gt, inArray, lte } from "drizzle-orm";

// 수다방 "광고 중 업소" 자격을 부여하는 조직 멤버 역할: 소유자·관리자만.
export const ADVERTISER_MEMBER_ROLES = ["owner", "admin"] as const;

export const isAdvertiserEligibleRole = (
	role: string | null | undefined
): boolean => role === "owner" || role === "admin";

// 유저가 owner/admin으로 속한 조직 중 지금 실제로 활성(active AND startsAt<=now<endsAt)
// 캠페인을 가진 곳이 하나라도 있으면 true. 만료는 endsAt 필터로 조회 시 파생 처리한다
// (스케줄러 없음). 이 값이 수다방 광고 자격의 권위값이다.
export const hasActiveAdvertiserCampaign = async ({
	now,
	userId,
}: {
	now: Date;
	userId: string;
}): Promise<boolean> => {
	const [row] = await db
		.select({ campaignId: jobPromotionCampaign.id })
		.from(jobPromotionCampaign)
		.innerJoin(
			member,
			and(
				eq(member.organizationId, jobPromotionCampaign.organizationId),
				eq(member.userId, userId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		)
		.where(
			and(
				eq(jobPromotionCampaign.status, "active"),
				lte(jobPromotionCampaign.startsAt, now),
				gt(jobPromotionCampaign.endsAt, now)
			)
		)
		.limit(1);

	return Boolean(row);
};

// 캠페인 상태가 바뀐 조직의 owner/admin 멤버들의 is_advertiser 캐시를 재계산해 동기화한다.
// 각 멤버는 여러 조직에 속할 수 있으므로 그 멤버의 전체 소속 기준으로 다시 판정한다.
export const syncAdvertiserFlagForOrganization = async ({
	now,
	organizationId,
}: {
	now: Date;
	organizationId: string;
}): Promise<void> => {
	const members = await db
		.select({ userId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				inArray(member.role, [...ADVERTISER_MEMBER_ROLES])
			)
		);

	for (const { userId } of members) {
		const isAdvertiser = await hasActiveAdvertiserCampaign({ now, userId });
		await db
			.update(bambiProfile)
			.set({ isAdvertiser })
			.where(eq(bambiProfile.userId, userId));
	}
};
```

- [ ] **Step 4: 순수 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api test bambi-advertiser`
Expected: PASS (isAdvertiserEligibleRole 2 tests).

- [ ] **Step 5: 통합 테스트 추가(실 DB)**

`bambi-advertiser.test.ts` 상단을 실 DB 하네스로 확장하고 통합 케이스를 추가한다. `organizations.test.ts:1-30` 패턴을 따른다:

```ts
import { randomUUID } from "node:crypto";

import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

import { isAdvertiserEligibleRole } from "./bambi-advertiser";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, advertiser] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./bambi-advertiser"),
]);

const { member, organization, user } = authSchema;
const { bambiProfile, jobPost, jobPromotionCampaign } = bambiSchema;

interface Seed {
	organizationId: string;
	ownerUserId: string;
	campaignId: string;
}

// endsAt이 미래인 active 캠페인을 소유한 조직 + owner 멤버 + employer 프로필을 시드한다.
const seedActiveAdvertiser = async ({
	endsAt,
	memberRole,
}: {
	endsAt: Date;
	memberRole: "owner" | "admin" | "member";
}): Promise<Seed> => {
	const now = new Date();
	const organizationId = `org_adv_${randomUUID()}`;
	const ownerUserId = `user_adv_${randomUUID()}`;
	const jobPostId = randomUUID();
	const campaignId = randomUUID();

	await db.insert(user).values({
		id: ownerUserId,
		name: "adv owner",
		email: `${ownerUserId}@bambi.test`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(organization).values({
		id: organizationId,
		name: organizationId,
		slug: organizationId,
		createdAt: now,
	});
	await db.insert(member).values({
		id: `mem_${randomUUID()}`,
		organizationId,
		userId: ownerUserId,
		role: memberRole,
		createdAt: now,
	});
	await db.insert(bambiProfile).values({
		userId: ownerUserId,
		role: "employer",
	});
	await db.insert(jobPost).values({
		id: jobPostId,
		organizationId,
		createdByUserId: ownerUserId,
		industryCategory: "cafe",
		region: "seoul",
		payAmount: 12_000,
		payUnit: "hour",
		workSchedule: "주 5일",
		title: "광고 테스트 공고",
		description: "설명",
	});
	await db.insert(jobPromotionCampaign).values({
		id: campaignId,
		jobPostId,
		organizationId,
		tier: "standard",
		status: "active",
		startsAt: new Date(now.getTime() - 60_000),
		endsAt,
	});

	return { campaignId, organizationId, ownerUserId };
};

const cleanup = async (seed: Seed): Promise<void> => {
	// FK cascade(organization/jobPost) + 명시 삭제로 시드 정리.
	await db
		.delete(bambiProfile)
		.where(eq(bambiProfile.userId, seed.ownerUserId));
	await db.delete(organization).where(eq(organization.id, seed.organizationId));
	await db.delete(user).where(eq(user.id, seed.ownerUserId));
};
```

> 참고 1: 위 스니펫은 `eq`를 쓰므로 상단 import에 `import { eq } from "drizzle-orm";`를 추가한다. `user`/`organization`/`member`의 실제 필수 컬럼(예: better-auth 스키마)은 `packages/db/src/schema/auth.ts`를 확인해 맞춘다. `createdAt`은 organization·member에 default가 없어 수동 지정한다.
> 참고 2(로드 순서): `bambi-advertiser.ts`는 `db`를 top-level import하므로, 테스트도 `dotenv.config` **이후** 동적 import해야 한다. Step 1의 정적 `import { isAdvertiserEligibleRole } from "./bambi-advertiser";`를 **제거**하고, 위 `Promise.all`의 `advertiser`(= `import("./bambi-advertiser")`)로 통일한 뒤, 순수 테스트도 `advertiser.isAdvertiserEligibleRole(...)`로 호출하도록 바꾼다. (`organizations.test.ts:14-26` 패턴 그대로.)

통합 케이스:

```ts
describe("hasActiveAdvertiserCampaign", () => {
	it("returns true for owner of an org with a live active campaign", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "owner",
		});
		try {
			await expect(
				advertiser.hasActiveAdvertiserCampaign({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(true);
		} finally {
			await cleanup(seed);
		}
	});

	it("returns false when the campaign already expired (endsAt in the past)", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() - 60_000),
			memberRole: "owner",
		});
		try {
			await expect(
				advertiser.hasActiveAdvertiserCampaign({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(false);
		} finally {
			await cleanup(seed);
		}
	});

	it("returns false for a plain member role", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "member",
		});
		try {
			await expect(
				advertiser.hasActiveAdvertiserCampaign({
					now: new Date(),
					userId: seed.ownerUserId,
				})
			).resolves.toBe(false);
		} finally {
			await cleanup(seed);
		}
	});
});

describe("syncAdvertiserFlagForOrganization", () => {
	it("sets is_advertiser true for owner/admin members with a live campaign", async () => {
		const seed = await seedActiveAdvertiser({
			endsAt: new Date(Date.now() + 60 * 60_000),
			memberRole: "owner",
		});
		try {
			await advertiser.syncAdvertiserFlagForOrganization({
				now: new Date(),
				organizationId: seed.organizationId,
			});
			const [profile] = await db
				.select({ isAdvertiser: bambiProfile.isAdvertiser })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, seed.ownerUserId));
			expect(profile?.isAdvertiser).toBe(true);
		} finally {
			await cleanup(seed);
		}
	});
});
```

- [ ] **Step 6: 통합 테스트 통과 확인·타입체크**

Run: `pnpm --filter @bambi-app/api test bambi-advertiser`
Expected: PASS. (DB 연결 필요. 컬럼 불일치·필수값 누락이 나면 `auth.ts`/`bambi.ts` 스키마에 맞춰 seed를 보정.)
Run: `pnpm --filter @bambi-app/api check-types`
Expected: 통과.

- [ ] **Step 7: 커밋**

```bash
git add packages/api/src/services/bambi-advertiser.ts packages/api/src/services/bambi-advertiser.test.ts
git commit -m "feat: 광고 자격 라이브 판정·동기화 서비스 추가
- isAdvertiserEligibleRole: owner/admin만 광고 자격
- hasActiveAdvertiserCampaign: member(owner/admin)→조직→활성 캠페인 조인으로 라이브 판정
- 만료는 endsAt>now 필터로 조회 시 파생 처리(스케줄러 없음)
- syncAdvertiserFlagForOrganization: 조직 owner/admin 멤버 is_advertiser 캐시 재동기화
- 순수 역할 판정 단위 + 실 DB 통합 테스트(활성/만료/일반멤버/동기화) 추가"
```

---

## Task 4: authz 프로필·프로필 생성 input에 gender 배선

**Files:**
- Modify: `packages/api/src/services/bambi-authz.ts:3-9,22-27,54-63`
- Modify: `packages/api/src/routers/bambi/onboarding.ts:34-37,125-155`

**Interfaces:**
- Consumes: `bambiProfile.gender` (기존).
- Produces: `BambiAccessProfile.gender: "male"|"female"|null`; `profileInput.gender` 선택 필드; `createBambiProfile`가 gender를 저장.

- [ ] **Step 1: `bambi-authz.ts` import·인터페이스·select 확장**

import 블록(`bambi-authz.ts:3-9`)에 `bambiGender` 추가:

```ts
import {
	type accountStatus,
	bambiGender,
	bambiProfile,
	type bambiUserRole,
	chatRoom,
	employerOrganizationProfile,
} from "@bambi-app/db/schema/bambi";
```

타입 별칭 추가(`type AccountStatus = ...` 아래):

```ts
type BambiGender = (typeof bambiGender.enumValues)[number];
```

`BambiAccessProfile` 인터페이스에 `gender` 추가:

```ts
export interface BambiAccessProfile {
	gender: BambiGender | null;
	isPhoneVerified: boolean;
	role: BambiRole;
	status: AccountStatus;
	userId: string;
}
```

`getBambiAccessProfile` select에 `gender` 추가:

```ts
		.select({
			userId: bambiProfile.userId,
			role: bambiProfile.role,
			status: bambiProfile.status,
			isPhoneVerified: bambiProfile.isPhoneVerified,
			gender: bambiProfile.gender,
		})
```

> 참고: 광고 자격(isAdvertiser)은 `BambiAccessProfile`에 넣지 않는다 — 자격은 라이브 파생값(Task 3)이며, 저장 컬럼을 진실값으로 신뢰하지 않기 위함.

- [ ] **Step 2: `onboarding.ts` profileInput에 gender 추가**

`onboarding.ts:34-37`:

```ts
const profileInput = z.object({
	displayName: z.string().min(1).max(80).optional(),
	gender: z.enum(["male", "female"]).optional(),
	phoneNumber: z.string().min(3).max(30).optional(),
});
```

- [ ] **Step 3: `createBambiProfile`가 gender 저장**

`onboarding.ts:125-155` — 파라미터·insert values에 gender 추가:

```ts
const createBambiProfile = async ({
	displayName,
	gender,
	phoneNumber,
	role,
	userId,
}: {
	displayName?: string;
	gender?: "male" | "female";
	phoneNumber?: string;
	role: BambiProfileRole;
	userId: string;
}) => {
	const [existingProfile] = await db
		.select({ role: bambiProfile.role })
		.from(bambiProfile)
		.where(eq(bambiProfile.userId, userId))
		.limit(1);

	assertCanCreateBambiProfile({ existingRole: existingProfile?.role });

	const [createdProfile] = await db
		.insert(bambiProfile)
		.values({
			userId,
			role,
			displayName,
			phoneNumber,
			gender,
		})
		.returning();

	return createdProfile;
};
```

`createJobSeekerProfile`·`createEmployerProfile`는 이미 `{ ...input, role, userId }`를 넘기므로 `input.gender`가 자동 전달된다 — 수정 불필요.

- [ ] **Step 4: 타입체크·기존 테스트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 통과. `BambiAccessProfile`을 만드는 다른 서비스가 새 `gender` 필드로 에러가 나면, select에 `gender: bambiProfile.gender`를 추가하거나 생성부에서 채운다.

Run: `pnpm --filter @bambi-app/api test`
Expected: 기존 테스트 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/services/bambi-authz.ts packages/api/src/routers/bambi/onboarding.ts
git commit -m "feat: authz 프로필·프로필 생성에 gender 배선
- BambiAccessProfile와 getBambiAccessProfile select에 gender 추가
- onboarding profileInput에 gender(male|female) 선택 필드 추가
- createBambiProfile가 gender를 bambi_profile에 저장하도록 확장
- 광고 자격은 라이브 파생값이라 BambiAccessProfile에 isAdvertiser는 넣지 않음"
```

---

## Task 5: 캠페인 activate/pause 시 is_advertiser 동기화

**Files:**
- Modify: `packages/api/src/routers/bambi/promotions.ts:22-33(import),246-278`

**Interfaces:**
- Consumes: `syncAdvertiserFlagForOrganization`, `getCampaignForAccess`(campaign.organizationId 반환).

- [ ] **Step 1: import 추가**

`promotions.ts`의 서비스 import 묶음에 추가:

```ts
import { syncAdvertiserFlagForOrganization } from "../../services/bambi-advertiser";
```

- [ ] **Step 2: activateForManualPayment에 동기화 추가**

`promotions.ts:246-262`를 다음처럼 수정(campaign을 구조분해로 받아 organizationId 확보):

```ts
	activateForManualPayment: protectedProcedure
		.input(campaignIdInput)
		.handler(async ({ context, input }) => {
			const { campaign } = await getCampaignForAccess(
				input.campaignId,
				context.session
			);
			const now = new Date();
			const [updated] = await db
				.update(jobPromotionCampaign)
				.set({
					startsAt: now,
					status: "active",
					updatedAt: now,
				})
				.where(eq(jobPromotionCampaign.id, input.campaignId))
				.returning();

			await syncAdvertiserFlagForOrganization({
				now,
				organizationId: campaign.organizationId,
			});

			return updated;
		}),
```

- [ ] **Step 3: pause에 동기화 추가**

`promotions.ts:264-278`:

```ts
	pause: protectedProcedure
		.input(campaignIdInput)
		.handler(async ({ context, input }) => {
			const { campaign } = await getCampaignForAccess(
				input.campaignId,
				context.session
			);
			const now = new Date();
			const [updated] = await db
				.update(jobPromotionCampaign)
				.set({
					status: "paused",
					updatedAt: now,
				})
				.where(eq(jobPromotionCampaign.id, input.campaignId))
				.returning();

			await syncAdvertiserFlagForOrganization({
				now,
				organizationId: campaign.organizationId,
			});

			return updated;
		}),
```

- [ ] **Step 4: 타입체크·테스트**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 통과.
Run: `pnpm --filter @bambi-app/api test`
Expected: 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/promotions.ts
git commit -m "feat: 캠페인 활성/일시정지 시 is_advertiser 동기화
- activateForManualPayment 후 해당 조직 owner/admin is_advertiser 재계산
- pause 후에도 동기화해 광고 종료 시 캐시가 즉시 갱신되도록 함
- 만료(기간 경과)는 이벤트가 없어 조회 시 라이브 파생으로 별도 처리"
```

---

## Task 6: `getMine`가 community 접근 정보(라이브 advertiser) 노출

**Files:**
- Modify: `packages/api/src/routers/bambi/onboarding.ts:19-32(import),158-281(getMine)`

**Interfaces:**
- Consumes: `resolveCommunityAccess`(Task 2), `hasActiveAdvertiserCampaign`(Task 3), `profile.gender`.
- Produces: `getMine` 반환에 `community: { canAccess: boolean; notice: "unverified"|"male_employer"|"male_seeker"|null }`.

- [ ] **Step 1: import 추가**

`onboarding.ts` 상단 import에 추가:

```ts
import { hasActiveAdvertiserCampaign } from "../../services/bambi-advertiser";
import { resolveCommunityAccess } from "../../services/bambi-community-access";
```

- [ ] **Step 2: getMine에서 라이브 advertiser + community 계산**

`getMine` 핸들러에서 `profile` 조회 직후 계산하고 반환 객체에 `community` 추가:

```ts
		const now = new Date();
		const isAdvertiser = profile
			? await hasActiveAdvertiserCampaign({ now, userId })
			: false;
		const community = resolveCommunityAccess({
			gender: profile?.gender ?? null,
			isAdvertiser,
			role: profile?.role ?? "job_seeker",
			status: profile?.status ?? "active",
		});
```

`return` 객체(`onboarding.ts:257-280`)에 `community` 키 추가:

```ts
		return {
			bambiProfile: profile ?? null,
			community,
			employerOrganizationProfiles: organizationProfiles,
			employerTeamProfiles: postingScopeTeamProfiles,
			employerJobPostingScopes: postingScopes.map((scope) => {
				// ...기존 그대로...
			}),
		};
```

- [ ] **Step 3: 타입체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 통과. (프로필 null이면 advertiser 조회를 건너뛰고 unverified 처리.)

- [ ] **Step 4: 커밋**

```bash
git add packages/api/src/routers/bambi/onboarding.ts
git commit -m "feat: onboarding.getMine에 수다방 접근 정보 노출
- hasActiveAdvertiserCampaign로 광고 자격을 라이브 파생 계산(만료 안전)
- gender·advertiser·role·status를 resolveCommunityAccess에 넣어 community 반환
- 프로필 미생성 시 advertiser 조회 생략, job_seeker/active 기본값으로 unverified"
```

---

## Task 7: 회원가입 시 클라이언트가 gender 캡처·전달

**Files:**
- Modify: `apps/web/src/lib/bambi/guest.ts:30-38(근처)`
- Modify: `apps/web/src/components/bambi/screens/auth-screen.tsx:12(import),98-110(finishSignup),141-157(onSuccess)`

**배경:** `onSuccess`에서 `clearGuestCookie()`가 `adultsex`를 포함한 성인인증 쿠키를 만료시킨 **뒤** `finishSignup()`이 프로필을 만든다. 따라서 gender는 `clearGuestCookie` **전에** 클라이언트가 쿠키에서 읽어 프로필 생성 input으로 넘겨야 한다. `adultsex`는 `httpOnly:false`라 `document.cookie`로 읽을 수 있다.

**Interfaces:**
- Consumes: 기존 `adultSexToGender`, `ADULT_SEX_COOKIE`, `BambiGenderValue` (guest.ts); Task 4의 `profileInput.gender`.
- Produces: `readAdultGenderFromCookieString(cookie: string): BambiGenderValue | null`.

- [ ] **Step 1: guest.ts에 쿠키 파서 추가**

`apps/web/src/lib/bambi/guest.ts`의 `adultSexToGender` 정의 아래에 추가:

```ts
// 쿠키 문자열에서 성인인증 성별(adultsex)을 읽는다. clearGuestCookie가 adultsex를
// 만료시키기 전에 회원 프로필로 성별을 옮길 때 쓴다.
export const readAdultGenderFromCookieString = (
	cookie: string
): BambiGenderValue | null => {
	const entry = cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${ADULT_SEX_COOKIE}=`));
	if (!entry) {
		return null;
	}
	return adultSexToGender(entry.slice(ADULT_SEX_COOKIE.length + 1));
};
```

- [ ] **Step 2: auth-screen import 확장**

`auth-screen.tsx:12` 인근의 guest import를 다음으로 교체(기존 구문에 맞춰 병합):

```ts
import {
	type BambiGenderValue,
	clearGuestCookie,
	readAdultGenderFromCookieString,
} from "@/lib/bambi/guest";
```

- [ ] **Step 3: finishSignup이 gender를 받아 전달**

```ts
	const finishSignup = async (gender: BambiGenderValue | null) => {
		const displayName = name.trim();
		if (signupRole === "employer") {
			await client.bambi.onboarding.createEmployerProfile({
				displayName,
				...(gender ? { gender } : {}),
			});
			queryClient.invalidateQueries();
			router.push("/employer" as Route);
			return;
		}
		await client.bambi.onboarding.createJobSeekerProfile({
			displayName,
			...(gender ? { gender } : {}),
		});
		queryClient.invalidateQueries();
		router.push("/seeker" as Route);
	};
```

- [ ] **Step 4: onSuccess에서 clearGuestCookie 전에 gender 캡처**

`onSuccess` 콜백 시작부를 수정(기존 `await clearGuestCookie();` 앞에 캡처, `finishSignup()` 호출에 인자 전달):

```ts
			onSuccess: async () => {
				// clearGuestCookie가 adultsex를 만료시키기 전에 성별을 읽어 둔다.
				const gender =
					typeof document === "undefined"
						? null
						: readAdultGenderFromCookieString(document.cookie);
				await clearGuestCookie();
				if (isSignUp) {
					finishSignup(gender).catch((error: unknown) => {
						setNotice({
							text:
								error instanceof Error
									? error.message
									: "프로필 생성에 실패했어요.",
							tone: "error",
						});
					});
					return;
				}
				// ...로그인 분기(기존 코드) 그대로...
```

- [ ] **Step 5: 타입체크·린트**

Run: `pnpm --filter web check-types`
Expected: 통과.
Run(apps/web에서): `pnpm dlx ultracite fix`
Expected: 추가 위반 없음.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/lib/bambi/guest.ts apps/web/src/components/bambi/screens/auth-screen.tsx
git commit -m "feat: 회원가입 시 성인인증 성별을 프로필로 이전
- guest.ts에 readAdultGenderFromCookieString 추가(adultsex 쿠키→gender)
- auth-screen onSuccess에서 clearGuestCookie 전에 gender를 읽어 캡처
- finishSignup이 gender를 create(JobSeeker|Employer)Profile input으로 전달
- adultsex는 httpOnly:false라 클라이언트에서 읽어 삭제 전 이전 가능"
```

---

## Task 8: BambiAuth 컨텍스트에 접근 플래그 노출

**Files:**
- Modify: `apps/web/src/components/bambi/auth-client-provider.tsx:9-17,34-46`

**Interfaces:**
- Consumes: `mineQuery.data.community` (Task 6).
- Produces: `useBambiAuth()` 반환에 `canAccessCommunity: boolean`, `communityNotice: "unverified"|"male_employer"|"male_seeker"|null`.

- [ ] **Step 1: 타입·컨텍스트 값 확장**

```ts
type BambiRole = "job_seeker" | "employer" | "admin" | null;
type CommunityNotice = "unverified" | "male_employer" | "male_seeker" | null;

interface BambiAuthValue {
	canAccessCommunity: boolean;
	communityNotice: CommunityNotice;
	isAuthenticated: boolean;
	isGuest: boolean;
	isPending: boolean;
	role: BambiRole;
	user: { id: string; email: string; name: string } | null;
}
```

`value` 선언 직전에 `community`를 뽑고, `value` 객체에 두 필드 추가:

```ts
		const community = mineQuery.data?.community;
		const value: BambiAuthValue = {
			user: session.data?.user
				? {
						id: session.data.user.id,
						email: session.data.user.email,
						name: session.data.user.name,
					}
				: null,
			role: (mineQuery.data?.bambiProfile?.role ?? null) as BambiRole,
			canAccessCommunity: community?.canAccess ?? false,
			communityNotice: (community?.notice ?? null) as CommunityNotice,
			isAuthenticated,
			isGuest,
			isPending: session.isPending || (isAuthenticated && mineQuery.isLoading),
		};
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter web check-types`
Expected: 통과.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/components/bambi/auth-client-provider.tsx
git commit -m "feat: useBambiAuth에 수다방 접근 플래그 노출
- getMine.community를 소비해 canAccessCommunity·communityNotice 노출
- 탭 게이팅·페이지 게이트가 gender 원값 없이 플래그만 소비하도록 함
- 데이터 로딩 전에는 canAccessCommunity=false로 안전 기본값"
```

---

## Task 9: 탭 게이팅 (모바일 하단탭 + 데스크톱 nav)

**Files:**
- Modify: `apps/web/src/components/bambi/mobile-tab-bar.tsx:22,49-57`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx:1-11(import),81-113`

**Interfaces:**
- Consumes: `useBambiAuth().canAccessCommunity` (Task 8). `persona-nav`는 `MobileTabBar`에 위임(자동 반영).

- [ ] **Step 1: mobile-tab-bar 수다방 탭 조건부**

```ts
	const { canAccessCommunity, role } = useBambiAuth();
	const isEmployer = role === "employer";
```

```ts
				items={[
					{ value: "home", label: "탐색", icon: Search2 },
					{ value: "chat", label: "채팅", icon: Message },
					...(isEmployer
						? [{ value: "employer", label: "구인 관리", icon: BriefcaseIcon }]
						: []),
					...(canAccessCommunity
						? [{ value: "community", label: "수다방", icon: MessagesIcon }]
						: []),
					{ value: "me", label: "내 정보", icon: UserIcon },
				]}
```

- [ ] **Step 2: responsive-shell 데스크톱 nav 조건부**

import에 추가:

```ts
import { useBambiAuth } from "./auth-client-provider";
```

`const pathname = usePathname();` 아래에 필터를 추가하고, 이후 `navItems` 사용처(`navItems.length`, `navItems.map`, `findActiveHref(pathname, navItems)`)를 `visibleNavItems`로 교체:

```ts
	const pathname = usePathname();
	const { canAccessCommunity } = useBambiAuth();
	const visibleNavItems = canAccessCommunity
		? navItems
		: navItems.filter((item) => item.href !== "/seeker/community");
	const isPublic = variant === "public";
	const isModerator = variant === "moderator";
	const activeHref = findActiveHref(pathname, visibleNavItems);
```

(`AuthClientProvider`는 `providers.tsx`에서 앱 전역을 감싸므로 public 변형에서도 `useBambiAuth` 사용 안전.)

- [ ] **Step 3: 타입체크·린트**

Run: `pnpm --filter web check-types`
Expected: 통과.
Run(apps/web에서): `pnpm dlx ultracite fix`
Expected: 위반 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/mobile-tab-bar.tsx apps/web/src/components/bambi/responsive-shell.tsx
git commit -m "feat: 수다방 탭을 입장 자격자에게만 노출
- mobile-tab-bar에서 canAccessCommunity일 때만 수다방 탭 렌더
- responsive-shell 데스크톱 nav에서 미자격 시 /seeker/community 항목 제외
- persona-nav는 MobileTabBar에 위임하므로 자동 반영"
```

---

## Task 10: 페이지 게이트 + 입장 자격 안내 화면

**Files:**
- Create: `apps/web/src/components/bambi/community-access-notice.tsx`
- Create: `apps/web/src/components/bambi/require-community-access.tsx`
- Modify: `apps/web/src/app/seeker/community/page.tsx`

**Interfaces:**
- Consumes: `useBambiAuth().canAccessCommunity`·`communityNotice`·`isPending` (Task 8), `EmptyState`(`action` prop), `RequireAuth`.
- Produces: `RequireCommunityAccess` 래퍼.

- [ ] **Step 1: 안내 화면 컴포넌트 생성**

`apps/web/src/components/bambi/community-access-notice.tsx`:

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import type { Route } from "next";
import Link from "next/link";
import { EmptyState } from "./empty-state";

type CommunityNotice = "unverified" | "male_employer" | "male_seeker";

interface NoticeContent {
	cta?: { href: Route; label: string };
	description: string;
	title: string;
}

const NOTICE_CONTENT: Record<CommunityNotice, NoticeContent> = {
	unverified: {
		cta: { href: "/seeker/me" as Route, label: "내 정보에서 인증하기" },
		description:
			"휴대폰 본인인증을 마친 여성 회원과 광고 중인 업소만 수다방에 입장할 수 있어요.",
		title: "본인인증이 필요해요",
	},
	male_employer: {
		cta: { href: "/employer/promotions" as Route, label: "광고 등록하러 가기" },
		description: "광고를 등록하면 수다방에 입장할 수 있어요.",
		title: "광고 중인 업소만 입장할 수 있어요",
	},
	male_seeker: {
		description: "수다방은 여성 회원과 광고 중인 업소만 이용할 수 있어요.",
		title: "여성 회원 전용 공간이에요",
	},
};

export function CommunityAccessNotice({ notice }: { notice: CommunityNotice }) {
	const content = NOTICE_CONTENT[notice];
	return (
		<div className="mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:max-w-[min(80%,72rem)] md:px-6">
			<EmptyState
				action={
					content.cta ? (
						<Button
							render={<Link href={content.cta.href}>{content.cta.label}</Link>}
						/>
					) : undefined
				}
				className="flex-1"
				description={content.description}
				title={content.title}
			/>
		</div>
	);
}
```

- [ ] **Step 2: 페이지 게이트 컴포넌트 생성**

`apps/web/src/components/bambi/require-community-access.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useBambiAuth } from "./auth-client-provider";
import { CommunityAccessNotice } from "./community-access-notice";
import { RequireAuth } from "./require-auth";

// 로그인 확인(RequireAuth) 후 수다방 입장 자격을 검사한다. 미자격자는 사유별
// 안내 화면을 보여준다. 게스트는 미들웨어(resolve-gate)가 이미 차단한다.
export function RequireCommunityAccess({ children }: { children: ReactNode }) {
	return (
		<RequireAuth>
			<CommunityGate>{children}</CommunityGate>
		</RequireAuth>
	);
}

function CommunityGate({ children }: { children: ReactNode }) {
	const { canAccessCommunity, communityNotice, isPending } = useBambiAuth();
	if (isPending) {
		return null;
	}
	if (canAccessCommunity) {
		return <>{children}</>;
	}
	return <CommunityAccessNotice notice={communityNotice ?? "unverified"} />;
}
```

- [ ] **Step 3: community 페이지에 게이트 적용**

`apps/web/src/app/seeker/community/page.tsx`를 교체:

```tsx
import { EmptyState } from "@/components/bambi/empty-state";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";

// 수다방 — 여성회원·광고 중 업소만 입장. 게시판 UI·백엔드는 후속 작업.
// 비로그인은 RequireAuth가, 미자격자는 안내 화면이 막는다.
export default function SeekerCommunityPage() {
	return (
		<RequireCommunityAccess>
			<div className="mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:max-w-[min(80%,72rem)] md:px-6">
				<EmptyState
					className="flex-1"
					description="구직자와 구인자가 함께 이야기하는 커뮤니티를 준비하고 있어요."
					title="수다방 준비 중"
				/>
			</div>
		</RequireCommunityAccess>
	);
}
```

- [ ] **Step 4: 타입체크·린트**

Run: `pnpm --filter web check-types`
Expected: 통과.
Run(apps/web에서): `pnpm dlx ultracite fix`
Expected: 위반 없음. (Button `render` prop·base-ui 규칙 준수 확인.)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/community-access-notice.tsx apps/web/src/components/bambi/require-community-access.tsx apps/web/src/app/seeker/community/page.tsx
git commit -m "feat: 수다방 페이지 입장 자격 게이트·안내 화면 추가
- RequireCommunityAccess(로그인 후 자격 검사) 게이트 컴포넌트 신설
- 사유별 안내 화면(미인증→인증, 남성 업소→광고 등록, 남성 구직자→여성 전용) 추가
- seeker/community 페이지를 게이트로 감싸 미자격자 진입 시 안내 노출
- shadcn Empty·Button(render prop)로 구성, 게스트 차단은 미들웨어 현행 유지"
```

---

## 최종 검증 (전체)

- [ ] `pnpm --filter @bambi-app/api test` — 신규 community-access(7)·advertiser(순수+통합) 포함 전부 PASS.
- [ ] `pnpm --filter @bambi-app/api check-types` / `pnpm --filter @bambi-app/db check-types` / `pnpm --filter web check-types` — 통과.
- [ ] 사용자에게 시각·기능 확인 요청:
  - 여성 회원가입(게스트 인증 여=2) → 수다방 탭·입장 가능.
  - 남성 구직자 → 탭 숨김·직접 URL 시 "여성 전용" 안내.
  - 남성 업소(owner/admin) + 광고 캠페인 활성(activate) → 탭·입장 가능; pause 또는 endsAt 경과 시 입장 차단.

## 후속 이슈(이번 스코프 외)

- 광고 결제 웹훅/PG 연동, `canceled`/`pending_payment` 상태 전이(현재 코드에 경로 없음).
- 회원 대상 휴대폰 본인인증 흐름(gender null 회원 보완) — 현재 unverified 안내는 `/seeker/me`로 유도만.
- 게시판 실기능(글·댓글 CRUD·신고·정렬).
