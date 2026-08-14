# 광고 노출 보장·정원 표시·정직 문구 설계 (2026-08-11)

> 선행 기능 [노출 섹션 운영자 제어](2026-08-11-exposure-section-config-design.md)(정원제·대기열·`listingCapacity`)를 이어받는 후속 작업. 병합 대상 브랜치: `feat/exposure-section-configuration`.

## 배경

구인자 광고 안내 페이지에서 프리미엄 배너에만 "남은 자리 N/10"이 뜨고, 스페셜/추천에는 정원 표시가 없다. 또한 "노출 빈도·보장"을 광고주에게 어떻게 정직하게 표현할지 정리되지 않았다. 타 플랫폼 리서치(잡코리아 점프업·크몽·당근) 결과, 밤비의 자동 끌어올리기(auto-boost)는 잡코리아 점프업과 동일한 **위치 기반 재노출 보장** 모델이며, impression(조회) 보장이 아니라 **"1일 N회 최상단 재게시"** 로 표현하는 것이 관행·정직성 모두에 맞다.

## 노출 로직 요약(현행, 변경 없음)

- **노출 정렬 키**: 섹션·전체 공고 모두 `greatest(boosted_at, published_at) DESC`([jobs.ts:1352](../../packages/api/src/routers/bambi/jobs.ts)). 끌어올리기는 `boosted_at=now` 갱신 → 최상단 재점프.
- **자동 끌어올리기**: 상품 `autoBoostsPerDay` 회를 KST 09~21시에 균등 분배, 공고별 오프셋으로 herd 방지([bambi-job-boost.ts](../../packages/api/src/services/bambi-job-boost.ts)). 무상태 캐치업 틱([bambi-auto-boost.ts](../../packages/api/src/services/bambi-auto-boost.ts))이 `jobBoostEvent(auto)`로 실행 보장.
- **impression(analytics)**: 목록 응답에 실리면 기록되는 별도 지표. **보장 로직과 무관** — 보장 문구로 쓰지 않는다.

## 확정 결정

1. "재노출 보장" 문구는 **스페셜·급구·추천 모든 리스팅 상품**에 적용(운영자가 값 설정으로 자연 통제). 라벨·로직은 공용.
2. 요구사항 2는 **기존 `autoBoostsPerDay` 재사용·리라벨**(신규 컬럼 없음). 백엔드 로직 무변경.
3. 수동 끌어올리기 쿨다운은 **광고 상품별 설정**(ad product form), 기본값 **10분**.
4. 보장 표현은 **위치·횟수 기반**만. "항상 최상단", "조회 N회 보장" 금지(과장·검증 불가).
5. impression·클릭은 보장이 아니라 **사후 리포트**로만.

---

## Part 1 — 요구사항 1: 스페셜/추천 "남은 자리 N/12·N/20"

**백엔드: 완료**(`adProducts.listingCapacity` — special/recommended `{activeCount,capacity,pendingCount,remaining}` 반환).

**작업**: [employer-ad-guide.tsx](../../apps/web/src/components/bambi/screens/employer-ad-guide.tsx)
- `useQuery(listingCapacity)` 추가(premiumCapacity처럼 `refetchInterval: 30_000`).
- `PremiumCapacityNote`를 일반화(`CapacityNote`)해 남은 자리/만석 안내를 공용화.
- 리스팅 상품의 `previewTemplate`(`special-list`→special, `recommended-list`→recommended)으로 해당 정원 매핑 → 신청 영역에 "남은 자리 N/12·N/20" + 만석 시 "대기열 등록" 안내.
- 급구(`urgent-list`)는 표시하지 않음(섹션 숨김·정원 제외).

## Part 2 — 요구사항 2 + #4: auto-boost 리라벨 & 정직 문구

**신규 컬럼 없음. `autoBoostsPerDay` 재사용.**

- **폼** [ad-product-form.tsx:541](../../apps/web/src/components/bambi/ad-product-form.tsx): "일일 자동 끌어올리기 횟수" 라벨 → **"최소 노출 빈도 — 하루 N회 최상단 재노출 보장"**, 설명을 "매일 N회 지정 시간대(09~21시)에 목록 최상단으로 자동 재게시됩니다. 타 공고 갱신 시 순위는 자연 변동합니다."로 교체.
- **안내** [employer-ad-guide.tsx:189](../../apps/web/src/components/bambi/screens/employer-ad-guide.tsx): "일일 자동 끌어올리기 N회 포함" → **"하루 N회 최상단 재노출 보장"**. 스페셜·급구·추천 리스팅 상품 중 `autoBoostsPerDay>0`인 곳에 표시.
- 과장 문구("항상 최상단"·"조회 보장") 사용하지 않음.

## Part 3 — #1: 성과 리포트에 기간 재게시 실행 횟수

**목적**: "1일 N회 보장" 이행 증빙을 광고주 성과 리포트에 노출(크몽 모범 — 보장은 실행 횟수로 증빙).

- **서비스** [bambi-analytics.ts](../../packages/api/src/services/bambi-analytics.ts): 7일 impression 집계와 함께 `jobBoostEvent` where `boostType='auto'` AND `created_at >= 7일전`을 `jobPostId`로 group-by 카운트 추가(N+1 없이 단일 쿼리). 공고별 지표에 `autoBoostFires` 필드 추가.
- **UI** [employer/analytics/page.tsx](../../apps/web/src/app/employer/analytics/page.tsx): 총계에 "자동 재노출(7일)" MetricCard 추가, 공고별 요약에도 "자동 재노출 N회" 행 추가.
- 광고 관리 페이지의 "오늘 N/M회 실행"은 그대로 유지(당일치).

## Part 4 — #2: 배너 로테이션 안내 투명화(구매 전)

**목적**: 프리미엄 배너는 3자리 공유 풀 로테이션인데 구매 결정 화면에 설명이 없어 "단독 상단 노출" 오인 소지.

- [employer-ad-guide.tsx](../../apps/web/src/components/bambi/screens/employer-ad-guide.tsx) 배너 `PlacementSection`(kind==="banner")에 정적 안내 추가: **"프리미엄 배너는 상단·좌·우 3자리를 지정 주기로 순환 노출합니다(구매자 수에 따라 대략 1/N 비중)."**
- (애널리틱스에는 이미 유사 설명 존재 — 구매 전 화면에도 동일 취지 반영.)

## Part 5 — #3: 수동 끌어올리기 최소 간격(쿨다운), 상품별 기본 10분

- **스키마**: `adProduct.manualBoostCooldownMinutes` `integer("manual_boost_cooldown_minutes").default(10).notNull()` 추가([bambi.ts:898 인근](../../packages/db/src/schema/bambi.ts)).
- **폼** [ad-product-form.tsx](../../apps/web/src/components/bambi/ad-product-form.tsx): 리스팅 상품에 "수동 끌어올리기 최소 간격(분)" 입력(기본 10). 배너형은 숨김. create/update input(zod)·[ad-products.ts](../../packages/api/src/routers/bambi/ad-products.ts) 전달 배선.
- **순수 헬퍼** [bambi-job-boost.ts](../../packages/api/src/services/bambi-job-boost.ts): `isManualBoostWithinCooldown(lastManualBoostAt, now, cooldownMinutes)` + `DEFAULT_MANUAL_BOOST_COOLDOWN_MINUTES=10`. 단위 테스트 동반.
- **강제** [promotions.ts `boost`](../../packages/api/src/routers/bambi/promotions.ts): 자격 판정 통과 후, 이 공고의 **가장 최근 manual `jobBoostEvent.createdAt`** 조회 → 쿨다운(상품값: `post.adProductId`로 라이브 조회, 없으면 기본 10) 이내면 `BAD_REQUEST` "N분 후에 다시 끌어올릴 수 있습니다.". 자동 끌어올리기·정원엔 영향 없음.
  - 쿨다운은 정책 노브라 라이브 조회(운영자 변경 즉시 반영). manual 소스(daily/count) 무관 적용.

## Part 6 — #5: 대기열 순번 라벨 폴리시

**이미 구현됨**: `listMyAds`가 배너+스페셜+추천 큐를 `premiumQueue`로 병합, 광고 관리 페이지가 `대기열 N번째`/`진행 가능` 배지 렌더([promotions/page.tsx:222](../../apps/web/src/app/employer/promotions/page.tsx)).

**작업(폴리시만)**: 배지 문구가 스페셜/추천에도 자연스럽게 읽히는지 점검. 신규 로직·컬럼 없음. (필드명 `premiumQueue`는 관용 유지.)

---

## 마이그레이션

- **0082**: `ad_product.manual_boost_cooldown_minutes integer NOT NULL DEFAULT 10` 1컬럼 추가.
- drizzle `db:generate` → `db:migrate`는 사용자 승인 후 실행, 적용 후 `information_schema`로 컬럼 검증([DB 마이그레이션 워크플로우 메모] 준수, `db:push` 금지).

## 테스트

- **순수 로직 단위 테스트**(vitest, 워크트리 내 실행): `isManualBoostWithinCooldown` 경계값(직전=차단, 경과=허용, 0분=항상 허용).
- 라우터/DB 의존 테스트는 dev DB를 지우는 스위트가 있어 **실행 금지**(기존 제약).
- 타입체크(web·api)·ultracite(경로 인자 필수) 클린.
- 시각 검증(안내 페이지 남은 자리·문구, 성과 리포트 재노출 지표, 폼 쿨다운 입력)은 사용자가 확인(개발서버·스크린샷 금지 제약).

## 완료 기준

1. 광고 안내: 스페셜·추천 "남은 자리 N/12·N/20"(+만석 대기열 안내), 급구 미표시.
2. 스페셜·급구·추천 상품에 "하루 N회 최상단 재노출 보장" 문구(폼·안내), 과장 표현 없음.
3. 성과 리포트에 "자동 재노출(7일) N회" 총계·공고별 표시.
4. 배너 placement에 로테이션/공유 비중 안내.
5. 수동 끌어올리기 상품별 쿨다운(기본 10분) 폼 설정·강제 동작.
6. 대기열 순번 배지가 스페셜/추천에도 정상 표기.
7. 마이그레이션 0082 적용·검증, 타입체크·린트·단위테스트 클린.

## 이슈 분할

- **이슈 A — 정원 표시 & 재노출 보장 문구(요구사항 1·2·#4)**: Part 1·2. 백엔드는 대부분 완료(listingCapacity), 안내 페이지 배선 + 폼/안내 리라벨.
- **이슈 B — 성과 리포트 재노출 실행 횟수(#1)**: Part 3. analytics 집계 1건 + UI 지표.
- **이슈 C — 정직 문구·품질 가드(#2·#3·#5)**: Part 4·5·6. 배너 로테이션 안내 + 수동 끌올 쿨다운(마이그레이션 0082) + 대기열 라벨 폴리시.
