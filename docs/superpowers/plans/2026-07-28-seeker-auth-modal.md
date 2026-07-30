# /seeker 인증 모달 · 인증 선행 회원가입 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인·회원가입을 `/welcome` 전용 페이지에서 `/seeker` 위의 오버레이로 옮기고, 회원가입을 본인인증 선행 2단계로 바꾼다.

**Architecture:** 게이트(`proxy.ts`→`resolve-gate.ts`)가 비로그인 방문자를 `/seeker`에 통과시키고, `app/seeker/layout.tsx`가 서버에서 anon을 판정해 마스킹된 블러 배경 + 인증 카드 + 선명한 푸터만 렌더한다. 배경 텍스트는 **서버에서 마스킹**되어 나가므로 devtools로 블러를 걷어내도 실제 업소명이 노출되지 않는다. 회원가입은 포트원 본인인증을 먼저 통과해야 폼이 열리고, 인증 결과가 그대로 프로필(`isPhoneVerified`·`birthDate`·`ciHash`·`diHash`)에 기록된다.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · Tailwind v4 + shadcn(base-ui) · oRPC · Drizzle · better-auth · 포트원 V2 본인인증 · vitest

**설계 문서:** `docs/superpowers/specs/2026-07-28-seeker-auth-modal-design.md`

## Global Constraints

- **UI 규칙(`apps/web/CLAUDE.md`)**: 인라인 `style` 금지, Tailwind만. 컴포넌트는 `@bambi-app/ui/components`의 shadcn 우선. `space-x-*`/`space-y-*` 금지(→ `flex flex-col gap-*`). 가로=세로면 `size-*`. 조건부 클래스는 `cn()`. `rounded-none` 금지. 오버레이에 수동 `z-index` 금지. base는 **base-ui**라 커스텀 트리거는 `asChild`가 아니라 `render` prop.
- **임의 px 금지**: `[16px]` 같은 임의값 대신 Tailwind 스케일 토큰을 쓴다.
- **색은 시맨틱 토큰**: `bg-background`·`text-muted-foreground`·`border-border` 등. raw hex/oklch 금지.
- **모바일 반응형 필수**: 데스크톱만 보지 말고 좁은 화면도 항상 확인한다.
- **라이브러리 추가 금지**: 새 npm 의존성을 넣지 않는다.
- **빌드·개발서버 실행 금지**: `next build`·`next dev` 금지. 검증은 단위 테스트 + `pnpm check-types` + `pnpm dlx ultracite fix`로 한다. 시각 확인은 사용자가 한다.
- **커밋 메시지**: 한국어 `type: 제목` + `- ` 블릿 본문(블릿 사이 빈 줄 없음). 멀티라인은 임시 파일 + `git commit -F`.
- **테스트 실행**: web 단위 테스트는 워크트리 루트에서 `pnpm vitest run <경로>`. api 패키지는 `pnpm --filter @bambi-app/api test`(실 DB 접속 필요).
- **작업 위치**: 워크트리 `C:\Users\user\projects\bambi-app\.claude\worktrees\seeker-auth-modal`, 브랜치 `worktree-seeker-auth-modal`. 완료 후 `refactor/login`에 로컬 머지. **push·PR 금지.**

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `apps/web/src/lib/bambi/auth-backdrop.ts` | `Job` → 마스킹된 배경용 데이터 변환(순수 함수) |
| `apps/web/src/lib/bambi/auth-backdrop.test.ts` | 마스킹 불변식 검증 |
| `apps/web/src/components/bambi/auth/adult-notice.tsx` | 19금 법정 안내 블록 |
| `apps/web/src/components/bambi/auth/auth-panel.tsx` | 로그인/회원가입 패널(2단계 상태 머신) |
| `apps/web/src/components/bambi/auth/auth-backdrop.tsx` | 마스킹 데이터로 그리는 블러 배경 |
| `apps/web/src/components/bambi/auth/seeker-auth-gate-screen.tsx` | anon 전용 화면 조립(서버 컴포넌트) |
| `apps/web/src/components/bambi/auth/auth-dialog.tsx` | guest용 닫을 수 있는 Dialog 껍데기 |
| `packages/api/src/services/bambi-identity.ts` | 포트원 조회 + 성인 확인 + CI/DI 해시(공통) |

**수정**

| 파일 | 변경 |
|---|---|
| `apps/web/src/lib/bambi/guest-token.ts` | payload v2에 `ivId` 추가 |
| `apps/web/src/app/api/guest/route.ts` | 발급 토큰에 `ivId` 싣기 |
| `apps/web/src/lib/bambi/resolve-gate.ts` | anon `/seeker` 통과, 리다이렉트 대상 변경 |
| `apps/web/src/lib/bambi/require-role.ts` | `/welcome` → `/seeker?auth=login` |
| `apps/web/src/app/seeker/layout.tsx` | anon 분기 |
| `apps/web/src/components/bambi/responsive-shell.tsx` | guest 헤더 진입점 |
| `apps/web/src/components/bambi/guest-blocked-toast.tsx` | `/seeker`에서 동작 |
| `packages/api/src/routers/bambi/onboarding.ts` | `checkIdentityForSignup` 추가, 프로필 생성에 인증 반영 |
| `apps/web/next.config.ts` · `sitemap.ts` · employer 페이지 6곳 등 | 링크 정리 |

**삭제**: `app/welcome/page.tsx` · `app/login/page.tsx` · `components/bambi/screens/adult-gate-screen.tsx` · `components/bambi/screens/auth-screen.tsx`(→ `auth/auth-panel.tsx`로 이동)

---

## Task 1: 게스트 토큰 v2 — 인증 ID 보관

인증 직후 새로고침해도 회원가입 폼 단계가 유지되도록, 이미 HMAC 서명된 게스트 토큰에 `identityVerificationId`를 함께 싣는다. `sessionStorage`보다 코드가 적고 위조가 막힌다.

**Files:**
- Modify: `apps/web/src/lib/bambi/guest-token.ts`
- Modify: `apps/web/src/lib/bambi/guest.ts`
- Modify: `apps/web/src/app/api/guest/route.ts`
- Test: `apps/web/src/lib/bambi/guest-token.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `GuestTokenPayload { exp: number; gender: BambiGenderValue | null; ivId?: string; v: 1 | 2 }`
  - `createGuestToken({ gender, ivId?, maxAgeSeconds, now, secret }): Promise<string>`
  - `decodeGuestTokenIvId(token: string): string | null`
  - `readGuestIvIdFromCookieString(cookie: string): string | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/lib/bambi/guest-token.test.ts` 끝에 추가:

```ts
describe("게스트 토큰 v2 — 인증 ID", () => {
	const secret = "test-secret";
	const now = new Date("2026-07-28T00:00:00Z");

	it("ivId를 실어 왕복한다", async () => {
		const token = await createGuestToken({
			gender: "female",
			ivId: "iv-abc",
			maxAgeSeconds: 3600,
			now,
			secret,
		});
		const payload = await verifyGuestToken(token, secret, now);
		expect(payload).toMatchObject({ gender: "female", ivId: "iv-abc", v: 2 });
		expect(decodeGuestTokenIvId(token)).toBe("iv-abc");
	});

	it("ivId 없이 발급하면 v2이되 ivId는 없다", async () => {
		const token = await createGuestToken({
			gender: null,
			maxAgeSeconds: 3600,
			now,
			secret,
		});
		expect(decodeGuestTokenIvId(token)).toBeNull();
		expect(await verifyGuestToken(token, secret, now)).toMatchObject({ v: 2 });
	});

	it("기존 v1 토큰도 계속 유효하다", async () => {
		// v1 페이로드를 직접 만들어 서명한다(구 버전이 발급한 토큰 재현).
		const payload = { exp: Math.floor(now.getTime() / 1000) + 3600, gender: "male", v: 1 };
		const encoder = new TextEncoder();
		const payloadPart = btoa(JSON.stringify(payload))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);
		const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadPart));
		const signaturePart = btoa(String.fromCharCode(...new Uint8Array(signature)))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
		const token = `${payloadPart}.${signaturePart}`;

		expect(await verifyGuestToken(token, secret, now)).toMatchObject({
			gender: "male",
			v: 1,
		});
		expect(decodeGuestTokenIvId(token)).toBeNull();
	});
});
```

파일 상단 import에 `decodeGuestTokenIvId`를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/guest-token.test.ts`
Expected: FAIL — `decodeGuestTokenIvId is not a function`

- [ ] **Step 3: 토큰 모듈을 고친다**

`guest-token.ts`:

```ts
export interface GuestTokenPayload {
	// 만료(Unix 초). 쿠키 maxAge와 별개로 토큰 자체에도 만료를 박아, 훔친 쿠키를
	// 무기한 재사용하는 것을 막는다.
	exp: number;
	// 인증에서 확인된 성별. 가입 시 프로필로 이관한다.
	gender: BambiGenderValue | null;
	// 포트원 인증 건 식별자. 가입 폼 단계에서 서버로 되돌려 프로필에 인증 결과를
	// 기록하는 데 쓴다. 그 자체로는 개인정보가 아니며 서버 조회 없이는 의미가 없다.
	ivId?: string;
	// 1 = ivId 이전 버전(계속 유효), 2 = 현재.
	v: 1 | 2;
}
```

`createGuestToken` 시그니처에 `ivId?: string`를 추가하고 payload를 이렇게 만든다:

```ts
	const payload: GuestTokenPayload = {
		exp: Math.floor(now.getTime() / 1000) + maxAgeSeconds,
		gender,
		v: 2,
	};
	if (ivId) {
		payload.ivId = ivId;
	}
```

`parsePayload`의 검증을 완화한다:

```ts
		const { exp, gender, ivId, v } = parsed as Record<string, unknown>;
		if ((v !== 1 && v !== 2) || typeof exp !== "number") {
			return null;
		}
		if (gender !== "male" && gender !== "female" && gender !== null) {
			return null;
		}
		if (ivId !== undefined && typeof ivId !== "string") {
			return null;
		}
		return ivId === undefined ? { exp, gender, v } : { exp, gender, ivId, v };
```

파일 끝에 추가:

```ts
// 클라이언트에서 서명 검증 없이 인증 ID만 읽는다(가입 폼 단계 복원용). 게이트 판정에
// 절대 쓰지 않는다 — 위조 가능한 값이며, 서버가 포트원 조회로 다시 검증한다.
export function decodeGuestTokenIvId(token: string): string | null {
	const payloadPart = token.split(".")[0];
	if (!payloadPart) {
		return null;
	}
	return parsePayload(payloadPart)?.ivId ?? null;
}
```

`guest.ts`에 `decodeGuestTokenIvId`를 import하고 `readGuestGenderFromCookieString` 옆에 추가:

```ts
// 게스트 토큰에서 포트원 인증 ID를 읽는다. 인증을 마친 뒤 새로고침해도 회원가입
// 폼 단계를 이어가기 위한 용도다.
export const readGuestIvIdFromCookieString = (cookie: string): string | null => {
	const token = readGuestTokenFromCookieString(cookie);
	return token ? decodeGuestTokenIvId(token) : null;
};
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/guest-token.test.ts`
Expected: PASS (기존 케이스 포함 전부)

- [ ] **Step 5: `/api/guest`가 ivId를 싣게 한다**

`apps/web/src/app/api/guest/route.ts`에서 `verifiedResponse`에 인자를 하나 더 받는다:

```ts
const verifiedResponse = async (
	gender: BambiGenderValue | null,
	ivId?: string
) => {
	const token = await createGuestToken({
		gender,
		ivId,
		maxAgeSeconds: GUEST_COOKIE_MAX_AGE,
		now: new Date(),
		secret: guestTokenSecret(),
	});
```

`handleRealVerification`의 마지막 반환을 바꾼다:

```ts
	return await verifiedResponse(
		mapPortOneGender(verification.verifiedCustomer?.gender),
		identityVerificationId
	);
```

목 흐름(`handleMockVerification`)은 그대로 둔다 — 개발 환경엔 실제 인증 건이 없다.

- [ ] **Step 6: 타입체크 후 커밋**

Run: `pnpm --filter web check-types` → 오류 없음
Run: `pnpm dlx ultracite fix`

```bash
git add apps/web/src/lib/bambi/guest-token.ts apps/web/src/lib/bambi/guest-token.test.ts apps/web/src/lib/bambi/guest.ts apps/web/src/app/api/guest/route.ts
```

커밋 메시지(임시 파일 경유):

```
feat: 게스트 토큰에 포트원 인증 ID를 실어 v2로 올림
- 인증 후 새로고침해도 회원가입 폼 단계를 이어가도록 ivId를 서명 토큰에 보관
- 기존 v1 토큰은 계속 유효하게 두어 재인증 강요를 피함
- /api/guest 실인증 경로에서만 ivId를 싣고 개발용 목 경로는 그대로 둠
```

---

## Task 2: 배경 마스킹 유틸

블러는 CSS라 devtools로 걷어낼 수 있다. 실효 가드는 **읽을 수 있는 문자열을 클라이언트로 보내지 않는 것**이므로, 서버가 직렬화 전에 마스킹한다. 필드를 **화이트리스트**로 뽑아 새 필드가 실수로 새는 것도 막는다.

**Files:**
- Create: `apps/web/src/lib/bambi/auth-backdrop.ts`
- Test: `apps/web/src/lib/bambi/auth-backdrop.test.ts`

**Interfaces:**
- Consumes: `Job` (`apps/web/src/lib/bambi/types.ts`)
- Produces:
  - `BackdropJob { company: string; location: string; pay: string; tags: string[]; title: string }`
  - `maskJobsForBackdrop(jobs: Job[]): BackdropJob[]`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/src/lib/bambi/auth-backdrop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maskJobsForBackdrop } from "./auth-backdrop";
import type { Job } from "./types";

const job: Job = {
	beginnerFriendly: false,
	company: "문스톤 라운지",
	desc: "서울 강남 문스톤 라운지에서 주말 야간 근무자를 모십니다.",
	district: "강남",
	featured: true,
	hours: "19:00–01:00",
	id: "j2",
	instantInterview: false,
	location: "서울 · 강남",
	pay: "시급 17,000원",
	pref: "장기 우대",
	rating: 4.8,
	region: "서울",
	reviews: 12,
	status: "published",
	tags: ["주말", "고정", "장기 우대"],
	title: "주말 야간 홀",
	type: "룸싸롱",
	verified: true,
};

// 결과 객체 안의 모든 문자열을 끌어모은다 — 새 필드가 추가돼도 자동으로 검사에 걸린다.
const collectStrings = (value: unknown): string[] => {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(collectStrings);
	}
	if (value && typeof value === "object") {
		return Object.values(value).flatMap(collectStrings);
	}
	return [];
};

describe("maskJobsForBackdrop", () => {
	it("마스크 문자 외에는 아무 문자도 남기지 않는다", () => {
		for (const text of collectStrings(maskJobsForBackdrop([job]))) {
			expect(text).toMatch(/^■*$/);
		}
	});

	it("글자 수를 보존해 카드 레이아웃이 실제와 같아 보인다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked.company).toHaveLength(job.company.length);
		expect(masked.title).toHaveLength(job.title.length);
		expect(masked.tags).toHaveLength(job.tags.length);
		expect(masked.tags[0]).toHaveLength(job.tags[0].length);
	});

	it("식별자·미디어·설명을 아예 싣지 않는다", () => {
		const [masked] = maskJobsForBackdrop([job]);
		expect(masked).not.toHaveProperty("id");
		expect(masked).not.toHaveProperty("desc");
		expect(masked).not.toHaveProperty("coverImage");
		expect(masked).not.toHaveProperty("rating");
	});
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/auth-backdrop.test.ts`
Expected: FAIL — `Failed to resolve import "./auth-backdrop"`

- [ ] **Step 3: 구현한다**

`apps/web/src/lib/bambi/auth-backdrop.ts`:

```ts
// 비로그인(anon) 화면의 블러 배경에 실을 데이터. 블러는 CSS라 devtools로 걷어낼 수
// 있으므로 연출일 뿐이고, 실제 가드는 여기서 문자열을 마스킹해 클라이언트로 아예
// 읽을 수 있는 값을 보내지 않는 것이다. 필드는 화이트리스트로 뽑는다 — Job에 새
// 필드가 생겨도 배경으로 새지 않는다.

import type { Job } from "./types";

// 배경 카드가 실제로 그리는 필드만 담는다 — 안 그리는 값까지 실어 보낼 이유가 없다.
export interface BackdropJob {
	company: string;
	location: string;
	pay: string;
	tags: string[];
	title: string;
}

const MASK_CHAR = "■";

// 같은 글자 수의 마스크로 치환한다. 카드 폭·줄바꿈이 실제 목록과 같아 보이되 내용은
// 남지 않는다. 이모지 등 서로게이트 페어를 한 글자로 세도록 Array.from을 쓴다.
const maskText = (value: string): string =>
	MASK_CHAR.repeat(Array.from(value).length);

const maskJobForBackdrop = (job: Job): BackdropJob => ({
	company: maskText(job.company),
	location: maskText(job.location),
	pay: maskText(job.pay),
	tags: job.tags.map(maskText),
	title: maskText(job.title),
});

export const maskJobsForBackdrop = (jobs: Job[]): BackdropJob[] =>
	jobs.map(maskJobForBackdrop);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/auth-backdrop.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/lib/bambi/auth-backdrop.ts apps/web/src/lib/bambi/auth-backdrop.test.ts
```

```
feat: 비로그인 배경용 공고 마스킹 유틸 추가
- 블러는 CSS라 우회 가능하므로 서버에서 문자열을 마스킹해 실제 업소명을 내보내지 않음
- 글자 수를 보존해 카드 폭·줄바꿈이 실제 목록과 같아 보이게 함
- 화이트리스트 방식이라 Job에 새 필드가 생겨도 배경으로 새지 않음
```

---

## Task 3: 서버 — 인증 검증 공통화 · 가입 전 중복 확인 · 프로필 반영

`verifyMyPhone`에 있던 검증 로직을 서비스로 빼고, 계정이 없는 상태에서도 부를 수 있는 `checkIdentityForSignup`을 추가한다. 프로필 생성 시 인증 결과를 그대로 기록한다.

**Files:**
- Create: `packages/api/src/services/bambi-identity.ts`
- Modify: `packages/api/src/routers/bambi/onboarding.ts`
- Test: `packages/api/src/routers/bambi/verify-phone-duplicate.test.ts`

**Interfaces:**
- Consumes: `fetchIdentityVerification`, `hashIdentityValue`, `isAdultBirth8`, `mapPortOneGender`, `toBirth8`, `UNDERAGE_MESSAGE` (`../services/portone-identity`)
- Produces:
  - `VerifiedIdentity { birth8: string; ciHash: string; diHash: string; gender: "male" | "female" | null; phoneNumber?: string }`
  - `resolveVerifiedIdentity(apiSecret: string, identityVerificationId: string): Promise<VerifiedIdentity>`
  - oRPC `bambi.onboarding.checkIdentityForSignup({ identityVerificationId }) → { gender, hasAccount }`
  - `profileInput`에 `identityVerificationId?: string` 추가 → `createJobSeekerProfile` / `createEmployerProfile`이 함께 받음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/api/src/routers/bambi/verify-phone-duplicate.test.ts` 상단의 라우터 import는 그대로 두고, 파일 끝에 추가한다:

```ts
const checkClient = createProcedureClient(
	onboardingRouter.checkIdentityForSignup,
	{
		context: { auth: null, session: null } as unknown as Context,
		path: ["bambi", "onboarding", "checkIdentityForSignup"],
	}
);

describe("checkIdentityForSignup 가입 전 중복 확인", () => {
	it("처음 보는 사람이면 hasAccount:false와 성별을 돌려준다", async () => {
		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		const result = await checkClient({
			identityVerificationId: `iv_${randomUUID()}`,
		});
		expect(result).toEqual({ gender: "male", hasAccount: false });
	});

	it("이미 인증에 쓰인 DI면 hasAccount:true", async () => {
		const sharedDi = `di-${randomUUID()}`;
		const existingUser = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await runVerify(existingUser);

		setVerification(`ci-${randomUUID()}`, sharedDi);
		const result = await checkClient({
			identityVerificationId: `iv_${randomUUID()}`,
		});
		expect(result.hasAccount).toBe(true);
	});

	it("미성년이면 거부한다", async () => {
		nextVerification = {
			status: "VERIFIED",
			verifiedCustomer: {
				ci: `ci-${randomUUID()}`,
				di: `di-${randomUUID()}`,
				birthDate: "2015-01-01",
				phoneNumber: "010-1234-5678",
				gender: "FEMALE",
			},
		};
		await expect(
			checkClient({ identityVerificationId: `iv_${randomUUID()}` })
		).rejects.toThrow();
	});
});

describe("가입 시 인증 결과 반영", () => {
	it("createJobSeekerProfile이 인증 결과를 프로필에 기록한다", async () => {
		const userId = `user_signup_${randomUUID()}`;
		createdUserIds.push(userId);
		await db.insert(user).values({
			id: userId,
			name: "신규가입",
			email: `${userId}@bambi.test`,
		});

		setVerification(`ci-${randomUUID()}`, `di-${randomUUID()}`);
		const created = await createProcedureClient(
			onboardingRouter.createJobSeekerProfile,
			{ context: ctx(userId), path: ["bambi", "onboarding", "createJobSeekerProfile"] }
		)({ identityVerificationId: `iv_${randomUUID()}` });

		expect(created?.isPhoneVerified).toBe(true);
		expect(created?.diHash).toMatch(SHA256_HEX);
		expect(created?.birthDate).toBe("20000101");
		expect(created?.gender).toBe("male");
	});

	it("다른 계정이 쓴 DI로는 가입하지 못한다", async () => {
		const sharedDi = `di-${randomUUID()}`;
		const existingUser = await seedUserWithProfile();
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await runVerify(existingUser);

		const userId = `user_signup_${randomUUID()}`;
		createdUserIds.push(userId);
		await db.insert(user).values({
			id: userId,
			name: "중복가입",
			email: `${userId}@bambi.test`,
		});
		setVerification(`ci-${randomUUID()}`, sharedDi);
		await expect(
			createProcedureClient(onboardingRouter.createJobSeekerProfile, {
				context: ctx(userId),
				path: ["bambi", "onboarding", "createJobSeekerProfile"],
			})({ identityVerificationId: `iv_${randomUUID()}` })
		).rejects.toThrow("이미 다른 계정에서 본인인증에 사용된 정보예요.");
	});
});
```

> `toBirth8("2000-01-01")`이 `"20000101"`을 돌려주는지 `packages/api/src/services/portone-identity.ts`에서 확인하고, 다르면 위 단언값을 실제 형식에 맞춘다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @bambi-app/api test verify-phone-duplicate`
Expected: FAIL — `onboardingRouter.checkIdentityForSignup` 이 undefined

- [ ] **Step 3: 검증 서비스를 만든다**

`packages/api/src/services/bambi-identity.ts`:

```ts
// 포트원 본인인증 결과를 "믿을 수 있는 형태"로 바꾸는 공통 절차. verifyMyPhone(기존
// 회원 재인증) · checkIdentityForSignup(가입 전 확인) · 프로필 생성이 같은 규칙을
// 쓰도록 한 곳에 모은다. DB는 건드리지 않는다 — 중복 판정은 호출부가 한다.

import { ORPCError } from "@orpc/server";
import {
	fetchIdentityVerification,
	hashIdentityValue,
	isAdultBirth8,
	mapPortOneGender,
	toBirth8,
	UNDERAGE_MESSAGE,
} from "./portone-identity";

export interface VerifiedIdentity {
	birth8: string;
	ciHash: string;
	diHash: string;
	gender: "female" | "male" | null;
	phoneNumber?: string;
}

export const resolveVerifiedIdentity = async (
	apiSecret: string,
	identityVerificationId: string
): Promise<VerifiedIdentity> => {
	const verification = await fetchIdentityVerification(
		apiSecret,
		identityVerificationId
	);
	if (verification.status !== "VERIFIED") {
		throw new ORPCError("BAD_REQUEST", {
			message: "본인인증이 완료되지 않았습니다. 다시 시도해 주세요.",
		});
	}
	const customer = verification.verifiedCustomer;
	const birth8 = toBirth8(customer?.birthDate);
	// 생년월일을 못 읽으면 성인임을 증명할 수 없으므로 거부한다(안전 기본값).
	if (!(birth8 && isAdultBirth8(birth8, new Date()))) {
		throw new ORPCError("FORBIDDEN", { message: UNDERAGE_MESSAGE });
	}
	if (!customer?.ci) {
		throw new ORPCError("BAD_REQUEST", {
			message: "인증 정보에 개인 식별값(CI)이 없습니다.",
		});
	}
	if (!customer.di) {
		throw new ORPCError("BAD_REQUEST", {
			message: "인증 정보에 중복확인 식별값(DI)이 없습니다.",
		});
	}
	// CI·DI 원문은 저장하지 않는다 — 해시로 중복 계정만 판별한다.
	return {
		birth8,
		ciHash: await hashIdentityValue(customer.ci),
		diHash: await hashIdentityValue(customer.di),
		gender: mapPortOneGender(customer.gender),
		phoneNumber: customer.phoneNumber,
	};
};
```

- [ ] **Step 4: 라우터를 고친다**

`onboarding.ts` 상단 import에 추가:

```ts
import {
	resolveVerifiedIdentity,
	type VerifiedIdentity,
} from "../../services/bambi-identity";
```

`profileInput`을 확장한다:

```ts
const profileInput = z.object({
	gender: z.enum(["male", "female"]).optional(),
	// 가입 직전에 마친 포트원 본인인증 건. 있으면 서버가 다시 조회해 프로필에
	// 인증 결과(번호·생년월일·성별·CI/DI 해시)를 함께 기록한다.
	identityVerificationId: z.string().min(1).optional(),
	phoneNumber: z.string().min(3).max(30).optional(),
});
```

`createBambiProfile` 위에 중복 판정 헬퍼를 둔다:

```ts
// 다른 계정이 같은 사람으로 인증했는지 본다. 판정 축은 DI지만, 과거 CI만 저장된
// 계정과의 충돌도 유니크 인덱스가 유지되므로 함께 걸러 같은 안내로 막는다.
const findIdentityCollision = async (
	identity: VerifiedIdentity,
	excludeUserId?: string
): Promise<boolean> => {
	const collisions = await db
		.select({ userId: bambiProfile.userId })
		.from(bambiProfile)
		.where(
			or(
				eq(bambiProfile.diHash, identity.diHash),
				eq(bambiProfile.ciHash, identity.ciHash)
			)
		);
	return collisions.some((row) => row.userId !== excludeUserId);
};

const IDENTITY_CONFLICT_MESSAGE =
	"이미 다른 계정에서 본인인증에 사용된 정보예요.";
```

`createBambiProfile`을 인증 반영이 가능하도록 바꾼다:

```ts
const createBambiProfile = async ({
	gender,
	identityVerificationId,
	phoneNumber,
	role,
	userId,
}: {
	gender?: "male" | "female";
	identityVerificationId?: string;
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

	const apiSecret = env.PORTONE_API_SECRET;
	// 포트원이 구성된 환경에서는 본인인증 없이 가입할 수 없다. 미구성 개발 환경만
	// 목 흐름을 위해 인증 없는 가입을 허용한다.
	if (apiSecret && !identityVerificationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "본인인증을 먼저 완료해 주세요.",
		});
	}

	let identity: VerifiedIdentity | null = null;
	if (apiSecret && identityVerificationId) {
		identity = await resolveVerifiedIdentity(apiSecret, identityVerificationId);
		// 폼 진입 전에 checkIdentityForSignup이 대부분 걸러내지만, 두 사람이 동시에
		// 가입하는 경합을 위해 최종 방어선으로 한 번 더 본다.
		if (await findIdentityCollision(identity, userId)) {
			throw new ORPCError("CONFLICT", { message: IDENTITY_CONFLICT_MESSAGE });
		}
	}

	const [createdProfile] = await db
		.insert(bambiProfile)
		.values({
			userId,
			role,
			phoneNumber: identity?.phoneNumber ?? phoneNumber,
			// 실인증 결과가 신뢰 원천이므로 클라이언트가 보낸 성별을 덮어쓴다.
			gender: identity?.gender ?? gender,
			birthDate: identity?.birth8,
			ciHash: identity?.ciHash,
			diHash: identity?.diHash,
			isPhoneVerified: identity !== null,
		})
		.returning();

	return createdProfile;
};
```

`verifyMyPhone` 핸들러에서 포트원 조회~해시 블록을 서비스 호출로 교체한다. 기존
`const verification = await fetchIdentityVerification(...)`부터 `const collisions = ...`
`if (collisions.some(...)) { ... }`까지를 다음으로 바꾼다:

```ts
			const identity = await resolveVerifiedIdentity(
				apiSecret,
				input.identityVerificationId
			);
			if (await findIdentityCollision(identity, userId)) {
				throw new ORPCError("CONFLICT", { message: IDENTITY_CONFLICT_MESSAGE });
			}
```

이어지는 `db.update(...).set({...})`도 새 이름을 쓰도록 고친다:

```ts
				.set({
					phoneNumber: identity.phoneNumber,
					isPhoneVerified: true,
					gender: identity.gender ?? existingProfile.gender,
					birthDate: identity.birth8,
					ciHash: identity.ciHash,
					diHash: identity.diHash,
				})
```

`onboardingRouter`에 새 절차를 추가한다(`verifyMyPhone` 바로 앞):

```ts
	// 가입 전 본인인증 확인 — 계정이 없는 상태에서 부르므로 publicProcedure다.
	// 개인정보는 돌려주지 않는다(성별과 가입 여부 불리언만). 인증 자체는 이미
	// 끝난 뒤이고 포트원 단건조회는 무료라, 임의 ID로 두드려도 얻을 게 없다
	// (identityVerificationId는 UUID라 추측이 불가능하다).
	checkIdentityForSignup: publicProcedure
		.input(z.object({ identityVerificationId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const apiSecret = env.PORTONE_API_SECRET;
			if (!apiSecret) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "본인인증이 아직 구성되지 않았습니다.",
				});
			}
			const identity = await resolveVerifiedIdentity(
				apiSecret,
				input.identityVerificationId
			);
			return {
				gender: identity.gender,
				hasAccount: await findIdentityCollision(identity),
			};
		}),
```

`publicProcedure`가 이 파일에 import되어 있지 않으면 `import { protectedProcedure, publicProcedure } from "../../index";`로 고친다.

- [ ] **Step 5: 통과를 확인한다**

Run: `pnpm --filter @bambi-app/api test verify-phone-duplicate`
Expected: PASS — 기존 3개 + 신규 5개

- [ ] **Step 6: 타입체크 후 커밋**

Run: `pnpm --filter @bambi-app/api check-types`
Run: `pnpm dlx ultracite fix`

```bash
git add packages/api/src/services/bambi-identity.ts packages/api/src/routers/bambi/onboarding.ts packages/api/src/routers/bambi/verify-phone-duplicate.test.ts
```

```
feat: 가입 전 본인인증 확인과 인증 결과 프로필 반영
- 포트원 조회·성인 확인·CI/DI 해시를 bambi-identity 서비스로 모아 세 경로가 공유
- checkIdentityForSignup으로 폼 진입 전에 중복 가입을 걸러 인증 비용 낭비를 줄임
- 프로필 생성 시 번호·생년월일·성별·CI/DI 해시를 기록하고 isPhoneVerified를 세움
- 포트원 구성 환경에서는 본인인증 없는 가입을 서버가 거부
```

---

## Task 4: 19금 안내 추출 · AuthPanel 2단계 개편

기존 `AuthScreen`을 `auth/auth-panel.tsx`로 옮기면서 회원가입에 인증 단계를 넣는다. 이 시점에도 `/welcome`·`/login`이 살아 있어 화면은 계속 동작한다.

**Files:**
- Create: `apps/web/src/components/bambi/auth/adult-notice.tsx`
- Create: `apps/web/src/components/bambi/auth/auth-panel.tsx`
- Modify: `apps/web/src/components/bambi/screens/adult-gate-screen.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Delete: `apps/web/src/components/bambi/screens/auth-screen.tsx`

**Interfaces:**
- Consumes: `readGuestIvIdFromCookieString`, `readGuestFromCookieString` (Task 1) · `client.bambi.onboarding.checkIdentityForSignup` (Task 3) · 기존 `PhoneVerifyDialog`
- Produces:
  - `AdultNotice()` — 19 배지 + 법정 문구
  - `AuthPanel({ compact?: boolean; onDone?: () => void })` — `compact`는 Dialog용 좁은 레이아웃, `onDone`은 화면을 떠나기 직전 정리 훅(둘 다 Task 7에서 소비)

- [ ] **Step 1: AdultNotice를 뽑는다**

`apps/web/src/components/bambi/auth/adult-notice.tsx`:

```tsx
// 청소년유해매체물 고지. 인증 UI 상단에 상시 노출한다(로그인 탭 포함).
export function AdultNotice() {
	return (
		<section className="flex items-center gap-4 rounded-xl border border-border bg-background p-5">
			<span className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-destructive font-extrabold text-destructive text-xl">
				19
			</span>
			<p className="m-0 text-muted-foreground text-sm leading-relaxed">
				본 정보내용은 청소년 유해매체물로서 정보통신망 이용촉진 및 정보보호 등에
				관한 법률 및 청소년 보호법의 규정에 의하여 만 19세 미만의 청소년이 이용할
				수 없습니다.
			</p>
		</section>
	);
}
```

`screens/adult-gate-screen.tsx`가 이 컴포넌트와 새 `AuthPanel`을 쓰도록 고친다(같은 파일 안의 19금 마크업 제거).

- [ ] **Step 2: auth-screen.tsx를 auth/auth-panel.tsx로 옮긴다**

```bash
git mv apps/web/src/components/bambi/screens/auth-screen.tsx apps/web/src/components/bambi/auth/auth-panel.tsx
```

이동 후 상대 import를 한 단계 조정한다(`../ds` → `../ds`는 그대로, `./auth-screen` 참조처는 Step 6에서 정리).
export 이름을 `AuthScreen` → `AuthPanel`로 바꾸고, `embedded` prop과 `authWrapperClass`/`authGridClass`의 `embedded` 분기를 `compact` prop으로 교체한다. `compact`는 Dialog 안(Task 7)에서 2컬럼 소개 영역을 접기 위한 것이다:

```tsx
export function AuthPanel({
	compact = false,
	onDone,
}: {
	// Dialog 안처럼 폭이 좁은 자리에서는 좌측 소개 컬럼을 접고 폼만 보여준다.
	compact?: boolean;
	// 로그인·가입이 끝나 화면을 떠나기 직전에 감싼 쪽이 정리할 기회를 준다.
	onDone?: () => void;
} = {}) {
```

```tsx
	<div className="w-full text-foreground">
		<div
			className={cn(
				"mx-auto grid w-full max-w-[980px] items-center gap-6",
				compact ? "max-w-md" : "lg:grid-cols-[minmax(0,1fr)_390px]"
			)}
		>
```

좌측 소개 `<section className="hidden lg:block">`은 `compact`일 때 렌더하지 않는다. `onDone`은 `finishSignup`의 `router.push` 직전과 로그인 성공 시 `window.location.assign` 직전에 `onDone?.()`로 호출한다.

- [ ] **Step 3: 2단계 상태와 인증 핸들러를 넣는다**

`AuthPanel` 안에 추가한다(기존 `useState` 묶음 아래):

```tsx
type SignupStep = "form" | "verify";
```

```tsx
	const [step, setStep] = useState<SignupStep>("verify");
	const [verifiedId, setVerifiedId] = useState<string | null>(null);

	// 이미 본인인증을 마친 방문자(게스트 쿠키 보유)는 폼 단계로 바로 들어간다.
	// 서버 렌더에는 document가 없으므로 effect에서 읽어 하이드레이션 불일치를 피한다.
	useEffect(() => {
		if (readGuestFromCookieString(document.cookie)) {
			setStep("form");
			setVerifiedId(readGuestIvIdFromCookieString(document.cookie));
		}
	}, []);
```

인증 완료 처리기들:

```tsx
	const postGuestVerification = async (body: Record<string, unknown>) => {
		const response = await fetch("/api/guest", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!response.ok) {
			const data = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			throw new Error(
				data?.message ?? "인증 처리에 실패했어요. 다시 시도해 주세요."
			);
		}
	};

	// 회원가입 1단계: 인증 → 중복 계정 사전 확인 → 폼 단계로.
	const handleVerifiedForSignup = async (identityVerificationId: string) => {
		const check = await client.bambi.onboarding.checkIdentityForSignup({
			identityVerificationId,
		});
		if (check.hasAccount) {
			setMode("sign-in");
			setNotice({
				text: "이미 가입된 계정이 있어요. 로그인해 주세요.",
				tone: "error",
			});
			return;
		}
		await postGuestVerification({ identityVerificationId });
		setVerifiedId(identityVerificationId);
		setStep("form");
	};

	// 비회원 둘러보기: 같은 인증을 거치되 가입은 하지 않고 목록으로 보낸다.
	// 하드 내비게이션으로 Router Cache를 우회해 갓 세팅된 게스트 쿠키가 반영되게 한다.
	const handleVerifiedForGuest = async (identityVerificationId: string) => {
		await postGuestVerification({ identityVerificationId });
		window.location.assign("/seeker");
	};

	// 포트원 미구성 개발 환경의 목 폼 경로. 실제 인증 건이 없어 verifiedId는 비운다.
	const handleMockVerifiedForSignup = async (input: MockPhoneVerifyInput) => {
		await postGuestVerification({ ...input });
		setVerifiedId(null);
		setStep("form");
	};

	const handleMockVerifiedForGuest = async (input: MockPhoneVerifyInput) => {
		await postGuestVerification({ ...input });
		window.location.assign("/seeker");
	};
```

`toggleMode`가 회원가입으로 갈 때 단계를 초기화하지 않도록 주의한다 — 이미 인증한 사람은 폼 단계를 유지해야 한다. 기존 구현 그대로 두면 된다.

- [ ] **Step 4: 인증 단계 UI를 그린다**

카드 안에서 `isSignUp && step === "verify"`일 때 폼 대신 아래를 렌더한다. 기존 `<form>` 블록 전체를 `{isSignUp && step === "verify" ? (인증 블록) : (기존 form)}`으로 감싼다:

```tsx
	<div className="flex flex-col gap-4">
		<AdultNotice />
		<p className="m-0 text-muted-foreground text-sm leading-relaxed">
			밤비는 성인만 이용할 수 있어요. 본인인증을 마치면 가입 정보를 입력할 수
			있고, 가입하지 않고 공고 목록만 둘러볼 수도 있어요.
		</p>
		<PhoneVerifyDialog
			onMockVerified={handleMockVerifiedForSignup}
			onVerified={handleVerifiedForSignup}
			triggerLabel="본인인증하고 계속하기"
		/>
		<PhoneVerifyDialog
			onMockVerified={handleMockVerifiedForGuest}
			onVerified={handleVerifiedForGuest}
			triggerLabel="비회원으로 둘러보기"
		/>
		<p className="m-0 text-center text-muted-foreground text-xs">
			비회원은 공고 목록만 볼 수 있어요. 상세 열람·채팅은 회원가입이 필요해요.
		</p>
		<p className="m-0 text-center text-muted-foreground text-sm">
			이미 계정이 있으신가요?{" "}
			<button
				className="font-bold text-primary underline-offset-2 hover:underline"
				onClick={toggleMode}
				type="button"
			>
				로그인
			</button>
		</p>
	</div>
```

로그인 모드일 때도 카드 상단에 `<AdultNotice />`를 넣는다(19금 안내 상시 노출 요구).

기존 `GuestBrowseButton` 컴포넌트와 카드 하단의 `<GuestBrowseButton />` 호출을 삭제한다 — 인증 단계로 흡수됐다.

- [ ] **Step 5: 가입 완료 시 인증 ID를 전달한다**

`finishSignup`을 고친다:

```tsx
	const finishSignup = async (gender: BambiGenderValue | null) => {
		// 닉네임(표시명)은 signUp.email의 name(→ user.name)에 저장되므로 프로필 생성
		// 페이로드에는 표시명을 싣지 않는다. 인증을 마쳤으면 인증 건 ID를 실어 서버가
		// 번호·생년월일·성별·CI/DI 해시를 함께 기록하게 한다.
		const profilePayload = {
			...(gender ? { gender } : {}),
			...(verifiedId ? { identityVerificationId: verifiedId } : {}),
		};
		if (signupRole === "employer") {
			await client.bambi.onboarding.createEmployerProfile(profilePayload);
		} else {
			await client.bambi.onboarding.createJobSeekerProfile(profilePayload);
		}
		await client.bambi.onboarding.recordLegalConsent().catch(() => undefined);
		queryClient.invalidateQueries();
		router.push("/seeker" as Route);
	};
```

`?auth=` 쿼리로 초기 모드를 잡도록 `getInitialMode`를 고친다:

```tsx
const getInitialMode = (mode: string | null): AuthMode =>
	mode === "sign-up" || mode === "signup" ? "sign-up" : "sign-in";
```

그리고 호출부를 `searchParams.get("auth") ?? searchParams.get("mode")`로 바꾼다(`?auth=signup`·`?auth=login` 지원).

import에 다음을 추가한다: `useEffect`(react), `AdultNotice`, `readGuestFromCookieString`·`readGuestIvIdFromCookieString`·`MockPhoneVerifyInput`(`@/lib/bambi/guest`).

- [ ] **Step 6: 참조를 고치고 검증한다**

`app/login/page.tsx`와 `screens/adult-gate-screen.tsx`의 `AuthScreen` import를 `AuthPanel`로 바꾼다.

Run: `pnpm --filter web check-types`
Expected: 오류 없음
Run: `pnpm dlx ultracite fix`
Run: `pnpm vitest run apps/web/src`
Expected: 기존 테스트 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/auth apps/web/src/components/bambi/screens/adult-gate-screen.tsx apps/web/src/app/login/page.tsx
git add -u
```

```
feat: 회원가입을 본인인증 선행 2단계로 개편
- AuthScreen을 auth/auth-panel로 옮기고 embedded 분기를 걷어냄
- 회원가입은 인증을 마쳐야 폼이 열리고, 인증 ID를 가입 요청에 실어 프로필에 반영
- 인증 직후 중복 계정을 확인해 폼을 채우기 전에 로그인으로 안내
- 비회원 둘러보기를 인증 단계로 흡수하고 19금 안내를 adult-notice로 추출해 상시 노출
```

---

## Task 5: anon 화면 — 마스킹 블러 배경 + 선명한 푸터

아직 게이트가 anon을 `/seeker`로 보내지 않으므로 이 커밋만으로는 화면이 노출되지 않는다. Task 6에서 연결된다.

**Files:**
- Create: `apps/web/src/components/bambi/auth/auth-backdrop.tsx`
- Create: `apps/web/src/components/bambi/auth/seeker-auth-gate-screen.tsx`
- Modify: `apps/web/src/app/seeker/layout.tsx`

**Interfaces:**
- Consumes: `BackdropJob`·`maskJobsForBackdrop` (Task 2) · `AuthPanel` (Task 4) · `toMarketplaceJob` (`@/lib/bambi/api-job-mapper`) · `SiteFooter`
- Produces: `SeekerAuthGateScreen()` (async 서버 컴포넌트)

- [ ] **Step 1: 배경 컴포넌트를 만든다**

`apps/web/src/components/bambi/auth/auth-backdrop.tsx`:

```tsx
// 비로그인 화면 뒤의 장식용 배경. 데이터는 서버에서 이미 마스킹돼 실제 문자열이
// 없다(lib/bambi/auth-backdrop.ts). 블러는 연출일 뿐 가드가 아니다.
// aria-hidden + 네이티브 inert로 클릭·탭 이동·스크린리더 접근을 한 번에 막는다.

import { cn } from "@bambi-app/ui/lib/utils";
import type { BackdropJob } from "@/lib/bambi/auth-backdrop";
import { SEEKER_CONTENT_MAX_W } from "@/lib/bambi/layout";

function BackdropCard({ job }: { job: BackdropJob }) {
	return (
		<article className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
			<div className="h-32 w-full rounded-md bg-gradient-to-br from-secondary to-muted" />
			<p className="m-0 truncate font-bold text-sm">{job.title}</p>
			<p className="m-0 truncate text-muted-foreground text-xs">
				{job.company} · {job.location}
			</p>
			<p className="m-0 truncate font-semibold text-sm">{job.pay}</p>
			<div className="flex flex-wrap gap-1">
				{job.tags.map((tag, index) => (
					<span
						className="rounded-full bg-secondary px-2 py-0.5 text-muted-foreground text-xs"
						key={`${tag}-${index}`}
					>
						{tag}
					</span>
				))}
			</div>
		</article>
	);
}

export function AuthBackdrop({ jobs }: { jobs: BackdropJob[] }) {
	return (
		<div
			aria-hidden
			className="hidden select-none blur-sm md:block"
			inert
		>
			{/* 헤더 목업 — 실제 셸을 쓰지 않고 형태만 흉내낸다. */}
			<div className="border-border border-b bg-background">
				<div
					className={cn(
						"mx-auto flex h-16 w-full items-center gap-4 px-6",
						SEEKER_CONTENT_MAX_W
					)}
				>
					<div className="h-8 w-24 rounded-md bg-secondary" />
					<div className="h-10 w-48 rounded-lg bg-secondary" />
					<div className="ml-auto h-10 w-28 rounded-lg bg-secondary" />
				</div>
			</div>
			<div
				className={cn(
					"mx-auto grid w-full grid-cols-3 gap-4 px-6 py-10 xl:grid-cols-4",
					SEEKER_CONTENT_MAX_W
				)}
			>
				{jobs.map((job, index) => (
					<BackdropCard job={job} key={index} />
				))}
			</div>
		</div>
	);
}
```

> `SEEKER_CONTENT_MAX_W`가 `@/lib/bambi/layout`에 있는지 확인한다(`seeker-app-shell.tsx`가 쓰고 있다). 카드 그리드는 데스크톱에서 최소 3열을 유지한다.

- [ ] **Step 2: anon 화면을 조립한다**

`apps/web/src/components/bambi/auth/seeker-auth-gate-screen.tsx`:

```tsx
// 비로그인(anon) 방문자가 /seeker에서 만나는 화면. 오버레이는 Dialog가 아니라
// 배경 위 절대배치 카드다 — 닫을 수 없는 화면이라 포커스 트랩·backdrop이 필요 없고,
// 덕분에 푸터가 블러 밖에서 선명하고 클릭 가능한 상태로 남는다.

import { Suspense } from "react";
import { toMarketplaceJob } from "@/lib/bambi/api-job-mapper";
import { maskJobsForBackdrop } from "@/lib/bambi/auth-backdrop";
import { client } from "@/utils/orpc";
import { SiteFooter } from "../site-footer";
import { AuthBackdrop } from "./auth-backdrop";
import { AuthPanel } from "./auth-panel";

const BACKDROP_JOB_LIMIT = 12;

// 실제 공고를 받아 개수·레이아웃은 진짜처럼 두되, 문자열은 직렬화 전에 전부
// 마스킹한다. 조회에 실패해도 화면은 떠야 하므로 빈 배열로 폴백한다.
const loadBackdropJobs = async () => {
	try {
		const result = await client.bambi.jobs.list({ limit: BACKDROP_JOB_LIMIT });
		const jobs = [
			...result.sections.special,
			...result.sections.urgent,
			...result.sections.recommended,
			...result.sections.organic,
		]
			.slice(0, BACKDROP_JOB_LIMIT)
			.map(toMarketplaceJob);
		return maskJobsForBackdrop(jobs);
	} catch {
		return [];
	}
};

export async function SeekerAuthGateScreen() {
	const backdropJobs = await loadBackdropJobs();
	return (
		<div className="flex min-h-[100dvh] flex-col bg-secondary">
			<div className="relative flex-1">
				<AuthBackdrop jobs={backdropJobs} />
				<div className="flex min-h-full items-center justify-center p-4 md:absolute md:inset-0">
					<Suspense>
						<AuthPanel />
					</Suspense>
				</div>
			</div>
			<SiteFooter contentWidthClassName="max-w-5xl" />
		</div>
	);
}
```

`AuthPanel`이 `useSearchParams`를 쓰므로 `Suspense`로 감싼다.

- [ ] **Step 3: layout에서 anon을 분기한다**

`apps/web/src/app/seeker/layout.tsx`:

```tsx
import { getSessionCookie } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { AccountStatusBanner } from "@/components/bambi/account-status-banner";
import { SeekerAuthGateScreen } from "@/components/bambi/auth/seeker-auth-gate-screen";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { SeekerAppShell } from "@/components/bambi/seeker-app-shell";
import { GUEST_COOKIE_NAME } from "@/lib/bambi/guest";
import { verifyGuestToken } from "@/lib/bambi/guest-token";

const guestTokenSecret = (): string =>
	process.env.BAMBI_GUEST_TOKEN_SECRET ??
	"bambi-dev-guest-token-secret-not-for-prod";

// proxy.ts와 같은 규칙으로 anon을 판정한다. 서버에서 판정하므로 하이드레이션 후
// 화면이 바뀌는 깜빡임이 없다.
const isAnonymousVisitor = async (): Promise<boolean> => {
	const requestHeaders = await headers();
	const hasSession = Boolean(
		getSessionCookie(
			{ headers: requestHeaders } as unknown as Request,
			{ cookiePrefix: process.env.BAMBI_COOKIE_PREFIX }
		)
	);
	if (hasSession) {
		return false;
	}
	const token = (await cookies()).get(GUEST_COOKIE_NAME)?.value;
	if (!token) {
		return true;
	}
	return (await verifyGuestToken(token, guestTokenSecret(), new Date())) === null;
};

export default async function SeekerLayout({
	children,
}: {
	children: ReactNode;
}) {
	// anon은 게이트상 /seeker 외에는 도달할 수 없으므로 children을 버려도 안전하다.
	if (await isAnonymousVisitor()) {
		return <SeekerAuthGateScreen />;
	}
	return (
		<SeekerAppShell>
			<SeekerNav>
				<AccountStatusBanner />
				{children}
			</SeekerNav>
		</SeekerAppShell>
	);
}
```

> `getSessionCookie`가 `Request`를 받는 형태라 헤더만 넘기는 위 캐스팅이 타입체크를 통과하는지 확인한다. 통과하지 못하면 `(await cookies()).get(...)`로 세션 쿠키 이름을 직접 읽는 방식으로 바꾼다 — 쿠키 이름은 `process.env.BAMBI_COOKIE_PREFIX`가 붙은 better-auth 기본 세션 쿠키다.

- [ ] **Step 4: 검증**

Run: `pnpm --filter web check-types` → 오류 없음
Run: `pnpm dlx ultracite fix`
Run: `pnpm vitest run apps/web/src` → 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src/components/bambi/auth/auth-backdrop.tsx apps/web/src/components/bambi/auth/seeker-auth-gate-screen.tsx apps/web/src/app/seeker/layout.tsx
```

```
feat: 비로그인 /seeker 화면에 마스킹 블러 배경과 인증 카드 추가
- 실제 공고를 받아 개수·레이아웃은 유지하되 문자열은 서버에서 마스킹해 내보냄
- 배경에 aria-hidden과 네이티브 inert를 걸어 클릭·탭 이동·스크린리더 접근 차단
- 오버레이를 Dialog 대신 절대배치 카드로 두어 푸터가 선명하고 클릭 가능하게 남김
- 모바일에서는 배경을 감추고 카드를 문서 흐름에 배치
```

---

## Task 6: 게이트 전환

여기서 비로소 anon이 `/seeker`에 도달한다.

**Files:**
- Modify: `apps/web/src/lib/bambi/resolve-gate.ts`
- Modify: `apps/web/src/lib/bambi/require-role.ts`
- Test: `apps/web/src/lib/bambi/resolve-gate.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `resolveGate` 동작 변경 — anon `/seeker` 통과, 그 외 `/seeker?auth=signup`

- [ ] **Step 1: 테스트를 새 규칙으로 고친다**

`resolve-gate.test.ts`에서 `/welcome`·`/login` 관련 3개 케이스를 지우고 다음으로 교체한다(나머지 케이스는 유지하되 리다이렉트 대상만 갱신):

```ts
	it("lets anonymous visitors reach the seeker list root", () => {
		expect(resolveGate({ pathname: "/seeker", ...fresh }).type).toBe("next");
	});
	it("sends anonymous visitors elsewhere to the signup overlay", () => {
		expect(resolveGate({ pathname: "/seeker/jobs/abc", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker?auth=signup",
		});
		expect(resolveGate({ pathname: "/", ...fresh })).toEqual({
			type: "redirect",
			to: "/seeker?auth=signup",
		});
	});
	it("no longer treats /welcome or /login as public", () => {
		expect(resolveGate({ pathname: "/welcome", ...fresh }).type).toBe(
			"redirect"
		);
		expect(resolveGate({ pathname: "/login", ...fresh }).type).toBe("redirect");
	});
```

guest 케이스 3개의 기대값을 `/welcome?signup&guestBlocked=1` → `/seeker?auth=signup&guestBlocked=1`로 바꾼다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/resolve-gate.test.ts`
Expected: FAIL — anon `/seeker`가 `/welcome`으로 리다이렉트됨

- [ ] **Step 3: 게이트를 고친다**

`resolve-gate.ts`:

```ts
// 약관(/terms)·개인정보 처리방침(/privacy)은 로그인·게스트 여부와 무관하게
// 누구나 열람할 수 있어야 한다(회원가입 동의 화면에서도 링크로 연다).
const PUBLIC_PREFIXES = ["/api", "/bambi", "/terms", "/privacy"];
```

```ts
// 인증 UI는 /seeker 위의 오버레이다. 목록 루트는 비로그인도 통과시키고, 그 위에
// 뜨는 카드가 게이트 역할을 한다(배경 데이터는 서버에서 마스킹된다).
const SEEKER_ROOT = "/seeker";
const SIGNUP_REDIRECT = "/seeker?auth=signup";
// 게스트가 허용되지 않은 경로로 진입할 때. guestBlocked 신호로 토스트를 띄운다.
const GUEST_BLOCKED_REDIRECT = "/seeker?auth=signup&guestBlocked=1";
```

`resolveGate` 본문:

```ts
export const resolveGate = ({
	pathname,
	hasSession,
	isGuest,
}: GateInput): GateDecision => {
	if (isStaticFile(pathname)) {
		return next;
	}
	if (isPublic(pathname)) {
		return next;
	}
	if (hasSession) {
		return next;
	}
	// 세션 없는 방문자(anon·guest)에게 공통으로 열리는 유일한 화면.
	if (pathname === SEEKER_ROOT) {
		return next;
	}
	if (isGuest) {
		if (pathname === "/") {
			return redirect(SEEKER_ROOT);
		}
		return redirect(GUEST_BLOCKED_REDIRECT);
	}
	return redirect(SIGNUP_REDIRECT);
};
```

`GUEST_BLOCKED_SEEKER_PREFIXES` 상수는 더 이상 분기에 쓰이지 않으므로 삭제한다(모든 비허용 경로가 같은 목적지로 간다).

- [ ] **Step 4: 통과를 확인한다**

Run: `pnpm vitest run apps/web/src/lib/bambi/resolve-gate.test.ts`
Expected: PASS

- [ ] **Step 5: 서버 리다이렉트를 맞춘다**

`require-role.ts`의 `redirect("/welcome")` 2곳을 `redirect("/seeker?auth=login")`으로 바꾸고, 위 주석의 "/welcome" 언급도 함께 갱신한다.

- [ ] **Step 6: 검증 후 커밋**

Run: `pnpm --filter web check-types`
Run: `pnpm vitest run apps/web/src`

```bash
git add apps/web/src/lib/bambi/resolve-gate.ts apps/web/src/lib/bambi/resolve-gate.test.ts apps/web/src/lib/bambi/require-role.ts
```

```
feat: 비로그인 방문자를 /seeker 인증 오버레이로 보내도록 게이트 전환
- 세션 없는 방문자에게 /seeker 목록 루트만 열고 나머지는 ?auth=signup으로 유도
- /welcome·/login을 공개 경로에서 제외하고 게스트 차단 신호도 /seeker로 옮김
- 세션·프로필이 없을 때의 서버 리다이렉트를 /seeker?auth=login으로 변경
```

---

## Task 7: guest용 Dialog와 헤더 진입점

인증만 마친 guest는 실제 목록을 보고 있으므로, 로그인·회원가입은 닫을 수 있는 Dialog로 띄운다.

**Files:**
- Create: `apps/web/src/components/bambi/auth/auth-dialog.tsx`
- Modify: `apps/web/src/components/bambi/responsive-shell.tsx`
- Modify: `apps/web/src/components/bambi/guest-blocked-toast.tsx`
- Modify: `apps/web/src/app/seeker/page.tsx`

**Interfaces:**
- Consumes: `AuthPanel` (Task 4)
- Produces: `AuthDialog()` — `?auth=login|signup` 쿼리로 열리는 Dialog

- [ ] **Step 1: Dialog 껍데기를 만든다**

```bash
pnpm dlx shadcn@latest docs dialog
```
로 API를 확인한 뒤 `apps/web/src/components/bambi/auth/auth-dialog.tsx`:

```tsx
"use client";

// 이미 본인인증을 마친 게스트가 실제 목록 위에서 여는 로그인·회원가입 다이얼로그.
// anon 화면과 달리 닫을 수 있다(뒤에 볼 것이 있다). 패널 내용은 AuthPanel로 공유한다.

import { Dialog, DialogContent } from "@bambi-app/ui/components/dialog";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AuthPanel } from "./auth-panel";

export function AuthDialog() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const auth = searchParams.get("auth");
	const isOpen = auth === "login" || auth === "signup";

	const close = () => {
		router.replace(pathname as Route);
	};

	return (
		<Dialog onOpenChange={(open) => (open ? undefined : close())} open={isOpen}>
			<DialogContent className="max-w-xl">
				<AuthPanel compact onDone={close} />
			</DialogContent>
		</Dialog>
	);
}
```

`compact`·`onDone`은 Task 4에서 이미 `AuthPanel`에 있다 — 여기서는 넘기기만 한다.

- [ ] **Step 2: 헤더 진입점을 붙인다**

`responsive-shell.tsx:224`의 `href={(isPublic ? "/login" : "/seeker/me") as Route}`를 `href={(isPublic ? "/seeker?auth=login" : "/seeker/me") as Route}`로 바꾼다.

`app/seeker/page.tsx`에 Dialog를 마운트한다:

```tsx
import { Suspense } from "react";
import { AuthDialog } from "@/components/bambi/auth/auth-dialog";
import { GuestBlockedToast } from "@/components/bambi/guest-blocked-toast";
import { SeekerMarketplaceScreen } from "@/components/bambi/screens/seeker-marketplace";

export default function SeekerHomePage() {
	return (
		<>
			<Suspense>
				<GuestBlockedToast />
				<AuthDialog />
			</Suspense>
			<SeekerMarketplaceScreen />
		</>
	);
}
```

- [ ] **Step 3: 토스트가 /seeker에서 동작하게 한다**

`guest-blocked-toast.tsx`의 주석과 리다이렉트를 고친다:

```tsx
// 게스트가 공고 목록(/seeker) 외 경로로 진입해 게이트가 되돌려보냈을 때 "회원가입
// 후에 볼 수 있어요" 토스트를 1회 띄운다. 새로고침·재렌더로 반복되지 않도록 신호
// 파라미터(guestBlocked)만 제거하고 auth 파라미터는 남겨 인증 카드는 열어 둔다.
		router.replace("/seeker?auth=signup");
```

- [ ] **Step 4: 검증 후 커밋**

Run: `pnpm --filter web check-types`
Run: `pnpm dlx ultracite fix`
Run: `pnpm vitest run apps/web/src`

```bash
git add apps/web/src/components/bambi/auth/auth-dialog.tsx apps/web/src/components/bambi/responsive-shell.tsx apps/web/src/components/bambi/guest-blocked-toast.tsx apps/web/src/app/seeker/page.tsx apps/web/src/components/bambi/auth/auth-panel.tsx
```

```
feat: 게스트용 로그인·회원가입 다이얼로그와 헤더 진입점 추가
- ?auth=login|signup 쿼리로 열리고 닫으면 쿼리만 지우는 Dialog를 /seeker에 마운트
- 인증 패널 내용을 anon 화면과 공유해 문구·흐름이 갈라지지 않게 함
- 게스트 차단 토스트가 /seeker에서 뜨도록 리다이렉트 대상 정리
```

---

## Task 8: 옛 라우트 제거와 링크 정리

**Files:**
- Delete: `apps/web/src/app/welcome/page.tsx` · `apps/web/src/app/login/page.tsx` · `apps/web/src/components/bambi/screens/adult-gate-screen.tsx`
- Modify: `apps/web/next.config.ts` · `apps/web/src/app/sitemap.ts` · `apps/web/src/components/bambi/screens/seeker-marketplace.tsx` · `apps/web/src/components/bambi/require-auth.tsx` · `apps/web/src/app/seeker/jobs/[id]/chat/page.tsx` · employer 페이지 6개
- Test: `apps/web/src/components/bambi/seeker-chat-role-guard.test.ts`

**Interfaces:**
- Consumes: Task 6의 게이트 규칙
- Produces: 없음(정리)

- [ ] **Step 1: 남은 참조를 전부 찾는다**

Run: `git grep -n '"/welcome\|/welcome?\|"/login"' -- apps/web/src`
결과 목록을 그대로 체크리스트로 쓴다.

- [ ] **Step 2: 링크를 교체한다**

| 파일 | 현재 | 변경 |
|---|---|---|
| `app/employer/page.tsx:398` · `me/page.tsx:155` · `new/page.tsx:165` · `settings/page.tsx:51` · `settings/teams/page.tsx:111` · `jobs/[id]/edit/page.tsx:446` | `href="/login"` | `href="/seeker?auth=login"` |
| `app/employer/page.tsx:436` · `me/page.tsx:193` · `new/page.tsx:203` | `href="/welcome"` | `href="/seeker?auth=signup"` |
| `app/seeker/jobs/[id]/chat/page.tsx:117` | `router.push("/login" as Route)` | `router.push("/seeker?auth=login" as Route)` |
| `components/bambi/require-auth.tsx:34` | `router.replace("/login")` | `router.replace("/seeker?auth=login")` |
| `screens/seeker-marketplace.tsx:45` | `router.push("/welcome?signup")` | `router.push("/seeker?auth=signup")` |
| `app/sitemap.ts:7` | `["/welcome", "/terms", "/privacy"]` | `["/seeker", "/terms", "/privacy"]` |

`seeker-chat-role-guard.test.ts:49`는 채팅 화면이 **가입 게이트**로 튕기지 않는지를 소스 문자열로 검사한다(로그인 유도는 정상이다). `/welcome`이 사라졌으므로 금지 문자열을 새 가입 경로로 갱신한다 — 같은 파일의 `router.push("/seeker?auth=login")`은 계속 허용된다:

```ts
		// 이 리다이렉트가 원래 버그였다: 구인자가 채팅으로 이어가면 가입 게이트로 튕겼다.
		expect(page).not.toContain('router.push("/seeker?auth=signup"');
```

`requireRole` 관련 주석의 `/welcome` 언급도 `/seeker 인증 오버레이`로 갱신한다.

- [ ] **Step 3: 라우트를 지우고 리다이렉트를 남긴다**

```bash
git rm apps/web/src/app/welcome/page.tsx apps/web/src/app/login/page.tsx apps/web/src/components/bambi/screens/adult-gate-screen.tsx
```

`apps/web/next.config.ts`의 설정 객체에 추가한다(기존 키를 지우지 말 것):

```ts
	// 옛 진입 경로. 인증 UI가 /seeker 오버레이로 옮겨졌지만 외부 북마크·검색엔진
	// 색인이 남아 있어 영구 리다이렉트로 흡수한다. next.config의 redirects는
	// 미들웨어(proxy)보다 먼저 실행되므로 게이트에 걸리지 않는다.
	async redirects() {
		return [
			{ source: "/welcome", destination: "/seeker", permanent: true },
			{ source: "/login", destination: "/seeker?auth=login", permanent: true },
		];
	},
```

- [ ] **Step 4: 최종 검증**

Run: `git grep -n '/welcome' -- apps/web/src` → next.config·리다이렉트 외 결과 없음
Run: `pnpm --filter web check-types` → 오류 없음
Run: `pnpm --filter @bambi-app/api check-types` → 오류 없음
Run: `pnpm dlx ultracite fix`
Run: `pnpm vitest run apps/web/src` → 전부 PASS
Run: `pnpm --filter @bambi-app/api test` → 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add -A
```

```
refactor: /welcome·/login 라우트를 제거하고 진입점을 /seeker로 통일
- 옛 경로는 next.config 영구 리다이렉트로 흡수해 외부 링크가 깨지지 않게 함
- employer·구직자 화면의 로그인 유도 링크를 /seeker?auth=login으로 정리
- sitemap의 공개 경로를 /seeker로 교체하고 adult-gate-screen을 삭제
```

---

## Task 9: 통합 마무리

- [ ] **Step 1: 전체 검증**

Run: `pnpm check-types`
Expected: 전 패키지 오류 없음

Run: `pnpm vitest run apps/web/src`
Run: `pnpm --filter @bambi-app/api test`
Expected: 전부 PASS

- [ ] **Step 2: 사용자 시각 확인 요청**

개발서버·스크린샷은 금지되어 있으므로, 다음을 사용자에게 확인 요청한다:

1. 비로그인으로 `/seeker` 진입 → 블러 배경 + 인증 카드 + **선명하고 클릭되는 푸터**
2. devtools로 배경의 `blur-sm` 클래스를 지웠을 때 **업소명이 아니라 `■` 문자만** 보이는지
3. 회원가입 → 본인인증 → 폼 순서로 진행되는지, 19금 안내가 계속 보이는지
4. 인증 후 새로고침해도 폼 단계가 유지되는지
5. 비회원 둘러보기 → 인증 후 실제 목록이 보이는지
6. 모바일 폭에서 카드가 잘리지 않고 푸터까지 스크롤되는지

- [ ] **Step 3: `refactor/login`에 로컬 머지**

사용자 확인 후:

```bash
git -C C:/Users/user/projects/bambi-app checkout refactor/login
git -C C:/Users/user/projects/bambi-app merge --no-ff worktree-seeker-auth-modal
```

머지 커밋 제목은 `merge: /seeker 인증 모달·인증 선행 회원가입` 형식으로 하고 브랜치명 접미사를 붙이지 않는다. **push·PR은 하지 않는다.**

---

## 위험 요소

- **`getSessionCookie`의 서버 컴포넌트 사용(Task 5 Step 3):** edge 미들웨어용 API라 `Request`를 기대한다. 타입이 맞지 않으면 쿠키 이름을 직접 읽는 방식으로 대체한다.
- **`toBirth8` 반환 형식(Task 3 Step 1):** 테스트 단언값 `"20000101"`이 실제 구현과 다를 수 있다. 구현을 먼저 확인한다.
- **`jobs.list`가 anon 컨텍스트에서 동작하는지(Task 5):** `publicProcedure`지만 `context`를 참조하는 분기가 있다. 실패해도 배경이 빈 채로 뜨도록 `catch`가 걸려 있으니 화면은 깨지지 않는다.
- **Dialog 내 `AuthPanel` 폭(Task 7):** 2컬럼 레이아웃이 Dialog에서 넘칠 수 있어 `onDone` 유무로 분기한다.
