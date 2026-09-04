# native 구인자 후속(끌어올리기 옵션 구매·채팅 탭·계좌 복사·사업자 임시저장) 설계

- 날짜: 2026-09-04
- 브랜치: `feat/native-recruiter-boost`(base `mobile`)
- 선행: PR #292(구인자 영역 구축), PR #295(광고 관리·성과 분석·팀 관리)
- 범위 결정(사용자): 끌어올리기 옵션은 **광고 관리 단독 구매만**, 구매 UI는 **별도 Stack 화면**, `expo-clipboard` **추가 허가**

## 1. 배경

PR #292가 "끌어올리기 옵션·계좌번호 복사·업체 채팅 탭·사업자 임시저장"을, PR #295가 "끌어올리기 옵션 구매"를 각각 후속으로 이연했다. 서버는 이미 전부 갖춰져 있어 **DB 마이그레이션도, 새 프로시저도 없다.** 이번 작업은 native가 기존 oRPC 계약을 쓰게 붙이는 일이다.

이번 범위에서 제외(다음 브랜치): 상세 디자인 제작 신청, 배너 레이아웃(단색 배경) 편집, 슬라이싱 생성, 공고 폼 UI/UX 미반영분(첫 오류로 스크롤, 뒤로가기 경고, 급여 천단위 표기 등).

## 2. 끌어올리기 옵션 구매

### 2.1 서버 계약(기존)

`packages/api/src/routers/bambi/boost-options.ts`

| 프로시저 | 용도 | 비고 |
|---|---|---|
| `listOptions` | 판매 중(가격 not null) 옵션 | `optionType` 정렬 고정(manual_period→manual_count→auto_period) |
| `purchaseOption` | 단독 구매 | 입력 `{ jobPostId, optionType, paymentMethod }`, 반환 `{ id, amount }`, `purchaseSource="standalone"` |
| `cancelPurchase` | 미결제 구매 취소 | `paid`면 거부, `standalone`이 아니면 거부 |

거부 사유는 서버가 한국어 메시지로 내려준다(미판매·배너형 공고·입금 대기 중복·활성 기간제 중복). **화면에서 미리 판정하지 않는다** — 웹과 같은 규칙으로 서버 메시지를 그대로 토스트에 띄운다. 두 곳에서 판정하면 한쪽만 바뀐다.

### 2.2 진입점과 화면

- 새 Stack 화면 `apps/native/app/(employer)/boost-options.tsx`, `(employer)/_layout.tsx`에 `title="끌어올리기 옵션"`으로 등록.
- 파라미터: `jobPostId`, `jobTitle`(제목 표시용).
- 진입: 광고 관리(`promotions.tsx`) 카드 액션 줄의 "옵션 구매" 버튼. **배너형 공고(`AD_BANNER_EXPOSURE_TYPES`)에서는 버튼을 숨긴다** — 서버가 거부하는 대상이라 열어 둘 이유가 없다.
- `src/lib/employer/ad-promotions.ts`의 한도 0 사유 문구 "웹에서 끌어올리기 옵션을 구매할 수 있어요"를 앱 내부 유도 문구로 교체한다.

화면 구성(위→아래):

1. 공고 제목 + 안내 한 줄
2. 옵션 목록 — `listOptions` 결과를 카드형 단일 선택. 각 항목은 라벨 · 스펙 요약 · 가격. 판매 중인 옵션이 없으면 안내 카드
3. 결제수단 — 무통장입금 고정, 신용카드는 비활성 표시 + "준비 중"(#292 확정 정책과 동일)
4. 계좌 안내 — 공용 `BankAccounts`(§4)
5. 입금 확인 대기 목록 — 옵션 라벨 · 금액 · 취소 버튼
6. `stickyFooter`에 "옵션 구매" CTA

### 2.3 데이터 조회

`listMyAds`는 집계값(`boostOptionManualPerDay`·`hasUnpaidBoostOption` 등)만 주고 **구매 id를 내려주지 않는다.** 취소 대상을 만들 수 없으므로 웹 다이얼로그와 같은 이유로 `jobs.getEditableById({ id: jobPostId })`를 함께 조회해 `boostPurchases`에서 `paymentStatus === "unpaid"`만 추린다.

편집 조회가 실패하면 빈 목록으로 두지 않고 "입금 대기 내역을 불러오지 못했어요" 경고를 띄운다 — 조용한 빈 목록은 "대기 없음"과 구별되지 않는다.

구매·취소 성공 시 무효화 대상: `promotions.listMyAds`, `jobs.getEditableById({ id })`.

### 2.4 라벨·포매터 공유 (web 코드 이동)

`JOB_BOOST_OPTION_TYPE_LABELS`와 `formatBoostOptionSpec`이 `apps/web/src/lib/bambi/boost-options.ts`에 있어 native가 쓸 수 없다. 복제하면 라벨이 갈라지므로 **`packages/api/src/services/bambi-job-boost.ts`**(이미 `isBoostPurchaseActive`가 사는 곳)로 옮기고, 웹 lib는 재수출만 남긴다. `EXPOSURE_TYPE_LABELS`가 서비스에 사는 것과 같은 축이며, 웹 소비처는 수정하지 않는다.

DB enum 원값은 화면에 노출하지 않는다(라벨 맵 경유).

### 2.5 공고 수정 화면은 건드리지 않는다

`jobs.update`는 `boostOptionTypes` 키를 생략하면 기존 구매를 **보존**하고, native `job-update.ts`는 이미 보내지 않는다. 현재 동작이 안전하므로 그대로 둔다.

## 3. 구인자 채팅 탭

- 서버 `chats.listMine`/`getById`가 `viewerIsEmployer`로 역할을 이미 분기해 상대 표시명을 뒤집어 준다. **새 프로시저·새 입력 없음.**
- seeker의 목록/방 화면(`app/(seeker)/(tabs)/chats.tsx`, `app/(seeker)/chats/[id].tsx`)을 공용 화면 컴포넌트로 추출하고 `(seeker)`·`(employer)` 라우트는 얇게 남긴다. 방 화면이 531줄이라 복붙하면 두 벌을 함께 고쳐야 한다.
- 역할별로 달라지는 것은 **빈 상태 문구와 그 CTA 경로**뿐이다(구직자는 공고 탐색, 구인자는 공고 관리). prop으로 받는다.
- 새 라우트 `app/(employer)/chats/[id].tsx`, `(employer)/(tabs)/chats.tsx`의 플레이스홀더 제거.
- `src/components/chat/*`, `src/lib/chat/*`(소켓·낙관적 갱신·읽음 워터마크)는 그대로 재사용한다.

## 4. 계좌 안내 공용화와 복사

native에 계좌 안내가 이미 두 벌 있다 — `promotions.tsx`의 `BankGuideDialog`, `job-exposure-section.tsx`의 `BankAccounts`. 구매 화면에 세 번째 사본을 만들지 않고 `apps/native/src/components/bank-accounts.tsx`로 추출해 셋이 공유한다(`siteSettings.getPaymentAccounts` 조회 포함).

복사 버튼은 이 공용 컴포넌트에 한 번만 붙인다 — `expo-clipboard`의 `setStringAsync` + heroui 토스트. 웹 `bank-transfer-guide.tsx`와 같은 동작이다.

설치는 `pnpm expo install expo-clipboard`(SDK 호환 버전 고정). **네이티브 모듈이라 사용자 쪽에서 prebuild/재빌드가 한 번 필요하다.**

## 5. 사업자 임시저장

`onboarding.saveEmployerBusinessDraft`(입력: 표시명·사업자번호·대표자명·개업일자 + `organizationId`)를 `app/(employer)/me/business.tsx`에 배선한다.

- 웹(`apps/web/src/app/employer/me/page.tsx`)과 같은 규칙: 입력 4종 중 하나가 바뀌면 500ms 디바운스 후 저장.
- `organizationId`가 있고 인증 상태가 `verified` 또는 `changes_unsubmitted`일 때만 호출한다. 조직 생성 전에는 저장할 대상이 없고, `pending`은 서버가 거부한다.
- 저장 실패는 조용히 넘긴다(사용자가 계속 입력 중인 자동 저장이므로 토스트를 띄우지 않는다). 확정 제출은 기존 `submitEmployerBusinessInfo` 그대로.

## 6. 테스트

순수 로직만 `apps/native/src/lib/**` 콜로케이션 vitest로 덮는다(native vitest include는 `{src,test}/**`).

- 끌어올리기: 미결제 구매 필터, 구매 CTA 비활성 판정(옵션 미선택·카드 결제·요청 중), 배너형에서 진입 버튼 숨김 판정
- 채팅: 역할별 빈 상태 문구·CTA 경로 분기
- 사업자 임시저장: 자동 저장 가능 여부 판정(조직 id 유무 × 인증 상태)

화면 렌더 테스트는 만들지 않는다(기존 native 스위트와 같은 방침).

## 7. 검증과 배포

- `pnpm --filter native check-types`, `npx ultracite check <경로>`, `pnpm --filter native test`
- **마이그레이션 없음**, 서버 로직 변경 없음(§2.4의 코드 이동은 동작 무변경)
- 실기기 확인(사용자):
  - 옵션 구매 → 광고 관리 카드의 입금 대기 배지 갱신, 취소 후 사라짐
  - 배너형 광고 공고에서 "옵션 구매"가 보이지 않는지
  - 계좌번호 복사(재빌드 후), 세 화면 모두에서 같은 안내가 나오는지
  - 구인자 채팅 목록·방 진입, 상대 표시명이 지원자로 나오는지, 구직자 채팅이 그대로인지
  - 사업자 입력 중 앱을 껐다 켜도 값이 남는지, 인증 대기 상태에서는 저장이 일어나지 않는지
