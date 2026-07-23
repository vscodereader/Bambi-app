# seeker 마켓플레이스 필터 구조화 — 초보 가능 / 당일면접 가능

작성일: 2026-07-21
브랜치: `feat/seeker-filters` (작업 워크트리: `worktree-seeker-filters`)

## 배경

seeker 마켓플레이스의 "초보 가능만 보기", "오늘 면접 가능만 보기" 필터는 현재 공고
텍스트에 대한 문자열 부분 매칭이다.

- `jobMatchesBeginner` — `` `${job.title} ${job.desc} ${job.tags}`.includes("초보") `` (`apps/web/src/lib/bambi/marketplace.ts:123-126`)
- `jobMatchesToday` — `` `${job.desc} ${job.pref} ${job.tags}`.includes("오늘 면접") `` (`marketplace.ts:128-131`)

`includes` 기반이라 부정 표현을 구분하지 못한다. "초보 사절", "오늘 면접 불가" 같은
공고도 필터에 걸린다. 전용 DB 필드가 없어 생기는 정확도 한계다.

## 목표

공고에 boolean 필드 2개를 두고 채용자가 명시적으로 지정하게 한다. 필터는 텍스트가
아니라 이 필드를 직접 참조한다.

## 결정 사항

1. **DB 컬럼 2개** — `beginner_friendly`, `instant_interview` (둘 다 `boolean NOT NULL default false`)
2. **"오늘 면접 가능" 재정의** — "오늘"은 시간이 지나면 낡는 개념이라 상시 속성
   **"당일면접 가능"**(`instant_interview`)으로 재정의한다. cron·일일 갱신 불필요.
   - 사용자 노출 라벨: "오늘 면접 가능" → **"당일면접 가능"**
   - 내부 필터 키 `onlyToday` / `onlyBeginnerFriendly`는 **유지**한다(파급 최소화).
     매칭 소스만 DB 필드로 교체.
3. **서버 where 필터는 추가하지 않는다** — 현행 구조는 응답을 받은 뒤 클라이언트
   `filterMarketplaceJobs`로 거른다. 응답에 두 필드만 실으면 서버 쿼리 확장 없이 동작.
   결과셋이 커지면 그때 `listInput` + `toApiListInput`으로 서버 필터를 추가한다(후속).
4. **채용자 입력 폼 UI 포함** — 공고 등록/수정 폼에 체크박스 2개 추가.

## 변경 지점

### 1. 스키마 — `packages/db/src/schema/bambi.ts`
`jobPost`(`:284`)에 `interviewNotes`(`:309`) 근처로 컬럼 2개 추가:
```ts
beginnerFriendly: boolean("beginner_friendly").default(false).notNull(),
instantInterview: boolean("instant_interview").default(false).notNull(),
```
(`boolean`은 이미 import됨 — `:4`) 마이그레이션은 `drizzle-kit generate`로 생성
하되 **사용자 명시 지시 후 실행**한다(메모리: db:push 금지, generate/migrate는 지시 시).

### 2. API — `packages/api/src/routers/bambi/jobs.ts`
- `jobPostInput`(`:105-133`)에 optional boolean 2개 추가. create(`:993`)·update(`:1141`)는
  `...jobInput` 스프레드라 자동 반영.
- `list`의 `exposureSelection`(`:506-527`)과 `getById` selection(`:742-769`)에
  `beginnerFriendly`, `instantInterview` 노출. (`legacyList`/`listMine`은 seeker 노출과
  무관하면 생략.)

### 3. 폼 — `apps/web/src/lib/bambi-job-form.ts` + 등록/수정 페이지
- `JobForm`(`:138-154`), `emptyJobForm`(`:201-217`), `validateJobForm` 반환 input(`:827-852`)에
  `beginnerFriendly`, `instantInterview` 추가.
- `apps/web/src/app/employer/new/page.tsx` — "공고 조건" 카드(`:553-748`)에 shadcn
  `Checkbox` 2개 추가(`workSchedule` 뒤 `:745`). boolean용 setter 필요(`updateFormValue`는
  string 전용).
- `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` — 동일 체크박스 추가 + 기존값
  매핑(`:233-242`)에 두 필드 추가. **두 페이지가 JSX 복붙 공유라 양쪽 각각 손댄다.**

### 4. 매퍼 — `apps/web/src/lib/bambi/api-job-mapper.ts`
- `ApiMarketplaceJob`(`:32-56`)에 두 필드 추가.
- `toMarketplaceJob`(`:123-166`) 반환에 `beginnerFriendly: job.beginnerFriendly ?? false`,
  `instantInterview: job.instantInterview ?? false` 추가.

### 5. 필터 — `apps/web/src/lib/bambi/marketplace.ts` + `types.ts`
- `Job` 타입(`apps/web/src/lib/bambi/types.ts:52-77`)에 두 boolean 추가.
- `jobMatchesBeginner`/`jobMatchesToday` 제거, `filterMarketplaceJobs`(`:153-156`)에서
  `job.beginnerFriendly` / `job.instantInterview` 직접 참조.
- `MARKETPLACE_QUICK_FILTERS`(`:33-37`)의 `today` 라벨 "오늘 면접 가능" → "당일면접 가능".
- `apps/web/src/components/bambi/marketplace.tsx:160-170` 체크박스 라벨 "오늘 면접
  가능만 보기" → "당일면접 가능만 보기". (체크박스 자체는 이미 `onlyToday`에 연결돼
  있어 배선 변경 불필요.)

### 6. seed — `apps/server/src/seeds/bambi-dev.ts`
- `buildRichJobRow`(`:1997-2037`) 반환에 `beginnerFriendly: def.beginner ?? false` 추가
  (`RichJobDef.beginner`는 이미 존재 `:381`, 11개 job 마킹됨).
- `RichJobDef`에 `instant?: boolean` 신설 후 일부 job 마킹, 반환에 `instantInterview` 연결.
- base 4개(`seedJobs` `:1456-1618`)는 `$inferInsert` 기반이라 미지정 시 default false.
  데모 노출용으로 1~2개에 값 지정.

## 테스트

`apps/web/src/lib/bambi/marketplace.test.ts` — `onlyBeginnerFriendly`(`:31`),
`onlyToday`(`:59`) 케이스를 텍스트 기반에서 `job.beginnerFriendly` / `job.instantInterview`
기반으로 갱신. 부정 표현 오매칭이 더는 발생하지 않음을 확인하는 케이스 추가.

## 비목표 (이번 범위 밖)

- 서버측 `where` 필터 (결과셋 커질 때 후속)
- 운영 DB 기존 공고의 텍스트 → 필드 자동 백필. 마이그레이션 default는 `false`이며,
  dev seed만 값을 채운다. 운영 백필이 필요하면 별도 판단.
