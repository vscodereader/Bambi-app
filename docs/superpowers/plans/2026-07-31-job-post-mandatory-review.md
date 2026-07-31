# 공고 등록 금칙어 · 전수 검수 큐 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공고 등록·수정을 예외 없이 운영자 검수 큐로 보내고, 운영자 관리 금칙어를 공고에 적용해 감지된 문구와 상세 이미지를 검수 화면에서 확인할 수 있게 한다.

**Architecture:** 감지 결과를 `job_post.risk_flags`(왜 검수인가 — 코드)와 새 컬럼 `detected_terms`(어떤 단어인가 — 원문)로 나눠 저장한다. 하드코딩 위험어 3중 복제를 `banned_word` 테이블 한 곳으로 흡수하고, 상태 결정 함수를 "항상 검수"로 단순화한다. 검수 화면은 이미 존재하는 `getJobPostForAdmin`을 상세에서만 호출해 이미지를 얻는다(목록 쿼리 무변경).

**Tech Stack:** pnpm 모노레포 / drizzle-orm + PostgreSQL / oRPC + zod / Next.js RSC + TanStack Query / shadcn(base-ui) + Tailwind v4 / vitest

## Global Constraints

- **DB 적용 금지:** `pnpm db:push`는 절대 실행하지 않는다. `pnpm db:generate`로 마이그레이션 파일만 만들고, `pnpm db:migrate` 적용은 **사용자의 명시 지시가 있을 때만** 실행한다.
- **빌드·dev 서버 금지:** `pnpm build`·`pnpm dev`를 실행하지 않는다. 시각 확인은 사용자가 HMR로 한다.
- **커밋 훅 이슈(2026-07-31 현재):** `lefthook.exe`가 Windows 애플리케이션 제어 정책에 차단돼 `git commit`이 실패한다. 컨트롤러(메인 세션)가 커밋을 담당하며, 서브에이전트는 **git 명령을 실행하지 않는다**.
- **린트:** 커밋 전 `pnpm dlx ultracite fix <변경 파일 경로들>`. 경로 인자를 반드시 준다(생략하면 0개 파일 검사).
- **UI 규칙:** shadcn 컴포넌트 최대 재사용, 인라인 `style` 금지, `rounded-none` 금지, 임의 px(`[16px]`) 대신 Tailwind 스케일 토큰. 콜아웃은 `Alert`, 로딩은 `Skeleton`, 배지는 `Badge`. base-ui이므로 커스텀 트리거는 `asChild`가 아니라 `render` prop.
- **enum 원값 노출 금지:** DB enum·코드값을 화면에 그대로 렌더하지 않는다. `lib/bambi/moderation-labels.ts`의 라벨 맵을 경유하고, 새 코드값에는 라벨을 동반한다.
- **의존성 추가 금지:** 새 npm 패키지를 설치하지 않는다.
- **테스트 실행 위치:** 워크트리 안에서 실행한다(리포 루트에서 경로 필터로 vitest를 돌리면 다른 워크트리까지 스캔한다).
- **라우터 테스트는 dev DB 의존:** `packages/api/src/routers/bambi/*.test.ts`는 실제 개발 DB에 붙는다. 새 컬럼을 쓰는 라우터 테스트는 마이그레이션 적용 전까지 통과할 수 없으므로, Task 8에서 사용자 지시 후에만 실행한다.

## 파일 구조

| 파일 | 책임 | 변경 |
| --- | --- | --- |
| `packages/db/src/schema/bambi.ts` | `job_post.detectedTerms` 컬럼 정의 | 수정 |
| `packages/db/src/migrations/0057_*.sql` | 컬럼 추가 DDL + 위험어 3개 시드 | 생성 |
| `packages/api/src/services/bambi-banned-words.ts` | 금칙어 매칭 단일 진실원. 복수 히트 수집 추가 | 수정 |
| `packages/api/src/services/bambi-policy.ts` | 공고 상태 결정 규칙 | 수정 |
| `packages/api/src/services/bambi-job-description-blocks.ts` | 블록 검증. 위험어 계산 제거 | 수정 |
| `packages/api/src/routers/bambi/jobs.ts` | 등록·수정 시 금칙어 감지·상태 확정 배선 | 수정 |
| `packages/api/src/routers/bambi/moderation.ts` | 검수 큐 목록에 `detectedTerms`, 운영자 편집 상태 유지 | 수정 |
| `apps/web/src/lib/bambi/types.ts` | `QueueItem`에 `mediaSummaries` 분리 | 수정 |
| `apps/web/src/lib/bambi/moderation-labels.ts` | `banned_word` 라벨 | 수정 |
| `apps/web/src/components/bambi/screens/moderator-context.tsx` | 서버 응답 → `QueueItem` 변환. 클라이언트 위험어 재계산 제거 | 수정 |
| `apps/web/src/components/bambi/screens/moderator.tsx` | `QueueRow` 감지 문구 표기, `QueueDetail` 이미지 섹션 | 수정 |
| `apps/web/src/app/moderator/queue/[id]/page.tsx` | 상세 미디어 조회 후 `QueueDetail`에 전달 | 수정 |

---

### Task 1: `detected_terms` 컬럼과 위험어 시드 마이그레이션

**Files:**
- Modify: `packages/db/src/schema/bambi.ts:618` (`riskFlags` 정의 바로 아래)
- Create: `packages/db/src/migrations/0057_<drizzle가 붙이는 이름>.sql`

**Interfaces:**
- Produces: `jobPost.detectedTerms` — drizzle 컬럼, TS 타입 `string[]`, 기본값 `[]`

- [ ] **Step 1: 스키마에 컬럼 추가**

`packages/db/src/schema/bambi.ts`의 `jobPost` 테이블에서 `riskFlags` 줄 바로 아래에 넣는다.

```ts
		riskFlags: jsonb("risk_flags").$type<string[]>().default([]).notNull(),
		// 검수에 걸린 금칙어 원문. risk_flags가 "왜"(코드)라면 이 칸은 "어떤 단어"다.
		// 운영자 화면이 본문에서 이 문자열을 그대로 찾아 강조하므로 라벨이 아닌 원문을 담는다.
		detectedTerms: jsonb("detected_terms").$type<string[]>().default([]).notNull(),
```

- [ ] **Step 2: 마이그레이션 파일 생성**

Run: `pnpm db:generate`
Expected: `packages/db/src/migrations/0057_*.sql`이 생기고 안에
`ALTER TABLE "job_post" ADD COLUMN "detected_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;`가 들어 있다.
`meta/0057_snapshot.json`과 `meta/_journal.json`도 함께 갱신된다.

- [ ] **Step 3: 시드 SQL을 같은 파일에 이어 붙이기**

생성된 `0057_*.sql` 파일 **맨 끝**에 추가한다. `banned_word.created_by_user_id`가
`user`를 참조하는 NOT NULL이므로 소유자가 필요하다. admin이 한 명도 없는 환경(빈 DB)에서도
마이그레이션이 실패하지 않도록 `cross join`이 0행이면 아무것도 넣지 않는다.

```sql
--> statement-breakpoint
-- 기존에 코드로 하드코딩돼 있던 공고 위험어를 운영자 금칙어 목록으로 옮긴다.
-- 세 단어 모두 공백·구두점이 없어 normalizeForMatch 결과가 원문과 같다.
-- admin 사용자가 없는 환경에서는 소유자를 정할 수 없으므로 시드를 건너뛴다.
INSERT INTO "banned_word" ("term", "normalized_term", "is_active", "created_by_user_id")
SELECT t.term, t.term, true, u.user_id
FROM (VALUES ('미성년'), ('성매매'), ('강요')) AS t(term)
CROSS JOIN (
	SELECT "user_id" FROM "bambi_profile" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
) AS u
ON CONFLICT ("normalized_term") DO NOTHING;
```

- [ ] **Step 4: 타입 체크**

Run: `pnpm --filter @bambi-app/db check-types`
Expected: exit 0

- [ ] **Step 5: 마이그레이션은 적용하지 않는다**

`pnpm db:migrate`를 실행하지 **않는다**. 사용자 지시 대기(Task 8).

- [ ] **Step 6: 커밋 (컨트롤러가 수행)**

```
feat: 공고 감지 문구 컬럼·위험어 금칙어 시드

- job_post.detected_terms jsonb 추가 — risk_flags(왜)와 분리해 걸린 금칙어 원문을 담는다
- 하드코딩 위험어 3개(미성년·성매매·강요)를 banned_word 시드로 이관, admin 부재 시 건너뜀
```

---

### Task 2: 금칙어 복수 감지 서비스

**Files:**
- Modify: `packages/api/src/services/bambi-banned-words.ts`
- Test: `packages/api/src/services/bambi-banned-words.test.ts`

**Interfaces:**
- Consumes: 기존 `normalizeForMatch(text): string`, `BannedWordEntry { term, normalizedTerm }`, `getActiveBannedWords(): Promise<BannedWordEntry[]>`
- Produces:
  - `findBannedTerms(text: string, entries: BannedWordEntry[]): string[]` — 순수 함수
  - `detectBannedTerms(fields: string[]): Promise<string[]>` — 캐시 조회 포함

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/services/bambi-banned-words.test.ts`의 동적 import 목록에 `findBannedTerms`를
추가하고(9~11행), 파일 끝에 describe 블록을 더한다.

```ts
const { findBannedTerm, findBannedTerms, normalizeForMatch } = await import(
	"./bambi-banned-words"
);
```

```ts
describe("findBannedTerms", () => {
	const entries = [entry("성매매"), entry("미성년"), entry("보도")];

	it("걸린 단어를 모두 모은다", () => {
		expect(findBannedTerms("미성년 성매매 알선", entries)).toEqual([
			"성매매",
			"미성년",
		]);
	});

	it("같은 단어가 여러 번 나와도 한 번만 담는다", () => {
		expect(findBannedTerms("보도 보도 보도", entries)).toEqual(["보도"]);
	});

	it("공백·구두점으로 끊어 쓴 우회도 잡는다", () => {
		expect(findBannedTerms("성 매.매 합니다", entries)).toEqual(["성매매"]);
	});

	it("걸리는 단어가 없으면 빈 배열이다", () => {
		expect(findBannedTerms("주말 홀서빙 구합니다", entries)).toEqual([]);
	});

	it("금칙어 목록이 비면 빈 배열이다", () => {
		expect(findBannedTerms("성매매", [])).toEqual([]);
	});

	it("빈 텍스트는 빈 배열이다", () => {
		expect(findBannedTerms("", entries)).toEqual([]);
	});
});
```

반환 순서는 `entries` 순서를 따른다(위 첫 테스트에서 "성매매"가 "미성년"보다 앞).

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-banned-words.test.ts`
Expected: FAIL — `findBannedTerms is not a function`

- [ ] **Step 3: 구현**

`bambi-banned-words.ts`의 `findBannedTerm` 정의 바로 아래에 추가한다.

```ts
// 공고 검수용. 첫 히트에서 멈추는 findBannedTerm과 달리 걸린 단어를 전부 모은다 —
// 운영자가 한 화면에서 모든 히트를 보고 승인/반려를 판단해야 하기 때문이다.
export const findBannedTerms = (
	text: string,
	entries: BannedWordEntry[]
): string[] => {
	if (entries.length === 0) {
		return [];
	}

	const normalizedText = normalizeForMatch(text);

	if (normalizedText.length === 0) {
		return [];
	}

	return entries
		.filter(
			(candidate) =>
				candidate.normalizedTerm.length > 0 &&
				normalizedText.includes(candidate.normalizedTerm)
		)
		.map((candidate) => candidate.term);
};
```

파일 끝(`assertNoBannedWords` 아래)에 추가한다.

```ts
// 공고 등록·수정 경로. 커뮤니티처럼 차단하지 않고 감지 결과만 돌려준다 —
// 모든 공고가 운영자 검수를 거치므로 판단은 사람이 한다.
export const detectBannedTerms = async (
	fields: string[]
): Promise<string[]> => {
	const entries = await getActiveBannedWords();
	const detected = new Set<string>();

	for (const field of fields) {
		for (const term of findBannedTerms(field, entries)) {
			detected.add(term);
		}
	}

	return [...detected];
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-banned-words.test.ts`
Expected: PASS (기존 `normalizeForMatch`·`findBannedTerm` 테스트 포함 전부)

- [ ] **Step 5: 린트**

Run: `pnpm dlx ultracite fix packages/api/src/services/bambi-banned-words.ts packages/api/src/services/bambi-banned-words.test.ts`
Expected: exit 0

- [ ] **Step 6: 커밋 (컨트롤러가 수행)**

```
feat: 금칙어 복수 감지 — findBannedTerms·detectBannedTerms

- 첫 히트에서 멈추는 findBannedTerm과 별개로 걸린 단어를 전부 모으는 경로 추가(공고 검수용)
- 커뮤니티·고객센터가 쓰는 assertNoBannedWords 차단 동작은 그대로 유지
```

---

### Task 3: 공고 상태 규칙을 "항상 검수"로 단순화

**Files:**
- Modify: `packages/api/src/services/bambi-policy.ts:40-49, 84-117`
- Test: `packages/api/src/services/bambi-policy.test.ts:14-75`

**Interfaces:**
- Produces: `getUpdatedJobPostStatus({ currentStatus }): JobPostStatus`
- 삭제: `getInitialJobPostStatus`, `InitialJobPostStatusInput`

- [ ] **Step 1: 테스트를 새 규칙으로 교체**

`bambi-policy.test.ts`에서 `getInitialJobPostStatus` import를 지우고, 그 함수를 쓰는 테스트
3건("publishes verified employer posts immediately", "keeps unverified employer posts pending
review", "keeps risky verified employer posts pending review")을 삭제한다. 기존
`getUpdatedJobPostStatus` 테스트도 인자가 바뀌므로 아래로 교체한다.

```ts
	it("공개 중 공고를 수정하면 검수 대기로 내린다", () => {
		expect(getUpdatedJobPostStatus({ currentStatus: "published" })).toBe(
			"pending_review"
		);
	});

	it("숨김·반려 공고를 수정해도 검수 대기로 보낸다", () => {
		expect(getUpdatedJobPostStatus({ currentStatus: "hidden" })).toBe(
			"pending_review"
		);
		expect(getUpdatedJobPostStatus({ currentStatus: "rejected" })).toBe(
			"pending_review"
		);
	});

	it("임시 저장은 제출 전이라 그대로 둔다", () => {
		expect(getUpdatedJobPostStatus({ currentStatus: "draft" })).toBe("draft");
	});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-policy.test.ts`
Expected: FAIL — 타입 오류 또는 `getUpdatedJobPostStatus`가 `published`를 그대로 반환

- [ ] **Step 3: 구현**

`bambi-policy.ts`에서 `InitialJobPostStatusInput` 인터페이스(40~43행)와
`getInitialJobPostStatus` 함수(84~97행)를 **삭제**한다. `UpdatedJobPostStatusInput`을
아래로 바꾸고 함수도 교체한다.

```ts
interface UpdatedJobPostStatusInput {
	currentStatus: JobPostStatus;
}
```

```ts
// 공고는 등록도 수정도 예외 없이 운영자 검수를 거친다. 업소 인증 여부나 내용 변경 여부로
// 검수를 건너뛰면, 승인된 본문을 나중에 갈아끼우는 우회가 열린다.
// draft만 예외다 — 아직 제출되지 않은 임시 저장이라 검수 대상이 아니다.
export const getUpdatedJobPostStatus = ({
	currentStatus,
}: UpdatedJobPostStatusInput): JobPostStatus =>
	currentStatus === "draft" ? "draft" : "pending_review";
```

`EmployerVerificationStatus` 타입 자체는 다른 곳에서 쓰이므로 남긴다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-policy.test.ts`
Expected: PASS

- [ ] **Step 5: 린트**

Run: `pnpm dlx ultracite fix packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-policy.test.ts`
Expected: exit 0

- [ ] **Step 6: 커밋 (컨트롤러가 수행)**

`jobs.ts`가 아직 `getInitialJobPostStatus`를 import하므로 이 시점에는 타입 체크가 깨진다.
Task 4와 **함께 커밋**한다.

---

### Task 4: 등록·수정 경로 배선

**Files:**
- Modify: `packages/api/src/routers/bambi/jobs.ts:100-104(import), 229-233, 331-351, 385-421, 690-810, 1660-1700`
- Modify: `packages/api/src/services/bambi-job-description-blocks.ts:19-23, 38-44, 67-83, 118-127`
- Test: `packages/api/src/services/bambi-job-description-blocks.test.ts:41, 134`

**Interfaces:**
- Consumes: `detectBannedTerms(fields: string[]): Promise<string[]>` (Task 2), `getUpdatedJobPostStatus({ currentStatus })` (Task 3)
- Produces: `applyJobPostUpdate({ actorUserId, data, existing, keepStatus? })` — `keepStatus` 기본값 `false`

- [ ] **Step 1: 블록 서비스에서 위험어 계산 제거**

`bambi-job-description-blocks.ts`에서 다음을 **삭제**한다.
- `JOB_DESCRIPTION_RISKY_TERMS` 상수(19~23행)
- `getJobDescriptionBlockRiskTerms` 함수(67~83행)
- `JobDescriptionBlockValidationResult`의 `riskTerms: string[]` 필드(43행)
- `validateJobDescriptionBlocks` 반환값의 `riskTerms:` 줄(125행)

- [ ] **Step 2: 블록 서비스 테스트 갱신**

`bambi-job-description-blocks.test.ts`에서 기대값의 `riskTerms: []`(41행)와
`riskTerms: ["미성년", "강요", "성매매"]`(134행)를 삭제한다. 134행이 있던 테스트가
위험어 수집만 검증하는 케이스라면 테스트 자체를 삭제한다 — 그 책임은
`bambi-banned-words.test.ts`의 `findBannedTerms`로 옮겨갔다.

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/bambi-job-description-blocks.test.ts`
Expected: PASS

- [ ] **Step 3: jobs.ts에서 하드코딩 위험어 제거하고 금칙어로 교체**

import를 정리한다(100~104행). `getInitialJobPostStatus`를 빼고,
`getJobDescriptionBlockRiskTerms` import도 제거한 뒤 `detectBannedTerms`를 추가한다.

```ts
import { detectBannedTerms } from "../../services/bambi-banned-words";
import {
	type EmployerVerificationStatus,
	getUpdatedJobPostStatus,
	type JobPostStatus,
} from "../../services/bambi-policy";
```

`RISKY_TERMS` 상수와 `hasRiskFlags` 함수(331~351행)를 **삭제**한다.

`PreparedJobPostContent`(229~233행)의 `hasRiskFlags: boolean`을 바꾼다.

```ts
interface PreparedJobPostContent {
	description: string;
	descriptionBlocks: NonNullable<JobPostInput["descriptionBlocks"]>;
	// 걸린 금칙어 원문. 비어 있으면 감지 없음(그래도 검수는 거친다).
	detectedTerms: string[];
}
```

`prepareJobPostContent`(387~421행)를 async로 바꾸고 금칙어 검사로 교체한다.

```ts
// 배너 문구도 구직자에게 노출되는 문구다. 실제로 저장될 레이아웃을 넘겨받아 본문과 같은
// 금칙어 검사를 태운다 — 버려질 문구로 공고가 검수에 걸리지는 않게 한다.
const prepareJobPostContent = async (
	input: JobPostInput,
	adBannerLayout: unknown
): Promise<PreparedJobPostContent> => {
	const descriptionBlocks = input.descriptionBlocks ?? [];
	const validation = validateJobDescriptionBlocks(descriptionBlocks);

	if (!validation.ok) {
		throw new ORPCError("BAD_REQUEST", {
			message: getJobPostPolicyErrorMessage(validation.issues[0]?.code ?? ""),
		});
	}

	const normalizedBlocks = normalizeJobDescriptionBlocks(descriptionBlocks);
	const description =
		normalizedBlocks.length > 0
			? toPlainJobDescription(normalizedBlocks)
			: input.description.trim();

	return {
		description,
		descriptionBlocks: normalizedBlocks,
		// 가로·세로 두 배너 슬롯을 모두 훑고 블록 조립본을 함께 넘긴다 — 한쪽 슬롯만 보면
		// 반대 슬롯이 빠져나가고, 블록별로만 보면 "미성"과 "년"을 나란히 놓아 배너에는
		// "미성년"으로 보이는 조합이 검사를 통과한다.
		detectedTerms: await detectBannedTerms([
			input.title,
			description,
			input.interviewNotes ?? "",
			collectLayoutModerationText(adBannerLayout),
		]),
	};
};
```

- [ ] **Step 4: `applyJobPostUpdate`에 `keepStatus` 추가**

`jobs.ts:690`의 시그니처와 상태 계산부(768~807행)를 바꾼다. `publicContentChanged`를
계산하던 코드가 있으면 함께 지운다.

```ts
export const applyJobPostUpdate = async ({
	actorUserId,
	data,
	existing,
	// 운영자 편집(moderation.adminUpdateJobPost) 전용. 운영자가 승인 직전 오타를 고칠 때마다
	// 자기 큐로 되돌아오거나, 게시 중인 공고가 노출에서 내려가면 안 된다.
	keepStatus = false,
}: {
	actorUserId: string;
	data: JobPostInput;
	existing: typeof jobPost.$inferSelect;
	keepStatus?: boolean;
}) => {
```

(기존 파라미터 타입 표기가 다르면 그 형태를 유지하고 `keepStatus`만 더한다.)

상태·플래그 계산은 이렇게 바꾼다.

```ts
	const preparedContent = await prepareJobPostContent(data, finalLayout);
```

```ts
	const status: JobPostStatus = keepStatus
		? (existing.status as JobPostStatus)
		: getUpdatedJobPostStatus({
				currentStatus: existing.status as JobPostStatus,
			});
```

`update` set 절에서 `riskFlags`와 `publishedAt`을 다음으로 바꾼다.

```ts
				riskFlags: preparedContent.detectedTerms.length > 0 ? ["banned_word"] : [],
				detectedTerms: preparedContent.detectedTerms,
				// 재검수로 내려가도 게시 시각은 지우지 않는다. 노출 정렬 키가
				// greatest(boosted_at, published_at)이라 지우면 재승인 후 정렬이 깨진다.
				publishedAt: existing.publishedAt,
```

- [ ] **Step 5: `create` 핸들러를 무조건 검수로**

`jobs.ts:1660~1700`을 바꾼다.

```ts
			const preparedContent = await prepareJobPostContent(input, finalLayout);
```

```ts
			// 공고는 예외 없이 운영자 검수를 거친다. 업소 인증 여부로 건너뛰지 않는다.
			const status: JobPostStatus = "pending_review";
```

insert values에서:

```ts
						status,
						riskFlags: preparedContent.detectedTerms.length > 0 ? ["banned_word"] : [],
						detectedTerms: preparedContent.detectedTerms,
```

`publishedAt: status === "published" ? now : null`은 항상 `null`이 되므로
`publishedAt: null`로 바꾸고, 그 결과 쓰이지 않게 된 `const now = new Date();`가 있으면
다른 용도가 없는지 확인 후 제거한다.

`organizationProfile`은 여전히 존재 검증(FORBIDDEN)에 쓰이므로 조회를 남긴다.
`EmployerVerificationStatus` import가 이 파일에서 더 이상 쓰이지 않으면 제거한다.

- [ ] **Step 6: 타입 체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: exit 0 — `getInitialJobPostStatus`·`getJobDescriptionBlockRiskTerms` 참조가
남아 있으면 여기서 잡힌다.

- [ ] **Step 7: 순수 함수 테스트 회귀 확인**

Run: `pnpm --filter @bambi-app/api exec vitest run src/services/`
Expected: PASS (DB에 붙지 않는 서비스 테스트만 실행)

- [ ] **Step 8: 린트**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/jobs.ts packages/api/src/services/bambi-job-description-blocks.ts packages/api/src/services/bambi-job-description-blocks.test.ts packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-policy.test.ts`
Expected: exit 0

- [ ] **Step 9: 커밋 (컨트롤러가 수행 — Task 3과 합쳐서)**

```
feat: 공고 등록·수정 전수 검수 — 금칙어 감지로 교체

- 등록은 업소 인증 여부와 무관하게 항상 pending_review, getInitialJobPostStatus 삭제
- 수정도 무조건 재검수(draft만 유지), getUpdatedJobPostStatus를 currentStatus 하나로 단순화
- 운영자 편집은 keepStatus로 상태 유지 — 승인 직전 수정이 자기 큐로 되돌아오지 않게
- 하드코딩 RISKY_TERMS·getJobDescriptionBlockRiskTerms 제거하고 운영자 금칙어(detectBannedTerms)로 일원화
- 감지 결과를 riskFlags(["banned_word"])와 detectedTerms(원문)로 나눠 저장, 재검수 시 publishedAt 보존
```

---

### Task 5: 검수 큐 API — 감지 문구 노출·운영자 편집 예외

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts:950-994(listJobPosts), 1022-1050(adminUpdateJobPost)`

**Interfaces:**
- Consumes: `applyJobPostUpdate({ ..., keepStatus })` (Task 4)
- Produces: `listJobPosts` 응답에 `detectedTerms: string[]`

- [ ] **Step 1: 목록 select에 감지 문구 추가**

`moderation.ts`의 `listJobPosts` select(970행 `riskFlags` 아래)에 넣는다.

```ts
					riskFlags: jobPost.riskFlags,
					detectedTerms: jobPost.detectedTerms,
```

- [ ] **Step 2: 운영자 편집은 상태를 유지**

`adminUpdateJobPost` 핸들러의 `applyJobPostUpdate` 호출에 플래그를 넘긴다.

```ts
				const result = await applyJobPostUpdate({
					actorUserId: admin.userId,
					data: input.data,
					existing,
					// 운영자 편집은 검수 상태를 바꾸지 않는다. 게시 중 공고를 손봤다고
					// 노출에서 내려가거나, 승인 직전 오타 수정이 큐로 되돌아오면 안 된다.
					keepStatus: true,
				});
```

- [ ] **Step 3: 타입 체크**

Run: `pnpm --filter @bambi-app/api check-types`
Expected: exit 0

- [ ] **Step 4: 린트**

Run: `pnpm dlx ultracite fix packages/api/src/routers/bambi/moderation.ts`
Expected: exit 0

- [ ] **Step 5: 커밋 (컨트롤러가 수행)**

```
feat: 검수 큐 API — 감지 문구 노출·운영자 편집 상태 유지

- listJobPosts 응답에 detectedTerms 추가(검수 화면 본문 강조·감지 문구 표기용)
- adminUpdateJobPost는 keepStatus로 검수 상태를 그대로 둔다
```

---

### Task 6: 검수 큐 데이터 변환 — 감지 문구와 구성 요약 분리

**Files:**
- Modify: `apps/web/src/lib/bambi/types.ts:131-146`
- Modify: `apps/web/src/lib/bambi/moderation-labels.ts:55-64`
- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx:79-94, 127-210`

**Interfaces:**
- Consumes: `listJobPosts` 응답의 `detectedTerms: string[]` (Task 5)
- Produces: `QueueItem.detected`(금칙어 원문만), `QueueItem.mediaSummaries`(구성 요약)

- [ ] **Step 1: `QueueItem`에 필드 분리**

`apps/web/src/lib/bambi/types.ts`의 `QueueItem`을 바꾼다.

```ts
export interface QueueItem {
	company: string;
	desc: string;
	// 본문에 실재하는 금칙어 원문만 담는다 — HiText가 이 문자열을 본문에서 찾아 강조한다.
	detected: string[];
	flags: QueueFlag[];
	id: string;
	location: string;
	// "대표 이미지 포함", "이미지 3개" 같은 구성 요약. 감지 문구와 섞으면
	// "감지 문구 "이미지 3개""가 되고 강조도 걸리지 않는다.
	mediaSummaries: string[];
	pay: string;
	receivedAt: string;
	refId: string;
	risk: Severity;
	riskLevel: RiskLevel;
	role: string;
	submitted: string;
	title: string;
}
```

- [ ] **Step 2: 새 위험 코드 라벨 추가**

`apps/web/src/lib/bambi/moderation-labels.ts`의 `RISK_FLAG_LABELS`에 넣는다.

```ts
const RISK_FLAG_LABELS: Record<string, string> = {
	// 과거 데이터에 남아 있는 코드들(원값이 화면에 새지 않게 유지한다).
	needs_review: "검수 대기",
	risky_term: "위험 표현 감지",
	banned_word: "금칙어 감지",
};
```

- [ ] **Step 3: 변환 로직에서 클라이언트 재계산 제거**

`moderator-context.tsx`에서 `RISKY_BLOCK_TERMS` 상수와 `getBlockRiskMatches` 함수
(127~146행)를 **삭제**한다. 서버가 `detectedTerms`를 내려주므로 클라이언트가 같은 규칙을
다시 구현할 이유가 없다.

`ApiQueueItem` 인터페이스에 필드를 추가한다.

```ts
interface ApiQueueItem {
	createdAt: Date | string;
	description: string;
	descriptionBlocks: { text: string }[];
	detectedTerms: string[];
	hasCoverImage: boolean;
	id: string;
	industryCategory: string;
	mediaCount: number;
	organizationDisplayName: string;
	payAmount: null | number;
	payUnit: string;
	region: string;
	riskFlags: string[];
	status: string;
	title: string;
}
```

`toApiQueueItem`(156~210행)을 교체한다.

```ts
const toApiQueueItem = (item: ApiQueueItem): QueueItem => {
	const mediaSummaries = getQueueMediaSummaries(item);
	const detected = item.detectedTerms;
	const hasDetection = detected.length > 0;
	const detectionFlags = hasDetection
		? [
				{
					label: riskFlagLabel(item.riskFlags[0] ?? "banned_word"),
					match: detected.join(", "),
					sev: "review" as const,
				},
			]
		: [
				{
					label: jobPostStatusLabel(item.status),
					match: "감지된 문구 없음",
					sev: "ok" as const,
				},
			];
	const mediaFlags = mediaSummaries.map((summary) => ({
		label: "공고 구성",
		match: summary,
		sev: "ok" as const,
	}));

	return {
		company: item.organizationDisplayName,
		desc: item.description,
		detected,
		flags: [...detectionFlags, ...mediaFlags],
		id: item.id,
		location: item.region,
		mediaSummaries,
		pay:
			item.payAmount === null
				? NEGOTIABLE_PAY_TEXT
				: `${item.payUnit} ${item.payAmount.toLocaleString("ko-KR")}원`,
		receivedAt: formatDate(item.createdAt),
		refId: `#${item.id.slice(0, 8)}`,
		// 무조건 검수 체제에서는 감지 0건이 다수다. 위험도로 갈라 두면 운영자가
		// 큐 필터·정렬로 감지 건부터 처리할 수 있다.
		risk: hasDetection ? "review" : "ok",
		riskLevel: hasDetection ? "mid" : "low",
		role: item.industryCategory,
		submitted: formatDate(item.createdAt),
		title: item.title,
	};
};
```

`Severity`는 `"block" | "review" | "warn" | "ok"`이므로 위 값이 그대로 유효하다.
`descriptionBlocks`는 여전히 `getQueueMediaSummaries`가 개수를 세는 데 쓰므로 인터페이스에
남긴다.

- [ ] **Step 4: 타입 체크**

Run: `pnpm --filter web check-types`
Expected: exit 0 — `mediaSummaries` 누락이나 `Severity` 불일치가 여기서 잡힌다.
(메인 리포의 낡은 `.next` 캐시로 오탐이 날 수 있으니 반드시 워크트리 안에서 실행한다.)

- [ ] **Step 5: 린트**

Run: `pnpm dlx ultracite fix apps/web/src/lib/bambi/types.ts apps/web/src/lib/bambi/moderation-labels.ts apps/web/src/components/bambi/screens/moderator-context.tsx`
Expected: exit 0

- [ ] **Step 6: 커밋 (컨트롤러가 수행)**

```
feat: 검수 큐 감지 문구와 구성 요약 분리

- QueueItem.detected는 금칙어 원문만, 미디어 요약은 mediaSummaries로 분리 — 본문 강조가 실제로 걸리게
- 클라이언트 위험어 재계산(RISKY_BLOCK_TERMS·getBlockRiskMatches) 제거, 서버 detectedTerms 사용
- 감지 0건은 "감지된 문구 없음"으로 표기하고 riskLevel low로 내려 큐 정렬에서 감지 건이 앞에 오게
- risk_flags 코드 banned_word 라벨 추가(enum 원값 노출 금지)
```

---

### Task 7: 검수 화면 — 감지 문구 표기와 상세 이미지 열람

**Files:**
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx:431-441(QueueRow), 527-623(QueueDetail)`
- Modify: `apps/web/src/app/moderator/queue/[id]/page.tsx`

**Interfaces:**
- Consumes: `QueueItem.detected`, `QueueItem.mediaSummaries` (Task 6), `orpc.bambi.moderation.getJobPostForAdmin` (기존)
- Produces: `QueueDetail`가 `media?: QueueDetailMedia` prop을 받는다

```ts
export interface QueueDetailMediaItem {
	altText: string;
	storageKey: string;
}
export interface QueueDetailMedia {
	cover: QueueDetailMediaItem | null;
	detail: QueueDetailMediaItem[];
}
```

- [ ] **Step 1: `QueueRow`의 감지 문구 표기**

`moderator.tsx:431-441`의 감지 문구 줄을 바꾼다. 감지가 없을 때 `""`만 남아 빈 따옴표가
찍히던 문제를 없앤다.

```tsx
				<div className={cn("text-[12.5px] leading-[1.45]", subFg)}>
					{q.detected.length > 0 ? (
						<>
							<span>감지 문구 </span>
							<span
								className={cn(
									"font-bold",
									dark ? "text-white" : "text-[color:var(--text-default)]"
								)}
							>
								{q.detected.map((d) => `"${d}"`).join(", ")}
							</span>
						</>
					) : (
						<span>감지된 문구 없음 · 정상 등록 건</span>
					)}
				</div>
```

- [ ] **Step 2: `QueueDetail`에 이미지 섹션 추가**

`moderator.tsx` 상단 import에 추가한다. 이미지는 `job-cover-image.tsx`와 같은
`next/image` + `unoptimized` 패턴을 쓴다(공개 GCS 버킷 객체라 최적화 파이프라인을 태우지
않는다). 단 `JobCoverImage` 컴포넌트 자체는 재사용하지 않는다 — 로드 실패 시 샘플 썸네일로
바꿔치기하는 폴백이 있어, 검수 화면에서는 운영자가 남의 샘플 사진을 이 공고의 이미지로
오인할 수 있다.

```tsx
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import Image from "next/image";
import { jobMediaPublicUrl } from "@/lib/bambi/api-job-mapper";
```

`QueueDetail` 위에 이미지 섹션 컴포넌트를 만든다. 확대는 기존 `Sheet`가 아니라 shadcn
`Dialog`를 쓴다(오버레이 z-index를 수동 지정하지 않는다).

```tsx
// 검수용 이미지 열람. 본문 없이 이미지로만 등록된 공고가 있어 운영자가 실제 이미지를
// 봐야 승인/반려를 판단할 수 있다.
function QueueMediaSection({
	isLoading,
	media,
}: {
	isLoading: boolean;
	media?: QueueDetailMedia;
}) {
	const [zoomed, setZoomed] = useState<QueueDetailMediaItem | null>(null);

	if (isLoading) {
		return (
			<div className="grid grid-cols-2 gap-2.5">
				<Skeleton className="aspect-video w-full rounded-xl" />
				<Skeleton className="aspect-video w-full rounded-xl" />
			</div>
		);
	}

	const items = [...(media?.cover ? [media.cover] : []), ...(media?.detail ?? [])];

	if (items.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="font-bold text-[13px] text-foreground">
				공고 이미지 {items.length}장
			</div>
			<div className="grid grid-cols-2 gap-2.5">
				{items.map((item) => (
					<button
						className="relative aspect-video overflow-hidden rounded-xl border border-border bg-secondary p-0"
						key={item.storageKey}
						onClick={() => setZoomed(item)}
						type="button"
					>
						<Image
							alt={item.altText || "공고 이미지"}
							className="object-cover"
							fill
							sizes="(max-width: 768px) 50vw, 320px"
							src={jobMediaPublicUrl(item.storageKey)}
							unoptimized
						/>
					</button>
				))}
			</div>
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setZoomed(null);
					}
				}}
				open={zoomed !== null}
			>
				<DialogContent className="max-w-3xl">
					<DialogTitle>공고 이미지</DialogTitle>
					{zoomed ? (
						<div className="relative h-[70vh] w-full">
							<Image
								alt={zoomed.altText || "공고 이미지"}
								className="rounded-xl object-contain"
								fill
								sizes="768px"
								src={jobMediaPublicUrl(zoomed.storageKey)}
								unoptimized
							/>
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	);
}
```

`fill`을 쓰므로 부모에 `relative`와 높이가 있어야 한다(위 코드에 반영돼 있다).

- [ ] **Step 3: `QueueDetail` 본문 영역 재배치**

`QueueDetail`의 props에 `isMediaLoading`·`media`를 더하고, 본문 블록(579~590행)을 바꾼다.

```tsx
export function QueueDetail({
	item,
	isMediaLoading = false,
	media,
	tone,
	onBack,
	onResolve,
}: {
	item: QueueItem;
	isMediaLoading?: boolean;
	media?: QueueDetailMedia;
	tone: VisualTone;
	onBack: () => void;
	onResolve: (id: string, action: "approve" | "reject") => void;
}) {
```

```tsx
					{item.desc.trim().length > 0 ? (
						<>
							<div>
								<div className="mb-2 font-bold text-[13px] text-foreground">
									공고 본문 · 감지 표현 강조
								</div>
								<div className="rounded-[14px] border border-border bg-secondary p-4">
									<HiText
										level={item.riskLevel}
										terms={item.detected}
										text={item.desc}
									/>
								</div>
							</div>
							<QueueMediaSection isLoading={isMediaLoading} media={media} />
						</>
					) : (
						<>
							{/* 본문이 없으면 이미지가 유일한 판단 재료다 — 위로 올린다. */}
							<div className="flex items-center gap-2 rounded-[14px] bg-secondary px-4 py-3">
								<span className="inline-flex size-[18px] text-muted-foreground">
									<AlertCircle />
								</span>
								<span className="font-bold text-[13px] text-foreground">
									본문 없음 · 이미지로만 등록된 공고
								</span>
							</div>
							<QueueMediaSection isLoading={isMediaLoading} media={media} />
						</>
					)}
```

- [ ] **Step 4: 상세 페이지에서 미디어 조회**

`apps/web/src/app/moderator/queue/[id]/page.tsx`를 바꾼다.

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { ModeratorPaymentPanel } from "@/components/bambi/moderator-payment-panel";
import { QueueDetail } from "@/components/bambi/screens/moderator";
import { useMod } from "@/components/bambi/screens/moderator-context";
import { orpc } from "@/utils/orpc";

export default function ModeratorQueueDetailPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isLoading, queue, resolveQueue } = useMod();
	const item = queue.find((q) => q.id === id);
	// 이미지는 상세에서만 필요하다. 큐 목록(최대 50건)에 미디어 조인을 붙이지 않으려고
	// 여기서 공고 한 건만 따로 읽는다(getJobPostForAdmin은 미디어 세트를 그대로 내려준다).
	const mediaQuery = useQuery({
		...orpc.bambi.moderation.getJobPostForAdmin.queryOptions({
			input: { jobPostId: id },
		}),
		enabled: Boolean(item),
	});

	if (isLoading) {
		return null;
	}

	if (!item) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<p className="m-0 font-bold text-[15px] text-foreground">
					검수 공고를 찾을 수 없어요.
				</p>
				<button
					className="h-10 rounded-xl border border-border bg-card px-4 font-bold text-[13px] text-foreground"
					onClick={() => router.push("/moderator")}
					type="button"
				>
					목록으로
				</button>
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<QueueDetail
				isMediaLoading={mediaQuery.isPending}
				item={item}
				media={{
					cover: mediaQuery.data?.media.cover ?? null,
					detail: mediaQuery.data?.media.detail ?? [],
				}}
				onBack={() => router.push("/moderator")}
				onResolve={(qid, action) => {
					resolveQueue(qid, action);
					router.push("/moderator");
				}}
				tone="calm"
			/>
			<ModeratorPaymentPanel jobPostId={item.id} />
		</div>
	);
}
```

`getJobPostForAdmin`의 `media`는 `toJobPostMediaSet`이 만드는
`{ adHorizontal, adVertical, cover, detail }`이고 각 항목은 `job_post_media` 행 전체라
`storageKey`·`altText`가 들어 있다. 배너 두 슬롯은 검수 본문 판단과 무관하므로 넘기지 않는다.

- [ ] **Step 5: 타입 체크**

Run: `pnpm --filter web check-types`
Expected: exit 0

- [ ] **Step 6: 린트**

Run: `pnpm dlx ultracite fix apps/web/src/components/bambi/screens/moderator.tsx "apps/web/src/app/moderator/queue/[id]/page.tsx"`
Expected: exit 0

- [ ] **Step 7: 웹 정적 테스트 회귀 확인**

Run: `pnpm --filter web exec vitest run src/components/bambi src/lib/bambi`
Expected: PASS. 기존 실패로 알려진 `src/lib/bambi-job-blocks.test.ts`(8MB 이미지) 1건은
이 범위 밖이며 이번 변경과 무관하다.

- [ ] **Step 8: 커밋 (컨트롤러가 수행)**

```
feat: 검수 화면 감지 문구 표기·상세 이미지 열람

- QueueRow는 감지가 없으면 빈 따옴표 대신 "감지된 문구 없음 · 정상 등록 건"
- QueueDetail에 이미지 그리드 추가(클릭 시 Dialog 확대), 상세에서만 getJobPostForAdmin 조회
- 본문이 없는 이미지 전용 공고는 안내를 띄우고 이미지를 본문 자리로 올린다
```

---

### Task 8: 마이그레이션 적용과 라우터 회귀 (사용자 지시 필요)

**Files:** 없음 (실행·검증만)

**Interfaces:**
- Consumes: Task 1의 마이그레이션 파일

- [ ] **Step 1: 사용자에게 적용 여부를 확인받는다**

`pnpm db:migrate`는 개발 DB 스키마를 실제로 바꾸므로 **사용자의 명시 지시 없이 실행하지
않는다**. 지시가 없으면 여기서 멈추고 보고한다.

- [ ] **Step 2: 마이그레이션 적용 (지시가 있을 때만)**

Run: `pnpm db:migrate`
Expected: `0057_*` 적용 성공

- [ ] **Step 3: 적용 검증**

Run: `pnpm --filter @bambi-app/db exec drizzle-kit check`
Expected: 스키마와 마이그레이션이 어긋나지 않음

- [ ] **Step 4: 라우터 회귀 테스트**

Run: `pnpm --filter @bambi-app/api exec vitest run src/routers/bambi`
Expected: 이번 변경으로 인한 새 실패 없음. 알려진 dev DB 의존 기저 실패 3건은
변경 전과 동일한 목록인지 대조한다(새로 늘어났으면 원인을 조사한다).

- [ ] **Step 5: 사용자 시각 확인 요청**

HMR로 다음을 확인해 달라고 요청한다.
1. 구인자로 공고 등록 → 목록에서 바로 노출되지 않고 `/moderator` 검수 큐에 뜬다
2. 금칙어를 본문에 넣고 등록 → 등록은 성공하고, 큐 행에 `감지 문구 "..."`가 뜬다
3. 검수 상세에서 본문의 해당 단어가 강조된다
4. 본문 없이 이미지만 넣은 공고 → 상세에 "본문 없음" 안내와 이미지가 보이고 클릭하면 확대된다
5. 승인하면 게시되고, 그 공고를 수정하면 다시 검수 대기로 내려간다

## 실행 순서 메모

- Task 3과 Task 4는 함께 커밋한다(Task 3만 적용하면 `jobs.ts`가 삭제된 함수를 참조해 타입 체크가 깨진다).
- Task 1~5는 서버, Task 6~7은 웹이라 서로 독립적으로 검증되지만, Task 6은 Task 5의 `detectedTerms` 응답에 의존하므로 순서를 지킨다.
- 모든 커밋은 컨트롤러가 순차로 수행한다. 서브에이전트는 파일 수정과 테스트 실행만 한다.
