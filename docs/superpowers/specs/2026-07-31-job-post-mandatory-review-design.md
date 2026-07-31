# 공고 등록 금칙어 적용 · 전수 검수 큐 설계

/ 2026-07-31

## 목표

공고 등록·수정을 **예외 없이 운영자 검수 큐**로 보내고, 운영자가 승인/반려를 판단할 재료를
검수 화면에 갖춘다. 재료는 두 가지다 — 본문에서 **어떤 금칙어가 걸렸는지**, 본문 없이 이미지로만
등록된 공고의 **상세 이미지**.

## 현재 상태

| 영역 | 현재 |
| --- | --- |
| 금칙어(`banned_word`) | 운영자가 `/moderator/banned-words`에서 관리. `assertNoBannedWords`가 커뮤니티 글·댓글, 고객센터 문의만 검사해 위반 시 `BAD_REQUEST`로 **차단**. 공고에는 **미적용** |
| 공고 위험어 | `["미성년","성매매","강요"]`가 `jobs.ts`(`RISKY_TERMS`), `bambi-job-description-blocks.ts`(`JOB_DESCRIPTION_RISKY_TERMS`), `moderator-context.tsx`(`RISKY_BLOCK_TERMS`) **3곳에 하드코딩 중복** |
| 등록 시 상태 | `getInitialJobPostStatus` — 위험어가 있으면 `pending_review`, 없고 업소가 `verified`면 **즉시 `published`** |
| 수정 시 상태 | `getUpdatedJobPostStatus` — `published`가 아니면 그대로, 공개 내용이 바뀌어도 `verified` 업소면 `published` 유지 |
| 감지 결과 | `job_post.risk_flags`에 `["risky_term"]` 한 값. **어떤 단어가 걸렸는지 저장하지 않음** |
| 검수 큐 화면 | `/moderator`(`QueueList`) + `/moderator/queue/[id]`(`QueueDetail`). "감지 문구"에 `riskFlagLabel` 결과와 `"이미지 3개"` 같은 미디어 요약이 **한 배열에 섞여** 표시되고, 그 배열을 그대로 `HiText`의 하이라이트 대상으로 넘겨 **본문에서 아무것도 강조되지 않음** |
| 검수 화면 이미지 | 표시하지 않음. `listJobPosts`가 `mediaCount`·`hasCoverImage` 숫자/불리언만 내려줌 |

## 결정 사항

1. **금칙어 히트는 차단이 아니라 검수 플래그.** 어차피 모든 공고가 검수를 거치므로 등록은
   성공시키고 운영자가 승인/반려를 판단한다. 커뮤니티·고객센터의 기존 차단 동작은 그대로 둔다.
2. **수정도 무조건 재검수.** 내용 변경 여부와 무관하게 저장하면 `pending_review`로 내려간다.
   단 운영자 자신의 편집은 예외(아래 3-3).
3. **하드코딩 위험어 3개는 금칙어 DB로 흡수.** 코드 상수를 삭제하고 목록의 진실원을
   `banned_word` 한 곳으로 모은다.

## 1. 데이터 모델

`job_post`에 컬럼 하나를 추가한다.

```
detected_terms jsonb not null default '[]'::jsonb
```

- `risk_flags`: **왜** 검수인가(코드). 금칙어 히트 시 `["banned_word"]`.
- `detected_terms`: **어떤 단어**인가(매칭된 원문 배열, 예: `["성매매","보도"]`).

두 컬럼을 나누는 이유: `riskFlagLabel()`은 코드→한글 라벨 맵이라 임의 단어가 들어오면
"정책 확인 필요"로 폴백된다. 또한 검수 화면의 본문 하이라이트(`HiText`)는 **본문에 실재하는
문자열**을 받아야 동작하므로, 라벨이 아닌 원문을 별도로 보관해야 한다.

기존 행 백필은 하지 않는다(이미 게시된 공고는 그대로 둔다). 마이그레이션은 컬럼 추가와
위험어 3개 시드 두 가지를 담는다.

### 위험어 시드

`banned_word`는 `normalized_term`에 유니크 인덱스가 걸려 있고, 정규화 규칙은
`normalizeForMatch`(소문자화 + `[\s\p{P}\p{S}]` 제거)다. 세 단어는 공백·구두점이 없어
정규화형이 원문과 같다. `created_by_user_id`가 `user`를 참조하는 NOT NULL이므로, 시드는
가장 먼저 만들어진 `admin` 역할 사용자를 소유자로 넣고 그런 사용자가 없으면 아무것도
넣지 않는다(마이그레이션이 실패하지 않게).

```sql
insert into banned_word (term, normalized_term, is_active, created_by_user_id)
select t.term, t.term, true, u.user_id
from (values ('미성년'), ('성매매'), ('강요')) as t(term)
cross join (
  select user_id from bambi_profile where role = 'admin' order by created_at asc limit 1
) as u
on conflict (normalized_term) do nothing;
```

마이그레이션 파일은 `pnpm db:generate`로 컬럼 DDL을 생성한 뒤 위 시드 SQL을 같은 파일에
이어 붙인다. `db:push`는 쓰지 않는다.

## 2. 금칙어 검사를 공고에 적용

### 2-1. 서비스 — 복수 히트 수집

`packages/api/src/services/bambi-banned-words.ts`에 추가한다.

```ts
export const findBannedTerms = (
  text: string,
  entries: BannedWordEntry[]
): string[] => { /* 매칭되는 모든 term을 등록 순서대로, 중복 없이 */ };

export const detectBannedTerms = async (fields: string[]): Promise<string[]> =>
  /* getActiveBannedWords() 캐시를 쓰고, 필드별 결과를 합쳐 중복 제거 */;
```

기존 `findBannedTerm`(첫 히트 하나)과 `assertNoBannedWords`(차단)는 커뮤니티·고객센터가
쓰므로 **그대로 둔다**. 공고는 "전부 모아서 보여주고 통과시키는" 성격이라 별도 함수가 맞다.
운영자가 한 번에 모든 히트를 보고 판단해야 하므로 첫 히트에서 멈추지 않는다.

정규화 규칙(`normalizeForMatch`)은 공백을 지우므로 인접 단어가 붙어 우연히 금칙어를 이루는
오탐이 있을 수 있다. 이는 기존 커뮤니티 검사와 동일한 성질이며, 공고에서는 차단이 아니라
플래그이므로 부작용이 더 작다(운영자가 승인하면 그만).

### 2-2. 검사 대상 텍스트

현재 `hasRiskFlags`가 조립하던 텍스트를 그대로 쓴다.

- 제목(`title`)
- 본문 — 블록이 있으면 블록 평문 조립본(`toPlainJobDescription`), 없으면 `description`
- 면접 메모(`interviewNotes`)
- 광고 배너 문구 — `collectLayoutModerationText(finalLayout)`(가로·세로 두 슬롯 + 블록별
  문구 + 읽기 순서 조립본). 저장될 레이아웃만 검사하는 기존 규칙 유지

### 2-3. 하드코딩 상수 제거

| 파일 | 조치 |
| --- | --- |
| `packages/api/src/routers/bambi/jobs.ts` | `RISKY_TERMS`와 `hasRiskFlags()` 삭제. `prepareJobPostContent`가 `detectBannedTerms`를 호출해 `detectedTerms: string[]`를 반환하도록 변경(`hasRiskFlags: boolean` 필드를 대체) |
| `packages/api/src/services/bambi-job-description-blocks.ts` | `JOB_DESCRIPTION_RISKY_TERMS`와 `getJobDescriptionBlockRiskTerms()` 삭제. `JobDescriptionBlockValidationResult.riskTerms` 필드도 제거 |
| `apps/web/src/components/bambi/screens/moderator-context.tsx` | `RISKY_BLOCK_TERMS`와 `getBlockRiskMatches()` 삭제 — 서버가 `detectedTerms`를 내려주므로 클라이언트 재계산이 불필요 |

`prepareJobPostContent`가 비동기가 되므로(`detectBannedTerms`가 DB 캐시 조회) 호출부 두 곳
(`applyJobPostUpdate`, `create` 핸들러)에 `await`를 붙인다. 두 곳 모두 이미 async 함수 안이다.

## 3. 무조건 검수 큐

### 3-1. 등록

`getInitialJobPostStatus`는 인자 두 개를 받아 항상 `"pending_review"`를 반환하게 되므로
**함수째 삭제**하고, `create` 핸들러에서 `status: "pending_review"`를 직접 쓴다.
`bambi-policy.test.ts`의 해당 테스트 3건도 함께 제거한다.

무료 공고(유료 노출상품 미선택)의 `paymentStatus: "paid"`는 그대로 둔다 — 결제 게이트와
검수 게이트는 별개이며, 검수 승인 시점에 노출된다. `publishedAt`은 등록 시 `null`이고
운영자 승인(`setJobPostStatus`)에서 채워진다(기존 동작).

### 3-2. 수정

`getUpdatedJobPostStatus`를 단순화한다.

```ts
// draft는 아직 제출 전이므로 검수 대상이 아니다. 그 밖의 모든 상태
// (published·hidden·rejected·pending_review)는 저장 즉시 검수 대기로 내려간다.
export const getUpdatedJobPostStatus = ({
  currentStatus,
}: { currentStatus: JobPostStatus }): JobPostStatus =>
  currentStatus === "draft" ? "draft" : "pending_review";
```

`employerVerificationStatus`·`publicContentChanged` 인자는 더 이상 쓰이지 않으므로 제거하고,
`applyJobPostUpdate`에서 `publicContentChanged`를 계산하던 코드도 함께 지운다.

수정으로 게시가 내려갈 때 `publishedAt`은 **유지**한다(재승인 시 원래 게시 시각을 잃지 않게).
노출 정렬 키가 `greatest(boosted_at, published_at)`이므로 값을 지우면 재승인 후 정렬이
망가진다.

### 3-3. 운영자 편집은 예외

`moderation.adminUpdateJobPost`도 같은 `applyJobPostUpdate`를 탄다. 운영자가 승인 직전
오타를 고칠 때마다 자기 큐로 되돌아오거나, 게시 중인 공고를 손봤다고 노출에서 내려가면
안 된다. `applyJobPostUpdate`에 플래그를 추가한다.

```ts
export const applyJobPostUpdate = async ({
  actorUserId,
  data,
  existing,
  keepStatus = false, // 운영자 편집: 검수 상태를 그대로 둔다
}) => { ... }
```

`keepStatus`가 참이면 `status`는 `existing.status`를 유지한다. `detectedTerms`·`riskFlags`는
운영자 편집에서도 새로 계산해 갱신한다(운영자가 문제 문구를 지웠다면 플래그도 사라져야 한다).

## 4. 검수 화면

### 4-1. 감지 문구를 정확히

`QueueItem`(`apps/web/src/lib/bambi/types.ts`)에서 서로 다른 두 정보를 분리한다.

```ts
export interface QueueItem {
  // ...
  detected: string[];        // 금칙어 원문만 (본문 하이라이트 대상)
  mediaSummaries: string[];  // "대표 이미지 포함", "이미지 3개" 등 구성 요약
}
```

`toApiQueueItem`(`moderator-context.tsx`)에서:

- `detected` ← 서버 `detectedTerms` 그대로. 클라이언트 재계산 없음
- `mediaSummaries` ← 기존 `getQueueMediaSummaries` 결과
- `flags` ← 금칙어 플래그(`sev: "review"`) + 구성 요약(`sev: "ok"`)으로 지금처럼 조립하되,
  금칙어가 없으면 `{ label: "검수 대기", match: "감지된 문구 없음", sev: "ok" }` 하나
- `riskLevel` ← 금칙어 히트가 있으면 `"mid"`, 없으면 `"low"`

무조건 검수 체제에서는 감지 0건 공고가 다수가 되므로, `QueueRow`의 "감지 문구" 줄은
`detected`가 비면 **"감지된 문구 없음 · 정상 등록 건"**으로 표시한다. 큐 목록의 위험도
필터·정렬(`QueueFilterRow`)이 그대로 작동해 운영자가 위험 건부터 처리할 수 있다.

`HiText`에 넘기는 `terms`가 이제 본문에 실재하는 원문이므로 하이라이트가 실제로 걸린다.

`listJobPosts`(`moderation.ts`)의 select에 `detectedTerms: jobPost.detectedTerms`를 추가한다.
`ApiQueueItem` 인터페이스에도 `detectedTerms: string[]`를 더한다.

`moderation-labels.ts`의 `RISK_FLAG_LABELS`에 새 코드의 라벨을 추가한다 —
`banned_word: "금칙어 감지"`. 기존 `risky_term`·`needs_review` 키는 과거 데이터가 남아 있으므로
그대로 둔다(enum 원값이 화면에 새지 않게 하는 기존 규칙).

### 4-2. 상세 이미지 열람

`/moderator/queue/[id]`에서 `moderation.getJobPostForAdmin`을 조회한다. 이 프로시저는 이미
존재하며(`adminProcedure`) `getJobPostMediaSet(post.id)` 결과(cover / detail[] / 배너 2종)를
그대로 내려주므로 **서버 변경이 없다**. 큐 목록 쿼리(50건)는 건드리지 않는다 — 이미지가
필요한 건 상세 한 건뿐이라 목록에 미디어 조인을 붙일 이유가 없다.

`QueueDetail`에 이미지 섹션을 추가한다.

- 대표 이미지 + 상세 이미지들을 그리드로 배치. URL은 `jobMediaPublicUrl(storageKey)`
- 이미지 클릭 시 `Dialog`로 원본 확대
- 로딩 중에는 `Skeleton`, 이미지가 없으면 섹션 자체를 숨김

`QueueDetail`은 현재 순수 표시 컴포넌트이므로, 데이터 조회는 페이지(`page.tsx`)에서 하고
`media` prop으로 내려준다(테스트 가능성·관심사 분리 유지).

### 4-3. 본문 없이 이미지만 등록된 공고

본문(`item.desc`)이 비어 있고 이미지가 있으면:

- 본문 자리에 `Alert`로 **"본문 없음 · 이미지로만 등록된 공고"** 안내
- 이미지 섹션을 본문 위치로 올려 운영자가 바로 내용을 확인

본문이 있으면 기존처럼 본문(하이라이트 포함)을 먼저 보이고 이미지 섹션을 뒤에 둔다.

## 건드리지 않는 것

- 공고 등록 폼(`/employer/new`) — 금칙어가 차단이 아니므로 UI 변경이 필요 없다. 안내 문구는
  이미 "등록하면 검수를 거쳐 공개됩니다"라 무조건 검수와 일치한다
- 커뮤니티·고객센터의 금칙어 **차단** 동작
- 이미 `published`인 공고(마이그레이션 백필 없음)
- 크롤링 공고(`crawled_job_post`) — 우리 공고 등록 경로가 아니다

## 테스트

| 대상 | 검증 |
| --- | --- |
| `bambi-banned-words.test.ts` | `findBannedTerms`가 여러 히트를 중복 없이 모으고, 정규화(공백·구두점 삽입) 우회를 잡고, 히트 없으면 빈 배열 |
| `bambi-policy.test.ts` | `getUpdatedJobPostStatus`가 `draft`는 유지하고 `published`·`hidden`·`rejected`를 `pending_review`로. `getInitialJobPostStatus` 관련 3건 제거 |
| `jobs` 라우터 테스트 | ① 금칙어 없는 공고도 `status = "pending_review"`, ② `verified` 업소도 즉시 게시되지 않음, ③ 금칙어 포함 시 `riskFlags = ["banned_word"]` + `detectedTerms`에 원문, ④ 등록 자체는 성공(에러 없음) |
| `moderation` 라우터 테스트 | `adminUpdateJobPost`가 `published` 공고의 상태를 유지하고(`keepStatus`), `detectedTerms`는 재계산 |
| 웹 정적 테스트 | `moderator-context`에 `RISKY_BLOCK_TERMS`가 없고, `QueueDetail`이 `jobMediaPublicUrl`을 쓰는지 소스 단언(기존 `visual-job-components.test.ts` 패턴) |

## 마이그레이션 운영 메모

`pnpm db:generate`로 파일을 만든 뒤 시드 SQL을 이어 붙이고, 적용(`pnpm db:migrate`)은
**사용자의 명시 지시가 있을 때만** 실행한다. `db:push`는 사용하지 않는다.
