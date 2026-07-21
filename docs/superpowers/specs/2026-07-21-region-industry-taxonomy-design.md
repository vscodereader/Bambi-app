# 지역·업종 taxonomy 통일 — 시/도 + 세부지역 2단계

작성일: 2026-07-21
브랜치: `feat/seeker-filters` (작업 워크트리: `worktree-seeker-filters`)
관련: [seeker 필터 구조화](./2026-07-21-seeker-filter-fields-design.md)의 후속

## 배경

seeker 빠른탐색의 지역/업종 필터가 채용자가 올린 실제 공고를 못 잡고, mock
샘플 공고만 노출하는 버그가 있다. 근본 원인은 **지역·업종 값 어휘(controlled
vocabulary)가 세 곳에서 제각각**이기 때문이다.

| | 채용자 폼 (`bambi-options.ts`) | seeker 필터 (`marketplace.ts`) | dev seed (`bambi-dev.ts`) |
|---|---|---|---|
| 지역 | 서울·경기·인천·부산·… (시/도) | 강남·서초·송파·마포·… (구) | "서울 강남구"·"인천 부평구" (시+구 합침) |
| 업종 | 라운지·바·클럽·노래방·기타 | 라운지·바·클럽·호스트바·카페 | — |

서버 `list`는 `eq(jobPost.region, …)` / `eq(jobPost.industryCategory, …)`
**정확 일치**로 거른다(`packages/api/src/routers/bambi/jobs.ts:496-502`). 폼이
저장한 값("서울")과 필터가 보내는 값("강남")이 다르므로 실제 공고는 절대 안
걸리고, API가 0건을 반환한다. 이때 `useMarketplaceJobs`가 mock `JOBS`로
폴백(`api-jobs.ts:140-141`)하는데, 그 mock은 필터 어휘로 작성돼 있어 샘플만
노출된다. 결과: "필터는 되는데 실제 공고만 사라진다."

## 목표

폼·필터·mock이 **같은 taxonomy 소스 하나**를 참조하게 하여, 채용자가 고른
값과 구직자가 거는 필터가 항상 일치하게 한다. 지역은 시/도 + 세부지역 2단계로
재설계한다.

## 결정 사항

1. **지역 2단계 — `region`(시/도) + 새 `district`(세부지역) 컬럼**. `district`는
   `text` nullable(기존 공고·"기타" 시/도는 null 허용).
2. **필터 UX는 연동형** — 시/도를 고르면 하위 세부지역이 나온다(업종-세부업종
   `subcategoriesForCategory` 패턴과 대칭).
3. **업종 어휘도 통일** — 폼·필터 합집합 단일 목록.
4. **단일 소스 = `apps/web/src/lib/bambi-options.ts`** — 여기에 시/도·세부지역
   매핑·업종을 두고, 폼(`bambi-job-form.ts`·등록/수정 페이지)과
   필터(`marketplace.ts`·`marketplace.tsx`)·mock(`data.ts`)이 모두 import한다.
   서버(`packages/api`)·seed(`apps/server`)는 패키지 경계상 web을 import할 수
   없으므로 값을 **수동으로 정합**시킨다(자유문자열 저장·`eq` 필터라 값만 맞으면
   동작). seed 파일에 taxonomy 참조 주석을 단다.
5. **필터 매칭을 필드 기반으로** — mock/mapper가 만드는 `Job`에 `region`·
   `district` 필드를 실어, 문자열 `location.includes()`가 아니라 필드 정확
   비교로 거른다(초보/당일면접 필드화와 같은 철학).

## 확정 Taxonomy

### 지역 (시/도 → 세부지역)
| 시/도 | 세부지역 |
|---|---|
| 서울 | 강남 · 서초 · 송파 · 마포 · 용산 · 강북 |
| 경기 | 부천 · 수원 · 성남 · 안양 |
| 인천 | 남동 · 부평 · 미추홀 |
| 부산 | 해운대 · 서면 · 연제 |
| 기타 | (세부지역 없음) |

### 업종
> 라운지 · 바 · 클럽 · 호스트바 · 카페 · 노래방 · 기타

필터 UI에는 각 목록 앞에 `전체`(`ALL_OPTION`)를 붙인다(폼에는 붙이지 않음).

## 변경 지점

### 1. taxonomy 소스 — `apps/web/src/lib/bambi-options.ts`
- `regionOptions`를 시/도(`서울·경기·인천·부산·기타`)로 재정의.
- `REGION_DISTRICTS: Record<string, readonly string[]>` 신설(위 표).
- `districtsForRegion(region): readonly string[]` 헬퍼(정의 없으면 `[]`).
- `industryOptions`를 통일 7종으로.

### 2. DB — `packages/db/src/schema/bambi.ts`
- `jobPost`(`:284`)에 `region`(`:299`) 뒤로 `district: text("district")` 추가
  (nullable). `drizzle-kit generate`로 마이그레이션 생성, **migrate는 사용자
  명시 지시 후 실행**.

### 3. API — `packages/api/src/routers/bambi/jobs.ts`
- `jobPostInput`(`:105-`)·`listInput`에 `district: z.string().max(80).optional()`
  추가. create/update는 `...jobInput` 스프레드라 자동 반영.
- `list` 필터에 `if (input.district) filters.push(eq(jobPost.district, input.district))`
  추가(`:502` 뒤). `exposureSelection`(`:508-`)·organic select·`getById`
  selection에 `district: jobPost.district` 노출.

### 4. 필터 로직 — `marketplace.ts` + `types.ts` + `api-job-mapper.ts` + `api-jobs.ts`
- `bambi-options.ts`에서 `regionOptions`·`districtsForRegion`·`industryOptions`
  import. `MARKETPLACE_REGIONS` = `["전체", ...regionOptions]`,
  `MARKETPLACE_CATEGORIES` = `["전체", ...industryOptions]`로 대체.
- `districtOptionsForRegion(region)` = `["전체", ...districtsForRegion(region)]`.
- `MarketplaceFilters`·`DEFAULT_MARKETPLACE_FILTERS`에 `district` 추가.
- `Job`(`types.ts`)에 `region: string`·`district: string` 추가.
- `filterMarketplaceJobs`: `jobMatchesRegion`(`job.region === region`),
  `jobMatchesDistrict`(`job.district === district`)로 필드 비교. `전체`는 통과.
- `applyDiscoveryAxis`: region 축 리셋 시 `district`도 `ALL_OPTION`으로.
- `toApiListInput`(`api-jobs.ts:40-51`)에 `district` 추가.
- `toMarketplaceJob`(`api-job-mapper.ts`): `region: job.region`,
  `district: job.district ?? ""`, `location: [job.region, job.district]
  .filter(Boolean).join(" · ")`, `tags`에 세부지역 포함.

### 5. 필터 UI — `apps/web/src/components/bambi/marketplace.tsx`
- `MarketplaceFilterControls`의 지역 Select 아래에 **세부지역 Select** 추가
  (`districtOptionsForRegion(filters.region)` 연동, 세부지역 없으면 disabled).
  지역 변경 시 `update({ region: value, district: ALL_OPTION })`.

### 6. 폼 — `bambi-job-form.ts` + `employer/new/page.tsx` + `employer/jobs/[id]/edit/page.tsx`
- `JobForm`·`JobPostInput`·`emptyJobForm`에 `district: string` 추가
  (`emptyJobForm.district = districtsForRegion(regionOptions[0])[0] ?? ""`).
- `validateJobForm`/`getConditionErrors`: 선택한 시/도에 세부지역 목록이 있으면
  `district` 필수(비면 "세부지역을 선택해 주세요."), 없으면 통과.
- 등록/수정 페이지: 지역 Select 아래 세부지역 Select 추가. 지역 select
  `onValueChange`에서 `setForm(f => ({...f, region: v, district:
  districtsForRegion(v)[0] ?? ""}))`. edit 프리필(`:229-247`)에
  `district: job.district ?? ""` 추가.

### 7. mock — `apps/web/src/lib/bambi/data.ts`
- 각 job에 `region`·`district`를 taxonomy 값으로 부여, `location`을
  `"시/도 · 세부지역"`으로. `type`(업종)도 통일 목록 내 값으로 정합.

### 8. seed — `apps/server/src/seeds/bambi-dev.ts`
- `region`을 시/도로, 새 `district` 필드를 세부지역으로 재작성(현재 "서울
  강남구" → region "서울" + district "강남"). taxonomy 밖(대구·대전·광주)
  공고는 taxonomy 내 시/도로 재배치. `buildRichJobRow`·base `seedJobs` 반환에
  `district` 연결.

## 데이터 방침
- 마이그레이션 default: 기존 공고 `district = null`(시/도 필터엔 계속 걸림).
- 운영 DB 텍스트 → 필드 백필은 **비목표**. dev seed만 새 값을 채운다.

## 비목표
- 지역/업종 세부업종(subcategory) 재설계(현행 유지).
- 서버측 페이지네이션·정렬 변경.
- 운영 공고 자동 백필.
