# 운영자 콘솔 정리 설계 — 공고/결제 역할 분화 · nav 재구조화 · 무통장입금 계좌 게이트

작성일: 2026-07-24

## 배경

운영자 콘솔에서 세 가지 문제가 관찰됐다.

1. **공고 관리와 결제 관리 페이지의 컬럼이 크게 겹친다.** 두 페이지가 제목·업소·공고 상태·노출 상품·결제 상태·만료 컬럼을 각자 복붙해 유지하고 있고, `getExpiryTone` 헬퍼도 두 파일에 중복 정의돼 있다.
2. **공고 관리의 "관리" 컬럼이 인라인 버튼 2개**(숨김/재공개, 수정)로 되어 있어, 다른 행 액션과 일관성이 없고 확장이 어렵다. 표준 RowActions(드롭다운) 방식으로 통일해야 한다.
3. **운영자 헤더 nav 최상위 항목이 9개**라 화면에서 넘쳐 "채용정보"가 잘린다.
4. **무통장입금 결제 게이트 부재(버그).** 운영자가 입금 계좌를 하나도 등록하지 않은 상태에서도 구인자가 무통장입금을 선택해 공고 등록/수정이 그대로 통과된다. `card` 결제수단은 제출이 차단되는데 `bank_transfer`는 아무 검증이 없다.
5. **광고 안내 페이지 가격 옵션 UI(할인 시 지저분).** 광고 상품 안내 페이지의 가격 옵션이 할인율이 없을 땐 한 줄로 깔끔하지만, 할인이 붙으면 취소선 원가·할인가·빨강(`destructive`) 배지·기간이 좁은 컬럼에서 `flex-wrap`으로 쪼개져 행 높이·정렬이 무너진다.

## 확정된 결정 (사용자 승인)

- **공고 관리 ↔ 결제 관리: 분리 유지 + 역할 분화.** 두 페이지를 유지하되 각자 역할에 맞게 정리하고, 겹치는 셀·헬퍼만 공통화한다.
- **결제 상태 컬럼: 공고 관리에도 유지.** 두 페이지가 공통 셀 팩토리로 동일하게 렌더해 유지보수 중복만 제거한다. 검수 중 결제 여부를 한눈에 보기 위함.
- **헤더 nav: 채용정보 제거 + 추가 그룹화, 최상위 6개.**
- **무통장입금: 계좌 0개면 차단.** `card`와 대칭으로 클라이언트 제출 게이트 + 서버 검증을 모두 둔다.
- **광고 안내 가격 옵션: 기간 리드 + 차분한 표형 1줄.** 빨강 배지를 없애고, 기간을 좌측 키로 세워 최종가를 히어로(코럴 볼드)로, 원가 취소선·할인율은 작고 차분한 부속 정보로 낮춘다. 할인 유무와 무관하게 행 리듬을 일정하게 한다.

## 목표 / 비목표

**목표**
- 공고 관리·결제 관리의 컬럼 정의 중복(셀 렌더러·`getExpiryTone`)을 공통 모듈로 단일화하고 라벨을 통일한다.
- 재사용 가능한 `RowActions` 드롭다운 컴포넌트를 신설하고 공고 관리 "관리" 컬럼에 적용한다.
- 운영자 헤더 nav를 6개 최상위 구조로 재편한다(배열만 수정, 렌더러는 그대로).
- 무통장입금 계좌 미등록 시 유료 공고 결제를 클라이언트·서버 양쪽에서 차단한다.
- 광고 안내 페이지 가격 옵션을 할인 유무와 무관하게 일관된 표형으로 재정렬한다.

**비목표**
- 결제 관리의 벌크 처리 UX(체크박스 다중선택 + 상단 액션 바)는 현행 유지한다.
- 게시물·팀 멤버 등 다른 화면의 행 액션을 이번에 `RowActions`로 이관하지 않는다(신설 컴포넌트가 그쪽에서도 재사용 가능하도록만 설계).
- `card` 결제수단의 "미지원" 정책은 건드리지 않는다.
- 결제/주문 전용 테이블 신설 같은 데이터 모델 변경은 하지 않는다(계좌는 기존 `bambi_site_settings.bankAccounts` jsonb 유지).

---

## 워크스트림 1 — 공고 관리 ↔ 결제 관리 (역할 분화 · 중복 제거 · RowActions)

### 1-1. 역할 정의

- **공고 관리**(`apps/web/src/app/moderator/jobs/page.tsx`) = 검수/노출 관점. 컬럼:
  공고 제목 · 업소 · 업종 · 지역 · 급여 · 공고 상태 · 노출 상품 · 결제 상태 · 노출 마감 · **관리(RowActions)**.
  (현재 컬럼 구성 유지 — 결제 상태 포함. "관리" 컬럼만 인라인 버튼 → RowActions로 교체.)
- **결제 관리**(`apps/web/src/app/moderator/payments/page.tsx`) = 미결제 유료공고 정산 관점. 현행 유지:
  체크박스 다중선택 · 공고 제목 · 업소 · 공고 상태 · 노출 상품 · 결제 금액 · 결제 상태 · 남은 기간 · 만료 상태 · 등록일 + 상단 벌크 결제처리.

두 페이지는 서로 다른 업무(건별 검수 vs. 입금 확인 배치)를 담당하므로 통합하지 않는다. 공고 관리에 결제 관리 전용 컬럼(결제 금액·남은 기간·등록일)을 추가하지 않고, 결제 관리에 검수 전용 컬럼(업종·지역·급여)을 추가하지 않는다.

### 1-2. 중복 제거 — 공통 컬럼 셀 팩토리

두 페이지가 공유하는 셀 렌더러와 헬퍼를 한 모듈로 뽑는다(신규 `apps/web/src/lib/bambi/job-table-columns.tsx`, `@/lib/bambi/exposure`의 라벨·헬퍼를 import해 조합).

- 공통화 대상 셀: **공고 제목 · 업소 · 공고 상태 · 노출 상품 · 결제 상태 · 만료**.
- `getExpiryTone`(현재 `jobs/page.tsx:68-78`, `payments/page.tsx:37-47` 중복)를 공통 모듈로 이동해 단일 정의.
- 만료 셀은 두 페이지의 표기가 달라(공고=배지+남은 일수, 결제=배지만) `variant` 파라미터로 분기하는 하나의 빌더로 통일.
- **라벨 통일: "업체" → "업소"**(결제 관리의 `organizationDisplayName` 헤더를 공고 관리와 동일하게).
- 각 페이지의 `getJobColumns`/`getPaymentColumns`는 공통 빌더를 조합해 자기 컬럼 배열만 구성한다.

### 1-3. 재사용 RowActions 컴포넌트 신설

이 레포에는 공용 `RowActions`가 없고 "관리" 컬럼 구현이 페이지마다 제각각이다(팀 멤버 화면 `team-member-list.tsx:204-286`의 `MemberRowActions`만 `DropdownMenu` 기반). 표준 컴포넌트를 신설한다.

- 위치: `apps/web/src/components/bambi/row-actions.tsx`.
- 기반: shadcn `DropdownMenu`(레포 기존 규약 준수, base-ui `render` prop 사용).
- 트리거: `MoreHorizontalIcon` ghost 아이콘 버튼(접근성 라벨 "관리").
- API(초안): `actions: RowAction[]` — 각 액션은 `{ key, label, onSelect?, href?, variant?: "default" | "destructive", disabled?, hidden?, icon? }`. `href`가 있으면 `DropdownMenuItem`을 `Link`로 `render`, 아니면 `onSelect` 버튼.
- 정렬: 셀은 우측 정렬(`cellClassName: "text-right"`, 헤더 `"관리"`).

공고 관리 "관리" 컬럼(현재 `jobs/page.tsx:203-224`)을 다음 액션으로 교체:
- **수정** → `/moderator/jobs/${id}/edit` 링크.
- **숨김**(공고 상태 `published`일 때만) → 기존 확인 Dialog(사유 입력) 흐름 유지 후 `setJobPostStatus`.
- **재공개**(공고 상태 `hidden`일 때만) → `setJobPostStatus` published.

숨김/재공개 확인 Dialog·mutation 로직 자체는 재사용한다(드롭다운은 트리거만 대체).

---

## 워크스트림 2 — 운영자 헤더 nav 재구조화 (최상위 6개)

헤더는 이미 shadcn `NavigationMenu` + 드롭다운 그룹을 사용한다(렌더러 `apps/web/src/components/bambi/responsive-shell.tsx`가 `NavGroup` 지원). 따라서 **항목 배열 `MODERATOR_NAV_ITEMS`(`apps/web/src/app/moderator/layout.tsx:12-45`)만 재구성**하면 된다.

목표 구조(최상위 6개):

1. **검수 큐** (단일, `/moderator`)
2. **공고 관리** (단일, `/moderator/jobs`)
3. **회원 관리** ▾ — 사용자(`/moderator/users`) · 신고(`/moderator/reports`) · 업소 승인(`/moderator/employers`) · 팀 합류 승인(`/moderator/team-invites`)
4. **광고·결제** ▾ — 광고 상품(`/moderator/ad-products`) · 결제 관리(`/moderator/payments`)
5. **콘텐츠** ▾ — 게시물(`/moderator/content`) · 고객센터(`/moderator/support`) · 금칙어(`/moderator/banned-words`) · 후기 관리(`/moderator/reviews`)
6. **사이트 정보** (단일, `/moderator/site-settings`)

변경 내용:
- **채용정보(`/seeker`) 항목 제거** — 채용정보는 `/seeker` 메인으로 이동하는 외부 링크였고 nav 오버플로우의 원인.
- 단일 링크였던 **신고·사용자**를 기존 **승인 관리**(업소·팀 합류)와 합쳐 **회원 관리** 그룹으로 흡수.
- **콘텐츠·고객센터** 그룹을 **콘텐츠**로 명칭 정리(구성 동일).
- 모바일 하단 탭 셸(`persona-nav.tsx`의 `ModeratorShell`)은 별도 구조이며 이번 범위에서 건드리지 않는다(단, 회원 관리 그룹 변경과의 정합성만 확인).

라우트 자체·페이지 파일은 변경하지 않는다(nav 링크 구성만 조정).

---

## 워크스트림 3 — 무통장입금 계좌 0개 차단

운영자 입금 계좌는 별도 테이블이 아니라 `bambi_site_settings.bankAccounts` jsonb 배열이며(`packages/db/src/schema/bambi.ts:597-600`), `getPaymentAccounts`(`packages/api/src/routers/bambi/site-settings.ts:175-182`)로 조회한다. 무통장입금은 **유료 상품 선택 시에만** 노출되는 결제수단이다(무료 공고는 결제수단 섹션 자체가 없음).

### 3-1. 클라이언트 제출 게이트 (`card`와 대칭)

- `apps/web/src/app/employer/new/page.tsx`, `apps/web/src/app/employer/jobs/[id]/edit/page.tsx`:
  - `getPaymentAccounts` 조회로 계좌 개수 확보.
  - `bankTransferBlocked = Boolean(form.adProductId) && form.paymentMethod === "bank_transfer" && accounts.length === 0` 계산(기존 `cardPaymentBlocked`(`new/page.tsx:530-531`)와 동일 패턴).
  - 제출 버튼 `disabled`(`new/page.tsx:920-926`, edit `499-500`)에 `bankTransferBlocked` 추가.
  - 결제수단 근처에 인라인 안내 표시.
- `apps/web/src/components/bambi/bank-transfer-guide.tsx:69-73`의 0개 폴백 문구를 "입금 계좌가 준비되기 전이라 무통장입금으로 등록할 수 없습니다. 다른 결제수단을 선택하거나 고객센터에 문의해 주세요."로 명확화.

### 3-2. 서버 검증 (방어선)

- `packages/api/src/routers/bambi/jobs.ts`의 `resolveJobPostExposure`(`510-569`)에서, `paymentMethod === "bank_transfer"`이고 유료 상품(`adProductId` 존재)일 때 `bambiSiteSettings.bankAccounts`를 읽어 비어 있으면 `ORPCError`(BAD_REQUEST)를 던진다.
- `resolveJobPostExposure`는 create(`1263-1303`)·`applyJobPostUpdate`(`609-673`) 양쪽에서 호출되므로 등록·수정이 한 번에 커버된다.
- 메시지는 클라이언트 안내와 동일 취지로 통일.

무료 공고 경로(결제수단 없음)에는 영향이 없다. 계좌가 0개인 동안에는 유료 공고 결제가 사실상 막히며, 운영자가 계좌를 1개 이상 등록하면 정상화된다(의도된 게이트).

---

## 워크스트림 4 — 광고 안내 가격 옵션 재디자인 (할인 표현)

### 4-1. 현상 진단

광고 상품 안내 페이지(`apps/web/src/components/bambi/screens/employer-ad-guide.tsx`)의 "비용 및 기간" 컬럼은 4열 그리드 중 가장 좁은 트랙(`minmax(0,1fr)`)이다. 옵션 렌더(`175-189`)가 `[AdPriceTag] (기간)`을 `flex-wrap`으로 감싸고, `AdPriceTag`(`apps/web/src/components/bambi/ad-price-tag.tsx`)는 할인 시 `취소선 원가 + 코럴 할인가 + destructive 배지`를 또 `flex-wrap`으로 나열한다. 결과:
- 할인은 긍정 정보인데 **빨강(`destructive`) 배지**가 오류색으로 읽힌다.
- 할인 행만 2줄로 부풀어 **행 높이·정렬이 할인 없는 행과 어긋난다**.
- `flex-wrap`이 배지·기간을 예측 불가하게 다음 줄로 쪼갠다.

### 4-2. 재디자인 (기간 리드 · 차분한 표형 1줄)

**대상 정의**: 업소 사장(구인자)이 광고 기간 티어(30·60·90일)를 비교해 실제 낼 금액을 확인하는 표. 장기 계약일수록 할인이 유인이다.

**핵심 결정**: 기간을 좌측 키로 세워 표처럼 정렬하고, 최종가를 히어로(코럴 볼드)로, 원가·할인율은 차분한 부속 정보로 낮춘다. 빨강 배지를 없앤다. 할인 유무와 무관하게 행 리듬을 일정하게 유지한다.

목표 형태:

```
비용 및 기간
────────────────────────────
30일   1,500,000원
60일   2,700,000원  3,000,000원(취소선)  10% 할인
90일   3,825,000원  4,500,000원(취소선)  15% 할인
```

- **기간**: 각 옵션 행의 좌측 키(`text-muted-foreground text-xs`, 항상 같은 폭). 기존 trailing `(30일)` 표기를 leading 키로 이동.
- **최종가**: 히어로(`font-bold text-base text-coral-600`).
- **원가·할인율**: 작고 차분한 부속. 원가는 `text-muted-foreground text-xs line-through`, 할인율은 `text-coral-600 text-xs font-medium`(배지 아님). 원가+할인율은 `whitespace-nowrap` 한 덩어리로 묶어 좁을 때 함께 줄바꿈(쪼개지지 않음).

**구현 변경점(2개 파일)**:
- `ad-price-tag.tsx`: 할인 분기의 순서를 **최종가 → 취소선 원가 → 할인율**로 바꾸고, `Badge variant="destructive"`를 차분한 텍스트(`text-coral-600 text-xs font-medium`)로 교체. 원가+할인율은 `whitespace-nowrap`로 그룹. props(API)는 그대로 유지.
- `employer-ad-guide.tsx`: "비용 및 기간" 옵션 행을 `grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3`로 재구성 — col1 = 기간 키, col2 = `AdPriceTag`(가격 블록). trailing `({formatAdDuration(option.days)})` 제거.

**공유 컴포넌트 주의**: `AdPriceTag`는 공고 등록 폼(`job-exposure-fields.tsx`)에서도 쓰인다. 배지 제거·순서 변경은 그쪽에도 반영되므로(일관성 상 바람직), 변경 후 공고 등록 폼의 가격 표시가 깨지지 않는지 확인한다. 안내 페이지 전용 레이아웃(기간 리드 그리드)은 `employer-ad-guide.tsx`에만 적용한다.

---

## 영향 파일 요약

**워크스트림 1**
- (신규) `apps/web/src/components/bambi/row-actions.tsx`
- (신규) `apps/web/src/lib/bambi/job-table-columns.tsx` — 공통 셀 팩토리 + `getExpiryTone`
- `apps/web/src/app/moderator/jobs/page.tsx` — 공통 팩토리 사용 + "관리" 컬럼 RowActions화
- `apps/web/src/app/moderator/payments/page.tsx` — 공통 팩토리 사용 + 라벨 통일

**워크스트림 2**
- `apps/web/src/app/moderator/layout.tsx` — `MODERATOR_NAV_ITEMS` 재구성

**워크스트림 3**
- `apps/web/src/app/employer/new/page.tsx`, `apps/web/src/app/employer/jobs/[id]/edit/page.tsx` — `bankTransferBlocked` 게이트
- `apps/web/src/components/bambi/bank-transfer-guide.tsx` — 폴백 문구
- `packages/api/src/routers/bambi/jobs.ts` — `resolveJobPostExposure` 계좌 검증

**워크스트림 4**
- `apps/web/src/components/bambi/ad-price-tag.tsx` — 할인 분기 순서·배지 제거·차분한 할인율 텍스트
- `apps/web/src/components/bambi/screens/employer-ad-guide.tsx` — 비용 및 기간 옵션 행 기간 리드 그리드

## 검증

- `pnpm check-types`(web·api), `pnpm lint`/ultracite 클린.
- 무통장입금 서버 검증: api 테스트로 "계좌 0개 + bank_transfer + 유료상품 → 에러", "계좌 1개 이상 → 통과" 케이스 추가.
- 광고 가격 옵션: `AdPriceTag`·`employer-ad-guide` 관련 web 테스트(`ad-price-tag`/`employer-ad-guide.test.ts`, `job-exposure-fields.test.ts`)가 배지 제거·순서 변경으로 깨지면 함께 갱신.
- UI 시각 확인(nav 6개 배치, RowActions 드롭다운, 제출 버튼 비활성, 할인 가격 옵션 정렬)은 사용자가 IDE 실행분(HMR)에서 확인.
- 빌드/실행은 하지 않는다(프로젝트 규칙).

## 리스크 / 유의

- 공통 셀 팩토리로 뽑을 때 두 페이지의 정렬(`sortValue`)·`cellClassName` 차이를 보존해야 한다(특히 만료 셀 `variant`).
- RowActions는 base-ui `DropdownMenu` `render` prop 규약을 따라야 하며, `DataTable` 셀 안에서 포털 렌더가 테이블 `overflow`에 잘리지 않는지 확인.
- 무통장 서버 검증 추가로, 기존 테스트/시드가 "계좌 0개 상태에서 유료+bank_transfer 공고"를 만들고 있으면 깨질 수 있으니 픽스처를 함께 점검.
