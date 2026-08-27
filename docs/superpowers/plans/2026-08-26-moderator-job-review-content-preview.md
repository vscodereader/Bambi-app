# 운영자 공고 검수 본문·상세 이미지 실제 노출 형태 미리보기 계획

**Goal:** 운영자가 공고 검수 상세에서 구인자가 작성한 구조화 본문과 상세 이미지를 실제 공개 공고에 노출되는 형태와 크기로 확인할 수 있게 한다.

**Architecture:** 공고 등록·수정 경계에서 `description`을 기본 상세설명으로 보존하고 `descriptionBlocks`는 추가 구조화 블록으로 별도 저장한다. 기존 데이터는 `description === toPlainJobDescription(descriptionBlocks)`인 경우 구버전 블록 평문으로 판정해 중복 표시하지 않는다. `moderation.getJobPostForAdmin`이 이미 반환하는 `description`, `descriptionBlocks`, `media`를 사용하고, 공개 공고 화면 안에 로컬로 들어 있는 본문·상세 이미지 렌더러를 공용 컴포넌트로 추출해 공개 화면과 운영자 검수 화면이 같은 코드를 사용하게 한다. 운영자 본문은 shadcn `Accordion`으로 기본 접힘 상태를 제공하고, 상세 이미지 확대 화면은 공개 공고와 같은 콘텐츠 폭·원본 비율로 렌더링하면서 기존 `Dialog`의 내부 세로 스크롤을 사용한다. DB·Drizzle migration·oRPC 입력·응답 스키마 변경은 없다.

**Tech Stack:** Next.js App Router, React 19, TypeScript, TanStack Query, shadcn/base-ui, Tailwind CSS, Vitest, Ultracite.

---

## 배경과 확인된 원인

구인자가 공고 등록 화면에서 기본 상세설명과 구조화 블록(문단·제목·목록·강조)을 함께 입력해도 현재 등록 경계는 둘을 모두 보존하지 않는다.

- `job_post.description`: 블록이 하나라도 있으면 `toPlainJobDescription(descriptionBlocks)`로 덮어쓴다. 이 과정에서 사용자가 별도 입력한 기본 상세설명은 저장되지 않는다.
- `job_post.description_blocks`: 블록의 `id`, `type`, `text`를 보존한 구조화 데이터.

따라서 스크린샷의 기본 상세설명인 `사람 구해요...`가 공개 공고와 관리자 검수 양쪽에서 실제로 유실된 것이 맞다. 공개 공고 상세는 `descriptionBlocks`가 있으면 블록 타입별 UI만 렌더링하고 `description`을 표시하지 않는다. 운영자 검수 상세는 반대로 목록용 `QueueItem.desc`에 담긴 블록 합성 평문만 `HiText`로 출력한다. 즉 1번 문제는 저장 경계와 양쪽 표시 경계를 함께 고쳐야 해결된다.

운영자 이미지 확대 화면은 대표 이미지와 상세 이미지를 한 목록에 합친 뒤, 고정 `70vh` 상자 안에서 `fill + object-contain`으로 렌더링한다. 이 때문에 세로로 긴 상세 이미지가 한 화면에 전부 들어가도록 지나치게 축소된다. 공고 공개 화면은 상세 이미지를 본문 폭에 맞춰 `h-auto w-full`로 렌더링하므로 두 화면의 표시 방식이 다르다.

---

## 확정 요구사항

- 운영자 검수 상세에 `공고 내용` 아코디언을 추가한다.
- 아코디언의 최초 상태는 접힘이며, 운영자가 펼치고 다시 접을 수 있다.
- 펼친 본문은 구인자가 등록한 순서와 블록 타입을 보존한다.
  - 기본 상세설명을 가장 먼저 일반 본문으로 표시한다.
  - 그 뒤에 문단·제목·목록·강조 블록을 작성 순서대로 표시한다.
  - 제목은 공개 공고와 같은 제목 위계와 굵기로 표시한다.
  - 목록은 공개 공고와 같은 불릿 목록으로 표시한다.
  - 강조는 공개 공고와 같은 강조 박스로 표시한다.
- 공개 공고와 운영자 검수 화면은 별도 복제 렌더러를 두지 않고 같은 공용 구조화 본문 컴포넌트를 사용한다.
- 구조화 블록이 없는 기존 공고는 `description` 평문을 줄바꿈을 보존해 표시한다.
- 구버전 공고에서 `description`이 구조화 블록의 평문 합성본과 같으면 기본 상세설명으로 다시 표시하지 않는다. 블록과 같은 내용이 두 번 보이지 않아야 한다.
- 새로 등록·수정하는 공고는 기본 상세설명과 구조화 블록을 모두 보존한다. 금칙어 감지는 두 축을 합친 실제 노출 전체를 검사한다.
- `공고 본문 · 감지 표현 강조` 영역은 서버가 실제 감지한 문구가 있을 때만 표시한다. 감지 문구가 없으면 아코디언과 같은 평문을 중복 노출하지 않는다.
- 대표 이미지와 상세 이미지는 기존처럼 `공고 이미지 N장` 한 줄 썸네일 그리드에 함께 표시한다. 기존 검수 화면의 배치·크롭·순서를 유지하고 확대 화면에만 실제 노출 크기 규칙을 적용한다.
- 상세 이미지 확대 화면은 공개 공고의 본문 이미지와 동일하게 다음 규칙을 따른다.
  - 콘텐츠 영역의 사용 가능한 폭에 맞춘다.
  - 이미지 원본 종횡비를 유지한다.
  - `object-cover`로 자르거나 `object-contain`으로 한 화면에 강제 축소하지 않는다.
  - 세로로 긴 이미지가 뷰포트보다 길면 모달 내부에 우측 세로 스크롤바가 생긴다.
  - 모바일에서는 같은 내부 영역을 손가락으로 세로 스크롤할 수 있다.
- 이미지 썸네일 선택, 모달 열기·닫기, 승인·보류·반려, 감지 신호, 결제 정보 등 기존 검수 기능은 유지한다.
- 하드코딩된 별도 본문 스타일이나 이미지 크기 값을 새로 만들지 않고 기존 공개 공고 스타일과 공용 UI를 재사용한다.
- DB 스키마와 데이터 마이그레이션은 변경하지 않는다. 이미 유실된 구버전 공고의 기본 상세설명은 복구할 원본이 없으므로 소급 생성하지 않는다.

---

## 범위

### 포함

- 구조화 공고 본문 표시 컴포넌트 공용화.
- 공고 등록·수정 시 기본 상세설명과 구조화 블록을 각각 보존하도록 Web·API 정규화 수정.
- 기존 공고의 블록 합성 평문 중복 표시 방지.
- 공개 공고 상세를 공용 본문 컴포넌트 사용으로 전환하되 기존 화면 결과 유지.
- 운영자 검수 단건 조회 결과의 `description`과 `descriptionBlocks` 배선.
- 운영자 검수 상세의 기본 접힘 `공고 내용` 아코디언.
- 기존 대표·상세 이미지 통합 썸네일 그리드 배치 유지.
- 상세 이미지 모달의 실제 공고 폭·비율 렌더링과 내부 스크롤.
- 데스크톱·모바일 반응형 및 키보드 접근성 검증.
- 관련 회귀 테스트와 문서 검증 결과 기록.

### 제외

- 공고 작성·수정 폼의 블록 종류나 입력 UX 변경.
- DB 저장 컬럼 추가, 검수 상태 전이 변경.
- 이미지 업로드 정책, 파일 개수·용량·MIME 제한 변경.
- 대표 이미지의 공개 공고 카드/히어로 표시 방식 변경.
- 운영자가 검수 화면에서 본문이나 이미지를 직접 수정하는 기능.
- Native 앱의 별도 운영자 검수 화면.

---

## 데이터 흐름

```text
공고 작성·수정 입력
  ├─ description: 기본 상세설명
  └─ descriptionBlocks: 추가 구조화 블록
            │
            ▼
Web validateJobForm + API prepareJobPostContent
  ├─ description을 덮어쓰지 않고 별도 보존
  ├─ descriptionBlocks 정규화·별도 보존
  └─ 기본 상세설명 + 블록 합성본 전체를 금칙어 검사
            │
            ▼
job_post.description / job_post.description_blocks / job_post_media
                         │
                         ├─ moderation.listJobPosts
                         │    └─ description + descriptionBlocks
                         │         → 검수용 전체 평문 조합
                         │
                         └─ moderation.getJobPostForAdmin
                              ├─ description
                              ├─ descriptionBlocks
                              └─ media.cover / media.detail
                                      │
                                      ▼
                         moderator/queue/[id]/page.tsx
                              ├─ 공고 내용 Accordion
                              │    └─ 공용 구조화 본문 렌더러
                              └─ QueueMediaSection
                                   ├─ 대표/상세 썸네일
                                   └─ 상세 이미지 Dialog 내부 스크롤
```

관리자 단건 조회는 `.select()`로 공고 전체 필드를 반환하므로 API나 DB에 필드를 추가하지 않는다. 목록 조회의 `descriptionBlocks`는 구성 요약(`상세 블록 N개`)과 감지 표현 전체 평문 조합에 사용하고, 실제 미리보기 데이터는 이미 상세 페이지에서 호출하는 `getJobPostForAdmin` 결과를 사용한다. 이렇게 해야 최대 50건인 검수 목록에 상세 미디어 렌더링 책임을 추가하지 않는다.

### 구버전 호환 판정

기존 공고는 블록이 있으면 `description`에 블록 평문 합성본이 저장돼 있다. 새 표시 로직이 무조건 `description + blocks`를 출력하면 같은 내용이 두 번 보인다. 공용 순수 함수에서 다음 규칙으로 실제 표시 모델을 만든다.

1. 블록이 없으면 `description`만 표시한다.
2. 블록이 있고 `description.trim() === toPlainDescription(descriptionBlocks)`이면 구버전 행으로 판정해 블록만 표시한다.
3. 블록이 있고 두 값이 다르면 새 저장 형식으로 판정해 기본 상세설명 뒤에 블록을 표시한다.

이 판정은 임의 DB 플래그나 날짜를 하드코딩하지 않고 저장된 두 필드의 관계만 사용한다. 이미 유실된 기본 상세설명은 복원할 수 없지만 기존 공개 화면과 같은 블록 내용은 유지하며 중복을 만들지 않는다.

---

## 재사용 설계

### 공용 구조화 본문 렌더러

현재 `seeker-job-detail-responsive.tsx` 내부의 `DescriptionBlock`은 공개 공고의 실제 표현을 소유하지만 화면 로컬 함수라 운영자 화면에서 재사용할 수 없다. 이를 `apps/web/src/components/bambi/job-description-content.tsx`로 추출한다.

공용 컴포넌트와 순수 표시 모델 헬퍼가 소유할 책임:

- `description`과 `JobDescriptionBlock[]`을 함께 입력으로 받는다.
- 구버전 호환 판정으로 기본 상세설명의 표시 여부를 결정한다.
- 표시 대상 기본 상세설명을 첫 문단으로 렌더링한 뒤 `heading`, `bullet_list`, `callout`, `paragraph`를 현재 공개 화면과 동일하게 렌더링한다.
- 블록이 없으면 `description`의 사용자 개행을 보존한다.
- 블록 순서와 각 블록의 `id`를 그대로 사용한다.
- 이미지·아코디언·검수 상태는 다루지 않는다.

공개 공고와 운영자 검수 화면은 이 컴포넌트를 같은 입력 규칙으로 호출한다. 공개 화면의 기존 `CollapsibleJobDescription`은 뷰포트 기준 `더보기` UX를 위한 별도 책임이므로 유지하고, 그 children만 공용 본문 렌더러로 교체한다. 운영자 화면에서는 요구사항에 맞춰 shadcn `Accordion`이 공용 본문 렌더러를 감싼다.

### 운영자 아코디언

- `@bambi-app/ui/components/accordion`의 `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`를 사용한다.
- `defaultValue`를 지정하지 않아 최초 접힘으로 둔다.
- 단일 항목의 value는 의미 있는 고정 식별자를 사용한다.
- 트리거는 `공고 내용`과 블록 수/본문 존재 여부 같은 기존 데이터 기반 보조 정보를 표시할 수 있으나, 사용자 콘텐츠나 공고별 값을 UI 코드에 하드코딩하지 않는다.
- 콘텐츠에는 관리자 단건 조회가 완료된 뒤 공용 본문 렌더러를 표시한다.
- 로딩 중에는 기존 `Skeleton`을 사용하고, 조회 실패 시 빈 본문으로 오인하지 않도록 실패 안내를 표시한다.

### 감지 표현 영역과 실제 미리보기의 분리

현재 `HiText`는 `description` 평문 안에서 `detectedTerms`를 강조한다. 새 저장 형식에서는 `description`이 기본 상세설명만 담으므로, 검수 목록 adapter에서 기본 상세설명과 구조화 블록 평문을 조합한 전체 검수 문자열을 만든 뒤 `HiText`에 전달한다. 단, `detectedTerms`가 비어 있으면 이 영역 자체를 렌더링하지 않아 실제 미리보기와 같은 내용이 두 번 보이지 않게 한다.

- 감지 표현 영역: 실제 감지 문구가 있는 공고에서만 자동 필터 판정 근거 확인.
- `공고 내용` 아코디언: 구직자에게 실제로 보이는 타입·순서·강조 확인.

두 영역이 같은 콘텐츠를 다른 목적으로 보여주더라도, 검수 기능상 필요한 중복으로 유지한다.

### 이미지 검수

`QueueMediaSection`은 기존 화면과 같이 대표 이미지를 먼저, 상세 이미지를 등록 순서대로 이어 붙인 한 배열을 사용한다.

- 썸네일 목록:
  - `공고 이미지 N장` 제목과 `grid-cols-2 lg:grid-cols-3` 배치를 유지한다.
  - 대표 이미지가 첫 번째, 상세 이미지가 그 뒤 등록 순서로 나온다.
  - 모든 썸네일은 기존 `aspect-video`·`object-cover`를 유지한다.
- 확대 화면:
  - 썸네일을 선택하면 Dialog를 연다.
  - Dialog 콘텐츠 폭은 공개 공고 본문 폭과 같은 현재 디자인 경계(`max-w-3xl`)를 재사용한다.
  - 공개 공고의 상세 이미지 렌더링도 공용 `JobDetailImage`로 추출해 동일 컴포넌트를 사용한다.
  - DB에 저장된 실제 `width`/`height` 메타데이터를 우선 사용하고, 메타데이터가 없는 구버전 행만 공개 화면이 현재 사용 중인 fallback 규격을 이름 있는 공용 상수로 재사용한다.
  - 이미지는 `h-auto w-full`로 렌더링한다.
  - 기존 `relative h-[70vh]`, `fill`, `object-contain`을 제거한다.
  - 공용 `DialogContent`가 이미 `max-h-[calc(100dvh-2rem)]`, `overflow-y-auto`, `overscroll-contain`을 제공하므로 별도 스크롤 라이브러리나 CSS를 만들지 않는다.
  - 제목은 스크롤 영역 안에서도 이미지 검수 맥락을 알 수 있도록 유지한다.

상세 이미지가 여러 장이면 썸네일에서 선택한 한 장을 모달에 표시하는 현재 상호작용을 유지한다. 한 이미지가 길 경우 그 한 장을 위에서 아래까지 내부 스크롤해 검수한다.

---

## 파일 변경 계획

| 파일 | 변경 |
|---|---|
| `packages/api/src/services/bambi-job-description-blocks.ts` | 기존 블록 정규화 서비스에 기본 상세설명·블록 조합과 구버전 중복 방지 순수 헬퍼 추가 |
| `apps/web/src/lib/bambi-job-form.ts` | 기본 상세설명을 블록 평문으로 덮어쓰지 않고 두 입력을 모두 제출 |
| `packages/api/src/routers/bambi/jobs.ts` | 기본 상세설명·블록 별도 저장 및 전체 노출 본문 금칙어 검사 |
| `apps/web/src/components/bambi/job-description-content.tsx` | 공개·관리자 공용 기본 상세설명·구조화 블록 렌더러 신규 작성 |
| `apps/web/src/components/bambi/job-detail-image.tsx` | 공개·관리자 공용 상세 이미지 비율 렌더러 신규 작성 |
| `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx` | 로컬 본문·상세 이미지 렌더링을 공용 컴포넌트로 교체 |
| `apps/web/src/components/bambi/screens/moderator-context.tsx` | 기본 상세설명과 블록을 검수용 전체 평문으로 조합 |
| `apps/web/src/app/moderator/queue/[id]/page.tsx` | 관리자 단건 조회의 `description`·`descriptionBlocks`를 `QueueDetail`에 전달 |
| `apps/web/src/components/bambi/screens/moderator.tsx` | 검수 본문 타입·아코디언·로딩/실패 상태 배선, 이미지 usage 분리 및 상세 이미지 스크롤 모달 수정 |
| `packages/api/test/services/bambi-job-description-blocks.test.ts` | 기본 상세설명·블록 표시 모델과 구버전 호환 테스트 추가 |
| `apps/web/test/lib/bambi-job-form.test.ts` | 기본 상세설명과 구조화 블록이 함께 제출되는 회귀 테스트 추가 |
| `packages/api/test/routers/bambi/job-post-media.test.ts` | 기본 상세설명·블록 별도 저장과 전체 금칙어 검사 통합 회귀 테스트 추가 |
| `apps/web/test/components/bambi/job-description-content.test.ts` | 공용 렌더러 정적 마크업 회귀 테스트 신규 작성 |
| `apps/web/test/app/moderator/queue/moderator-job-content-preview.test.ts` | 관리자 상세 데이터 배선·기본 접힘 아코디언·이미지 모달 회귀 테스트 신규 작성 |
| `docs/superpowers/plans/2026-08-26-moderator-job-review-content-preview.md` | 구현 체크박스와 검증 결과 동기화 |

실제 구현 시 최신 코드에서 테스트 디렉터리 관례가 달라졌다면 동일 기능의 가장 가까운 기존 테스트 위치를 따르되, 이 설계서의 파일 표와 검증 기록도 함께 갱신한다.

---

## 구현 계획

### Task 1: 기본 상세설명 유실 수정과 구버전 호환

**Files:**

- Modify: `packages/api/src/services/bambi-job-description-blocks.ts`
- Modify: `apps/web/src/lib/bambi-job-form.ts`
- Modify: `packages/api/src/routers/bambi/jobs.ts`
- Modify: `apps/web/src/components/bambi/screens/moderator-context.tsx`
- Test: `packages/api/test/services/bambi-job-description-blocks.test.ts`
- Test: `apps/web/test/lib/bambi-job-form.test.ts`
- Test: `packages/api/test/routers/bambi/job-post-media.test.ts`

- [x] **Step 1: 기본 상세설명 유실 실패 테스트 작성**

- Web 폼 검증 결과의 `input.description`이 사용자가 입력한 기본 상세설명을 유지한다.
- `input.descriptionBlocks`가 별도 배열로 함께 유지된다.
- API create/update 결과도 두 필드를 각각 보존한다.
- 금칙어가 기본 상세설명 또는 어느 블록에 있든 전체 노출 본문 검사에서 감지된다.

- [x] **Step 2: 구버전 호환 순수 함수 테스트 작성**

- 블록이 없으면 기본 상세설명만 표시한다.
- `description`이 블록 평문 합성본과 같으면 구버전으로 판정해 기본 상세설명을 별도로 표시하지 않는다.
- 두 값이 다르면 기본 상세설명과 블록을 모두 표시한다.
- 앞뒤 공백 차이만으로 새 형식으로 오판하지 않는다.
- 블록 순서와 사용자 개행을 보존한다.

- [x] **Step 3: Web 제출 정규화 수정**

`validateJobForm`은 `description` 유효성 검사를 항상 `form.description.trim()`에 수행하고, `descriptionBlocks`는 별도 정규화한다. 반환 input에도 두 값을 각각 싣는다. 블록이 있다는 이유로 `description`을 `toPlainJobDescription` 결과로 교체하지 않는다.

- [x] **Step 4: API 저장·금칙어 검사 수정**

`prepareJobPostContent`는 `input.description.trim()`을 `description`으로 저장하고 정규화된 블록은 `descriptionBlocks`로 저장한다. `detectBannedTerms`에는 제목, 기본 상세설명, 블록 평문 합성본, 면접 안내, 배너 문구를 모두 전달한다. create와 update가 같은 기존 `prepareJobPostContent`/`applyJobPostUpdate` 경계를 재사용하는지 확인한다.

- [x] **Step 5: 검수 평문 조합 수정**

`moderator-context.tsx`의 `QueueItem.desc`는 새 공고에서도 감지된 블록 문구가 빠지지 않도록 구버전 호환 순수 함수로 기본 상세설명과 블록 평문을 조합한다.

### Task 2: 공용 구조화 본문 렌더러 추출

**Files:**

- Create: `apps/web/src/components/bambi/job-description-content.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Test: `apps/web/test/components/bambi/job-description-content.test.ts`

- [x] **Step 1: 공용 렌더러 실패 테스트 작성**

다음 사례를 검증한다.

- 기본 상세설명이 첫 일반 문단과 사용자 개행을 보존한다.
- `paragraph`가 기본 상세설명 다음의 일반 문단으로 표시된다.
- `heading`이 공개 공고의 `h3` 위계와 강조를 사용한다.
- `bullet_list`가 줄 단위 항목을 불릿 목록으로 렌더링하고 빈 줄을 제외한다.
- `callout`이 공개 공고의 코럴 강조 박스로 렌더링된다.
- 입력 배열 순서가 DOM 순서로 보존된다.
- 블록이 없으면 `description` 평문 fallback과 개행을 표시한다.

- [x] **Step 2: `JobDescriptionContent` 구현**

기존 `DescriptionBlock`의 블록별 마크업과 Tailwind 클래스를 그대로 옮긴다. 새로운 블록 타입이나 관리자 전용 스타일을 추가하지 않는다. 타입은 기존 `JobDescriptionBlock`을 재사용한다.

- [x] **Step 3: 공개 공고 상세를 공용 렌더러로 전환**

`CollapsibleJobDescription`과 상세 이미지 렌더링은 유지하고, 현재의 로컬 `DescriptionBlock` 분기와 평문 fallback만 `JobDescriptionContent` 호출로 교체한다. 공개 화면의 스냅샷/DOM 의미가 바뀌지 않는지 테스트한다.

- [x] **Step 4: 공용 렌더러 테스트 통과 확인**

Run:

```powershell
pnpm --filter web exec vitest run test/components/bambi/job-description-content.test.ts
```

Expected: 모든 블록·fallback 테스트 통과.

### Task 3: 관리자 단건 본문 데이터 배선

**Files:**

- Modify: `apps/web/src/app/moderator/queue/[id]/page.tsx`
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Test: `apps/web/test/app/moderator/queue/moderator-job-content-preview.test.ts`

- [x] **Step 1: 누락 회귀 테스트 작성**

관리자 상세 페이지가 `getJobPostForAdmin` 응답의 다음 값을 `QueueDetail`에 전달하는지 검증한다.

- `description`
- `descriptionBlocks`
- 조회 pending/error 상태

검수 목록의 축약 타입 `{ text: string }[]`을 실제 렌더링에 확장해 쓰지 않고, 관리자 단건 응답의 완전한 `{ id, type, text }[]`을 사용해야 한다.

- [x] **Step 2: `QueueDetail` 본문 미리보기 타입 추가**

`QueueDetail`에 공고 본문 미리보기 전용 prop을 추가한다. 미리보기 타입은 기존 `JobDescriptionBlock`을 재사용하고 다음 상태를 구분한다.

- 로딩 중
- 조회 성공(블록 있음/평문 fallback)
- 조회 실패

`item.desc`는 감지 표현 강조용으로 그대로 둔다.

- [x] **Step 3: 관리자 단건 조회 결과 연결**

`moderator/queue/[id]/page.tsx`의 기존 `mediaQuery`는 실제로 본문과 미디어를 함께 가져오므로 역할에 맞는 이름으로 정리한다. 새 네트워크 호출을 추가하지 않고 동일 응답에서 본문과 미디어를 각각 전달한다.

### Task 4: 기본 접힘 `공고 내용` 아코디언

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Reuse: `apps/web/src/components/bambi/job-description-content.tsx`
- Test: `apps/web/test/app/moderator/queue/moderator-job-content-preview.test.ts`

- [x] **Step 1: 기본 접힘 배선 테스트 작성**

- `Accordion`에 열린 항목 기본값을 주지 않아 최초 접힘이다.
- `AccordionTrigger`와 `AccordionContent` 안에 공용 본문 렌더러가 배선된다.
- 제목·목록·강조·문단의 타입과 순서가 공개 공고 렌더러 결과와 같다.
- 블록이 없는 과거 공고는 평문 fallback을 표시한다.
- 로딩과 실패가 `본문 없음`으로 잘못 표시되지 않는다.

현재 Web Vitest는 Node 환경이며 `test/**/*.test.ts`만 수집하고 Testing Library/jsdom 의존성이 없다. 자동 클릭 토글 검증을 위해 새 테스트 스택을 추가하지 않는다. base-ui Accordion 자체 동작은 공용 컴포넌트 책임으로 보고, 기본값·배선은 정적 테스트로 검증하며 실제 열기·닫기와 키보드 동작은 Task 7 브라우저 QA에서 검증한다.

- [x] **Step 2: shadcn Accordion으로 구현**

`Accordion`·`AccordionItem`·`AccordionTrigger`·`AccordionContent`를 사용한다. 접근 가능한 버튼/상태 관리는 base-ui에 맡기고 수동 클릭 div나 별도 펼침 상태를 만들지 않는다.

- [x] **Step 3: 검수 레이아웃에 배치**

감지 표현 강조 영역과 이미지 섹션 사이의 판단 흐름을 해치지 않도록 실제 본문 아코디언을 주 콘텐츠 열에 둔다. 데스크톱의 판정 도크 sticky 동작과 모바일 하단 액션 영역을 유지한다.

### Task 5: 기존 공고 이미지 썸네일 배치 보존

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Test: `apps/web/test/app/moderator/queue/moderator-job-content-preview.test.ts`

- [x] **Step 1: 이미지 usage 회귀 테스트 작성**

- 대표 이미지와 상세 이미지의 합계가 `공고 이미지 N장`으로 표시된다.
- 대표 이미지가 첫 번째, 상세 이미지가 그 뒤 등록 순서로 표시된다.
- 기존 2열·데스크톱 3열 썸네일 그리드를 유지한다.
- 상세 이미지 선택이 선택한 storage key의 모달을 연다.
- 이미지가 없는 공고는 기존 빈 상태 흐름을 유지한다.

- [x] **Step 2: 기존 통합 `items` 배열 유지**

`media.cover`와 `media.detail`을 기존처럼 하나의 `items` 배열로 조합한다. 화면 배치와 순서를 바꾸지 않고 기존 이미지 URL 생성 함수 `jobMediaPublicUrl`을 그대로 사용한다.

- [x] **Step 3: 썸네일 접근성 유지**

각 버튼의 접근 가능한 이름에서 대표/상세 이미지와 순서를 식별할 수 있게 한다. 이미지 `altText`가 있으면 우선 사용하고 빈 값은 의미 있는 fallback을 사용한다.

### Task 6: 공용 상세 이미지와 실제 공고 크기 스크롤 모달

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Create: `apps/web/src/components/bambi/job-detail-image.tsx`
- Modify: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx`
- Test: `apps/web/test/app/moderator/queue/moderator-job-content-preview.test.ts`

- [x] **Step 1: 축소 원인 제거 테스트 작성**

상세 이미지 모달에 다음 과거 구현이 남지 않는지 검증한다.

- 고정 `h-[70vh]` 이미지 상자
- `fill`
- `object-contain`

대신 공개 공고와 같은 `h-auto w-full` 비율 렌더링과 Dialog 내부 overflow가 사용되는지 확인한다.

- [x] **Step 2: 공용 상세 이미지 렌더러 추출**

공개 공고에 인라인으로 들어 있는 상세 이미지 `Image`를 `JobDetailImage`로 추출한다. 저장된 실제 width/height를 우선 사용하고, 값이 없는 구버전 미디어에만 기존 공개 렌더러의 1200×1600 fallback을 이름 있는 상수로 이동해 사용한다. 공개 공고와 운영자 모달이 같은 `h-auto w-full` 컴포넌트를 사용한다.

- [x] **Step 3: 관리자 상세 이미지 모달 변경**

모달은 `max-w-3xl` 콘텐츠 폭을 유지하고 공용 `DialogContent`의 뷰포트 최대 높이와 `overflow-y-auto`를 통해 우측 스크롤바와 터치 스크롤을 제공한다.

- [x] **Step 4: 스크롤 격리 확인**

모달 끝에서 스크롤해도 뒤의 검수 페이지가 같이 움직이지 않아야 한다. 공용 Dialog의 `overscroll-contain`을 유지하고 별도 전역 CSS나 수동 wheel/touch 이벤트 핸들러를 추가하지 않는다.

### Task 7: 정적 검증과 브라우저 QA

**Files:**

- Update: `docs/superpowers/plans/2026-08-26-moderator-job-review-content-preview.md`

- [x] **Step 1: 관련 테스트 실행**

```powershell
pnpm --filter web exec vitest run test/lib/bambi-job-form.test.ts test/components/bambi/job-description-content.test.ts test/app/moderator/queue/moderator-job-content-preview.test.ts test/components/bambi/screens/seeker-job-detail-responsive.test.ts
pnpm --filter @bambi-app/api exec vitest run test/services/bambi-job-description-blocks.test.ts
pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/job-post-media.test.ts -t "creates a job with one cover image|returns description blocks and media in public job detail"
```

- [ ] **Step 2: Web 타입 검사**

```powershell
pnpm --filter web check-types
pnpm --filter @bambi-app/api check-types
```

- [x] **Step 3: 변경 파일 Ultracite 검사**

구현 중에는 변경 파일 범위로 검사하고, 최종적으로 저장소 관례에 맞는 검사를 실행한다. 자동 수정 전에 diff를 확인해 관련 없는 사용자 변경을 건드리지 않는다.

- [ ] **Step 4: 데스크톱 브라우저 QA**

운영자 계정으로 구조화 블록 4종과 상세 이미지 2장이 포함된 검수 대기 공고를 연다.

- `공고 내용`이 처음에는 접혀 있다.
- 펼치면 공개 공고와 같은 문단·제목·목록·강조 순서와 표현이 보인다.
- 다시 접을 수 있다.
- 실제 감지 문구가 있는 공고에서는 감지 표현 강조 영역이 동작하고, 없는 공고에서는 중복 평문이 나오지 않는다.
- 대표 이미지와 상세 이미지가 구분된다.
- 세로로 긴 상세 이미지는 읽을 수 있는 본문 폭으로 보이고 Dialog 우측 스크롤바로 끝까지 확인된다.
- 승인·보류·반려 도크와 결제 패널이 기존대로 동작한다.

- [ ] **Step 5: 모바일 브라우저 QA**

375px와 390px 폭에서 확인한다.

- 아코디언 트리거와 내용이 화면 밖으로 넘치지 않는다.
- 상세 이미지 모달이 뷰포트 안에 들어오고 손가락 세로 스크롤로 이미지 끝까지 확인된다.
- 모달 스크롤 중 뒤 페이지가 같이 움직이지 않는다.
- 닫기·포커스 복귀·키보드 접근성이 유지된다.
- 검수 페이지 자체 스크롤과 모바일 하단 판정 액션이 기존대로 동작한다.

- [ ] **Step 6: 공개 공고 회귀 QA**

새 형식 공고와 구버전 공고를 공개 상세에서 각각 확인한다.

- 새 형식 공고는 기본 상세설명 다음에 블록 타입·순서·스타일이 유지된다.
- 구버전 공고는 블록 합성 평문이 별도 기본 상세설명으로 중복되지 않는다.
- 상세 이미지 폭·비율·순서 유지.
- 기존 `더보기` 동작 유지.
- 블록이 없는 공고의 평문 fallback 유지.

- [x] **Step 7: 설계서 검증 결과 기록**

실행한 명령, 통과 건수, 브라우저 뷰포트, 확인한 공고 데이터 구성을 이 문서 아래 `구현 결과`에 구체적으로 기록한다. 구현 범위나 파일이 바뀌면 위 표와 단계도 함께 갱신한다.

---

## 완료 기준

- 관리자 검수 상세에서 구인자가 작성한 기본 상세설명과 문단·제목·목록·강조가 사라지거나 평문으로 뭉개지지 않는다.
- `공고 내용`은 기본 접힘 아코디언이며 열고 다시 접을 수 있다.
- 관리자와 공개 공고가 같은 구조화 본문 렌더러를 사용한다.
- 구조화 블록이 없는 기존 공고도 평문 본문을 확인할 수 있다.
- 대표 이미지와 본문 상세 이미지가 검수 화면에서 용도별로 구분된다.
- 세로로 긴 상세 이미지는 공개 공고와 같은 콘텐츠 폭·원본 비율로 표시되고 데스크톱 스크롤바와 모바일 터치 스크롤로 끝까지 확인할 수 있다.
- 감지 표현 강조와 승인·보류·반려 등 기존 검수 기능에 회귀가 없다.
- DB migration과 oRPC 입력·응답 스키마 변경이 없다.
- 관련 테스트, Web 타입 검사, Ultracite 검사, 데스크톱·모바일 브라우저 QA 결과가 문서에 기록된다.

---

## 구현 결과

### 구현 완료

- Web 폼과 API 저장 경계가 기본 상세설명과 구조화 블록을 각각 보존하도록 수정했다.
- 기존 `bambi-job-description-blocks` 순수 서비스에 구버전 블록 합성 평문 중복 방지와 검수용 전체 평문 조합 함수를 추가하고 Web에서도 재사용했다.
- 공개 공고와 관리자 검수 화면이 같은 `JobDescriptionContent`를 사용한다. 기본 상세설명 뒤에 문단·제목·목록·강조가 등록 순서대로 표시된다.
- 관리자 단건 조회의 전체 본문을 기본 접힘 shadcn Accordion에 연결했다. 감지 표현 강조 평문은 별도로 유지한다.
- 감지 표현 강조 평문은 서버가 실제 감지한 문구가 있을 때만 표시해 정상 공고에서 아코디언 내용이 중복되지 않게 했다.
- PR 리뷰에서 지적된 신규 `text-[13px]` 2곳을 `text-sm`로, 공용 본문 렌더러로 옮긴 `text-[15px]` 4곳을 `text-base`로 교체해 이번 작업 소유 UI에서 임의 px 폰트 크기를 제거했다.
- 대표 이미지와 상세 이미지는 기존 `공고 이미지 N장` 통합 썸네일 그리드 배치를 유지하고, 공개 공고와 관리자 확대 모달이 같은 `JobDetailImage`를 사용하도록 했다. 저장 치수를 우선 사용하고 구버전 null 행에만 기존 1200×1600 호환값을 쓴다.
- 관리자 모달의 고정 `70vh`·`fill`·`object-contain` 축소를 제거했다. 공용 Dialog의 최대 높이·`overflow-y-auto`·`overscroll-contain`으로 내부 세로 스크롤과 모바일 터치 스크롤을 제공한다.
- 공고 등록 알림 때문에 API 미디어 테스트 픽스처 사용자가 삭제되지 않던 cleanup에 알림 선삭제를 추가해 이번 저장 회귀 통합 테스트가 잔여 데이터를 만들지 않게 했다.

### 검증 결과

- Web 관련 테스트: 4파일, 43건 통과.
- API 본문 순수 테스트: 1파일, 9건 통과.
- API 저장·공개 조회 통합 테스트: 관련 2건 통과, 나머지 6건은 선택 실행에서 제외.
- API `check-types`: 통과.
- 변경 파일 Ultracite: 14파일, 오류 0건.
- `git diff --check`: 통과.

### 기존 저장소 문제로 완료하지 못한 검증

- Web 전체 `check-types`는 이번 변경과 무관한 최신 `develop` 기존 오류 2건에서 실패했다.
  - `apps/web/src/app/moderator/points/page.tsx`: typed route 불일치.
  - `apps/web/src/lib/bambi/manual.ts`: `"/manual"`이 `Route`에 할당되지 않음.
- 브라우저 QA는 중첩 worktree에서 Next/Turbopack이 `.worktrees/mobile-chat-attachment-layout/apps/web/src/...`를 프로젝트 파일시스템 `apps/web` 밖으로 판정해 panic/500을 내므로 실행하지 못했다. 전역 CSS 상대 경로 확인을 위한 임시 junction은 QA 시도 후 제거했고 저장소 파일에는 남기지 않았다.
- 위 두 차단 때문에 Task 7의 Web 타입 검사와 데스크톱·모바일·공개 공고 브라우저 QA 체크박스는 완료 처리하지 않았다.
