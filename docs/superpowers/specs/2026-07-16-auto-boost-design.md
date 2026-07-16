# 자동 끌어올리기(auto boost) 설계

- 날짜: 2026-07-16
- 상태: 사용자 승인 완료(구현 착수)
- 기반 브랜치: feat/promotion-boost (7864ed5)

## 배경·현황

현재는 수동 끌어올리기만 있다. `promotions.boost`가 클릭 시 `jobBoostEvent`(boostType
`"manual"`)를 기록하고 `jobPost.boostedAt`을 갱신하며, 노출 정렬 키
`GREATEST(boosted_at, published_at)`로 상단 점프한다. 일일 한도는 구매 시점 스냅샷
`jobPost.manualBoostsPerDay`(KST 자정 리셋)다. `jobBoostEvent.boostType`은 자동 점프
확장을 대비해 이미 존재하지만, `actorUserId`가 NOT NULL이고 서버(Fastify)에는
크론·주기 실행 인프라가 전혀 없다.

## 제품 결정(사용자 확정)

1. **상품 모델**: `adProduct.autoBoostsPerDay` 신설 — 수동과 독립된 쿼터.
   상품 예: "수동 3회 + 자동 2회". 기존 수동 로직 불변.
2. **발동 시각**: 주간 시간대 균등 — 09:00~21:00 KST 창(12시간)을 횟수로 균등 분배.
   간격 = 12h ÷ N, 슬롯 = 09:00 + k×간격 (k = 0..N-1). 예: 2회 → 09시·15시,
   3회 → 09시·13시·17시.
3. **구인자 제어**: 없음 — 상품 포함 시 공개 중(게시+결제완료)·노출 유효하면
   시스템이 무조건 자동 실행. 구인자 UI는 현황 표시만.

## 실행 메커니즘: 서버 내장 틱 스케줄러(채택)

Fastify 플러그인(`apps/server/src/plugins/auto-boost.ts`)에서 `setInterval` 60초
틱으로 서비스 함수를 호출한다. 상태를 메모리에 두지 않고 매 틱 DB 기준으로
재계산하므로 서버 재시작에도 자연 복구되고(밀린 슬롯은 당일 내 캐치업), 이력·쿼터·
정렬이 수동 끌어올리기와 동일한 데이터 경로(`jobBoostEvent` + `boostedAt`)를
공유한다. 새 라이브러리 불필요.

기각한 대안: ① 쿼리 시점 가상 정렬 키(스케줄러 불필요하나 정렬 SQL 복잡화, 실행
이력이 데이터로 남지 않아 현황 표시 불가) ② 외부 크론(pg_cron/OS 스케줄러 —
dev·운영 환경마다 인프라 구성 추가, 현 로컬 dev 중심 환경에 과함).

## 데이터 모델 — 마이그레이션 0018

- `ad_product.auto_boosts_per_day` integer DEFAULT 0 NOT NULL — 카탈로그 필드.
- `job_post.auto_boosts_per_day` integer DEFAULT 0 NOT NULL — 구매 시점 스냅샷.
  `manual_boosts_per_day`와 동일 패턴으로, 운영자가 상품을 수정해도 기존 적용
  공고에 소급되지 않는다.
- `job_boost_event.actor_user_id` NOT NULL 해제 — 자동 실행은 사람 액터가 없어
  null 저장(`boostType: "auto"`로 구분). 수동 경로는 계속 값을 저장한다.
- 백필 불필요(기존 상품·공고 전부 자동 0에서 시작).
- 마이그레이션 파일 생성은 구현에 포함하되, dev DB 적용(db:migrate)은 사용자
  명시 지시 시점에 실행한다(db:push 절대 금지).

## 슬롯 계산(순수 함수)

`packages/api/src/services/bambi-job-boost.ts`에 추가:

- 발동 창 상수: 09:00~21:00 KST(12시간). 변경이 쉬운 단일 상수로 둔다.
- **공고별 슬롯 분산(herd 제거)**: `getAutoBoostSlotOffsetMs(jobPostId,
  autoBoostsPerDay)` — 공고 id 문자열의 결정적 해시(FNV-1a 32비트, 순수 TS·
  라이브러리 없음) `% intervalMs`로 오프셋을 산출. 슬롯 = 09:00 + offset +
  k×interval라, 같은 N을 가진 공고들도 발동 시각이 id별로 어긋나 특정 분에 몰리지
  않고, 전 공고가 동시에 점프해 서로 상대 우위가 없던 herd 문제도 사라진다.
  offset ∈ [0, interval)이므로 마지막 슬롯(= 09:00 + offset + (N-1)×interval) <
  09:00 + N×interval = 21:00이 수학적으로 보장돼 모든 슬롯이 창 안에 든다.
- `countDueAutoBoostSlots(autoBoostsPerDay, now, offsetMs = 0)` — `now`가 속한 KST
  하루 기준으로 지금까지 도래한 슬롯 수(dueCount)를 반환. 슬롯 = 창 시작 + offsetMs +
  k×interval, due = floor((elapsed − offsetMs) ÷ interval) + 1을 [0, N]으로 클램프
  (elapsed < offsetMs면 0). offsetMs 기본값 0이면 09:00 + k×interval의 기존 동작과
  동일. `getKstDayStart` 재사용.
- 단위 테스트 대상(횟수별 슬롯 경계 직전/직후, KST 자정, 0회; 오프셋 결정성·범위
  [0, interval)·서로 다른 id 분산, offset 반영 경계, offset 기본값 0 동작 보존).

## 틱 서비스

`packages/api/src/services/bambi-auto-boost.ts`의 `runAutoBoostTick(now)`:

1. 후보 조회: `autoBoostsPerDay > 0` AND `status = 'published'` AND
   `paymentStatus = 'paid'` AND 노출 유효(`exposureEndsAt` null 또는 미래).
2. 공고별 오늘 `"auto"` 이벤트 수가 dueCount 미만이면 발동 대상. dueCount는
   **그 공고의 오프셋**(`getAutoBoostSlotOffsetMs`)을 반영한다 — 사전 필터와 잠금 내
   재확인 둘 다 동일 오프셋을 써야 재확인이 유의미하다.
3. 발동은 공고별 트랜잭션: jobPost `FOR UPDATE` 잠금 → **잠금 안에서 (오프셋 반영)
   auto 카운트 재확인** → `jobBoostEvent` insert(boostType `"auto"`, actorUserId
   null) → `boostedAt = now`. 동시 틱·다중 인스턴스에서도 쿼터 초과가 구조적으로
   불가능(수동 boost와 같은 직렬화 지점).
4. **발동 대상은 동시 실행 상한(`AUTO_BOOST_TICK_CONCURRENCY = 10`)이 있는 워커
   풀로 병렬 처리**한다 — 공유 인덱스에서 다음 대상을 꺼내는 async 워커를
   `min(상한, 대상 수)`개 띄우고 `Promise.all`로 대기(청크 Promise.all보다 슬롯
   활용이 좋음). JS 이벤트 루프가 단일 스레드라 인덱스 소비·`fired` 증가에 경쟁
   조건이 없다. 대규모 공고에서도 커넥션·잠금 경합을 상한 안에 가두면서 순차
   for-await보다 처리량을 확대한다(공고별 트랜잭션·재확인·실패 삼킴은 불변).
5. 틱당 공고별 최대 1회 발동 — 서버가 오래 꺼졌다 켜지면 이후 틱들이 1분 간격으로
   캐치업한다(당일 쿼터는 정직하게 소진, 자정이 지나면 소멸).
6. 개별 공고 실패는 로그만 남기고 다음 공고 진행(틱이 서버를 죽이면 안 됨).

Fastify 플러그인: 기존 플러그인 스타일(`FastifyPluginCallback`)로 `setInterval`
60초, 이전 틱 미완료 시 스킵하는 재진입 가드, `onClose`에서 `clearInterval`.

## 기존 수동 카운트 필터(필수 선행 수정)

`promotions.ts`의 일일 사용량 카운트 2곳(listMyAds의 usedRows, boost의 usage)이
현재 boostType 무관 전체 카운트라 자동 이벤트가 생기는 순간 수동 쿼터를 잠식한다.
`boostType = 'manual'` 필터를 추가한다.

## API 확장

- `jobs.ts` `resolveJobPostExposure`: `ResolvedJobExposure`에 `autoBoostsPerDay`
  추가(상품 없으면 0), 공고 create·update 두 경로의 명시 나열부에 스냅샷 저장 —
  manualBoostsPerDay와 동일 3곳.
- `promotions.ts` `listMyAds`: `autoBoostsPerDay`(jobPost 스냅샷)와
  `autoBoostsUsedToday`(오늘 `"auto"` 이벤트 카운트) 추가.
- `ad-products.ts`: create/update zod 입력·getCatalog select에 `autoBoostsPerDay`
  추가(웹 카탈로그 타입은 oRPC 반환 타입 파생이라 자동 전파).

## UI(3곳)

- 운영자 상품 폼 `ad-product-form.tsx`: 자동 횟수 입력 1개 — 수동과 동일한
  zero-clearable 패턴, new/edit 페이지 전달부 포함.
- 광고 상품 안내 `employer-ad-guide.tsx`: `autoBoostsPerDay > 0`이면
  "일일 자동 끌어올리기 N회 포함" 라인(수동 라인과 동일 스타일).
- 광고 관리 `promotions/page.tsx`: "자동 끌어올리기" 컬럼 신설 — 미포함 상품은
  "—", 포함이면 오늘 실행 현황(예: "오늘 M/N회 실행"). AdListItem 타입에
  `autoBoostsPerDay`·`autoBoostsUsedToday` 추가.
- 구인자 대시보드 `employer/page.tsx`의 남은 횟수 합계는 수동 기준 유지(무변경).

## 테스트

- 슬롯 순수 함수 단위 테스트(`bambi-job-boost.test.ts` 확장): N=1·2·3·4 슬롯
  경계 직전/직후, KST 자정 리셋, 0회.
- 틱 서비스 통합 테스트(신규): due 슬롯 도달 시 이벤트+`boostedAt` 갱신, 쿼터
  소진 후 미발동, 미게시/미결제/노출 만료 제외, 자동 이벤트가 수동 쿼터를
  잠식하지 않음(auto 이벤트 후 수동 boost 여전히 가능), 잠금 내 재확인.
- 기존 `promotions-boost.test.ts`: 수동 카운트가 `"manual"` 타입만 세는 회귀 단언.
- web 소스 단언 테스트 갱신: `ad-product-form.test.ts`, `employer-ad-guide.test.ts`,
  `promotions/page.test.ts`.

## 엣지 케이스

- 서버 재시작: 틱이 무상태라 DB 재계산으로 자연 캐치업.
- KST 자정 경계: `getKstDayStart` 재계산으로 쿼터 리셋.
- 노출 만료: `exposureEndsAt` 경과 시 후보에서 제외(수동과 동일 판정).
- 검수 재게시로 `publishedAt` 갱신: 정렬 키가 GREATEST라 영향 없음.
- 동시 틱/다중 인스턴스: FOR UPDATE + 잠금 내 카운트 재확인으로 중복 발동 방지.

## 비범위(후속 후보)

- 구인자 자동 끌어올리기 on/off 토글(필요해지면 jobPost 상태 컬럼+mutation 추가).
- 구인자 발동 시각 직접 지정.
- 발동 창(09~21시) 상품별 커스텀.
