# 19금 게이트 · 역할 기반 라우팅 · 온보딩 제거 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비로그인·최초 방문자에게 19금 게이트를 보여주고, 로그인 여부(미들웨어)와 역할(RSC의 orpc 조회)로 `/employer`·`/seeker`·`/moderator`를 자동 분기하며, 온보딩을 제거하고 회원가입이 역할 선택을 흡수하되 업소회원은 운영자 승인 후 활성화한다.

**Architecture:** 미들웨어(`getSessionCookie` + 게스트 쿠키)로 게이트/게스트를 낙관적으로 강제하고, RSC 서버 가드가 orpc `getMyRouting`으로 역할·승인상태를 읽어 역할별 리다이렉트를 서버에서 처리한다. 클라이언트 `AuthClientProvider`는 UI 분기용. 업소 가입은 단일 서버 procedure `registerEmployer`가 profile+org+승인대기 프로필을 원자 생성하고, 운영자는 신규 승인/반려 procedure로 처리한다.

**Tech Stack:** Next.js 16 App Router(RSC), React 19, better-auth(웹은 client + `better-auth/cookies`만), orpc + TanStack Query, Drizzle ORM(PostgreSQL), shadcn/base-ui + Tailwind v4, Vitest, Biome/Ultracite.

## Global Constraints

- 스타일: 인라인 `style` 금지. shadcn(base-ui) 컴포넌트 + Tailwind `className`만. 임의 px(`[Npx]`) 금지, 토큰/스케일 사용. `rounded-none` 금지. 시맨틱/브랜드 토큰 사용.
- 커스텀 트리거는 `asChild`가 아니라 base-ui `render` prop.
- 세로 스택 `flex flex-col gap-*` (`space-y-*` 금지), 정사각 `size-*`.
- primary 버튼은 화면당 주요 액션 한 곳만(내비 버튼 primary 금지).
- 모바일 반응형 필수(데스크톱+모바일 모두 고려).
- DB 변경은 `db:push` 금지 — 필요 시 `generate`→`migrate`만. **이 계획은 신규 컬럼/테이블 없음(마이그레이션 불필요).**
- 커밋 메시지: 한국어 `type:` 제목 + 빈 줄 + 블릿 본문. push/PR은 사용자 명시 지시 전까지 금지(로컬 커밋만).
- UI 검증은 린트+타입체크만(개발서버/스크린샷 금지), 시각 확인은 사용자.
- 커밋 전 워크트리에서 `pnpm install` 되어 있어야 함(이미 완료). 줄바꿈 LF.
- 역할 원천: `bambi_profile.role`(`job_seeker`|`employer`|`admin`). 승인상태 원천: `employer_organization_profile.verificationStatus`(`none`|`pending`|`verified`|`rejected`).
- 게이트 라우트: `/welcome`. 게스트 쿠키: `bambi_guest`(httpOnly 아님, TTL 30일).
- 테스트 명령: 순수 유닛은 `pnpm --filter @bambi-app/web test`(vitest), API는 `pnpm --filter @bambi-app/api test`. DB 연동 테스트는 상단에서 `dotenv.config({ path: "../../apps/server/.env" })` 로드.

---

## 파일 구조 개요

**packages/api (백엔드 로직·orpc)**
- `src/services/bambi-onboarding.ts` — `deriveEmployerApprovalStatus` 순수 함수 추가.
- `src/routers/bambi/onboarding.ts` — `getMyRouting`, `registerEmployer` procedure 추가.
- `src/routers/bambi/moderation.ts` — `listPendingEmployers`, `setEmployerVerificationStatus` procedure 추가.

**apps/web (라우팅·UI)**
- `src/lib/bambi/resolve-gate.ts` — 미들웨어 순수 판정.
- `src/lib/bambi/resolve-role-redirect.ts` — RSC 역할 판정.
- `src/lib/bambi/guest.ts` — 게스트 쿠키 상수/헬퍼.
- `src/lib/bambi/require-role.ts` — RSC 서버 가드(orpc 호출 + redirect).
- `middleware.ts` — 게이트/게스트 강제 + `x-bambi-pathname` 주입.
- `src/app/api/guest/route.ts` — 게스트 쿠키 발급.
- `src/app/welcome/page.tsx` + `src/components/bambi/screens/adult-gate-screen.tsx` — 19금 게이트.
- `src/components/bambi/auth-client-provider.tsx` — UI용 세션/역할 컨텍스트.
- `src/app/employer/pending/page.tsx` — 승인 대기/반려 화면.
- `src/app/moderator/employers/page.tsx` + 컴포넌트 — 대기 업소 승인 UI.
- 수정: `providers.tsx`, `app/page.tsx`, `app/employer/layout.tsx`, `app/moderator/layout.tsx`, `screens/auth-screen.tsx`, `mobile-tab-bar.tsx`, 게스트 카드 상호작용.
- 제거: `app/onboarding/`, `screens/onboarding-screen.tsx`, `lib/bambi/onboarding-routes.ts`(+test).

---

# Phase A — 백엔드 (packages/api)

### Task 1: `deriveEmployerApprovalStatus` 순수 함수

**Files:**
- Modify: `packages/api/src/services/bambi-onboarding.ts`
- Test: `packages/api/src/services/bambi-onboarding.test.ts` (신규)

**Interfaces:**
- Produces: `export type EmployerApprovalStatus = "none" | "pending" | "verified" | "rejected"` 및 `deriveEmployerApprovalStatus(statuses: string[]): EmployerApprovalStatus`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/api/src/services/bambi-onboarding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveEmployerApprovalStatus } from "./bambi-onboarding";

describe("deriveEmployerApprovalStatus", () => {
	it("returns none for empty list", () => {
		expect(deriveEmployerApprovalStatus([])).toBe("none");
	});
	it("prioritizes verified over everything", () => {
		expect(
			deriveEmployerApprovalStatus(["pending", "rejected", "verified"])
		).toBe("verified");
	});
	it("returns pending when any pending and no verified", () => {
		expect(deriveEmployerApprovalStatus(["rejected", "pending"])).toBe(
			"pending"
		);
	});
	it("returns rejected when only rejected/none", () => {
		expect(deriveEmployerApprovalStatus(["none", "rejected"])).toBe("rejected");
	});
	it("returns none when only none", () => {
		expect(deriveEmployerApprovalStatus(["none", "none"])).toBe("none");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-onboarding.test.ts`
Expected: FAIL — `deriveEmployerApprovalStatus` is not exported.

- [ ] **Step 3: 구현 추가**

`packages/api/src/services/bambi-onboarding.ts` 하단에 추가:

```ts
export type EmployerApprovalStatus =
	| "none"
	| "pending"
	| "verified"
	| "rejected";

export const deriveEmployerApprovalStatus = (
	statuses: string[]
): EmployerApprovalStatus => {
	if (statuses.includes("verified")) {
		return "verified";
	}
	if (statuses.includes("pending")) {
		return "pending";
	}
	if (statuses.includes("rejected")) {
		return "rejected";
	}
	return "none";
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-onboarding.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/services/bambi-onboarding.ts packages/api/src/services/bambi-onboarding.test.ts
git commit -m "feat: 업소 승인상태 파생 순수 함수 추가

- deriveEmployerApprovalStatus: verified>pending>rejected>none 우선순위
- getMyRouting·registerEmployer에서 재사용"
```

---

### Task 2: `getMyRouting` orpc procedure

**Files:**
- Modify: `packages/api/src/routers/bambi/onboarding.ts`
- Test: `packages/api/src/routers/bambi/onboarding-routing.test.ts` (신규, DB 연동)

**Interfaces:**
- Consumes: `deriveEmployerApprovalStatus`(Task 1), 기존 `bambiProfile`, `employerOrganizationProfile`, `member`.
- Produces: `bambi.onboarding.getMyRouting()` → `{ role: "job_seeker" | "employer" | "admin" | null; employerApprovalStatus: EmployerApprovalStatus }`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/api/src/routers/bambi/onboarding-routing.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { onboardingRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./onboarding"),
	]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const getMyRouting = createProcedureClient(onboardingRouter.getMyRouting);

describe("getMyRouting", () => {
	it("returns null role when no profile", async () => {
		const userId = `user_route_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "무프로필",
			email: `${userId}@bambi.test`,
		});
		const result = await getMyRouting(undefined, { context: ctx(userId) });
		expect(result).toEqual({ role: null, employerApprovalStatus: "none" });
		await db.delete(user).where(eq(user.id, userId));
	});

	it("returns employer + pending when org profile pending", async () => {
		const userId = `user_route_${randomUUID()}`;
		const orgId = `org_route_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "업소",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(organization)
			.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
		await db.insert(member).values({
			id: `member_${randomUUID()}`,
			organizationId: orgId,
			userId,
			role: "owner",
			createdAt: new Date(),
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "업소" });
		await db.insert(employerOrganizationProfile).values({
			organizationId: orgId,
			displayName: "업소",
			verificationStatus: "pending",
		});

		const result = await getMyRouting(undefined, { context: ctx(userId) });
		expect(result).toEqual({
			role: "employer",
			employerApprovalStatus: "pending",
		});

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, orgId));
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/onboarding-routing.test.ts`
Expected: FAIL — `onboardingRouter.getMyRouting` is undefined.

- [ ] **Step 3: procedure 추가**

`packages/api/src/routers/bambi/onboarding.ts`:

import 구문에 `deriveEmployerApprovalStatus` 추가(같은 서비스 파일에서):

```ts
import {
	assertCanCreateBambiProfile,
	assertCanManageEmployerProfile,
	assertCanUpdateOwnBambiProfile,
	type BambiProfileRole,
	deriveEmployerApprovalStatus,
	type OrganizationRole,
} from "../../services/bambi-onboarding";
```

`onboardingRouter` 객체 안(예: `getMine` 다음)에 추가:

```ts
	getMyRouting: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;
		const [profile] = await db
			.select({ role: bambiProfile.role })
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId))
			.limit(1);

		if (!profile) {
			return { role: null, employerApprovalStatus: "none" as const };
		}

		if (profile.role !== "employer") {
			return { role: profile.role, employerApprovalStatus: "none" as const };
		}

		const orgProfiles = await db
			.select({
				verificationStatus: employerOrganizationProfile.verificationStatus,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.userId, userId)
				)
			);

		return {
			role: profile.role,
			employerApprovalStatus: deriveEmployerApprovalStatus(
				orgProfiles.map((row) => row.verificationStatus)
			),
		};
	}),
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/onboarding-routing.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/onboarding-routing.test.ts
git commit -m "feat: 라우팅 판정용 getMyRouting procedure 추가

- role + employerApprovalStatus 슬림 응답
- RSC 역할 가드가 서버에서 호출"
```

---

### Task 3: `registerEmployer` orpc procedure (원자 생성)

**Files:**
- Modify: `packages/api/src/routers/bambi/onboarding.ts`
- Test: `packages/api/src/routers/bambi/register-employer.test.ts` (신규, DB 연동)

**Interfaces:**
- Consumes: `assertCanCreateBambiProfile`(기존), `bambiProfile`, `organization`, `member`, `employerOrganizationProfile`, `randomUUID`.
- Produces: `bambi.onboarding.registerEmployer(input)` — 입력 `{ displayName: string; organizationName: string; businessRegistrationNumber?: string; phoneNumber?: string }`, 반환 `{ organizationId: string }`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/api/src/routers/bambi/register-employer.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { onboardingRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./onboarding"),
	]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const registerEmployer = createProcedureClient(
	onboardingRouter.registerEmployer
);

describe("registerEmployer", () => {
	it("creates employer profile, org(owner), and pending org profile", async () => {
		const userId = `user_reg_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "가입자",
			email: `${userId}@bambi.test`,
		});

		const { organizationId } = await registerEmployer(
			{ displayName: "밤비 업소", organizationName: "밤비 업소" },
			{ context: ctx(userId) }
		);

		const [profile] = await db
			.select({ role: bambiProfile.role })
			.from(bambiProfile)
			.where(eq(bambiProfile.userId, userId));
		expect(profile?.role).toBe("employer");

		const [membership] = await db
			.select({ role: member.role })
			.from(member)
			.where(
				and(eq(member.userId, userId), eq(member.organizationId, organizationId))
			);
		expect(membership?.role).toBe("owner");

		const [orgProfile] = await db
			.select({ status: employerOrganizationProfile.verificationStatus })
			.from(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, organizationId));
		expect(orgProfile?.status).toBe("pending");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("rejects when a profile already exists", async () => {
		const userId = `user_reg_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "중복",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "job_seeker", displayName: "이미" });

		await expect(
			registerEmployer(
				{ displayName: "x", organizationName: "x" },
				{ context: ctx(userId) }
			)
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/register-employer.test.ts`
Expected: FAIL — `onboardingRouter.registerEmployer` is undefined.

- [ ] **Step 3: procedure 추가**

`packages/api/src/routers/bambi/onboarding.ts` 상단 import에 추가:

```ts
import { randomUUID } from "node:crypto";
import { member, organization, team, teamMember } from "@bambi-app/db/schema/auth";
```
(기존 `member, team, teamMember` import 줄에 `organization` 추가. 이미 `member`가 있으니 `organization`만 병합.)

입력 스키마 정의(파일 상단 다른 스키마들 근처):

```ts
const registerEmployerInput = z.object({
	displayName: z.string().min(1).max(80),
	organizationName: z.string().min(1).max(120),
	businessRegistrationNumber: z.string().min(1).max(40).optional(),
	phoneNumber: z.string().min(3).max(30).optional(),
});

const toOrganizationSlug = (name: string): string => {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9가-힣]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 40);
	return `${base || "org"}-${randomUUID().slice(0, 8)}`;
};
```

`onboardingRouter` 객체 안에 추가:

```ts
	registerEmployer: protectedProcedure
		.input(registerEmployerInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			const [existingProfile] = await db
				.select({ role: bambiProfile.role })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, userId))
				.limit(1);

			assertCanCreateBambiProfile({ existingRole: existingProfile?.role });

			const organizationId = `org_${randomUUID()}`;
			const now = new Date();

			await db.transaction(async (tx) => {
				await tx.insert(organization).values({
					id: organizationId,
					name: input.organizationName,
					slug: toOrganizationSlug(input.organizationName),
					createdAt: now,
				});
				await tx.insert(member).values({
					id: `member_${randomUUID()}`,
					organizationId,
					userId,
					role: "owner",
					createdAt: now,
				});
				await tx.insert(bambiProfile).values({
					userId,
					role: "employer",
					displayName: input.displayName,
					phoneNumber: input.phoneNumber,
				});
				await tx.insert(employerOrganizationProfile).values({
					organizationId,
					displayName: input.organizationName,
					businessRegistrationNumber: input.businessRegistrationNumber,
					verificationStatus: "pending",
				});
			});

			return { organizationId };
		}),
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/register-employer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/register-employer.test.ts
git commit -m "feat: 업소회원 가입 원자 생성 registerEmployer 추가

- bambiProfile(employer)+organization(owner)+승인대기 org 프로필을 트랜잭션으로 생성
- 이미 프로필 있으면 CONFLICT"
```

---

### Task 4: 운영자 승인/반려 + 대기 목록 procedure

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Test: `packages/api/src/routers/bambi/employer-verification.test.ts` (신규, DB 연동)

**Interfaces:**
- Consumes: `requireAdminProfile`(기존), `adminModerationAction`, `employerOrganizationProfile`, `member`, `bambiProfile`, `user`.
- Produces:
  - `bambi.moderation.listPendingEmployers()` → `Array<{ organizationId; displayName; businessRegistrationNumber; verificationStatus; verificationNote; ownerUserId; ownerEmail }>`.
  - `bambi.moderation.setEmployerVerificationStatus({ organizationId, status, reason })` → 업데이트된 org 프로필. `status`는 `"verified" | "rejected"`.

- [ ] **Step 1: 실패 테스트 작성**

`packages/api/src/routers/bambi/employer-verification.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { moderationRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./moderation"),
	]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const setStatus = createProcedureClient(
	moderationRouter.setEmployerVerificationStatus
);

const seedAdmin = async () => {
	const adminId = `user_admin_${randomUUID()}`;
	await db.insert(user).values({
		id: adminId,
		name: "운영자",
		email: `${adminId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId: adminId, role: "admin", displayName: "운영자" });
	return adminId;
};

const seedPendingEmployer = async () => {
	const ownerId = `user_owner_${randomUUID()}`;
	const orgId = `org_${randomUUID()}`;
	await db.insert(user).values({
		id: ownerId,
		name: "업주",
		email: `${ownerId}@bambi.test`,
	});
	await db
		.insert(organization)
		.values({ id: orgId, name: "업소", slug: orgId, createdAt: new Date() });
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId: orgId,
		userId: ownerId,
		role: "owner",
		createdAt: new Date(),
	});
	await db
		.insert(bambiProfile)
		.values({ userId: ownerId, role: "employer", displayName: "업소" });
	await db.insert(employerOrganizationProfile).values({
		organizationId: orgId,
		displayName: "업소",
		verificationStatus: "pending",
	});
	return { ownerId, orgId };
};

describe("setEmployerVerificationStatus", () => {
	it("verifies a pending employer as admin", async () => {
		const adminId = await seedAdmin();
		const { ownerId, orgId } = await seedPendingEmployer();

		const result = await setStatus(
			{ organizationId: orgId, status: "verified", reason: "서류 확인" },
			{ context: ctx(adminId) }
		);
		expect(result.verificationStatus).toBe("verified");

		await db.delete(user).where(eq(user.id, adminId));
		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(organization).where(eq(organization.id, orgId));
	});

	it("forbids non-admin", async () => {
		const nonAdmin = `user_x_${randomUUID()}`;
		await db.insert(user).values({
			id: nonAdmin,
			name: "일반",
			email: `${nonAdmin}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: nonAdmin, role: "job_seeker", displayName: "일반" });
		const { ownerId, orgId } = await seedPendingEmployer();

		await expect(
			setStatus(
				{ organizationId: orgId, status: "verified", reason: "x" },
				{ context: ctx(nonAdmin) }
			)
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, nonAdmin));
		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(organization).where(eq(organization.id, orgId));
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/employer-verification.test.ts`
Expected: FAIL — `moderationRouter.setEmployerVerificationStatus` is undefined.

- [ ] **Step 3: procedure 추가**

`packages/api/src/routers/bambi/moderation.ts` 상단 import에 `member`, `user`는 이미 있음(auth). `and` 추가 필요 시 `drizzle-orm`에서 import(현재 `asc, desc, eq, sql`만 → `and` 추가).

입력 스키마 추가(다른 스키마 근처):

```ts
const employerVerificationDecisionSchema = z.enum(["verified", "rejected"]);

const setEmployerVerificationStatusInput = z.object({
	organizationId: z.string().min(1),
	status: employerVerificationDecisionSchema,
	reason: z.string().min(2).max(500),
});
```

`moderationRouter` 객체 안에 추가:

```ts
	listPendingEmployers: protectedProcedure.handler(async ({ context }) => {
		await requireAdminProfile(context.session);

		return await db
			.select({
				organizationId: employerOrganizationProfile.organizationId,
				displayName: employerOrganizationProfile.displayName,
				businessRegistrationNumber:
					employerOrganizationProfile.businessRegistrationNumber,
				verificationStatus: employerOrganizationProfile.verificationStatus,
				verificationNote: employerOrganizationProfile.verificationNote,
				ownerUserId: member.userId,
				ownerEmail: user.email,
				createdAt: employerOrganizationProfile.createdAt,
			})
			.from(employerOrganizationProfile)
			.innerJoin(
				member,
				and(
					eq(member.organizationId, employerOrganizationProfile.organizationId),
					eq(member.role, "owner")
				)
			)
			.innerJoin(user, eq(user.id, member.userId))
			.where(eq(employerOrganizationProfile.verificationStatus, "pending"))
			.orderBy(desc(employerOrganizationProfile.createdAt));
	}),

	setEmployerVerificationStatus: protectedProcedure
		.input(setEmployerVerificationStatusInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [owner] = await tx
					.select({ userId: member.userId })
					.from(member)
					.where(
						and(
							eq(member.organizationId, input.organizationId),
							eq(member.role, "owner")
						)
					)
					.limit(1);

				const [updated] = await tx
					.update(employerOrganizationProfile)
					.set({
						verificationStatus: input.status,
						verificationNote: input.status === "rejected" ? input.reason : null,
						updatedAt: new Date(),
					})
					.where(
						eq(employerOrganizationProfile.organizationId, input.organizationId)
					)
					.returning();

				if (!updated) {
					throw new ORPCError("NOT_FOUND");
				}

				await tx.insert(adminModerationAction).values({
					adminUserId: admin.userId,
					targetType: "user",
					targetId: owner?.userId ?? input.organizationId,
					action: `set_employer_verification:${input.status}`,
					reason: input.reason,
					metadata: { organizationId: input.organizationId },
				});

				return updated;
			});
		}),
```

주: `targetType`은 `moderation_target_type` enum에 `organization`이 없으므로 `"user"`(업소 소유자 userId)로 기록한다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/employer-verification.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/moderation.ts packages/api/src/routers/bambi/employer-verification.test.ts
git commit -m "feat: 업소 승인/반려 운영자 procedure 추가

- listPendingEmployers: 승인 대기 업소 목록(소유자 포함)
- setEmployerVerificationStatus: verified/rejected + 반려 사유(verificationNote), 감사 로그"
```

---

# Phase B — 웹 라우팅 순수 로직 + 미들웨어

### Task 5: `resolveGate` 순수 함수 + 테스트

**Files:**
- Create: `apps/web/src/lib/bambi/resolve-gate.ts`
- Test: `apps/web/src/lib/bambi/resolve-gate.test.ts`

**Interfaces:**
- Produces: `type GateInput = { pathname: string; hasSession: boolean; isGuest: boolean }`, `type GateDecision = { type: "next" } | { type: "redirect"; to: string }`, `resolveGate(input: GateInput): GateDecision`.

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/bambi/resolve-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveGate } from "./resolve-gate";

const guest = { hasSession: false, isGuest: true };
const fresh = { hasSession: false, isGuest: false };
const authed = { hasSession: true, isGuest: false };

describe("resolveGate", () => {
	it("lets public /welcome pass for everyone", () => {
		expect(resolveGate({ pathname: "/welcome", ...fresh }).type).toBe("next");
	});
	it("lets logged-in users pass", () => {
		expect(resolveGate({ pathname: "/employer", ...authed }).type).toBe("next");
	});
	it("sends fresh visitor to /welcome", () => {
		expect(resolveGate({ pathname: "/seeker", ...fresh })).toEqual({
			type: "redirect",
			to: "/welcome",
		});
	});
	it("allows guest on seeker list root", () => {
		expect(resolveGate({ pathname: "/seeker", ...guest }).type).toBe("next");
	});
	it("sends guest from job detail to signup", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup",
		});
	});
	it("sends guest from employer area to signup", () => {
		expect(resolveGate({ pathname: "/employer", ...guest })).toEqual({
			type: "redirect",
			to: "/welcome?signup",
		});
	});
	it("sends guest at root to seeker", () => {
		expect(resolveGate({ pathname: "/", ...guest })).toEqual({
			type: "redirect",
			to: "/seeker",
		});
	});
	it("lets api and media pass", () => {
		expect(resolveGate({ pathname: "/api/guest", ...fresh }).type).toBe("next");
		expect(
			resolveGate({ pathname: "/bambi/local-job-media/x", ...fresh }).type
		).toBe("next");
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/resolve-gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`apps/web/src/lib/bambi/resolve-gate.ts`:

```ts
export type GateInput = {
	pathname: string;
	hasSession: boolean;
	isGuest: boolean;
};

export type GateDecision = { type: "next" } | { type: "redirect"; to: string };

const PUBLIC_PREFIXES = ["/welcome", "/api", "/bambi"];

const GUEST_BLOCKED_SEEKER_PREFIXES = [
	"/seeker/jobs",
	"/seeker/community",
	"/seeker/chats",
	"/seeker/me",
];

const isPublic = (pathname: string): boolean =>
	PUBLIC_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);

const next: GateDecision = { type: "next" };
const redirect = (to: string): GateDecision => ({ type: "redirect", to });

export const resolveGate = ({
	pathname,
	hasSession,
	isGuest,
}: GateInput): GateDecision => {
	if (isPublic(pathname)) {
		return next;
	}
	if (hasSession) {
		return next;
	}
	if (isGuest) {
		if (pathname === "/") {
			return redirect("/seeker");
		}
		if (pathname === "/seeker") {
			return next;
		}
		if (
			GUEST_BLOCKED_SEEKER_PREFIXES.some((prefix) =>
				pathname.startsWith(prefix)
			) ||
			pathname.startsWith("/employer") ||
			pathname.startsWith("/moderator")
		) {
			return redirect("/welcome?signup");
		}
		return redirect("/welcome?signup");
	}
	return redirect("/welcome");
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/resolve-gate.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi/resolve-gate.ts apps/web/src/lib/bambi/resolve-gate.test.ts
git commit -m "feat: 미들웨어 게이트 판정 순수 함수 resolveGate 추가

- 공개경로/로그인/게스트/신규방문자 분기
- 게스트는 /seeker 목록만, 나머지는 가입 유도"
```

---

### Task 6: 게스트 쿠키 헬퍼 `guest.ts`

**Files:**
- Create: `apps/web/src/lib/bambi/guest.ts`
- Test: `apps/web/src/lib/bambi/guest.test.ts`

**Interfaces:**
- Produces: `GUEST_COOKIE_NAME = "bambi_guest"`, `GUEST_COOKIE_MAX_AGE`(초), `readGuestFromCookieString(cookie: string): boolean`.

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/bambi/guest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GUEST_COOKIE_NAME, readGuestFromCookieString } from "./guest";

describe("readGuestFromCookieString", () => {
	it("detects guest cookie", () => {
		expect(readGuestFromCookieString(`${GUEST_COOKIE_NAME}=1`)).toBe(true);
	});
	it("returns false when absent", () => {
		expect(readGuestFromCookieString("other=1")).toBe(false);
	});
	it("returns false for empty", () => {
		expect(readGuestFromCookieString("")).toBe(false);
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/guest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`apps/web/src/lib/bambi/guest.ts`:

```ts
export const GUEST_COOKIE_NAME = "bambi_guest";
export const GUEST_COOKIE_VALUE = "1";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const readGuestFromCookieString = (cookie: string): boolean =>
	cookie
		.split(";")
		.map((part) => part.trim())
		.some((part) => part === `${GUEST_COOKIE_NAME}=${GUEST_COOKIE_VALUE}`);
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/guest.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi/guest.ts apps/web/src/lib/bambi/guest.test.ts
git commit -m "feat: 비회원 게스트 쿠키 상수·판독 헬퍼 추가

- bambi_guest 쿠키명/값/만료(30일)
- 쿠키 문자열에서 게스트 여부 판독(클라이언트·미들웨어 공용)"
```

---

### Task 7: `middleware.ts` (게이트/게스트 강제 + pathname 주입)

**Files:**
- Create: `apps/web/middleware.ts`

**Interfaces:**
- Consumes: `resolveGate`(Task 5), `GUEST_COOKIE_NAME`(Task 6), `getSessionCookie` from `better-auth/cookies`.
- Produces: 응답에 리다이렉트/next; `next()` 시 요청 헤더 `x-bambi-pathname` 주입(RSC 가드용).

- [ ] **Step 1: 구현 작성**

`apps/web/middleware.ts`:

```ts
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/lib/bambi/guest";
import { resolveGate } from "@/lib/bambi/resolve-gate";

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const hasSession = Boolean(getSessionCookie(request));
	const isGuest = request.cookies.get(GUEST_COOKIE_NAME)?.value === "1";

	const decision = resolveGate({ pathname, hasSession, isGuest });

	if (decision.type === "redirect") {
		return NextResponse.redirect(new URL(decision.to, request.url));
	}

	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-bambi-pathname", pathname);
	return NextResponse.next({ request: { headers: requestHeaders } });
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS (에러 없음). `getSessionCookie`는 `better-auth`가 웹 의존성이라 해결됨.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/middleware.ts
git commit -m "feat: 19금 게이트·게스트 라우팅 미들웨어 추가

- getSessionCookie로 로그인 쿠키, bambi_guest로 게스트 판별
- resolveGate 결과대로 리다이렉트, next 시 x-bambi-pathname 주입"
```

---

### Task 8: `/api/guest` 게스트 쿠키 발급 route handler

**Files:**
- Create: `apps/web/src/app/api/guest/route.ts`

**Interfaces:**
- Consumes: `GUEST_COOKIE_NAME`, `GUEST_COOKIE_VALUE`, `GUEST_COOKIE_MAX_AGE`(Task 6).
- Produces: `POST /api/guest` → `{ ok: true }` + `Set-Cookie: bambi_guest`(httpOnly 아님).

- [ ] **Step 1: 구현 작성**

`apps/web/src/app/api/guest/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
	GUEST_COOKIE_MAX_AGE,
	GUEST_COOKIE_NAME,
	GUEST_COOKIE_VALUE,
} from "@/lib/bambi/guest";

export function POST() {
	const response = NextResponse.json({ ok: true });
	response.cookies.set(GUEST_COOKIE_NAME, GUEST_COOKIE_VALUE, {
		httpOnly: false,
		sameSite: "lax",
		path: "/",
		maxAge: GUEST_COOKIE_MAX_AGE,
	});
	return response;
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/api/guest/route.ts
git commit -m "feat: 비회원 게스트 진입 쿠키 발급 라우트 추가

- POST /api/guest → bambi_guest 쿠키(30일, 클라이언트 판독 가능)"
```

---

# Phase C — RSC 역할 가드

### Task 9: `resolveRoleRedirect` 순수 함수 + 테스트

**Files:**
- Create: `apps/web/src/lib/bambi/resolve-role-redirect.ts`
- Test: `apps/web/src/lib/bambi/resolve-role-redirect.test.ts`

**Interfaces:**
- Produces: `type RoleRoutingInput = { role: "job_seeker" | "employer" | "admin" | null; approvalStatus: "none" | "pending" | "verified" | "rejected"; pathname: string }`, `resolveRoleRedirect(input): string | null`(null이면 통과).

- [ ] **Step 1: 실패 테스트 작성**

`apps/web/src/lib/bambi/resolve-role-redirect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveRoleRedirect } from "./resolve-role-redirect";

describe("resolveRoleRedirect", () => {
	it("sends null role to /welcome", () => {
		expect(
			resolveRoleRedirect({ role: null, approvalStatus: "none", pathname: "/" })
		).toBe("/welcome");
	});
	it("routes root to role home", () => {
		expect(
			resolveRoleRedirect({
				role: "job_seeker",
				approvalStatus: "none",
				pathname: "/",
			})
		).toBe("/seeker");
		expect(
			resolveRoleRedirect({
				role: "admin",
				approvalStatus: "none",
				pathname: "/",
			})
		).toBe("/moderator");
	});
	it("verified employer at root goes to /employer", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/",
			})
		).toBe("/employer");
	});
	it("unverified employer forced to pending", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "pending",
				pathname: "/employer",
			})
		).toBe("/employer/pending");
	});
	it("unverified employer allowed on pending page", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "rejected",
				pathname: "/employer/pending",
			})
		).toBeNull();
	});
	it("verified employer redirected off pending page", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/employer/pending",
			})
		).toBe("/employer");
	});
	it("job seeker blocked from employer area", () => {
		expect(
			resolveRoleRedirect({
				role: "job_seeker",
				approvalStatus: "none",
				pathname: "/employer",
			})
		).toBe("/seeker");
	});
	it("non-admin blocked from moderator area", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/moderator",
			})
		).toBe("/employer");
	});
	it("allows seeker area for any authed role", () => {
		expect(
			resolveRoleRedirect({
				role: "employer",
				approvalStatus: "verified",
				pathname: "/seeker",
			})
		).toBeNull();
	});
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/resolve-role-redirect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`apps/web/src/lib/bambi/resolve-role-redirect.ts`:

```ts
export type RoleRoutingInput = {
	role: "job_seeker" | "employer" | "admin" | null;
	approvalStatus: "none" | "pending" | "verified" | "rejected";
	pathname: string;
};

const roleHome = (role: "job_seeker" | "employer" | "admin"): string => {
	if (role === "admin") {
		return "/moderator";
	}
	if (role === "employer") {
		return "/employer";
	}
	return "/seeker";
};

const isUnder = (pathname: string, prefix: string): boolean =>
	pathname === prefix || pathname.startsWith(`${prefix}/`);

export const resolveRoleRedirect = ({
	role,
	approvalStatus,
	pathname,
}: RoleRoutingInput): string | null => {
	if (role === null) {
		return "/welcome";
	}

	const home = roleHome(role);

	if (role === "employer") {
		if (approvalStatus !== "verified") {
			return pathname === "/employer/pending" ? null : "/employer/pending";
		}
		if (pathname === "/employer/pending") {
			return "/employer";
		}
	}

	if (isUnder(pathname, "/employer") && role !== "employer") {
		return home;
	}
	if (isUnder(pathname, "/moderator") && role !== "admin") {
		return home;
	}
	if (pathname === "/") {
		return home;
	}
	return null;
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/web exec vitest run src/lib/bambi/resolve-role-redirect.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi/resolve-role-redirect.ts apps/web/src/lib/bambi/resolve-role-redirect.test.ts
git commit -m "feat: RSC 역할 리다이렉트 판정 순수 함수 추가

- 역할 홈 매핑, 업소 승인 게이트(/employer/pending), 영역 소유 검사"
```

---

### Task 10: `require-role.ts` 서버 가드 유틸

**Files:**
- Create: `apps/web/src/lib/bambi/require-role.ts`

**Interfaces:**
- Consumes: `resolveRoleRedirect`(Task 9), `client` from `@/utils/orpc`, `headers`/`redirect` from next.
- Produces: `async function enforceRoleRouting(): Promise<void>` — 현재 요청의 role을 orpc로 읽어 필요 시 `redirect()`.

- [ ] **Step 1: 구현 작성**

`apps/web/src/lib/bambi/require-role.ts`:

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { client } from "@/utils/orpc";
import { resolveRoleRedirect } from "./resolve-role-redirect";

export async function enforceRoleRouting(): Promise<void> {
	const pathname = (await headers()).get("x-bambi-pathname") ?? "/";

	let routing: Awaited<ReturnType<typeof client.bambi.onboarding.getMyRouting>>;
	try {
		routing = await client.bambi.onboarding.getMyRouting();
	} catch {
		redirect("/welcome");
	}

	const to = resolveRoleRedirect({
		role: routing.role,
		approvalStatus: routing.employerApprovalStatus,
		pathname,
	});

	if (to) {
		redirect(to);
	}
}
```

주: `redirect()`는 내부적으로 `NEXT_REDIRECT`를 throw하므로 `try`의 catch가 이를 삼키지 않도록 catch 블록의 `redirect`는 try 밖에서 실행된다(위 구조가 그러함).

- [ ] **Step 2: 타입체크**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS. (여기서는 아직 소비처가 없어 미사용 경고가 있을 수 있으나 tsc는 통과. Biome unused는 Task 11에서 소비되며 해소.)

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/lib/bambi/require-role.ts
git commit -m "feat: RSC 역할 가드 유틸 enforceRoleRouting 추가

- x-bambi-pathname + orpc getMyRouting으로 서버측 역할 리다이렉트"
```

---

### Task 11: 서버 가드 적용 (page.tsx, employer/moderator layout)

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/employer/layout.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx`

**Interfaces:**
- Consumes: `enforceRoleRouting`(Task 10).

- [ ] **Step 1: page.tsx 수정**

`apps/web/src/app/page.tsx` 전체 교체:

```tsx
import { enforceRoleRouting } from "@/lib/bambi/require-role";

export default async function Home() {
	await enforceRoleRouting();
	return null;
}
```

주: 로그인 사용자만 이 페이지에 도달(비로그인·게스트는 미들웨어가 처리). `enforceRoleRouting`이 항상 역할 홈으로 리다이렉트하므로 `return null`은 도달하지 않는다. 기존 `PublicMarketplaceScreen`은 게스트/로그인 사용자가 `/seeker`에서 보게 되므로 홈에서 제거.

- [ ] **Step 2: employer/layout.tsx 수정**

`apps/web/src/app/employer/layout.tsx`에서 컴포넌트를 async로 바꾸고 가드 호출 추가:

```tsx
import type { Route } from "next";
import type { ReactNode } from "react";
import { EmployerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { enforceRoleRouting } from "@/lib/bambi/require-role";

const EMPLOYER_NAV_ITEMS = [
	{ href: "/employer", label: "내 공고" },
	{ href: "/employer/new", label: "공고 등록" },
	{ href: "/employer/settings" as Route, label: "조직 설정" },
	{ href: "/employer/me", label: "업체 정보" },
	{ href: "/seeker", label: "채용정보" },
] as const;

export default async function EmployerLayout({
	children,
}: {
	children: ReactNode;
}) {
	await enforceRoleRouting();
	return (
		<ResponsiveAppShell navItems={EMPLOYER_NAV_ITEMS} variant="employer">
			<EmployerNav>{children}</EmployerNav>
		</ResponsiveAppShell>
	);
}
```

- [ ] **Step 3: moderator/layout.tsx 수정**

`apps/web/src/app/moderator/layout.tsx`도 동일 패턴으로 async + 가드:

```tsx
import type { ReactNode } from "react";
import { ModeratorShell } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { ModProvider } from "@/components/bambi/screens/moderator-context";
import { enforceRoleRouting } from "@/lib/bambi/require-role";

const MODERATOR_NAV_ITEMS = [
	{ href: "/moderator", label: "검수 큐" },
	{ href: "/moderator/reports", label: "신고" },
	{ href: "/moderator/users", label: "사용자" },
	{ href: "/moderator/employers", label: "업소 승인" },
	{ href: "/seeker", label: "채용정보" },
] as const;

export default async function ModeratorLayout({
	children,
}: {
	children: ReactNode;
}) {
	await enforceRoleRouting();
	return (
		<ResponsiveAppShell navItems={MODERATOR_NAV_ITEMS} variant="moderator">
			<ModProvider>
				<ModeratorShell>{children}</ModeratorShell>
			</ModProvider>
		</ResponsiveAppShell>
	);
}
```

(“업소 승인” 내비는 Task 16의 화면과 연결.)

- [ ] **Step 4: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/app/page.tsx apps/web/src/app/employer/layout.tsx apps/web/src/app/moderator/layout.tsx`
Expected: 위반 없음.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/employer/layout.tsx apps/web/src/app/moderator/layout.tsx
git commit -m "feat: 서버 역할 가드 적용(홈·업소·운영자 레이아웃)

- '/'는 역할 홈으로, /employer·/moderator는 역할·승인 검사 후 진입
- 업소 승인 내비 추가"
```

---

# Phase D — 게이트 화면 · 가입 · Provider

### Task 12: AuthClientProvider

**Files:**
- Create: `apps/web/src/components/bambi/auth-client-provider.tsx`
- Modify: `apps/web/src/components/providers.tsx`

**Interfaces:**
- Consumes: `authClient`, `orpc`(getMine), `readGuestFromCookieString`.
- Produces: `useBambiAuth()` → `{ user; role: "job_seeker"|"employer"|"admin"|null; employerApprovalStatus; isAuthenticated: boolean; isGuest: boolean; isPending: boolean }`.

- [ ] **Step 1: 구현 작성**

`apps/web/src/components/bambi/auth-client-provider.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { authClient } from "@/lib/auth-client";
import { readGuestFromCookieString } from "@/lib/bambi/guest";
import { orpc } from "@/utils/orpc";

type BambiRole = "job_seeker" | "employer" | "admin" | null;

type BambiAuthValue = {
	user: { id: string; email: string; name: string } | null;
	role: BambiRole;
	isAuthenticated: boolean;
	isGuest: boolean;
	isPending: boolean;
};

const BambiAuthContext = createContext<BambiAuthValue | null>(null);

export function AuthClientProvider({ children }: { children: ReactNode }) {
	const session = authClient.useSession();
	const isAuthenticated = Boolean(session.data?.user);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isAuthenticated,
	});

	const isGuest =
		!isAuthenticated &&
		typeof document !== "undefined" &&
		readGuestFromCookieString(document.cookie);

	const value: BambiAuthValue = {
		user: session.data?.user
			? {
					id: session.data.user.id,
					email: session.data.user.email,
					name: session.data.user.name,
				}
			: null,
		role: (mineQuery.data?.bambiProfile?.role ?? null) as BambiRole,
		isAuthenticated,
		isGuest,
		isPending: session.isPending || (isAuthenticated && mineQuery.isLoading),
	};

	return (
		<BambiAuthContext.Provider value={value}>
			{children}
		</BambiAuthContext.Provider>
	);
}

export function useBambiAuth(): BambiAuthValue {
	const value = useContext(BambiAuthContext);
	if (!value) {
		throw new Error("useBambiAuth must be used within AuthClientProvider");
	}
	return value;
}
```

- [ ] **Step 2: providers.tsx 래핑**

`apps/web/src/components/providers.tsx` 수정 — `AuthClientProvider`로 children 감싸기:

```tsx
"use client";

import { Toaster } from "@bambi-app/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/utils/orpc";
import { AuthClientProvider } from "./bambi/auth-client-provider";

interface ProvidersProps {
	children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthClientProvider>{children}</AuthClientProvider>
			<Toaster position="top-center" richColors />
		</QueryClientProvider>
	);
}
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/components/bambi/auth-client-provider.tsx apps/web/src/components/providers.tsx`
Expected: 위반 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/auth-client-provider.tsx apps/web/src/components/providers.tsx
git commit -m "feat: UI용 AuthClientProvider 추가

- useSession(로그인)+getMine(role)+게스트 쿠키를 useBambiAuth로 노출
- Providers에 래핑"
```

---

### Task 13: 회원가입 폼이 역할 선택 흡수 (auth-screen)

**Files:**
- Modify: `apps/web/src/components/bambi/screens/auth-screen.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.onboarding.createJobSeekerProfile`, `orpc.bambi.onboarding.registerEmployer`, `authClient`.
- Produces: 회원가입 시 역할 선택 + 프로필 생성 후 역할 홈/승인대기로 이동. 로그인 시 `/`로 이동(RSC 가드가 역할 홈 분기).

- [ ] **Step 1: 로그인 리다이렉트 변경 (온보딩 제거 선반영)**

`auth-screen.tsx`의 `onSuccess` 콜백에서 `router.push("/onboarding")`를 제거하고, 로그인/가입을 분리 처리한다. 아래 Step 2에서 전체 핸들러를 교체한다.

- [ ] **Step 2: 역할 선택 + 프로필 생성 로직 추가**

`auth-screen.tsx`에서 다음을 반영한다(핵심 변경만 기술; 스타일은 기존 `Card`/`Input`/`Button` + base-ui 규칙 유지, 역할 선택은 `@bambi-app/ui/components`의 `ToggleGroup` 사용):

1) import 추가:

```tsx
import { ToggleGroup, ToggleGroupItem } from "@bambi-app/ui/components/toggle-group";
import { orpc } from "@/utils/orpc";
```
(`ToggleGroup`이 아직 없으면 `pnpm dlx shadcn@latest add toggle-group`로 추가.)

2) 상태 추가:

```tsx
const [signupRole, setSignupRole] = useState<"job_seeker" | "employer">(
	"job_seeker"
);
const [orgName, setOrgName] = useState("");
```

3) 제출 성공 흐름 교체 — 로그인은 `/`로, 가입은 프로필 생성 후 이동:

```tsx
const finishSignup = async () => {
	if (signupRole === "employer") {
		await orpc.bambi.onboarding.registerEmployer.call({
			displayName: name.trim(),
			organizationName: orgName.trim() || name.trim(),
		});
		queryClient.invalidateQueries();
		router.push("/employer/pending" as Route);
		return;
	}
	await orpc.bambi.onboarding.createJobSeekerProfile.call({
		displayName: name.trim(),
	});
	queryClient.invalidateQueries();
	router.push("/seeker" as Route);
};
```

주: orpc 클라이언트 직접 호출은 `client`(`@/utils/orpc`의 `client.bambi.onboarding.registerEmployer(...)`)를 사용한다. 위 `orpc.*.call`은 의사코드이며, 실제로는 파일 상단에 `import { client } from "@/utils/orpc"`를 추가하고 `await client.bambi.onboarding.registerEmployer({...})` / `await client.bambi.onboarding.createJobSeekerProfile({...})`로 호출한다.

4) `handleSubmit`의 콜백에서 `onSuccess`를 아래처럼 분기:

```tsx
onSuccess: () => {
	if (isSignUp) {
		finishSignup().catch((error: unknown) => {
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
	queryClient.invalidateQueries();
	router.push("/" as Route);
},
```

5) 회원가입 모드일 때 역할 선택 UI + (업소 선택 시)업체명 입력을 이름 입력 아래에 추가:

```tsx
{isSignUp ? (
	<div className="grid gap-2">
		<span className="font-bold text-sm">가입 유형</span>
		<ToggleGroup
			className="grid grid-cols-2 gap-2"
			onValueChange={(value) => {
				if (value === "job_seeker" || value === "employer") {
					setSignupRole(value);
				}
			}}
			value={signupRole}
		>
			<ToggleGroupItem value="job_seeker">개인회원</ToggleGroupItem>
			<ToggleGroupItem value="employer">업소회원</ToggleGroupItem>
		</ToggleGroup>
	</div>
) : null}
{isSignUp && signupRole === "employer" ? (
	<label className="grid gap-2" htmlFor="auth-org-name">
		<span className="font-bold text-sm">업체명</span>
		<Input
			id="auth-org-name"
			onChange={(event) => setOrgName(event.target.value)}
			placeholder="예: 밤비 라운지"
			value={orgName}
		/>
	</label>
) : null}
```

6) 업소 안내 문구: 업소 선택 시 "가입 후 운영자 승인이 완료되어야 이용할 수 있어요." 안내를 `Alert` 또는 기존 notice 스타일로 표시.

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/components/bambi/screens/auth-screen.tsx`
Expected: 위반 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/screens/auth-screen.tsx packages/ui
git commit -m "feat: 회원가입 폼이 업소/개인 역할 선택 흡수

- 개인회원 즉시 프로필 생성 후 /seeker, 업소회원 registerEmployer 후 /employer/pending
- 로그인은 '/'로(서버 가드가 역할 분기), 온보딩 리다이렉트 제거"
```

---

### Task 14: 19금 게이트 화면 `/welcome`

**Files:**
- Create: `apps/web/src/components/bambi/screens/adult-gate-screen.tsx`
- Create: `apps/web/src/app/welcome/page.tsx`

**Interfaces:**
- Consumes: 기존 `AuthScreen`(로그인/가입 폼), `/api/guest`(비회원 진입).
- Produces: `/welcome` 라우트가 19금 안내 + 로그인/가입 + 비회원 버튼을 렌더.

- [ ] **Step 1: 게이트 화면 컴포넌트 작성**

`apps/web/src/components/bambi/screens/adult-gate-screen.tsx` — 19금 안내 배너(만 19세 미만 이용 불가 문구) + 기존 `AuthScreen` 삽입 + 비회원 진입 버튼. 스타일은 base-ui/토큰 규칙, 모바일 반응형, primary는 로그인(내부 AuthScreen) 한 곳만이므로 비회원 버튼은 `variant="secondary"`.

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthScreen } from "./auth-screen";

export function AdultGateScreen() {
	const router = useRouter();
	const [isEntering, setIsEntering] = useState(false);

	const enterAsGuest = async () => {
		setIsEntering(true);
		try {
			await fetch("/api/guest", { method: "POST" });
			router.push("/seeker");
			router.refresh();
		} finally {
			setIsEntering(false);
		}
	};

	return (
		<div className="min-h-[100dvh] bg-secondary">
			<div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-4 py-6">
				<section className="flex items-center gap-4 rounded-xl border border-border bg-background p-5">
					<span className="flex size-14 items-center justify-center rounded-full border-2 border-destructive font-extrabold text-destructive text-xl">
						19
					</span>
					<p className="m-0 text-muted-foreground text-sm leading-relaxed">
						본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호
						등에 관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의
						청소년이 이용할 수 없습니다.
					</p>
				</section>
				<AuthScreen />
				<div className="flex flex-col items-center gap-2 pb-6">
					<Button
						disabled={isEntering}
						onClick={() => {
							enterAsGuest().catch(() => setIsEntering(false));
						}}
						variant="secondary"
					>
						비회원으로 공고 둘러보기
					</Button>
					<p className="m-0 text-muted-foreground text-xs">
						비회원은 공고 목록만 볼 수 있어요. 상세 열람·채팅은 회원가입이
						필요해요.
					</p>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: `/welcome` 라우트 작성**

`apps/web/src/app/welcome/page.tsx`:

```tsx
import { Suspense } from "react";
import { AdultGateScreen } from "@/components/bambi/screens/adult-gate-screen";

export default function WelcomePage() {
	return (
		<Suspense>
			<AdultGateScreen />
		</Suspense>
	);
}
```

(주: `AuthScreen`이 `useSearchParams`를 쓰므로 `Suspense` 필요.)

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/components/bambi/screens/adult-gate-screen.tsx apps/web/src/app/welcome/page.tsx`
Expected: 위반 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/welcome/page.tsx apps/web/src/components/bambi/screens/adult-gate-screen.tsx
git commit -m "feat: 19금 게이트 화면(/welcome) 추가

- 만19세 안내 배너 + 로그인/가입(AuthScreen) + 비회원 진입 버튼
- 비회원 버튼은 /api/guest 후 /seeker로 이동"
```

---

# Phase E — 업소 승인 화면 · 게스트 UX

### Task 15: 승인 대기 화면 `/employer/pending`

**Files:**
- Create: `apps/web/src/app/employer/pending/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.onboarding.getMine`(verificationStatus·verificationNote), `orpc.bambi.onboarding.requestEmployerVerification`(재신청).

- [ ] **Step 1: 화면 작성 (클라이언트)**

`apps/web/src/app/employer/pending/page.tsx` — getMine에서 소속 org 프로필의 `verificationStatus`/`verificationNote`를 읽어 pending/rejected 안내. rejected면 사유 + 재신청 버튼(`requestEmployerVerification`로 다시 pending).

```tsx
"use client";

import { Alert, AlertDescription, AlertTitle } from "@bambi-app/ui/components/alert";
import { Button } from "@bambi-app/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export default function EmployerPendingPage() {
	const queryClient = useQueryClient();
	const mineQuery = useQuery(orpc.bambi.onboarding.getMine.queryOptions());
	const orgProfile = mineQuery.data?.employerOrganizationProfiles?.[0] ?? null;
	const status = orgProfile?.verificationStatus ?? "pending";

	const resubmit = useMutation(
		orpc.bambi.onboarding.requestEmployerVerification.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	return (
		<div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-4 py-10">
			{status === "rejected" ? (
				<Alert variant="destructive">
					<AlertTitle>가입이 반려되었어요</AlertTitle>
					<AlertDescription>
						{orgProfile?.verificationNote ??
							"제출하신 정보를 확인할 수 없었어요."}
					</AlertDescription>
				</Alert>
			) : (
				<Alert>
					<AlertTitle>운영자 심사 대기 중이에요</AlertTitle>
					<AlertDescription>
						업소 정보를 검토하고 있어요. 승인되면 구인 관리 기능을 이용할 수
						있어요.
					</AlertDescription>
				</Alert>
			)}
			{status === "rejected" && orgProfile ? (
				<Button
					disabled={resubmit.isPending}
					onClick={() =>
						resubmit.mutate({ organizationId: orgProfile.organizationId })
					}
				>
					재신청하기
				</Button>
			) : null}
		</div>
	);
}
```

(`Alert`가 없으면 `pnpm dlx shadcn@latest add alert`.)

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/app/employer/pending/page.tsx`
Expected: 위반 없음.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/employer/pending packages/ui
git commit -m "feat: 업소 승인 대기·반려 화면(/employer/pending) 추가

- pending 안내, rejected 사유 표시 + 재신청(requestEmployerVerification)"
```

---

### Task 16: 운영자 업소 승인 화면 `/moderator/employers`

**Files:**
- Create: `apps/web/src/app/moderator/employers/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.moderation.listPendingEmployers`, `orpc.bambi.moderation.setEmployerVerificationStatus`(Task 4).

- [ ] **Step 1: 화면 작성 (클라이언트)**

`apps/web/src/app/moderator/employers/page.tsx` — 대기 업소 목록을 카드로 렌더, 각 항목에 승인/반려 버튼. 반려는 사유 입력(간단히 `prompt` 대신 인라인 입력 또는 기본 사유). 스타일은 base-ui `Card`/`Button`/`Input`, 반응형.

```tsx
"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@bambi-app/ui/components/card";
import { Input } from "@bambi-app/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { orpc } from "@/utils/orpc";

export default function ModeratorEmployersPage() {
	const queryClient = useQueryClient();
	const [notes, setNotes] = useState<Record<string, string>>({});
	const pendingQuery = useQuery(
		orpc.bambi.moderation.listPendingEmployers.queryOptions()
	);
	const decide = useMutation(
		orpc.bambi.moderation.setEmployerVerificationStatus.mutationOptions({
			onSuccess: async () => {
				toast.success("처리했어요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.moderation.listPendingEmployers.queryKey(),
				});
			},
			onError: (error) => toast.error(error.message),
		})
	);
	const employers = pendingQuery.data ?? [];

	return (
		<div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 py-6">
			<h1 className="m-0 font-extrabold text-2xl">업소 승인 대기</h1>
			{employers.length === 0 ? (
				<p className="text-muted-foreground text-sm">대기 중인 업소가 없어요.</p>
			) : null}
			{employers.map((employer) => (
				<Card key={employer.organizationId}>
					<CardHeader>
						<CardTitle>{employer.displayName}</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						<p className="m-0 text-muted-foreground text-sm">
							{employer.ownerEmail}
							{employer.businessRegistrationNumber
								? ` · 사업자 ${employer.businessRegistrationNumber}`
								: ""}
						</p>
						<Input
							onChange={(event) =>
								setNotes((prev) => ({
									...prev,
									[employer.organizationId]: event.target.value,
								}))
							}
							placeholder="반려 사유(반려 시 필수)"
							value={notes[employer.organizationId] ?? ""}
						/>
						<div className="flex gap-2">
							<Button
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({
										organizationId: employer.organizationId,
										status: "verified",
										reason: "서류 확인 완료",
									})
								}
							>
								승인
							</Button>
							<Button
								disabled={decide.isPending}
								onClick={() =>
									decide.mutate({
										organizationId: employer.organizationId,
										status: "rejected",
										reason:
											notes[employer.organizationId]?.trim() || "정보 확인 불가",
									})
								}
								variant="secondary"
							>
								반려
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
```

- [ ] **Step 2: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/app/moderator/employers/page.tsx`
Expected: 위반 없음.

- [ ] **Step 3: 커밋**

```bash
git add apps/web/src/app/moderator/employers/page.tsx
git commit -m "feat: 운영자 업소 승인 화면(/moderator/employers) 추가

- 대기 업소 목록, 승인/반려(사유) 처리 후 목록 갱신"
```

---

### Task 17: 게스트 공고 카드 → 가입 유도 + 내비 Provider 소비

**Files:**
- Modify: `apps/web/src/components/bambi/mobile-tab-bar.tsx`
- Modify: 공고 목록 카드 컴포넌트(공개 마켓/seeker 목록에서 사용하는 카드) — 실제 파일은 `src/components/bambi/` 내 공고 카드(구현 시 `PublicMarketplaceScreen`이 사용하는 카드 컴포넌트를 grep으로 확인).

**Interfaces:**
- Consumes: `useBambiAuth`(Task 12).

- [ ] **Step 1: mobile-tab-bar가 Provider 소비**

`mobile-tab-bar.tsx`에서 개별 `authClient.useSession()` + `orpc...getMine` 대신 `useBambiAuth()`의 `role`/`isAuthenticated`를 사용하도록 교체(로직 동일: `role === "employer"`면 "구인 관리" 탭 노출). 기존 동작 보존.

- [ ] **Step 2: 게스트 카드 클릭 가입 유도**

seeker 공고 목록 카드에서 상세로 이동하는 링크/onClick에, `useBambiAuth().isGuest`가 true면 상세로 가지 않고 `/welcome?signup`으로 보낸다. 예:

```tsx
const { isGuest } = useBambiAuth();
// 카드 클릭 핸들러 내부
if (isGuest) {
	router.push("/welcome?signup");
	return;
}
router.push(`/seeker/jobs/${jobId}`);
```

(미들웨어가 이미 딥링크를 차단하므로 이는 UX 보강. 카드 컴포넌트가 서버/공유 컴포넌트라면 `"use client"` 래퍼 또는 이미 클라이언트인지 확인.)

- [ ] **Step 3: 타입체크 + 린트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS.
Run: `pnpm dlx ultracite check apps/web/src/components/bambi/mobile-tab-bar.tsx`
Expected: 위반 없음.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/components/bambi/mobile-tab-bar.tsx apps/web/src/components/bambi
git commit -m "refactor: 내비·공고 카드가 useBambiAuth 소비

- mobile-tab-bar role 분기를 Provider로 통일
- 게스트 카드 클릭 시 /welcome?signup 유도"
```

---

# Phase F — 온보딩 제거

### Task 18: 온보딩 라우트·화면·헬퍼 제거 및 잔여 참조 정리

**Files:**
- Delete: `apps/web/src/app/onboarding/` (page.tsx 등)
- Delete: `apps/web/src/components/bambi/screens/onboarding-screen.tsx`
- Delete: `apps/web/src/lib/bambi/onboarding-routes.ts`, `apps/web/src/lib/bambi/onboarding-routes.test.ts`
- Modify: `getOnboardingNextRoute` 소비처(있다면) — RSC 가드/`resolveRoleRedirect`로 대체.

**Interfaces:**
- 없음(제거).

- [ ] **Step 1: 잔여 참조 확인**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`은 나중. 먼저 참조 검색:
`getOnboardingNextRoute` 및 `onboarding-screen` / `"/onboarding"` 문자열을 grep해 소비처 목록을 만든다.
Expected: `onboarding-screen.tsx`(자기 자신), 이미 Task 13에서 auth-screen의 `/onboarding` 리다이렉트는 제거됨. 남은 참조가 있으면 이 태스크에서 정리.

- [ ] **Step 2: 파일 삭제**

```bash
git rm -r apps/web/src/app/onboarding
git rm apps/web/src/components/bambi/screens/onboarding-screen.tsx
git rm apps/web/src/lib/bambi/onboarding-routes.ts apps/web/src/lib/bambi/onboarding-routes.test.ts
```

- [ ] **Step 3: 남은 import 오류 정리**

`getOnboardingNextRoute`를 import하던 곳이 있으면 제거하고, 역할 이동이 필요하면 `resolveRoleRedirect`의 홈 매핑 또는 직접 라우트로 대체.

- [ ] **Step 4: 전체 타입체크 + 린트 + 테스트**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit`
Expected: PASS (미해결 import 없음).
Run: `pnpm --filter @bambi-app/web exec vitest run`
Expected: PASS (onboarding-routes.test 제거됨, 나머지 통과).
Run: `pnpm dlx ultracite check apps/web`
Expected: 위반 없음.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor: 온보딩 라우트·화면·헬퍼 제거

- /onboarding, onboarding-screen, onboarding-routes(+test) 삭제
- 역할 이동은 회원가입 폼 + RSC 역할 가드로 대체"
```

---

# 최종 검증

### Task 19: 통합 정적 검증

- [ ] **Step 1: 전체 타입체크**

Run: `pnpm --filter @bambi-app/web exec tsc --noEmit && pnpm --filter @bambi-app/api exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 2: 전체 린트**

Run: `pnpm dlx ultracite check`
Expected: 위반 없음(또는 `pnpm dlx ultracite fix` 후 재확인, 변경 있으면 커밋).

- [ ] **Step 3: 순수 유닛 테스트**

Run: `pnpm --filter @bambi-app/web exec vitest run`
Expected: PASS (resolve-gate, resolve-role-redirect, guest 등).

- [ ] **Step 4: API 테스트(DB 연동, 로컬 DB 필요)**

Run: `pnpm --filter @bambi-app/api exec vitest run`
Expected: PASS. (DB 미가용 환경이면 이 단계는 사용자 로컬에서 수행하도록 보고.)

- [ ] **Step 5: 사용자 시각 확인 요청**

린트/타입/유닛 통과를 보고하고, 게이트·역할 분기·업소 승인 흐름의 시각 확인을 사용자에게 요청(개발서버는 사용자가 구동).

---

## 자체 검토 메모 (계획 작성자)

- **스펙 커버리지**: 게이트(Task 14), 게스트(5·6·8·17), 미들웨어(7), RSC 역할 가드(9·10·11), customSession 미사용·orpc 기반(2·10·12), 회원가입 역할 흡수(13), 업소 registerEmployer(3), 승인 게이트(9·15), 운영자 승인(4·16), 온보딩 제거(18) — 스펙 4.1~4.7·5·6·7 항목 모두 태스크로 매핑됨.
- **타입 일관성**: `role` 유니온(`job_seeker|employer|admin|null`)과 `employerApprovalStatus`(`none|pending|verified|rejected`)를 getMyRouting·resolveRoleRedirect·AuthClientProvider에서 동일하게 사용.
- **미해결/확인 필요(구현 중 처리)**: (a) `client.bambi.onboarding.*` 서버·클라 직접 호출 시그니처는 orpc `RouterClient` 규약대로 `await client.bambi.onboarding.getMyRouting()` 형태 — 구현 시 실제 타입으로 확정. (b) 게스트 카드 컴포넌트 실제 파일 경로는 Task 17 구현 시 grep 확정. (c) `ToggleGroup`/`Alert` 미설치 시 shadcn add.
