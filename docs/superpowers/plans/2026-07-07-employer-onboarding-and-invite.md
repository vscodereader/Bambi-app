# 구인자 온보딩 재구성 + 팀 초대 대상 제한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업소회원 가입을 이름/이메일/비밀번호만 받도록 축소하고, 업체정보(업체명+사업자등록번호) 제출→운영자 승인 후에만 구인 기능을 조작할 수 있게 하며, 팀 초대 대상을 현재 employer로 가입된 계정으로 제한하고 검색 매칭 자동완성을 붙인다.

**Architecture:** 인증(better-auth)과 역할(`bambiProfile`)은 그대로 분리 유지한다. 가입 시엔 `createEmployerProfile`로 employer 프로필만 만들고, 조직은 업체정보 제출 시점에 새 mutation `submitEmployerBusinessInfo`가 생성(`pending`)한다. 승인 게이팅은 화면 통짜 대체(`EmployerPending`)를 폐지하고, 서버는 `verified` 검사로 방어, 프론트는 approval 상태를 Context로 내려 조작 요소를 disabled + 안내 배너로 처리한다. 초대는 서버에서 employer 여부를 검증하고 검색 매칭 쿼리로 자동완성한다.

**Tech Stack:** TypeScript, oRPC(`@orpc/server`), Drizzle ORM(PostgreSQL), Vitest(서버 통합 테스트), Next.js App Router(RSC) + React Query, shadcn/ui(base-ui) + Tailwind v4.

## Global Constraints

- **빌드/실행 금지**: `npm/pnpm run build`, dev 서버 기동 금지. 동작 확인은 사용자에게 요청. (프로젝트 규칙 `no-build-or-run.md`)
- **UI 검증**: 개발서버·스크린샷 금지. 프론트 변경은 `check-types` + `ultracite check`까지만 자동 검증하고 시각 확인은 사용자에게 요청.
- **shadcn 우선**: 새 UI는 `@bambi-app/ui/components`의 shadcn 컴포넌트 최대 재사용. 없으면 `pnpm dlx shadcn@latest add <component>`로 추가. raw `div`/input 재발명 금지. 인라인 `style` 금지, Tailwind `className`만. `rounded-none` 금지.
- **px 금지**: 임의 `[Npx]` 금지, Tailwind 스케일 토큰 사용. 시맨틱 색 토큰(`bg-background`, `text-muted-foreground` 등) 사용.
- **DB 마이그레이션**: 이 계획은 **스키마 변경 없음**(`businessRegistrationNumber`, `employer_verification_status` 이미 존재). `db:push` 금지. (마이그레이션이 필요해지면 `db:generate`→`db:migrate`만)
- **커밋 메시지**: 한국어 `type:` 제목 + 빈 줄 + 블릿 본문. multi-line은 `git commit -F <file>` 또는 heredoc. 매 커밋 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **worktree 커밋 사전조건**: 커밋 전 `pnpm install` 필요할 수 있음. 줄바꿈 LF(`.gitattributes`).
- **push/PR 금지**: 사용자 명시 지시 전까지 `git push`·PR 생성 금지. 로컬 커밋까지만.
- **서버 테스트 실행 전제**: 통합 테스트는 실제 개발 DB에 연결한다(`register-employer.test.ts` 패턴이 `apps/server/.env`를 로드). 실행 시 Cloud SQL Proxy가 필요하면(`pnpm db:proxy`) 사용자에게 요청. 테스트가 DB에 붙지 못하면 그 사실을 보고하고 다음 태스크로 넘기지 말 것.

**정규 역할 용어**: 조직 역할은 `owner`/`manager`/`staff`(저장 별칭 `admin→manager`, `member→staff`). bambi 역할은 `job_seeker`/`employer`/`admin`. 승인 상태 enum은 `none`/`pending`/`verified`/`rejected`.

---

## File Structure

**서버 (`packages/api`, `packages/db`)**
- `src/routers/bambi/onboarding.ts` — `submitEmployerBusinessInfo` 추가, `registerEmployer` 제거(Task 10)
- `src/services/bambi-authz.ts` — `isEmployerOrganizationVerified` 헬퍼 추가
- `src/routers/bambi/jobs.ts` — `create`에 verified 게이팅 추가
- `src/routers/bambi/organizations.ts` — `updateProfile`에 verified 게이팅 추가
- `src/routers/bambi/teams.ts` — `searchEmployerInvitees` 추가, `inviteMember`에 employer 검증 추가
- 테스트: 각 라우터 옆 `*.test.ts` (기존 패턴)

**프론트 (`apps/web`)**
- `src/components/bambi/screens/auth-screen.tsx` — 업체명 필드 제거, `finishSignup` employer 분기 변경
- `src/lib/bambi/require-role.ts` — `resolveEmployerAccess`가 `approvalStatus` 반환
- `src/components/bambi/employer-approval-context.tsx` — (신규) approval 상태 Client Context Provider + 훅
- `src/app/employer/layout.tsx` — 게이팅 전환(항상 렌더 + Provider)
- `src/components/bambi/employer-gate-banner.tsx` — (신규) 상태별 안내 배너
- `src/app/employer/me/page.tsx` — 업체정보 입력 폼 추가
- `src/app/employer/page.tsx`, `src/app/employer/new/page.tsx`, `src/app/employer/settings/page.tsx` — disabled + 배너
- `src/components/bambi/team-member-list.tsx` — 이메일 입력을 검색 자동완성으로
- `src/components/bambi/screens/employer-pending.tsx` — 제거(Task 10)

---

## Task 1: 서버 — `submitEmployerBusinessInfo` mutation

가입 후 업체정보(업체명+사업자등록번호)를 제출하는 mutation. 본인 소유(owner) 조직이 없으면 조직+owner멤버+조직프로필(pending)을 생성하고, 있으면 조직프로필을 update하고 `pending`으로 되돌린다. `registerEmployer`의 트랜잭션 로직을 이관하되 `bambiProfile`은 이미 존재하므로 만들지 않는다.

**Files:**
- Modify: `packages/api/src/routers/bambi/onboarding.ts`
- Test: `packages/api/src/routers/bambi/submit-employer-business-info.test.ts` (신규)

**Interfaces:**
- Consumes: 기존 헬퍼 `toOrganizationSlug`, `requireEmployerBambiProfile`(onboarding.ts 내부), `db`, 스키마 `organization`/`member`/`employerOrganizationProfile`/`bambiProfile`.
- Produces: `onboardingRouter.submitEmployerBusinessInfo` — 입력 `{ displayName: string, businessRegistrationNumber: string }`, 반환 `{ organizationId: string, verificationStatus: "pending" }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/submit-employer-business-info.test.ts` 생성:

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

const callSubmit = (userId: string) =>
	createProcedureClient(onboardingRouter.submitEmployerBusinessInfo, {
		context: ctx(userId),
		path: ["bambi", "onboarding", "submitEmployerBusinessInfo"],
	});

describe("submitEmployerBusinessInfo", () => {
	it("creates org(owner) and pending org profile when the employer has none", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "가입자",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "가입자" });

		const submit = callSubmit(userId);
		const { organizationId, verificationStatus } = await submit({
			displayName: "밤비 업소",
			businessRegistrationNumber: "123-45-67890",
		});

		expect(verificationStatus).toBe("pending");

		const [membership] = await db
			.select({ role: member.role })
			.from(member)
			.where(
				and(
					eq(member.userId, userId),
					eq(member.organizationId, organizationId)
				)
			);
		expect(membership?.role).toBe("owner");

		const [orgProfile] = await db
			.select({
				status: employerOrganizationProfile.verificationStatus,
				brn: employerOrganizationProfile.businessRegistrationNumber,
				displayName: employerOrganizationProfile.displayName,
			})
			.from(employerOrganizationProfile)
			.where(eq(employerOrganizationProfile.organizationId, organizationId));
		expect(orgProfile?.status).toBe("pending");
		expect(orgProfile?.brn).toBe("123-45-67890");
		expect(orgProfile?.displayName).toBe("밤비 업소");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("updates existing owned org profile and resets status to pending", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "재제출",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "재제출" });

		const submit = callSubmit(userId);
		const first = await submit({
			displayName: "구업체명",
			businessRegistrationNumber: "111-11-11111",
		});
		// 운영자 반려를 흉내: 상태를 rejected로 바꿔둔다.
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "rejected" })
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);

		const second = await submit({
			displayName: "새업체명",
			businessRegistrationNumber: "222-22-22222",
		});

		expect(second.organizationId).toBe(first.organizationId);
		expect(second.verificationStatus).toBe("pending");

		const [orgProfile] = await db
			.select({
				status: employerOrganizationProfile.verificationStatus,
				brn: employerOrganizationProfile.businessRegistrationNumber,
				displayName: employerOrganizationProfile.displayName,
			})
			.from(employerOrganizationProfile)
			.where(
				eq(employerOrganizationProfile.organizationId, first.organizationId)
			);
		expect(orgProfile?.status).toBe("pending");
		expect(orgProfile?.brn).toBe("222-22-22222");
		expect(orgProfile?.displayName).toBe("새업체명");

		await db.delete(user).where(eq(user.id, userId));
		await db
			.delete(organization)
			.where(eq(organization.id, first.organizationId));
	});

	it("rejects invalid business registration number format", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "형식오류",
			email: `${userId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId, role: "employer", displayName: "형식오류" });

		const submit = callSubmit(userId);
		await expect(
			submit({ displayName: "x", businessRegistrationNumber: "1234567890" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
	});

	it("rejects when the caller has no employer bambi profile", async () => {
		const userId = `user_sub_${randomUUID()}`;
		await db.insert(user).values({
			id: userId,
			name: "무프로필",
			email: `${userId}@bambi.test`,
		});

		const submit = callSubmit(userId);
		await expect(
			submit({ displayName: "x", businessRegistrationNumber: "123-45-67890" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
	});
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/submit-employer-business-info.test.ts`
Expected: FAIL — `submitEmployerBusinessInfo`가 라우터에 없어 `createProcedureClient(undefined)` 단계 또는 호출에서 에러.

(DB 연결이 안 되면 여기서 멈추고 사용자에게 `pnpm db:proxy`를 요청.)

- [ ] **Step 3: 최소 구현 추가**

`onboarding.ts`의 입력 스키마 정의 구역(다른 `*Input` 상수들 근처, 예: `registerEmployerInput` 아래)에 추가:

```ts
const submitEmployerBusinessInfoInput = z.object({
	displayName: z.string().min(1).max(120),
	businessRegistrationNumber: z
		.string()
		.regex(
			/^\d{3}-\d{2}-\d{5}$/,
			"사업자등록번호는 000-00-00000 형식이어야 합니다."
		),
});
```

`onboardingRouter` 객체 안(예: `registerEmployer` 앞)에 프로시저 추가:

```ts
	submitEmployerBusinessInfo: protectedProcedure
		.input(submitEmployerBusinessInfoInput)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;
			await requireEmployerBambiProfile(userId);

			// 본인이 owner인 조직이 이미 있으면 그 조직 프로필을 갱신하고 재심사(pending)로 돌린다.
			const [ownedOrg] = await db
				.select({
					organizationId: employerOrganizationProfile.organizationId,
				})
				.from(employerOrganizationProfile)
				.innerJoin(
					member,
					and(
						eq(
							member.organizationId,
							employerOrganizationProfile.organizationId
						),
						eq(member.userId, userId),
						eq(member.role, "owner")
					)
				)
				.limit(1);

			if (ownedOrg) {
				await db
					.update(employerOrganizationProfile)
					.set({
						displayName: input.displayName,
						businessRegistrationNumber: input.businessRegistrationNumber,
						verificationStatus: "pending",
						updatedAt: new Date(),
					})
					.where(
						eq(
							employerOrganizationProfile.organizationId,
							ownedOrg.organizationId
						)
					);

				return {
					organizationId: ownedOrg.organizationId,
					verificationStatus: "pending" as const,
				};
			}

			const organizationId = `org_${randomUUID()}`;
			const now = new Date();

			await db.transaction(async (tx) => {
				await tx.insert(organization).values({
					id: organizationId,
					name: input.displayName,
					slug: toOrganizationSlug(input.displayName),
					createdAt: now,
				});
				await tx.insert(member).values({
					id: `member_${randomUUID()}`,
					organizationId,
					userId,
					role: "owner",
					createdAt: now,
				});
				await tx.insert(employerOrganizationProfile).values({
					organizationId,
					displayName: input.displayName,
					businessRegistrationNumber: input.businessRegistrationNumber,
					verificationStatus: "pending",
				});
			});

			return { organizationId, verificationStatus: "pending" as const };
		}),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/submit-employer-business-info.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/submit-employer-business-info.test.ts
git commit -F - <<'EOF'
feat: 업체정보 제출 mutation 추가

- submitEmployerBusinessInfo로 업체명+사업자등록번호 제출 처리
- owner 조직이 없으면 조직+owner멤버+조직프로필(pending) 생성
- 이미 있으면 조직프로필 갱신 후 재심사(pending)로 전환
- 사업자등록번호 000-00-00000 형식 검증

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: 서버 — 승인 게이팅(verified) 방어

미승인 조직은 공고 등록·조직 프로필 수정을 서버에서도 막는다(프론트 disabled만으로는 불충분). `admin` 역할은 예외.

**Files:**
- Modify: `packages/api/src/services/bambi-authz.ts` (헬퍼 추가)
- Modify: `packages/api/src/routers/bambi/jobs.ts` (`create` 핸들러)
- Modify: `packages/api/src/routers/bambi/organizations.ts` (`updateProfile` 핸들러)
- Test: `packages/api/src/routers/bambi/employer-verification-gate.test.ts` (신규)

**Interfaces:**
- Produces: `isEmployerOrganizationVerified(organizationId: string): Promise<boolean>` in `bambi-authz.ts`.
- `jobs.create`와 `organizations.updateProfile`는 미승인 조직에 대해 `ORPCError("FORBIDDEN")`을 던진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/employer-verification-gate.test.ts` 생성:

```ts
import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { organizationsRouter }] =
	await Promise.all([
		import("@bambi-app/db"),
		import("@bambi-app/db/schema/auth"),
		import("@bambi-app/db/schema/bambi"),
		import("./organizations"),
	]);

const { user, organization, member } = authSchema;
const { bambiProfile, employerOrganizationProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

// pending 조직 owner를 만든다.
const seedPendingOwner = async () => {
	const userId = `user_gate_${randomUUID()}`;
	const organizationId = `org_${randomUUID()}`;
	await db.insert(user).values({
		id: userId,
		name: "미승인",
		email: `${userId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role: "employer", displayName: "미승인" });
	await db.insert(organization).values({
		id: organizationId,
		name: "미승인업소",
		slug: `pending-${randomUUID().slice(0, 8)}`,
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId,
		role: "owner",
	});
	await db.insert(employerOrganizationProfile).values({
		organizationId,
		displayName: "미승인업소",
		verificationStatus: "pending",
	});
	return { userId, organizationId };
};

describe("verification gate — organizations.updateProfile", () => {
	it("forbids profile update while not verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();

		const updateProfile = createProcedureClient(
			organizationsRouter.updateProfile,
			{
				context: ctx(userId),
				path: ["bambi", "organizations", "updateProfile"],
			}
		);

		await expect(
			updateProfile({ organizationId, displayName: "변경시도" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("allows profile update once verified", async () => {
		const { userId, organizationId } = await seedPendingOwner();
		await db
			.update(employerOrganizationProfile)
			.set({ verificationStatus: "verified" })
			.where(eq(employerOrganizationProfile.organizationId, organizationId));

		const updateProfile = createProcedureClient(
			organizationsRouter.updateProfile,
			{
				context: ctx(userId),
				path: ["bambi", "organizations", "updateProfile"],
			}
		);

		const updated = await updateProfile({
			organizationId,
			displayName: "정상변경",
		});
		expect(updated.displayName).toBe("정상변경");

		await db.delete(user).where(eq(user.id, userId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/employer-verification-gate.test.ts`
Expected: FAIL — 첫 테스트가 `rejects`를 기대하지만 현재 `updateProfile`은 pending에서도 성공(throw 안 함).

- [ ] **Step 3: 헬퍼 추가**

`packages/api/src/services/bambi-authz.ts` 상단 import에 `employerOrganizationProfile`을 추가:

```ts
import {
	type accountStatus,
	bambiProfile,
	type bambiUserRole,
	chatRoom,
	employerOrganizationProfile,
} from "@bambi-app/db/schema/bambi";
```

파일 하단(export 구역)에 헬퍼 추가:

```ts
// 승인(verified)된 조직만 공고 등록·조직 설정 조작을 허용하기 위한 검사.
export const isEmployerOrganizationVerified = async (
	organizationId: string
): Promise<boolean> => {
	const [row] = await db
		.select({ status: employerOrganizationProfile.verificationStatus })
		.from(employerOrganizationProfile)
		.where(eq(employerOrganizationProfile.organizationId, organizationId))
		.limit(1);

	return row?.status === "verified";
};
```

- [ ] **Step 4: `organizations.updateProfile`에 게이팅 적용**

`organizations.ts` import에 헬퍼 추가(기존 `bambi-authz` import 구문에 병합):

```ts
import { isEmployerOrganizationVerified } from "../../services/bambi-authz";
```

`updateProfile` 핸들러에서 권한 검사 직후에 verified 검사 추가:

```ts
	updateProfile: protectedProcedure
		.input(updateProfileInput)
		.handler(async ({ context, input }) => {
			await requireOrganizationManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			if (!(await isEmployerOrganizationVerified(input.organizationId))) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 조직 설정을 변경할 수 있습니다.",
				});
			}

			// ...(기존 update 로직 그대로)
```

(`ORPCError`는 organizations.ts에 이미 import되어 있음.)

- [ ] **Step 5: `jobs.create`에 게이팅 적용**

`jobs.ts`의 `create` 핸들러에서 `requireEmployerPostingAccess(...)` 호출 결과로 `profile`을 받은 직후, `admin`이 아니면 verified를 요구한다. import에 헬퍼 추가:

```ts
import {
	isEmployerOrganizationVerified,
	requireActiveBambiProfile,
	requireEmployerPostingAccess,
} from "../../services/bambi-authz";
```

`create` 핸들러 내부, 접근 권한 확인 직후:

```ts
			const profile = await requireEmployerPostingAccess({
				organizationId: input.organizationId,
				teamId: input.teamId,
				session: context.session,
			});

			if (
				profile.role !== "admin" &&
				!(await isEmployerOrganizationVerified(input.organizationId))
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "운영자 승인 후 공고를 등록할 수 있습니다.",
				});
			}
```

(`requireEmployerPostingAccess`가 반환하는 값의 변수명은 기존 코드 그대로 사용. 기존 코드가 반환값을 변수에 담지 않았다면 `const profile =`로 받도록 수정. `ORPCError`가 jobs.ts에 import되어 있지 않으면 `import { ORPCError } from "@orpc/server";` 추가.)

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/employer-verification-gate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: 타입 체크 + 커밋**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: 에러 없음.

```bash
git add packages/api/src/services/bambi-authz.ts packages/api/src/routers/bambi/jobs.ts packages/api/src/routers/bambi/organizations.ts packages/api/src/routers/bambi/employer-verification-gate.test.ts
git commit -F - <<'EOF'
feat: 미승인 구인자 공고 등록·조직 설정 서버 차단

- isEmployerOrganizationVerified 헬퍼 추가
- jobs.create는 admin 외 미승인 조직 공고 등록 시 FORBIDDEN
- organizations.updateProfile은 미승인 시 FORBIDDEN

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: 서버 — 초대 대상 검색 자동완성 쿼리

이메일 입력값으로 employer 계정을 검색해 (이메일 + 이름)을 반환한다. 본인·기존 멤버·pending 초대는 제외한다.

**Files:**
- Modify: `packages/api/src/routers/bambi/teams.ts`
- Test: `packages/api/src/routers/bambi/search-employer-invitees.test.ts` (신규)

**Interfaces:**
- Produces: `teamsRouter.searchEmployerInvitees` — 입력 `{ organizationId: string, query?: string }`, 반환 `Array<{ userId: string, email: string, name: string }>` (최대 10개).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/search-employer-invitees.test.ts` 생성:

```ts
import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { teamsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./teams"),
]);

const { user, organization, member } = authSchema;
const { bambiProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const makeEmployer = async (label: string) => {
	const userId = `user_inv_${randomUUID()}`;
	await db.insert(user).values({
		id: userId,
		name: label,
		email: `${label}_${userId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId, role: "employer", displayName: label });
	return userId;
};

describe("searchEmployerInvitees", () => {
	it("returns employer accounts filtered by query, excluding self and members", async () => {
		const ownerId = await makeEmployer("소유자");
		const targetId = await makeEmployer("김초대");
		const seekerId = `user_inv_${randomUUID()}`;
		await db.insert(user).values({
			id: seekerId,
			name: "김구직",
			email: `seeker_${seekerId}@bambi.test`,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: seekerId, role: "job_seeker", displayName: "김구직" });

		const organizationId = `org_${randomUUID()}`;
		await db.insert(organization).values({
			id: organizationId,
			name: "org",
			slug: `org-${randomUUID().slice(0, 8)}`,
		});
		await db.insert(member).values({
			id: `member_${randomUUID()}`,
			organizationId,
			userId: ownerId,
			role: "owner",
		});

		const search = createProcedureClient(teamsRouter.searchEmployerInvitees, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "searchEmployerInvitees"],
		});

		// "김"으로 검색 → 김초대(employer)만. 김구직은 job_seeker라 제외.
		const results = await search({ organizationId, query: "김" });
		const ids = results.map((r) => r.userId);
		expect(ids).toContain(targetId);
		expect(ids).not.toContain(seekerId);
		expect(ids).not.toContain(ownerId); // 본인 제외
		const target = results.find((r) => r.userId === targetId);
		expect(target?.name).toBe("김초대");
		expect(typeof target?.email).toBe("string");

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, targetId));
		await db.delete(user).where(eq(user.id, seekerId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/search-employer-invitees.test.ts`
Expected: FAIL — `searchEmployerInvitees` 미정의.

- [ ] **Step 3: 최소 구현**

`teams.ts` import를 확장한다. `drizzle-orm`에서 `ilike`, `ne`, `notInArray`, `or`를 추가하고, 스키마/유저/프로필을 import:

```ts
import { invitation, member, team, user } from "@bambi-app/db/schema/auth";
import {
	bambiProfile,
	employerTeamProfile,
} from "@bambi-app/db/schema/bambi";
import { and, asc, eq, ilike, ne, notInArray, or } from "drizzle-orm";
```

입력 스키마 추가(다른 `*Input` 근처):

```ts
const searchEmployerInviteesInput = organizationIdInput.extend({
	query: z.string().max(320).optional(),
});
```

`teamsRouter`에 프로시저 추가(`inviteMember` 근처):

```ts
	searchEmployerInvitees: protectedProcedure
		.input(searchEmployerInviteesInput)
		.handler(async ({ context, input }) => {
			const { profile } = await requireOrganizationTeamManagementAccess({
				organizationId: input.organizationId,
				session: context.session,
			});

			// 제외 대상: 이미 이 조직의 멤버인 유저.
			const existingMembers = await db
				.select({ userId: member.userId })
				.from(member)
				.where(eq(member.organizationId, input.organizationId));
			const excludedUserIds = [
				profile.userId,
				...existingMembers
					.map((row) => row.userId)
					.filter((id): id is string => Boolean(id)),
			];

			// 제외 대상: 이미 pending 초대가 있는 이메일.
			const pendingInvites = await db
				.select({ email: invitation.email })
				.from(invitation)
				.where(
					and(
						eq(invitation.organizationId, input.organizationId),
						eq(invitation.status, "pending")
					)
				);
			const excludedEmails = new Set(
				pendingInvites.map((row) => row.email.toLowerCase())
			);

			const trimmed = input.query?.trim();
			const searchFilter = trimmed
				? or(
						ilike(user.email, `%${trimmed}%`),
						ilike(user.name, `%${trimmed}%`)
					)
				: undefined;

			const rows = await db
				.select({
					userId: user.id,
					email: user.email,
					name: user.name,
				})
				.from(bambiProfile)
				.innerJoin(user, eq(user.id, bambiProfile.userId))
				.where(
					and(
						eq(bambiProfile.role, "employer"),
						notInArray(user.id, excludedUserIds),
						searchFilter
					)
				)
				.orderBy(asc(user.name))
				.limit(10);

			return rows.filter(
				(row) => !excludedEmails.has(row.email.toLowerCase())
			);
		}),
```

참고: `notInArray(user.id, [])`는 빈 배열이면 안전하지 않을 수 있으나 `excludedUserIds`는 항상 본인(`profile.userId`)을 포함하므로 비어 있지 않다. `and(..., undefined)`는 drizzle에서 무시되므로 `searchFilter`가 없을 때도 안전하다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/search-employer-invitees.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/api/src/routers/bambi/teams.ts packages/api/src/routers/bambi/search-employer-invitees.test.ts
git commit -F - <<'EOF'
feat: 팀 초대 대상 검색 자동완성 쿼리 추가

- searchEmployerInvitees로 employer 계정을 이메일/이름 검색
- 본인·기존 멤버·pending 초대 제외, 상위 10개 반환

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: 서버 — `inviteMember`에 employer 검증

초대 이메일이 employer 프로필 보유 계정인지 서버에서 확인한다.

**Files:**
- Modify: `packages/api/src/routers/bambi/teams.ts` (`inviteMember`)
- Test: `packages/api/src/routers/bambi/invite-member-employer-only.test.ts` (신규)

**Interfaces:**
- Consumes: Task 3에서 추가한 `user`, `bambiProfile` import.
- `inviteMember`는 대상 이메일이 employer가 아니면 `ORPCError("FORBIDDEN")`.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/invite-member-employer-only.test.ts` 생성:

```ts
import { randomUUID } from "node:crypto";

import { createProcedureClient } from "@orpc/server";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { Context } from "../../context";

dotenv.config({ path: "../../apps/server/.env" });

const [{ db }, authSchema, bambiSchema, { teamsRouter }] = await Promise.all([
	import("@bambi-app/db"),
	import("@bambi-app/db/schema/auth"),
	import("@bambi-app/db/schema/bambi"),
	import("./teams"),
]);

const { user, organization, member } = authSchema;
const { bambiProfile } = bambiSchema;

const ctx = (userId: string): Context =>
	({ auth: null, session: { user: { id: userId } } }) as Context;

const seedOwner = async () => {
	const ownerId = `user_iv_${randomUUID()}`;
	await db.insert(user).values({
		id: ownerId,
		name: "소유자",
		email: `${ownerId}@bambi.test`,
	});
	await db
		.insert(bambiProfile)
		.values({ userId: ownerId, role: "employer", displayName: "소유자" });
	const organizationId = `org_${randomUUID()}`;
	await db.insert(organization).values({
		id: organizationId,
		name: "org",
		slug: `org-${randomUUID().slice(0, 8)}`,
	});
	await db.insert(member).values({
		id: `member_${randomUUID()}`,
		organizationId,
		userId: ownerId,
		role: "owner",
	});
	return { ownerId, organizationId };
};

describe("inviteMember employer-only", () => {
	it("allows inviting an employer account", async () => {
		const { ownerId, organizationId } = await seedOwner();
		const inviteeEmail = `invitee_${randomUUID()}@bambi.test`;
		const inviteeId = `user_iv_${randomUUID()}`;
		await db.insert(user).values({
			id: inviteeId,
			name: "초대대상",
			email: inviteeEmail,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: inviteeId, role: "employer", displayName: "초대대상" });

		const invite = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "inviteMember"],
		});

		const created = await invite({
			organizationId,
			email: inviteeEmail,
			role: "staff",
		});
		expect(created?.email).toBe(inviteeEmail.toLowerCase());

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, inviteeId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("rejects inviting a non-employer email", async () => {
		const { ownerId, organizationId } = await seedOwner();
		const seekerEmail = `seeker_${randomUUID()}@bambi.test`;
		const seekerId = `user_iv_${randomUUID()}`;
		await db.insert(user).values({
			id: seekerId,
			name: "구직자",
			email: seekerEmail,
		});
		await db
			.insert(bambiProfile)
			.values({ userId: seekerId, role: "job_seeker", displayName: "구직자" });

		const invite = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "inviteMember"],
		});

		await expect(
			invite({ organizationId, email: seekerEmail, role: "staff" })
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, seekerId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});

	it("rejects inviting an email with no account", async () => {
		const { ownerId, organizationId } = await seedOwner();

		const invite = createProcedureClient(teamsRouter.inviteMember, {
			context: ctx(ownerId),
			path: ["bambi", "teams", "inviteMember"],
		});

		await expect(
			invite({
				organizationId,
				email: `ghost_${randomUUID()}@bambi.test`,
				role: "staff",
			})
		).rejects.toThrow();

		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(organization).where(eq(organization.id, organizationId));
	});
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/invite-member-employer-only.test.ts`
Expected: FAIL — 현재 `inviteMember`는 employer 검증이 없어 non-employer/미가입 이메일도 초대 성공(두 번째·세 번째 테스트 실패).

- [ ] **Step 3: 최소 구현**

`inviteMember` 핸들러에서 `invitation` insert 직전에 대상 이메일 검증을 추가:

```ts
			if (input.teamId) {
				await assertTeamBelongsToOrganization({
					organizationId: input.organizationId,
					teamId: input.teamId,
				});
			}

			// 초대 대상은 현재 employer로 가입된 계정만 허용한다.
			const normalizedEmail = input.email.toLowerCase();
			const [invitee] = await db
				.select({ role: bambiProfile.role })
				.from(user)
				.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
				.where(eq(user.email, normalizedEmail))
				.limit(1);

			if (!invitee || invitee.role !== "employer") {
				throw forbidden("구인자로 가입된 계정만 초대할 수 있습니다.");
			}

			const [created] = await db
				.insert(invitation)
				.values({
					email: normalizedEmail,
					// ...(기존 값 그대로)
```

(기존 `email: input.email.toLowerCase()`를 `email: normalizedEmail`로 대체.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/invite-member-employer-only.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: 회귀 확인 + 커밋**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/teams`
Expected: 기존 teams 관련 테스트도 PASS (없으면 생략).

```bash
git add packages/api/src/routers/bambi/teams.ts packages/api/src/routers/bambi/invite-member-employer-only.test.ts
git commit -F - <<'EOF'
feat: 팀 초대 대상을 employer 계정으로 제한

- inviteMember가 대상 이메일의 bambiProfile.role=employer 여부 검증
- 미가입·구직자 이메일 초대 시 FORBIDDEN

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: 프론트 — 회원가입 폼에서 업체명 제거

업소회원 가입은 이름/이메일/비밀번호만 받고, 가입 직후 `createEmployerProfile`만 호출한다.

**Files:**
- Modify: `apps/web/src/components/bambi/screens/auth-screen.tsx`

**Interfaces:**
- Consumes: `client.bambi.onboarding.createEmployerProfile`(이미 존재).

- [ ] **Step 1: `orgName` 상태 제거**

`auth-screen.tsx`에서 `const [orgName, setOrgName] = useState("");`(114행) 줄을 삭제.

- [ ] **Step 2: `finishSignup`의 employer 분기 변경**

기존:

```ts
		if (signupRole === "employer") {
			await client.bambi.onboarding.registerEmployer({
				displayName,
				organizationName: orgName.trim() || displayName,
			});
			queryClient.invalidateQueries();
			// 미검증 구인자는 /employer 레이아웃이 승인 대기 화면을 인라인 렌더한다.
			router.push("/employer" as Route);
			return;
		}
```

변경:

```ts
		if (signupRole === "employer") {
			await client.bambi.onboarding.createEmployerProfile({ displayName });
			queryClient.invalidateQueries();
			// 조직은 업체정보 제출 시 생성된다. /employer 대시보드가 업체정보 입력을 유도한다.
			router.push("/employer" as Route);
			return;
		}
```

- [ ] **Step 3: 업체명 입력 필드 제거**

업체명 `<label ... htmlFor="auth-org-name">`(297~307행) 블록 전체를 삭제.

- [ ] **Step 4: 안내 문구 수정**

기존 안내(308~315행)의 문구를 교체:

```tsx
			{isSignUp && signupRole === "employer" ? (
				<p
					className="m-0 rounded-lg border border-border bg-secondary px-4 py-3 text-muted-foreground text-sm"
					role="note"
				>
					가입 후 업체 정보를 입력하고 운영자 승인을 받으면 구인 기능을 이용할 수 있어요.
				</p>
			) : null}
```

- [ ] **Step 5: 타입 체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 없음. (`registerEmployer` 참조가 사라졌는지 확인. Task 10 전이라 서버엔 아직 남아있으므로 타입은 통과.)

Run: `pnpm dlx ultracite check apps/web/src/components/bambi/screens/auth-screen.tsx`
Expected: 에러 없음(있으면 `pnpm dlx ultracite fix <file>`).

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/screens/auth-screen.tsx
git commit -F - <<'EOF'
feat: 업소회원 가입에서 업체명 입력 제거

- 가입은 이름/이메일/비밀번호만 받고 employer 프로필만 생성
- 가입 직후 /employer로 이동(조직은 업체정보 제출 시 생성)
- 안내 문구를 업체정보 입력 유도로 변경

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

**시각 확인 요청**: 사용자에게 "회원가입 → 업소회원 선택 시 업체명 필드가 사라지고 안내 문구가 바뀌었는지" 확인 요청.

---

## Task 6: 프론트 — employer 레이아웃 게이팅 전환

화면 통짜 대체(`EmployerPending`)를 폐지하고, approval 상태를 Client Context로 내려 하위 화면이 소비하게 한다. nav는 항상 표시.

**Files:**
- Modify: `apps/web/src/lib/bambi/require-role.ts` (`resolveEmployerAccess`)
- Create: `apps/web/src/components/bambi/employer-approval-context.tsx`
- Modify: `apps/web/src/app/employer/layout.tsx`

**Interfaces:**
- Produces: `resolveEmployerAccess(): Promise<{ approvalStatus: "none" | "pending" | "verified" | "rejected" }>`.
- Produces: `EmployerApprovalProvider`(Client Component, prop `value: EmployerApprovalStatus`), `useEmployerApproval(): EmployerApprovalStatus` 훅, 타입 `EmployerApprovalStatus`.

- [ ] **Step 1: `resolveEmployerAccess` 반환 변경**

`require-role.ts`의 `resolveEmployerAccess`를 교체:

```ts
// 구인자 영역: 구인자가 아니면 각자 홈으로. 구인자면 승인 상태를 돌려준다(리다이렉트 없음).
// 미승인이어도 화면은 렌더하고, 조작 요소만 approval 상태로 disabled 처리한다.
export async function resolveEmployerAccess(): Promise<{
	approvalStatus: Routing["employerApprovalStatus"];
}> {
	const routing = await getRouting();
	if (routing.role !== "employer") {
		redirect(homePathForRole(routing.role));
	}
	return { approvalStatus: routing.employerApprovalStatus };
}
```

- [ ] **Step 2: Approval Context 생성**

`apps/web/src/components/bambi/employer-approval-context.tsx` 생성:

```tsx
"use client";

import { createContext, type ReactNode, useContext } from "react";

export type EmployerApprovalStatus =
	| "none"
	| "pending"
	| "verified"
	| "rejected";

const EmployerApprovalContext = createContext<EmployerApprovalStatus>("none");

export function EmployerApprovalProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: EmployerApprovalStatus;
}) {
	return (
		<EmployerApprovalContext.Provider value={value}>
			{children}
		</EmployerApprovalContext.Provider>
	);
}

export function useEmployerApproval(): EmployerApprovalStatus {
	return useContext(EmployerApprovalContext);
}

// 승인 완료 여부 단축 헬퍼.
export function useEmployerVerified(): boolean {
	return useEmployerApproval() === "verified";
}
```

- [ ] **Step 3: 레이아웃 교체**

`apps/web/src/app/employer/layout.tsx` 전체를 교체:

```tsx
import type { Route } from "next";
import type { ReactNode } from "react";
import { EmployerApprovalProvider } from "@/components/bambi/employer-approval-context";
import { EmployerNav } from "@/components/bambi/persona-nav";
import { ResponsiveAppShell } from "@/components/bambi/responsive-shell";
import { resolveEmployerAccess } from "@/lib/bambi/require-role";

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
	const { approvalStatus } = await resolveEmployerAccess();
	// 미승인이어도 화면과 nav는 그대로 노출한다. 각 페이지가 approval 상태로
	// 조작 요소를 비활성화하고 안내 배너를 띄운다.
	return (
		<ResponsiveAppShell navItems={EMPLOYER_NAV_ITEMS} variant="employer">
			<EmployerNav>
				<EmployerApprovalProvider value={approvalStatus}>
					{children}
				</EmployerApprovalProvider>
			</EmployerNav>
		</ResponsiveAppShell>
	);
}
```

주의: `ResponsiveAppShell`과 `EmployerNav`가 `gated` prop을 **필수**로 요구하면 타입 에러가 난다. 그럴 경우 두 컴포넌트에서 `gated`를 **optional(기본 false)**로 바꾸거나 `gated={false}`를 명시적으로 전달한다. Step 4에서 처리.

- [ ] **Step 4: `gated` prop 정리**

`responsive-shell.tsx`와 `persona-nav.tsx`에서 `gated` prop을 확인한다.
- `gated`가 여전히 다른 곳에서 쓰이면(예: seeker 게이트) prop 시그니처는 optional로 유지하고 layout에서 전달을 생략한다(기본값 false).
- `gated`가 employer 게이팅 전용이었다면, 두 컴포넌트에서 관련 분기를 제거한다.

Run: `pnpm --filter web check-types`
Expected: 에러 없음. (에러가 `gated` 관련이면 위 지침대로 optional 처리.)

- [ ] **Step 5: 린트 + 커밋**

Run: `pnpm dlx ultracite check apps/web/src/app/employer/layout.tsx apps/web/src/components/bambi/employer-approval-context.tsx apps/web/src/lib/bambi/require-role.ts`
Expected: 에러 없음.

```bash
git add apps/web/src/app/employer/layout.tsx apps/web/src/components/bambi/employer-approval-context.tsx apps/web/src/lib/bambi/require-role.ts apps/web/src/components/bambi/responsive-shell.tsx apps/web/src/components/bambi/persona-nav.tsx
git commit -F - <<'EOF'
feat: 구인자 레이아웃 게이팅을 화면 대체에서 상태 전달로 전환

- resolveEmployerAccess가 approvalStatus를 반환
- EmployerApprovalProvider/useEmployerApproval로 하위 화면에 상태 제공
- 미승인이어도 nav·화면을 렌더(조작 제한은 각 페이지가 담당)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

(`EmployerPending` 컴포넌트 자체 삭제는 참조가 모두 사라지는 Task 8 이후 Task 10에서 처리.)

---

## Task 7: 프론트 — 업체정보 입력 폼(`/employer/me`)

업체 정보 페이지에 업체명+사업자등록번호 입력 폼을 추가하고 `submitEmployerBusinessInfo`를 호출한다.

**Files:**
- Modify: `apps/web/src/app/employer/me/page.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.onboarding.submitEmployerBusinessInfo`(Task 1), `orpc.bambi.onboarding.getMine`.

- [ ] **Step 1: 입력 폼 컴포넌트 추가**

`me/page.tsx` 상단 import에 필요한 것 추가(이미 있는 것 제외):

```tsx
import { Input } from "@bambi-app/ui/components/input";
import { Label } from "@bambi-app/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
```

같은 파일 안에 폼 컴포넌트를 정의(파일 하단, `EmployerMePage` 밖):

```tsx
const BRN_PATTERN = /^\d{3}-\d{2}-\d{5}$/;

function BusinessInfoForm({
	defaultDisplayName,
	defaultBusinessRegistrationNumber,
}: {
	defaultDisplayName: string;
	defaultBusinessRegistrationNumber: string;
}) {
	const queryClient = useQueryClient();
	const [displayName, setDisplayName] = useState(defaultDisplayName);
	const [brn, setBrn] = useState(defaultBusinessRegistrationNumber);
	const [showValidation, setShowValidation] = useState(false);

	const submitMutation = useMutation(
		orpc.bambi.onboarding.submitEmployerBusinessInfo.mutationOptions({
			onError: (error) => {
				toast.error(error.message || "업체 정보를 제출하지 못했습니다.");
			},
			onSuccess: async () => {
				toast.success("업체 정보를 제출했습니다. 운영자 승인을 기다려 주세요.");
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.onboarding.getMine.queryKey(),
				});
			},
		})
	);

	const nameError =
		displayName.trim().length === 0 ? "업체명을 입력해 주세요." : "";
	const brnError = BRN_PATTERN.test(brn.trim())
		? ""
		: "사업자등록번호는 000-00-00000 형식으로 입력해 주세요.";

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (nameError || brnError) {
			setShowValidation(true);
			return;
		}
		submitMutation.mutate({
			displayName: displayName.trim(),
			businessRegistrationNumber: brn.trim(),
		});
	};

	return (
		<form className="flex flex-col gap-3 border p-4" onSubmit={handleSubmit}>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="business-name">업체명</Label>
				<Input
					aria-invalid={showValidation && Boolean(nameError)}
					id="business-name"
					onChange={(event) => setDisplayName(event.target.value)}
					placeholder="예: 밤비 라운지"
					value={displayName}
				/>
				{showValidation && nameError ? (
					<p className="text-destructive text-xs">{nameError}</p>
				) : null}
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="business-brn">사업자 등록 번호</Label>
				<Input
					aria-invalid={showValidation && Boolean(brnError)}
					id="business-brn"
					onChange={(event) => setBrn(event.target.value)}
					placeholder="000-00-00000"
					value={brn}
				/>
				{showValidation && brnError ? (
					<p className="text-destructive text-xs">{brnError}</p>
				) : null}
			</div>
			<Button
				className="w-full sm:w-auto"
				disabled={submitMutation.isPending}
				type="submit"
			>
				업체 정보 제출
			</Button>
		</form>
	);
}
```

- [ ] **Step 2: 폼을 "사업자 인증" 섹션에 배치**

`me/page.tsx`의 `<section aria-labelledby="businesses" ...>` 안, 설명 문단 아래·조직 카드 위에 폼을 삽입한다. 기존 조직 프로필 데이터로 기본값을 채운다:

```tsx
				<BusinessInfoForm
					defaultBusinessRegistrationNumber={
						organizationProfiles[0]?.businessRegistrationNumber ?? ""
					}
					defaultDisplayName={organizationProfiles[0]?.displayName ?? ""}
				/>
```

기존 조직 카드 목록(`organizationProfiles.length > 0 ? ... : <EmptyState .../>`)은 그대로 두되, `EmptyState`의 "조직 설정으로 이동" 유도 문구는 폼이 생겼으므로 설명을 "위 양식으로 업체 정보를 제출하면 사업자 인증을 신청할 수 있습니다."로 바꾼다.

- [ ] **Step 3: 타입 체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 없음.

Run: `pnpm dlx ultracite check apps/web/src/app/employer/me/page.tsx`
Expected: 에러 없음(있으면 fix).

- [ ] **Step 4: 커밋**

```bash
git add apps/web/src/app/employer/me/page.tsx
git commit -F - <<'EOF'
feat: 업체 정보 페이지에 업체명·사업자등록번호 제출 폼 추가

- submitEmployerBusinessInfo로 업체 정보 제출·재제출
- 사업자등록번호 000-00-00000 형식 검증

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

**시각 확인 요청**: 업소회원 신규 가입 → `/employer/me`에서 업체정보 제출 → getMine이 갱신되어 상태가 `pending`으로 표시되는지 사용자에게 확인 요청.

---

## Task 8: 프론트 — 게이팅 배너 + 조작 disabled

미승인 상태에서 대시보드·새 공고·조직 설정의 조작 요소를 비활성화하고 안내 배너를 띄운다.

**Files:**
- Create: `apps/web/src/components/bambi/employer-gate-banner.tsx`
- Modify: `apps/web/src/app/employer/page.tsx` (대시보드)
- Modify: `apps/web/src/app/employer/new/page.tsx` (새 공고)
- Modify: `apps/web/src/app/employer/settings/page.tsx` (조직 설정)

**Interfaces:**
- Consumes: `useEmployerApproval`/`useEmployerVerified`(Task 6).
- Produces: `<EmployerGateBanner action="공고를 등록" />` 컴포넌트 — 미승인 상태별 안내를 렌더, verified면 `null`.

- [ ] **Step 1: 안내 배너 컴포넌트 생성**

`apps/web/src/components/bambi/employer-gate-banner.tsx` 생성:

```tsx
"use client";

import { Alert, AlertDescription, AlertTitle } from "@bambi-app/ui/components/alert";
import { buttonVariants } from "@bambi-app/ui/components/button";
import type { Route } from "next";
import Link from "next/link";

import { useEmployerApproval } from "@/components/bambi/employer-approval-context";

// action 예: "공고를 등록", "조직 설정을 변경"
export function EmployerGateBanner({ action }: { action: string }) {
	const status = useEmployerApproval();

	if (status === "verified") {
		return null;
	}

	const title =
		status === "pending"
			? "운영자 승인 대기 중"
			: status === "rejected"
				? "업체 인증이 반려되었습니다"
				: "업체 정보 등록이 필요합니다";

	const description =
		status === "pending"
			? `${action}하려면 운영자 승인이 완료되어야 합니다.`
			: status === "rejected"
				? `반려 사유를 확인하고 업체 정보를 다시 제출해 주세요. 승인 후 ${action}할 수 있습니다.`
				: `${action}하려면 업체명과 사업자등록번호를 입력하세요.`;

	return (
		<Alert>
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription className="flex flex-col items-start gap-2">
				<span>{description}</span>
				{status !== "pending" ? (
					<Link
						className={buttonVariants({ size: "sm", variant: "outline" })}
						href={"/employer/me" as Route}
					>
						업체 정보 입력
					</Link>
				) : null}
			</AlertDescription>
		</Alert>
	);
}
```

주의: `alert` 컴포넌트가 없으면 추가한다:
Run: `pnpm dlx shadcn@latest add alert`
(shadcn 추가 파일이 루트로 떨어지면 `packages/ui/src/components/`로 이동. 프로젝트 shadcn 워크플로우 준수. `rounded-none` 제거.)

- [ ] **Step 2: 대시보드(`employer/page.tsx`)에 배너 + 새 공고 버튼 비활성화**

`employer/page.tsx` 상단(클라이언트 컴포넌트인지 확인; 아니면 배너/버튼을 감싸는 작은 client wrapper로 처리)에서:
- 페이지 본문 최상단에 `<EmployerGateBanner action="공고를 등록" />` 삽입.
- "새 공고" 등록 `<Link href="/employer/new">`를 `useEmployerVerified()`가 false면 비활성 표시로 바꾼다. `Link`는 disabled가 없으므로 verified일 때만 `Link`, 아니면 `disabled`된 `Button`으로 렌더:

```tsx
{verified ? (
	<Link className={buttonVariants()} href="/employer/new">
		새 공고 등록
	</Link>
) : (
	<Button disabled type="button">
		새 공고 등록
	</Button>
)}
```

`const verified = useEmployerVerified();`를 컴포넌트 상단에 추가. `employer/page.tsx`가 server component면, 배너와 조건부 버튼을 담는 client 컴포넌트(`EmployerDashboardActions` 등)로 분리하거나 파일 상단에 `"use client"`가 이미 있는지 확인 후 처리.

- [ ] **Step 3: 새 공고 페이지(`employer/new/page.tsx`) 비활성화**

`new/page.tsx`(이미 `"use client"`) 폼 최상단에 `<EmployerGateBanner action="공고를 등록" />` 삽입. 제출 버튼 `disabled` 조건에 `|| !verified`를 더한다:

```tsx
const verified = useEmployerVerified();
// ...
<Button
	type="submit"
	disabled={createMutation.isPending || !verified /* 기존 조건 유지 */}
>
```

`useEmployerVerified` import 추가.

- [ ] **Step 4: 조직 설정 페이지(`employer/settings/page.tsx`) 비활성화**

`settings/page.tsx` 최상단에 `<EmployerGateBanner action="조직 설정을 변경" />` 삽입. `OrgProfileForm`에 `disabled`를 전달할 수 있으면 `disabled={!verified}`를 넘기고, 없으면 `OrgProfileForm`을 `verified`가 false일 때 렌더하지 않거나 감싸는 컨테이너에 `aria-disabled`와 pointer 차단을 준다. 가장 단순하게는 `org-profile-form.tsx`의 입력·저장 버튼 `disabled` 조건에 상위에서 받은 `disabled` prop을 OR로 결합.

(권장: `OrgProfileForm`에 optional `disabled?: boolean` prop을 추가하고 내부 `disabled={!organization.canManageOrganization || disabled}`로 결합. 팀 관리 진입 링크도 `verified`가 false면 disabled 버튼으로.)

- [ ] **Step 5: 타입 체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 없음.

Run: `pnpm dlx ultracite check apps/web/src/components/bambi/employer-gate-banner.tsx apps/web/src/app/employer/page.tsx apps/web/src/app/employer/new/page.tsx apps/web/src/app/employer/settings/page.tsx`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/bambi/employer-gate-banner.tsx apps/web/src/app/employer/page.tsx apps/web/src/app/employer/new/page.tsx apps/web/src/app/employer/settings/page.tsx apps/web/src/components/bambi/org-profile-form.tsx packages/ui/src/components/alert.tsx
git commit -F - <<'EOF'
feat: 미승인 구인자 조작 비활성화 및 안내 배너

- EmployerGateBanner로 none/pending/rejected 상태별 안내 표시
- 대시보드·새 공고·조직 설정의 조작 요소를 미승인 시 disabled
- 안내에서 업체 정보 입력(/employer/me)으로 유도

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

**시각 확인 요청**: 미승인 상태에서 대시보드/새 공고/조직 설정 진입 시 배너가 뜨고 조작이 막히는지, verified 후 정상 동작하는지 사용자에게 확인 요청.

---

## Task 9: 프론트 — 팀 초대 이메일 검색 자동완성

이메일 입력 필드를 검색 자동완성으로 바꿔 employer 계정을 (이메일 + 이름)으로 노출한다.

**Files:**
- Modify: `apps/web/src/components/bambi/team-member-list.tsx`
- (필요 시) shadcn `command`, `popover` 추가

**Interfaces:**
- Consumes: `orpc.bambi.teams.searchEmployerInvitees`(Task 3).

- [ ] **Step 1: shadcn command/popover 추가**

Run: `pnpm dlx shadcn@latest add command popover`
(추가 파일이 루트로 떨어지면 `packages/ui/src/components/`로 이동. `rounded-none` 제거, 반경 토큰화. 프로젝트 shadcn 워크플로우 준수.)

- [ ] **Step 2: 검색 상태 + 쿼리 배선**

`team-member-list.tsx`에 검색어 상태와 쿼리를 추가한다. 기존 `email` state는 "확정된 초대 대상 이메일"로 유지하고, 별도 `search` state로 입력값을 관리:

```tsx
const [search, setSearch] = useState("");
const [popoverOpen, setPopoverOpen] = useState(false);

const inviteesQuery = useQuery(
	orpc.bambi.teams.searchEmployerInvitees.queryOptions({
		input: {
			organizationId: organization.organizationId,
			query: search.trim() || undefined,
		},
		enabled: popoverOpen,
	})
);
const invitees = inviteesQuery.data ?? [];
```

- [ ] **Step 3: 이메일 입력을 Combobox(Popover + Command)로 교체**

기존 `<Input id="invite-email" ...>` 블록을 Popover 트리거 + Command 리스트로 교체. 선택 시 `email`을 확정하고 `search`에 표시한다. 각 항목은 **이메일과 이름을 함께** 노출:

```tsx
<Popover onOpenChange={setPopoverOpen} open={popoverOpen}>
	<PopoverTrigger
		render={
			<Input
				aria-invalid={showValidation && Boolean(emailError)}
				id="invite-email"
				onChange={(event) => {
					setSearch(event.target.value);
					setEmail(event.target.value);
					setPopoverOpen(true);
				}}
				placeholder="구인자 이메일 검색"
				value={search}
			/>
		}
	/>
	<PopoverContent align="start" className="p-0">
		<Command shouldFilter={false}>
			<CommandList>
				{inviteesQuery.isLoading ? (
					<CommandEmpty>검색 중…</CommandEmpty>
				) : invitees.length === 0 ? (
					<CommandEmpty>일치하는 구인자 계정이 없습니다.</CommandEmpty>
				) : (
					<CommandGroup>
						{invitees.map((invitee) => (
							<CommandItem
								key={invitee.userId}
								onSelect={() => {
									setEmail(invitee.email);
									setSearch(invitee.email);
									setPopoverOpen(false);
								}}
								value={invitee.email}
							>
								<span className="flex flex-col">
									<span className="font-medium text-sm">{invitee.name}</span>
									<span className="text-muted-foreground text-xs">
										{invitee.email}
									</span>
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</Command>
	</PopoverContent>
</Popover>
```

import 추가:

```tsx
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@bambi-app/ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@bambi-app/ui/components/popover";
```

주의(base-ui): 이 레포 shadcn base는 base-ui이므로 커스텀 트리거는 `asChild`가 아니라 `render` prop을 쓴다(위 예시 참고). 실제 `PopoverTrigger` API는 `pnpm dlx shadcn@latest docs popover`로 확인.

`onSuccess`(초대 성공) 콜백에서 `setSearch("")`도 함께 초기화하도록 기존 `setEmail("")` 옆에 추가.

- [ ] **Step 4: 타입 체크 + 린트**

Run: `pnpm --filter web check-types`
Expected: 에러 없음.

Run: `pnpm dlx ultracite check apps/web/src/components/bambi/team-member-list.tsx`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/team-member-list.tsx packages/ui/src/components/command.tsx packages/ui/src/components/popover.tsx
git commit -F - <<'EOF'
feat: 팀 초대 이메일 검색 자동완성

- searchEmployerInvitees로 employer 계정을 검색해 이메일+이름 노출
- Popover+Command 콤보박스로 초대 대상 선택

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

**시각 확인 요청**: 팀 관리에서 이메일 입력 시 employer 계정이 이메일+이름으로 뜨고, 구직자/미가입은 안 뜨는지 사용자에게 확인 요청.

---

## Task 10: 정리 — `registerEmployer`·`EmployerPending` 제거

새 플로우로 대체된 미사용 코드를 제거하고 전체 타입/테스트를 확인한다.

**Files:**
- Modify: `packages/api/src/routers/bambi/onboarding.ts` (`registerEmployer`, `registerEmployerInput` 제거)
- Delete: `packages/api/src/routers/bambi/register-employer.test.ts`
- Delete: `apps/web/src/components/bambi/screens/employer-pending.tsx`

- [ ] **Step 1: 참조 확인**

Run: `pnpm dlx grep -rn "registerEmployer\|EmployerPending" packages apps` (또는 에디터 검색)
Expected: `onboarding.ts`의 정의, 삭제 대상 테스트, 삭제 대상 컴포넌트 외에 **참조가 없어야** 한다. 남은 참조가 있으면 먼저 제거(auth-screen은 Task 5에서, layout은 Task 6에서 이미 정리됨).

- [ ] **Step 2: 코드 제거**

- `onboarding.ts`에서 `registerEmployer` 프로시저(핸들러)와 `registerEmployerInput` 스키마 상수를 삭제.
- `register-employer.test.ts` 파일 삭제.
- `employer-pending.tsx` 파일 삭제.

- [ ] **Step 3: 전체 타입 체크**

Run: `pnpm --filter @bambi-app/api check-types`
Run: `pnpm --filter web check-types`
Expected: 둘 다 에러 없음.

- [ ] **Step 4: 서버 테스트 스위트 회귀 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi`
Expected: 신규 4개 테스트 파일 포함 전부 PASS. (삭제한 register-employer 테스트 제외.)

- [ ] **Step 5: 린트 + 커밋**

Run: `pnpm dlx ultracite check packages/api/src/routers/bambi/onboarding.ts`
Expected: 에러 없음.

```bash
git add -A
git commit -F - <<'EOF'
refactor: registerEmployer·EmployerPending 제거

- 조직 생성은 submitEmployerBusinessInfo로 이관되어 registerEmployer 불필요
- 화면 통짜 대체 EmployerPending은 게이트 배너로 대체되어 제거

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## 최종 확인 (전체 스위트)

- [ ] `pnpm --filter @bambi-app/api check-types` — 에러 없음
- [ ] `pnpm --filter web check-types` — 에러 없음
- [ ] `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi` — 전부 PASS
- [ ] 사용자 시각 확인: 아래 시나리오
  1. 업소회원 가입(이름/이메일/비번만) → `/employer` 진입, 배너로 업체정보 입력 유도, 새 공고·조직 설정 disabled
  2. `/employer/me`에서 업체명+사업자번호 제출 → `pending` 표시
  3. 운영자 승인(admin) 후 → 조작 활성화, 공고 등록·조직 설정 정상
  4. 팀 관리 초대에서 이메일 검색 → employer 계정만 이메일+이름으로 자동완성, 초대 성공
  5. 구직자/미가입 이메일 초대 시도 → 서버 거부(에러 토스트)

---

## Notes / 후속 (이번 스코프 밖)

- 초대 **수락(accept) · member/teamMember 합류** 플로우, 초대 이메일 발송/링크는 별도 설계.
- "다른 owner에게 초대받아 팀 합류" 시 남의 조직 member로서 `/employer` UI가 나오는 동작은
  `getMyRouting`이 이미 member 기준 조직을 읽으므로 구조적으로 수용되나, 실제 합류 경로는 후속.
