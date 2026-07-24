# 이미지 검증·금칙어·연락처 공개 재설계 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이미지 업로드 검증(10MB+시그니처)을 전역 강화하고, 금칙어 관리에 CSV·정렬·검색을 추가하고, 연락처 공개 흐름을 "구인자 번호 자동 노출 + 구직자 번호 요청 왕복 + 채팅 소프트삭제 + 운영자 채팅 관리"로 재설계한다.

**Architecture:** 3개 독립 워크스트림(A 이미지 / B 금칙어 / C 연락처). A·B는 소규모·독립. C는 스키마(chat_message.kind/metadata, chat_room.deletedAt, contact_reveal_consent drop) 위에 API·웹·운영자 UI를 얹는다. 연락처 요청 왕복은 `contact_request` 인라인 메시지 1건의 `metadata.status` 전이로 표현하고, 채팅 말풍선은 shadcn `@shadcn/message`로 전환한다.

**Tech Stack:** pnpm/turbo monorepo, Next.js 16(apps/web, RSC), oRPC(packages/api), Drizzle(packages/db, Postgres bambi_dev @ localhost:55432), better-auth, shadcn/base-ui(packages/ui), vitest.

## Global Constraints

- **이미지 상한**: `10 * 1024 * 1024` (10MB). 채팅 PDF는 기존 `10MB` 유지.
- **공고 상세 안내 카피(verbatim)**: `("밤비알바 보고 전화드렸는데요"라고 하시면 정확한 상담 받으실 수 있습니다.)`
- **연락처 요청 카피(verbatim 기반)**: pending→구직자 `{상대}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?`; decline→구인자 `{구직자}님께서 연락처 공개를 거절하셨습니다.`
- **shadcn/base-ui 규칙**: `apps/web/CLAUDE.md` 준수 — 인라인 style 금지, 시맨틱/코럴 토큰, `cn()`, base-ui는 `render` prop(asChild 아님), `rounded-none` 금지(반경 토큰), 아이콘 lucide 객체 전달. 새 UI는 shadcn 컴포넌트 우선.
- **enum 원값 노출 금지**: DB enum/상태는 라벨 맵 경유(신규 상태 문자열엔 사용자 대면 라벨 별도).
- **빌드/실행 금지**: dev 서버·build 기동 금지(HMR로 사용자 육안 확인). typecheck/lint/vitest만.
- **DB**: `db:push` 금지. `pnpm --filter @bambi-app/db db:generate` → `db:migrate`만(사용자 위임됨). 적용 후 컬럼 실재 검증 필수.
- **라이브러리 추가 금지**: 새 npm 의존성 금지. shadcn 컴포넌트 소스 복사는 허용(`@shadcn/message`). `message-scroller`는 `@shadcn/react` 의존이라 **도입 금지**.
- **커밋**: 서브에이전트는 커밋·git stash 금지(컨트롤러가 순차 커밋). 커밋 메시지 한국어 `type:` + 촘촘한 `- ` 블릿(빈 줄 없음) + `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **테스트 실행**:
  - web: 레포 루트에서 `pnpm exec vitest run <path>`.
  - api: `pnpm --filter @bambi-app/api exec vitest run <src-상대경로>` (dotenv가 `../../apps/server/.env`를 읽으므로 CWD=packages/api).
- **check-types 파이프 마스킹 주의**: `pnpm check-types`를 파이프하면 exit code가 가려짐 → `${PIPESTATUS[0]}` 또는 unpiped로 확인.

---

## File Structure

### Workstream A (이미지 검증)
- Create: `apps/web/src/lib/bambi/image-signature.ts` — 매직넘버 시그니처 판정.
- Create: `apps/web/src/lib/bambi/image-signature.test.ts`.
- Modify: `packages/api/src/services/bambi-job-media-policy.ts:17`, `apps/web/src/lib/bambi-job-form.ts:26`, `packages/api/src/services/bambi-media-policy.ts:25` — 8MB→10MB.
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx`, `apps/web/src/components/bambi/community-editor.tsx`, `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` — 시그니처 검증 배선.
- Modify: `packages/api/src/services/bambi-media-policy.test.ts` (또는 job-media-policy.test.ts) — 10MB 경계.

### Workstream B (금칙어)
- Create: `apps/web/src/lib/bambi/banned-words-csv.ts` + `.test.ts`.
- Modify: `packages/api/src/routers/bambi/banned-words.ts` — `createMany`.
- Create/Modify: `packages/api/src/routers/bambi/banned-words.test.ts` (신규 파일; 현재 없음) — createMany.
- Modify: `apps/web/src/app/moderator/banned-words/page.tsx` — DataTable+검색+CSV.
- Create: `apps/web/src/app/moderator/banned-words/page.test.ts` — 소스 스캔.

### Workstream C (연락처 재설계)
- Modify: `packages/db/src/schema/bambi.ts` — chat_message(kind/metadata), chat_room(deletedAt×2), contact_reveal_consent 제거.
- Create: `packages/db/src/migrations/00NN_*.sql` + meta (db:generate 산출).
- Modify: `packages/api/src/routers/bambi/chats.ts` — 프로시저 add/remove/수정.
- Modify: `packages/api/src/routers/bambi/chats.test.ts` — 옛 테스트 제거, 신규 추가, contactRevealConsent import 제거.
- Modify: `packages/api/src/services/bambi-policy.ts` (+ `bambi-policy.test.ts`) — 미사용 함수 정리.
- Modify: `packages/api/src/routers/bambi/moderation.ts` — listChatsForModeration, hardDeleteChatRoom.
- Modify: `packages/api/src/routers/bambi/moderation.test.ts` (또는 moderation-management.test.ts) — 신규 프로시저.
- Add(shadcn): `packages/ui/src/components/message.tsx` (`pnpm dlx shadcn@latest add @shadcn/message`).
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` — message 컴포넌트, contact_request 렌더, 요청 버튼, 구인자 번호.
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`, `apps/web/src/components/bambi/screens/types.ts`, `apps/web/src/components/bambi/screens/api-job-mapper.ts` — 구인자 번호 블록.
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx` — 삭제/신고/차단 액션.
- Create: `apps/web/src/app/moderator/chats/page.tsx` + `page.test.ts`.
- Modify: `apps/web/src/app/moderator/layout.tsx` (+ layout.test.ts) — "채팅" nav.
- Delete: `apps/web/src/app/seeker/chats/[id]/reveal/page.tsx`, `apps/web/src/components/bambi/screens/contact-reveal.tsx`.
- Modify: `apps/web/src/app/seeker/chats/[id]/page.tsx` — reveal 라우팅 제거.

---

## Workstream A — 이미지 검증 강화

### Task A1: 이미지 시그니처 판정 헬퍼

**Files:**
- Create: `apps/web/src/lib/bambi/image-signature.ts`
- Test: `apps/web/src/lib/bambi/image-signature.test.ts`

**Interfaces — Produces:**
- `type DetectedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif"`
- `async function detectImageSignature(file: Blob): Promise<DetectedImageType | null>`
- `function isSignatureMismatch(declaredMime: string, detected: DetectedImageType | null): boolean`

- [ ] **Step 1: 실패 테스트 작성** — `image-signature.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { detectImageSignature, isSignatureMismatch } from "./image-signature";

const blobFromBytes = (bytes: number[]): Blob =>
	new Blob([new Uint8Array(bytes)]);

// RIFF....WEBP: 0-3 "RIFF", 4-7 size(임의), 8-11 "WEBP"
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0];

describe("detectImageSignature", () => {
	it("PNG 매직넘버를 image/png로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(PNG))).toBe("image/png");
	});
	it("JPEG 매직넘버를 image/jpeg로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(JPEG))).toBe("image/jpeg");
	});
	it("WebP(RIFF..WEBP)를 image/webp로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(WEBP))).toBe("image/webp");
	});
	it("GIF8을 image/gif로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(GIF))).toBe("image/gif");
	});
	it("정체불명 바이트는 null을 반환한다", async () => {
		expect(await detectImageSignature(blobFromBytes([1, 2, 3, 4]))).toBeNull();
	});
	it("12바이트 미만이어도 안전하게 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes([0xff, 0xd8, 0xff]))).toBe(
			"image/jpeg"
		);
	});
});

describe("isSignatureMismatch", () => {
	it("선언 mime과 실제가 일치하면 false", () => {
		expect(isSignatureMismatch("image/png", "image/png")).toBe(false);
	});
	it("png 선언인데 실제 jpeg면 true", () => {
		expect(isSignatureMismatch("image/png", "image/jpeg")).toBe(true);
	});
	it("판정 불가(null)면 true", () => {
		expect(isSignatureMismatch("image/png", null)).toBe(true);
	});
});
```

- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run apps/web/src/lib/bambi/image-signature.test.ts` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** — `image-signature.ts`

```ts
// 파일 앞바이트(매직넘버)로 실제 이미지 형식을 판정한다. File.type/확장자 위조를
// 걸러내는 클라이언트 1차 방어. 서버는 실제 바이트를 열지 않으므로 완전 차단은 아니다.
export type DetectedImageType =
	| "image/jpeg"
	| "image/png"
	| "image/webp"
	| "image/gif";

const startsWith = (bytes: Uint8Array, sig: number[]): boolean =>
	sig.every((b, i) => bytes[i] === b);

export async function detectImageSignature(
	file: Blob
): Promise<DetectedImageType | null> {
	const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
		return "image/jpeg";
	}
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
		return "image/gif";
	}
	// WebP: "RIFF"(0-3) + "WEBP"(8-11)
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

export function isSignatureMismatch(
	declaredMime: string,
	detected: DetectedImageType | null
): boolean {
	return detected === null || detected !== declaredMime;
}
```

- [ ] **Step 4: 통과 확인** — `pnpm exec vitest run apps/web/src/lib/bambi/image-signature.test.ts` → PASS.

- [ ] **Step 5: 커밋(컨트롤러)** — `feat(image): 파일 시그니처 매직넘버 판정 헬퍼 추가`

### Task A2: 이미지 상한 10MB 통일

**Files:**
- Modify: `packages/api/src/services/bambi-job-media-policy.ts:17` (`JOB_POST_IMAGE_MAX_BYTES`)
- Modify: `apps/web/src/lib/bambi-job-form.ts:26` (`IMAGE_MAX_BYTES`)
- Modify: `packages/api/src/services/bambi-media-policy.ts:25` (채팅 `IMAGE_MAX_BYTES`)
- Test: `packages/api/src/services/bambi-media-policy.test.ts` (10MB 경계)

- [ ] **Step 1: 경계 테스트 추가/수정** — `bambi-media-policy.test.ts`에 10MB 통과·10MB+1 실패 케이스 추가(기존 8MB 단정이 있으면 10MB로 갱신). 채팅 이미지 정책 검증 함수(`validateChatMediaUpload`) 기준.

```ts
// 10MB 정확히는 통과, 초과는 BAD_REQUEST/거부.
it("이미지 10MB는 허용한다", () => {
	expect(() =>
		assertValidChatImage({ byteSize: 10 * 1024 * 1024, mimeType: "image/png" })
	).not.toThrow();
});
it("이미지 10MB 초과는 거부한다", () => {
	expect(() =>
		assertValidChatImage({
			byteSize: 10 * 1024 * 1024 + 1,
			mimeType: "image/png",
		})
	).toThrow();
});
```
(실제 export 함수명/시그니처는 `bambi-media-policy.ts` 확인 후 맞춘다. 채팅 PDF 10MB는 건드리지 않는다.)

- [ ] **Step 2: 실패 확인** — `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-media-policy.test.ts` → 8MB 상한이면 10MB 케이스 FAIL.

- [ ] **Step 3: 상수 3곳 10MB로 변경** — 각 파일의 `8 * 1024 * 1024` → `10 * 1024 * 1024`. 주석에 "공고·커뮤니티·채팅 이미지 공통 상한(세 파일 동기화)" 명시.

- [ ] **Step 4: 통과 확인** — `bambi-media-policy.test.ts`, `bambi-job-media-policy.test.ts` 재실행 PASS. 클라 `bambi-job-form.test.ts`도 8MB 문자열 단정이 있으면 갱신 후 `pnpm exec vitest run apps/web/src/lib/bambi-job-form.test.ts` PASS.

- [ ] **Step 5: 커밋** — `feat(image): 이미지 업로드 상한 8MB→10MB 전역 통일`

### Task A3: 시그니처 검증 3개 업로드 경로 배선

**Files:**
- Modify: `apps/web/src/components/bambi/job-post-media-uploader.tsx` (`createMediaItemFromFile` ~59-68)
- Modify: `apps/web/src/components/bambi/community-editor.tsx` (이미지 삽입 ~256-262)
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` (첨부 선택부)
- Test: 각 파일 소스 스캔(간단) — `job-post-media-uploader`에 대한 신규 소스 스캔 테스트 1개.

**Interfaces — Consumes:** A1의 `detectImageSignature`, `isSignatureMismatch`.

- [ ] **Step 1: 소스 스캔 실패 테스트** — `apps/web/src/components/bambi/job-post-media-uploader.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./job-post-media-uploader.tsx", import.meta.url), "utf8");
describe("공고 미디어 업로더 시그니처 검증", () => {
	it("detectImageSignature로 파일 형식을 실제 검증한다", () => {
		expect(source).toContain("detectImageSignature");
	});
});
```

- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run apps/web/src/components/bambi/job-post-media-uploader.test.ts` → FAIL.

- [ ] **Step 3: 배선 구현** — 각 파일에서 **파일 선택 시점**(File 객체가 있는 곳)에 `const detected = await detectImageSignature(file); if (isSignatureMismatch(file.type, detected)) { <에러 표시/차단> }`. 이미지가 아닌 첨부(채팅 PDF)는 건드리지 않음(`file.type.startsWith("image/")`일 때만 검증). 에러는 각 화면의 기존 에러 표기 방식(항목 에러 상태/`toast()`)에 맞춰 표시. 문구 예: "이미지 형식이 올바르지 않습니다. PNG·JPG·WebP·GIF만 업로드할 수 있어요."

- [ ] **Step 4: 통과 확인** — Step 1 테스트 PASS. `pnpm check-types`(unpiped) 통과. `pnpm dlx ultracite fix` 클린.

- [ ] **Step 5: 커밋** — `feat(image): 공고·커뮤니티·채팅 업로드에 시그니처 실검증 배선`

---

## Workstream B — 금칙어 관리

### Task B1: CSV 파싱 헬퍼

**Files:**
- Create: `apps/web/src/lib/bambi/banned-words-csv.ts` + `.test.ts`

**Interfaces — Produces:** `function parseBannedWordsCsv(text: string): string[]`

- [ ] **Step 1: 실패 테스트** — `banned-words-csv.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { parseBannedWordsCsv } from "./banned-words-csv";

describe("parseBannedWordsCsv", () => {
	it("개행·쉼표를 모두 구분자로 쓴다", () => {
		expect(parseBannedWordsCsv("가,나\n다")).toEqual(["가", "나", "다"]);
	});
	it("공백을 trim하고 빈 항목을 버린다", () => {
		expect(parseBannedWordsCsv(" 가 , ,나\n\n")).toEqual(["가", "나"]);
	});
	it("배치 내 중복을 제거한다", () => {
		expect(parseBannedWordsCsv("가,가,나")).toEqual(["가", "나"]);
	});
});
```

- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run apps/web/src/lib/bambi/banned-words-csv.test.ts` → FAIL.

- [ ] **Step 3: 구현**

```ts
// 단일 컬럼 금칙어 목록 CSV/텍스트를 파싱한다. 개행·쉼표를 구분자로, trim·빈값 제거·중복 제거.
export function parseBannedWordsCsv(text: string): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of text.split(/[\n,]/)) {
		const term = raw.trim();
		if (term.length === 0 || seen.has(term)) {
			continue;
		}
		seen.add(term);
		result.push(term);
	}
	return result;
}
```

- [ ] **Step 4: 통과 확인** — PASS.

- [ ] **Step 5: 커밋** — `feat(banned-words): CSV 파싱 헬퍼 추가`

### Task B2: `createMany` 프로시저

**Files:**
- Modify: `packages/api/src/routers/bambi/banned-words.ts`
- Test: `packages/api/src/routers/bambi/banned-words.test.ts` (신규)

**Interfaces — Produces:** `bannedWordsRouter.createMany({ terms: string[] }) -> { added: number; skipped: Array<{ term: string; reason: "duplicate" | "empty" }> }`

**Consumes:** 기존 `normalizeForMatch`, `invalidateBannedWordCache`, `bannedWord` 스키마, `adminProcedure`.

- [ ] **Step 1: api 실패 테스트** — `banned-words.test.ts` (chats.test.ts의 dotenv/dynamic-import/createContextForUser/expectOrpcCode 패턴 복제). admin 사용자 픽스처 필요: `user` + `bambiProfile{role:"admin"}` (또는 레포의 admin 판정 방식 확인 — `requireAdminProfile`). 케이스:
  - 새 단어 3개 → `added:3, skipped:[]`, DB에 3행.
  - 중복 단어(정규화 동일) 포함 → 중복은 `skipped(reason:"duplicate")`.
  - 빈 문자열/공백만 → `skipped(reason:"empty")` (zod min(1)로 걸리면 입력 단계에서 제외되므로, 정규화 후 빈 값이 되는 케이스로 검증).
  - 비admin 컨텍스트 → `FORBIDDEN`(adminProcedure 게이트).
  - 각 테스트 후 삽입 단어 cleanup(`inArray(bannedWord.term, terms)` delete).

- [ ] **Step 2: 실패 확인** — `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/banned-words.test.ts` → FAIL.

- [ ] **Step 3: 구현** — `banned-words.ts`에 `createMany` 추가

```ts
createMany: adminProcedure
	.input(
		z.object({
			terms: z
				.array(z.string().trim().min(1).max(100))
				.min(1, "추가할 단어가 없습니다.")
				.max(500, "한 번에 최대 500개까지 추가할 수 있습니다."),
		})
	)
	.handler(async ({ input }) => {
		const skipped: Array<{ term: string; reason: "duplicate" | "empty" }> = [];
		const seen = new Set<string>();
		const toInsert: Array<{ term: string; normalizedTerm: string; createdByUserId: string }> = [];
		// 기존 DB normalizedTerm 집합 조회
		const existing = await db
			.select({ normalizedTerm: bannedWord.normalizedTerm })
			.from(bannedWord);
		const existingSet = new Set(existing.map((r) => r.normalizedTerm));
		for (const term of input.terms) {
			const normalizedTerm = normalizeForMatch(term);
			if (normalizedTerm.length === 0) {
				skipped.push({ reason: "empty", term });
				continue;
			}
			if (seen.has(normalizedTerm) || existingSet.has(normalizedTerm)) {
				skipped.push({ reason: "duplicate", term });
				continue;
			}
			seen.add(normalizedTerm);
			toInsert.push({ createdByUserId: context.session.user.id, normalizedTerm, term });
		}
		if (toInsert.length > 0) {
			await db.insert(bannedWord).values(toInsert);
			invalidateBannedWordCache();
		}
		return { added: toInsert.length, skipped };
	}),
```
(핸들러 시그니처에서 `context`를 구조분해로 받는다: `.handler(async ({ context, input }) => {...})`. `createdByUserId` 세팅 방식은 기존 `create` 프로시저와 동일하게 맞춘다.)

- [ ] **Step 4: 통과 확인** — Step 1 테스트 PASS. `pnpm check-types`(api) 통과.

- [ ] **Step 5: 커밋** — `feat(banned-words): createMany 일괄 등록 프로시저 추가`

### Task B3: 금칙어 페이지 DataTable·검색·CSV

**Files:**
- Modify: `apps/web/src/app/moderator/banned-words/page.tsx`
- Test: `apps/web/src/app/moderator/banned-words/page.test.ts` (신규 소스 스캔)

**Consumes:** `DataTable`/`DataColumn`(`components/bambi/data-table.tsx`), `parseBannedWordsCsv`(B1), `orpc.bambi.bannedWords.createMany`(B2)/`list`/`setActive`/`remove`, `toast`.

- [ ] **Step 1: 소스 스캔 실패 테스트** — `page.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
describe("금칙어 관리 페이지", () => {
	it("DataTable로 정렬 가능한 목록을 렌더한다", () => {
		expect(source).toContain("DataTable");
		expect(source).toContain("sortValue");
	});
	it("검색 입력을 제공한다", () => {
		expect(source).toContain("useMemo");
	});
	it("CSV 파일 업로드로 일괄 추가한다", () => {
		expect(source).toContain("parseBannedWordsCsv");
		expect(source).toContain("createMany");
		expect(source).toContain('accept=".csv');
	});
});
```

- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run apps/web/src/app/moderator/banned-words/page.test.ts` → FAIL.

- [ ] **Step 3: 구현** — 원시 `Table` → `DataTable`. 컬럼: `term`(`sortValue: (r) => r.term`), `normalizedTerm`(Badge), `isActive`(Switch→setActive), actions(삭제→remove, destructive). 상단: 단건 추가(기존 유지) + 검색 `Input`(`useMemo`로 `term`/`normalizedTerm` `toLowerCase().includes` 필터) + "CSV로 추가" 버튼(숨김 `<input type="file" accept=".csv,text/csv">`, `onChange`에서 `await file.text()`→`parseBannedWordsCsv`→`createMany` 뮤테이션→결과 `toast("추가 N건 · 중복/빈값 M건 제외")`, 성공 시 `list` invalidate). `apps/web/CLAUDE.md` 스타일 규칙 준수.

- [ ] **Step 4: 통과 확인** — Step 1 PASS. `pnpm check-types`(web) 통과. `pnpm dlx ultracite fix` 클린(복잡도 ≤20 — 헬퍼 추출로 관리).

- [ ] **Step 5: 커밋** — `feat(banned-words): 금칙어 페이지 DataTable 정렬·검색·CSV 일괄 추가`

---

## Workstream C — 연락처 공개 재설계

### Task C0: 스키마 마이그레이션 (기반 — C의 선행)

**Files:**
- Modify: `packages/db/src/schema/bambi.ts`
- Create: `packages/db/src/migrations/00NN_*.sql` + meta (db:generate 산출)

**Interfaces — Produces:**
- `chatMessage.kind: text NOT NULL DEFAULT 'text'`, `chatMessage.metadata: jsonb`(nullable)
- `chatRoom.seekerDeletedAt: timestamp`(nullable), `chatRoom.employerDeletedAt: timestamp`(nullable)
- `contactRevealConsent` 테이블/export 제거

- [ ] **Step 1: 스키마 편집(additive only)** — `bambi.ts`
  - `chat_message`(686–704)에 추가: `kind: text("kind").notNull().default("text"),` `metadata: jsonb("metadata"),`
  - `chat_room`(648–684)에 추가: `seekerDeletedAt: timestamp("seeker_deleted_at"),` `employerDeletedAt: timestamp("employer_deleted_at"),`
  - **`contactRevealConsent`는 이 태스크에서 제거하지 않는다.** 이 테이블/옛 프로시저를 참조하는 `chats.ts`·`chats.test.ts`가 정리되기 전에 지우면 api 타입체크가 깨지므로, 테이블 drop과 스키마 export 제거는 **C10(참조 제거 후)**로 미룬다. 매 단계 타입체크를 초록으로 유지.

- [ ] **Step 2: 마이그레이션 생성** — `pnpm --filter @bambi-app/db db:generate`
  - Expected: 새 `00NN_*.sql`에 `ALTER TABLE "chat_message" ADD COLUMN "kind" text NOT NULL DEFAULT 'text';`, `ADD COLUMN "metadata" jsonb;`, `ALTER TABLE "chat_room" ADD COLUMN "seeker_deleted_at" timestamp;`, `ADD COLUMN "employer_deleted_at" timestamp;` (순수 add라 비대화형). 대화형 rename 프롬프트가 뜨면 중단하고 보고.

- [ ] **Step 3: 마이그레이션 적용** — `pnpm --filter @bambi-app/db db:migrate` (apps/server/.env의 DATABASE_URL=bambi_dev).

- [ ] **Step 4: 컬럼 실재 검증** — psql로 확인(예):
  ```
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
   WHERE table_name='chat_message' AND column_name IN ('kind','metadata');
  SELECT column_name FROM information_schema.columns
   WHERE table_name='chat_room' AND column_name IN ('seeker_deleted_at','employer_deleted_at');
  ```
  Expected: kind(text, NO/default), metadata(jsonb, YES), deletedAt 2컬럼 존재. (contact_reveal_consent는 아직 존재 — C10에서 drop.)

- [ ] **Step 5: check-types** — `pnpm --filter @bambi-app/db check-types` 통과(스키마 자체). (다른 패키지의 contactRevealConsent 참조 오류는 C1/C2에서 해소.)

- [ ] **Step 6: 커밋** — `feat(chat): chat_message kind/metadata·chat_room 소프트삭제 컬럼 추가·contact_reveal_consent 제거`

### Task C1: 연락처 요청 왕복 프로시저 (requestContactReveal / respondContactReveal)

**Files:**
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Modify: `packages/api/src/routers/bambi/chats.test.ts`

**Consumes:** C0 스키마(`chatMessage.kind/metadata`), `requireChatParticipant`, room 참여자·역할, `bambiProfile.isPhoneVerified`, 알림 발행 헬퍼.

**Interfaces — Produces:**
- `requestContactReveal({ chatRoomId: string })` — 구인자 전용, 폰인증 필수, pending 중복 차단. 반환: 생성된 contact_request 메시지.
- `respondContactReveal({ messageId: string; decision: "reveal" | "decline" })` — 대상(구직자) 전용. 반환: 갱신된 메시지.

- [ ] **Step 1: chats.test.ts 정리 + 신규 실패 테스트**
  - 상단 `contactRevealConsent` import(29) 제거, cleanup의 `contactRevealConsent` delete(153–160) 제거.
  - 옛 `describe("bambi chats router contact reveal")`(497–734) 및 "records a contact_reveal event"(395–439) 제거(프로시저 삭제됨).
  - 신규 describe 추가:
    - 구직자가 `requestContactReveal` 호출 → `FORBIDDEN`.
    - 구인자가 호출 → kind `contact_request`, `metadata.status="pending"` 메시지 생성.
    - pending 있는 상태에서 재요청 → `CONFLICT`(또는 BAD_REQUEST — 구현과 일치).
    - 구인자가 응답 시도(`respondContactReveal`) → `FORBIDDEN`(대상 아님).
    - 구직자 `reveal` → 메시지 `metadata.status="revealed"`.
    - 구직자 `decline` → `metadata.status="declined"`.
  - 구인자 폰 미인증 케이스: fixture는 기본 `isPhoneVerified:true`이므로, 별도 케이스는 employer 프로필을 `false`로 업데이트 후 `requestContactReveal` → `BAD_REQUEST`.

- [ ] **Step 2: 실패 확인** — `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi/chats.test.ts` → FAIL(프로시저 없음).

- [ ] **Step 3: 구현** — `chats.ts`에 추가(역할·권한은 기존 `proposeInterview`/`revealContact` 패턴 참고). 핵심 로직:
  - `requestContactReveal`: `requireChatParticipant`로 room 로드 → `userId === room.employerUserId` 아니면 FORBIDDEN → employer 프로필 `isPhoneVerified` 아니면 BAD_REQUEST("본인인증 후 이용할 수 있습니다.") → 방에 `kind='contact_request' AND metadata->>'status'='pending'` 메시지 존재 시 CONFLICT → `chatMessage` insert(`kind:"contact_request"`, `senderUserId:employer`, `body:"연락처 공개를 요청했습니다."`, `metadata:{status:"pending", requesterUserId:employerUserId, targetUserId:jobSeekerUserId}`) → 구직자에게 알림 → 메시지 반환.
  - `respondContactReveal`: 메시지 로드 → `kind==='contact_request'` & `metadata.status==='pending'` 아니면 BAD_REQUEST → `context.session.user.id === metadata.targetUserId` 아니면 FORBIDDEN → decision `reveal`→status `revealed`(구직자 `isPhoneVerified` 확인) / `decline`→`declined`; 낙관적 update(where status='pending' 조건) → 구인자에게 알림 → 갱신 메시지 반환.

- [ ] **Step 4: 통과 확인** — Step 1 PASS. `pnpm check-types`(api) 통과.

- [ ] **Step 5: 커밋** — `feat(chat): 연락처 공개 요청·응답(공개/거절) 프로시저 추가`

### Task C2: 채팅 소프트삭제 (deleteChatRoom / listMine 필터 / sendMessage 재노출)

**Files:**
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Modify: `packages/api/src/routers/bambi/chats.test.ts`

**Consumes:** C0 `chatRoom.seekerDeletedAt/employerDeletedAt`.

**Interfaces — Produces:** `deleteChatRoom({ chatRoomId: string }) -> { ok: true }`. `listMine`은 자기쪽 미삭제만 반환. `sendMessage`는 새 메시지 시 양쪽 deletedAt clear.

- [ ] **Step 1: 실패 테스트** — chats.test.ts에 추가:
  - 구직자가 `deleteChatRoom` → `listMine`(구직자 컨텍스트)에서 방이 안 보임.
  - 같은 방이 구인자 `listMine`에는 계속 보임.
  - 소프트삭제 후 상대(구인자)가 `sendMessage` → 구직자 `listMine`에 방 재등장(deletedAt cleared).
  - 비참여자(outsider) `deleteChatRoom` → `NOT_FOUND`.
  - (주의) `listMine`은 메시지 0인 방을 숨기므로, 각 케이스에서 최소 1개 메시지를 seed.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
  - `deleteChatRoom`: `requireChatParticipant` → 호출자가 seeker면 `seekerDeletedAt=now()`, employer면 `employerDeletedAt=now()` update → `{ ok: true }`.
  - `listMine`(447): WHERE에 `(jobSeekerUserId=me AND seekerDeletedAt IS NULL) OR (employerUserId=me AND employerDeletedAt IS NULL)` 추가(기존 참여자 조건 대체/보강, drizzle `or`/`and`/`isNull`).
  - `sendMessage`(703): 메시지 insert 후(또는 트랜잭션 내) 해당 room의 `seekerDeletedAt=null, employerDeletedAt=null` update(양쪽 재노출). `sendMediaMessage`(748)에도 동일 반영.

- [ ] **Step 4: 통과 확인** — Step 1 + 기존 unread/media 테스트 PASS.

- [ ] **Step 5: 커밋** — `feat(chat): 채팅방 per-user 소프트삭제·새 메시지 재노출`

### Task C3: 구인자 인증번호 노출 (getById + 공고 상세 서버)

**Files:**
- Modify: `packages/api/src/routers/bambi/chats.ts` (`getById`)
- Modify: `packages/api/src/routers/bambi/jobs.ts` (공고 상세 프로시저 — createdBy 인증번호)
- Modify: `packages/api/src/routers/bambi/chats.test.ts`

**Interfaces — Produces:**
- `chats.getById` 응답에 `employerVerifiedPhone: string | null` + revealed된 `contact_request` 메시지에 뷰어가 구인자일 때 `revealedPhone`(구직자 번호) 주입.
- 공고 상세 응답에 `employerVerifiedPhone: string | null`(작성자 인증번호).

- [ ] **Step 1: 실패 테스트** (chats.test.ts):
  - `getById`(구직자·구인자 각 컨텍스트) → `employerVerifiedPhone`이 employer 프로필 phone(인증시)과 일치. employer 미인증이면 null.
  - employer가 request → seeker가 reveal → `getById`(구인자 컨텍스트)의 해당 메시지에 `revealedPhone`=구직자 phone. `getById`(구직자 컨텍스트)엔 `revealedPhone` 미포함.
  - (fixture profiles에 `phoneNumber` 세팅 필요 — 현재 fixture는 phoneNumber 없음. 테스트에서 employer/seeker 프로필 update로 `phoneNumber` 주입.)

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
  - `getById`: employer 프로필 조회(`isPhoneVerified ? phoneNumber : null`) → 응답 `employerVerifiedPhone`. 메시지 매핑 시 `kind==='contact_request' && metadata.status==='revealed' && viewer===employer`면 seeker 프로필 phone을 `metadata.revealedPhone`(또는 별도 필드)로 주입(DB 미저장, 응답 조립 시점).
  - 공고 상세 프로시저(jobs.ts): 공고 응답에 `createdByUserId` 프로필의 `isPhoneVerified ? phoneNumber : null`을 `employerVerifiedPhone`로 추가.

- [ ] **Step 4: 통과 확인** — PASS. `pnpm check-types`(api) 통과.

- [ ] **Step 5: 커밋** — `feat(chat): 구인자 인증번호·구직자 공개번호 응답 노출`

### Task C4: shadcn message 컴포넌트 도입

**Files:**
- Create: `packages/ui/src/components/message.tsx` (`pnpm dlx shadcn@latest add @shadcn/message`)

- [ ] **Step 1: 추가** — `pnpm dlx shadcn@latest add @shadcn/message` (packages/ui, components.json 기준). `message-scroller`는 추가하지 않는다.

- [ ] **Step 2: base-ui/코럴 검수** — 추가 소스가 radix 의존 없이 div 기반인지 확인. `rounded-none` 있으면 제거→반경 토큰, 색은 시맨틱/코럴 토큰으로 재테마(내 메시지=coral, 상대=secondary). 파일이 루트로 떨어졌으면 `packages/ui/src/components/`로 이동, import 경로 정리.

- [ ] **Step 3: check-types** — `pnpm --filter @bambi-app/ui check-types`(있으면) 또는 web check-types 통과.

- [ ] **Step 4: 커밋** — `chore(ui): shadcn message 컴포넌트 추가(코럴 재테마)`

### Task C5: 채팅방 UI — message 렌더·연락처 요청·구인자 번호

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`
- Test: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.test.ts` (신규 소스 스캔)

**Consumes:** C4 message, C1 `requestContactReveal`/`respondContactReveal`, C3 `employerVerifiedPhone`.

- [ ] **Step 1: 소스 스캔 실패 테스트**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./seeker-chat-room-responsive.tsx", import.meta.url), "utf8");
describe("채팅방 연락처 재설계", () => {
	it("구인자 버튼을 연락처 공개 요청으로 바꾼다", () => {
		expect(source).toContain("연락처 공개 요청");
		expect(source).toContain("requestContactReveal");
	});
	it("연락처 공개 요청 안내 문구를 렌더한다", () => {
		expect(source).toContain("연락처 공개 요청이 왔습니다");
	});
	it("옛 reveal 페이지 이동을 제거한다", () => {
		expect(source).not.toContain("/reveal");
		expect(source).not.toContain("getContactReveal");
	});
	it("shadcn message 컴포넌트를 쓴다", () => {
		expect(source).toContain("@bambi-app/ui/components/message");
	});
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
  - 메시지 렌더(202–239)를 shadcn `message`로 교체. `chatMessage.kind === "contact_request"`면 역할+`metadata.status`별 렌더(설계 스펙 표): 구직자·pending → 안내문 + [공개][거절] 버튼(`respondContactReveal({messageId, decision})`); 구인자·revealed → "{구직자}님께서 연락처를 공개했습니다: {revealedPhone}"; 구인자·declined → "{구직자}님께서 연락처 공개를 거절하셨습니다."; 등.
  - 면접 일정 카드(1239–1353): 구인자 뷰 버튼 "연락처 공개하기"→"연락처 공개 요청"(`requestContactReveal` 뮤테이션); `getRevealButtonLabel`·`onReveal`(→/reveal)·`revealQuery`(getContactReveal) 제거. 구직자 뷰: `roomQuery.data.employerVerifiedPhone` 있으면 구인자 번호 표시(안내 카피 톤).
  - 성공/실패 `toast`, 관련 쿼리 invalidate(getById).

- [ ] **Step 4: 통과 확인** — Step 1 PASS. `pnpm check-types`(web) 통과. `pnpm dlx ultracite fix` 클린(복잡도 관리 위해 렌더 분기를 헬퍼 컴포넌트로 추출).

- [ ] **Step 5: 커밋** — `feat(chat): 채팅방 연락처 공개 요청 왕복·구인자 번호·shadcn message 전환`

### Task C6: 공고 상세 — 구인자 번호 블록

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx` (161↔162)
- Modify: `apps/web/src/components/bambi/screens/types.ts` (`Job.employerVerifiedPhone`)
- Modify: `apps/web/src/components/bambi/screens/api-job-mapper.ts`
- Test: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.test.ts` (신규 소스 스캔)

**Consumes:** C3 공고 상세 서버 `employerVerifiedPhone`.

- [ ] **Step 1: 소스 스캔 실패 테스트**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./seeker-job-detail-responsive.tsx", import.meta.url), "utf8");
describe("공고 상세 구인자 번호", () => {
	it("근무시간·고용형태 사이에 구인자 인증번호 안내를 렌더한다", () => {
		expect(source).toContain("employerVerifiedPhone");
		expect(source).toContain("밤비알바 보고 전화드렸는데요");
	});
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
  - `types.ts` `Job`에 `employerVerifiedPhone?: string | null`.
  - `api-job-mapper.ts`에서 서버 응답 `employerVerifiedPhone` 매핑.
  - `seeker-job-detail-responsive.tsx` 근무시간 InfoTile(157–161) 직후, 고용형태(162) 직전에 조건부 블록: `job.employerVerifiedPhone`가 있으면 번호(`tel:` 링크, 강조 토큰) + muted 안내문 `("밤비알바 보고 전화드렸는데요"라고 하시면 정확한 상담 받으실 수 있습니다.)`. 없으면 미표시. shadcn 스타일(InfoTile 또는 Alert 톤, 시맨틱/코럴 토큰, 인라인 style 금지).

- [ ] **Step 4: 통과 확인** — Step 1 PASS. check-types(web) 통과.

- [ ] **Step 5: 커밋** — `feat(job): 공고 상세에 구인자 인증번호 안내 노출`

### Task C7: 채팅 목록 — 삭제·신고·차단 액션

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`
- Test: `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.test.ts` (신규 소스 스캔)

**Consumes:** C2 `deleteChatRoom`, 기존 `moderation.createReport`/`ReportDialog`, 기존 `blocks.blockUser`, `RowActions`(또는 케밥 DropdownMenu).

- [ ] **Step 1: 소스 스캔 실패 테스트**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./seeker-chat-list-responsive.tsx", import.meta.url), "utf8");
describe("채팅 목록 액션", () => {
	it("각 채팅에 삭제·신고·차단 액션을 제공한다", () => {
		expect(source).toContain("deleteChatRoom");
		expect(source).toContain("삭제");
		expect(source).toContain("신고");
		expect(source).toContain("차단");
	});
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** — 각 방 항목에 케밥/RowActions: 삭제(`deleteChatRoom` 뮤테이션), 신고(기존 `ReportDialog`, targetType `chat_room`), 차단(기존 `blocks.blockUser`, 상대 userId). 셋 다 성공 시 `listMine` invalidate(삭제/신고/차단→소프트삭제로 숨김). 신고/차단은 상대 userId 필요(방의 counterpart). 목록 항목이 현재 `<button>`(열기)이므로, 클릭 영역과 액션 메뉴가 겹치지 않게 배치(액션 버튼 `stopPropagation`).

- [ ] **Step 4: 통과 확인** — Step 1 PASS. check-types(web)·ultracite 클린.

- [ ] **Step 5: 커밋** — `feat(chat): 채팅 목록에 삭제·신고·차단 액션(소프트삭제)`

### Task C8: 운영자 채팅 관리 프로시저 (listChatsForModeration / hardDeleteChatRoom)

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Test: `packages/api/src/routers/bambi/moderation-management.test.ts` (또는 신규 `moderation-chats.test.ts`)

**Interfaces — Produces:**
- `listChatsForModeration() -> Array<{ chatRoomId; jobPostTitle; employerUserId; employerName; jobSeekerUserId; jobSeekerName; isBlocked; isDeleted; isReported; lastMessageAt }>` (adminProcedure)
- `hardDeleteChatRoom({ chatRoomId: string; reason: string }) -> { ok: true }` (adminProcedure)

- [ ] **Step 1: api 실패 테스트** — admin 컨텍스트 픽스처 + 채팅 fixture(chats.test.ts 패턴 재사용). 케이스:
  - 삭제/차단/신고된 방이 `listChatsForModeration`에 나온다(정상 방은 안 나옴).
  - `hardDeleteChatRoom` 후 `chat_room`·`chat_message` 행 삭제 + `admin_moderation_action`에 `action` 로그 1건.
  - 비admin → `FORBIDDEN`.
  - 사유 1자 → 검증 에러(BAD_REQUEST).

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현** (`adminProcedure` 신규 방식):
  - `listChatsForModeration`: `chat_room`에서 `isBlocked OR seekerDeletedAt IS NOT NULL OR employerDeletedAt IS NOT NULL` 또는 `report`(targetType `chat_room`/`chat_message`가 해당 방/메시지 참조) 있는 방 join → 참여자 이름·공고 제목·상태 플래그·최근 메시지 시각.
  - `hardDeleteChatRoom`: 사유 `min(2)`. 트랜잭션 delete 순서 `chat_message_read_receipt` → `chat_attachment` → `chat_message` → `interview_schedule` → `chat_room`(FK 준수) + `admin_moderation_action` insert(targetType `chat_room`, targetId chatRoomId, action `hard_delete`, reason).

- [ ] **Step 4: 통과 확인** — PASS. check-types(api) 통과.

- [ ] **Step 5: 커밋** — `feat(moderation): 운영자 채팅 목록 조회·하드삭제 프로시저`

### Task C9: 운영자 채팅 관리 페이지 + nav

**Files:**
- Create: `apps/web/src/app/moderator/chats/page.tsx`
- Create: `apps/web/src/app/moderator/chats/page.test.ts`
- Modify: `apps/web/src/app/moderator/layout.tsx` ("회원 관리" 그룹에 채팅)
- Modify: `apps/web/src/app/moderator/layout.test.ts` (채팅 nav 단정 추가)

**Consumes:** C8 `listChatsForModeration`/`hardDeleteChatRoom`, `DataTable`, `RowActions`, `setUserStatus` 대상 회원 상세 링크.

- [ ] **Step 1: 소스 스캔 실패 테스트** — `chats/page.test.ts`

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
describe("운영자 채팅 관리 페이지", () => {
	it("삭제·차단·신고 채팅을 DataTable로 렌더한다", () => {
		expect(source).toContain("listChatsForModeration");
		expect(source).toContain("DataTable");
	});
	it("RowActions에 하드삭제와 회원 상세 이동을 제공한다", () => {
		expect(source).toContain("hardDeleteChatRoom");
		expect(source).toContain("/moderator/users/");
	});
});
```
layout.test.ts에 추가: `expect(source).toContain('label: "채팅"')` 및 `expect(source).toContain("/moderator/chats")`.

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**
  - `layout.tsx` "회원 관리" 그룹(16–24)에 `{ href: "/moderator/chats" as Route, label: "채팅" }` 추가.
  - `chats/page.tsx`: `jobs/page.tsx` 패턴 복제. 컬럼(공고/구인자/구직자/상태 배지/최근 시각), RowActions([삭제(destructive, 사유 Dialog→`hardDeleteChatRoom`), 구직자 상세 href, 구인자 상세 href]). 로딩 Skeleton, 빈 상태 Empty. 상태 배지는 라벨 맵 경유(삭제됨/차단됨/신고됨).

- [ ] **Step 4: 통과 확인** — Step 1 + layout.test.ts PASS. check-types(web)·ultracite 클린.

- [ ] **Step 5: 커밋** — `feat(moderation): 운영자 채팅 관리 페이지·nav 추가`

### Task C10: reveal 폐기 정리

**Files:**
- Delete: `apps/web/src/app/seeker/chats/[id]/reveal/page.tsx`
- Delete: `apps/web/src/components/bambi/screens/contact-reveal.tsx`
- Modify: `apps/web/src/app/seeker/chats/[id]/page.tsx` (reveal 라우팅 제거)
- Modify: `packages/api/src/routers/bambi/chats.ts` (`revealContact`/`getContactReveal` 제거)
- Modify: `packages/api/src/routers/bambi/chats.test.ts` (옛 reveal/consent 테스트·잔존 import 제거)
- Modify: `packages/api/src/services/bambi-policy.ts` (+ `bambi-policy.test.ts`) — `canRevealContact`/`canViewCounterpartContact`/`isContactRevealEligibleInterviewStatus` 미사용 시 제거
- Modify: `packages/db/src/schema/bambi.ts` — `contactRevealConsent` 테이블/인덱스 export 제거
- Create: `packages/db/src/migrations/00NN_*.sql` + meta — `DROP TABLE "contact_reveal_consent";`

- [ ] **Step 1: 참조 스캔** — `getContactReveal`/`revealContact`/`contactRevealConsent`/`contact-reveal`/`/reveal` grep으로 잔존 참조 확인. 제거 순서: 먼저 코드(프로시저·페이지·테스트·정책)에서 모든 참조를 없앤 뒤 마지막에 스키마 테이블을 제거해야 타입체크가 유지된다.

- [ ] **Step 2: 코드 정리** — reveal 페이지·`contact-reveal.tsx` 삭제 + `[id]/page.tsx` reveal push 제거(C5에서 채팅방 버튼은 이미 교체됨; 래퍼의 `onReveal`/route 제거). chats.ts에서 `revealContact`/`getContactReveal` 제거. chats.test.ts에서 잔존 옛 테스트/`contactRevealConsent` import 제거. bambi-policy.ts 미사용 함수 + 정책 테스트 케이스 제거.

- [ ] **Step 3: 스키마 테이블 제거 + drop 마이그레이션** — 위 코드 참조가 0이 된 것을 확인한 뒤 `bambi.ts`에서 `contactRevealConsent` 정의 제거 → `pnpm --filter @bambi-app/db db:generate`(Expected: `DROP TABLE "contact_reveal_consent";`, 비대화형) → `db:migrate` → `SELECT to_regclass('public.contact_reveal_consent');`가 NULL인지 검증.

- [ ] **Step 4: 전체 검증** — `pnpm check-types`(unpiped, 전 패키지 EXIT 0). `chats.test.ts`, `bambi-policy.test.ts` PASS. `pnpm dlx ultracite fix` 클린.

- [ ] **Step 5: 커밋** — `refactor(chat): 옛 연락처 공개(reveal) 페이지·라우터·정책·테이블 제거`

---

## 워크스트림 간 의존성 (실행 순서)
- **A, B는 C와 완전 독립**(병렬).
- **C는 C0(스키마) 필수 선행** → 이후 C1/C2/C3(모두 chats.ts·chats.test.ts 공유 → 같은 파일이므로 순차 권장), C4(독립), C6(공고 상세, C3 서버 의존), C8(moderation.ts 독립), C9(C8 의존), C5(C1/C3/C4 의존), C7(C2 의존), C10(마지막 정리, C5 이후).
- **같은 파일 동시 편집 주의**: `chats.ts`(C1·C2·C3·C10), `chats.test.ts`(C1·C2·C3), `seeker-chat-room-responsive.tsx`(A3·C5) → 동일 파일 태스크는 직렬화.

## 검증 게이트 (각 커밋 전)
- 해당 태스크 테스트 PASS.
- `pnpm check-types`(unpiped 또는 `${PIPESTATUS[0]}`로 exit 확인) — 변경 패키지 통과.
- `pnpm dlx ultracite fix` 클린(cognitive complexity ≤ 20: 큰 렌더 분기는 헬퍼 추출).
- 빌드/dev 서버 기동 금지.

## 최종 통합 검증 (전체 완료 후)
- `pnpm check-types` 전 패키지 EXIT 0.
- 변경된 api 테스트(chats, banned-words, moderation-management, media-policy) + web 소스 스캔 테스트 전부 PASS.
- C0 마이그레이션 컬럼 실재 재확인.
