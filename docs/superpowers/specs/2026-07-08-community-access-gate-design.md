# 수다방(커뮤니티) 접근 제어 — 설계

- 관련 이슈: #2 (수다방 기능 추가 및 접근 제어), 선행 #18 (gender 필드)
- 브랜치: `feat/community-access-gate` (`feat/phone-verify-gender`에서 분기, develop 대상)
- 작성일: 2026-07-08

## 목표 / 스코프

수다방(커뮤니티)에 **여성회원**과 **광고 중인 업소 회원**만 입장할 수 있도록 접근 제어를 도입한다.
이번 작업은 **여성회원 판정 우선** 스코프로 한정한다.

포함:
- 회원 `gender` 배선 (온보딩 시 게스트 성인인증 쿠키에서 이전)
- 서버 접근 자격 판정 헬퍼 + `getMine` 응답 플래그 노출
- 프론트 탭 게이팅(3곳) + 페이지 가드 + 입장 자격 안내 화면
- `bambi_profile.is_advertiser` **컬럼만** 추가(default false)

제외(후속 이슈):
- `is_advertiser` ↔ 광고 캠페인 상태 동기화 / 기간 만료 처리
- 조직 다중 멤버 중 광고 자격 부여 범위 (플래그가 profile 단위라 자연 해소)
- 게시판 실기능(글·댓글 CRUD·신고·정렬)

## 전제 / 현황

- `gender` enum·컬럼·마이그레이션(`packages/db/src/migrations/0009_bambi_profile_gender.sql`)은 이미 완료. nullable.
- 회원 `gender`는 아직 기록되지 않음: `createBambiProfile`/`updateMyProfile`이 gender를 쓰지 않고, `getBambiAccessProfile`도 gender를 읽지 않는다.
- 게스트 성별은 `ADULT_SEX_COOKIE`(male→"1"/female→"2")에만 존재. 회원은 `bambi_profile.gender`로 이원화.
- 게스트는 미들웨어(`resolve-gate.ts`)가 `/seeker/community`를 이미 차단 → `/welcome?guestBlocked=1`.
- 접근 판정 계층은 3곳: 미들웨어(edge, DB 조회 불가 → 쿠키만), 서버 프로시저(`bambi-authz.ts`), 프론트 탭·페이지 가시성.

## 입장 자격 정의

```
canAccessCommunity(profile) =
    status !== "suspended"
    AND (
        role === "admin"                                   // admin 항상 허용
        OR gender === "female"                             // 여성회원
        OR (role === "employer" AND isAdvertiser === true) // 광고 중인 업소
    )
```

- 미인증 회원(`gender = null`)은 광고 업소가 아니면 입장 불가.
- 이번 스코프에서 `isAdvertiser`는 항상 false(default)이므로 광고 업소 입장 경로는 실질적으로 아직 작동하지 않는다(후속 동기화 시 자동 작동). 헬퍼 로직에는 조건을 포함해 둔다.

## 컴포넌트별 설계

### 1. DB / 마이그레이션
- `gender`는 그대로 사용(이미 완료).
- `bambi_profile`에 `is_advertiser boolean NOT NULL DEFAULT false` 컬럼 추가.
- `packages/db/src/schema/bambi.ts`의 `bambiProfile` 정의에 컬럼 추가 후 drizzle `generate`로 신규 마이그레이션(`0010_*`) 생성. (DB 마이그레이션 워크플로우: `db:push` 금지, generate→migrate만.)

### 2. gender 배선 (온보딩 쿠키 이전)
- `packages/api/src/routers/bambi/onboarding.ts`의 `createBambiProfile`에서 요청 컨텍스트의 `ADULT_SEX_COOKIE`를 읽어 `adultSexToGender()`로 변환 → `profile.gender`로 기록.
- 쿠키가 없으면 `gender: null`로 생성(기존 동작 유지). 미인증 회원은 안내 화면에서 인증 유도.
- 쿠키 접근 방식은 API 컨텍스트가 쿠키를 어떻게 노출하는지에 맞춰 구현 시 확정(헤더/컨텍스트 헬퍼).

### 3. 서버 authz (`packages/api/src/services/bambi-authz.ts`)
- `BambiAccessProfile` 인터페이스에 `gender`, `isAdvertiser` 추가.
- `getBambiAccessProfile`의 select에 두 컬럼 추가.
- `canAccessCommunity(profile)` 순수 헬퍼 신설(위 정의).
- (선택) `requireCommunityAccess` — 후속 게시판 CRUD 프로시저 가드용. 이번엔 헬퍼만 두고 실사용은 후속.

### 4. `getMine` 응답 플래그 노출
- `onboarding.getMine` 반환에 `canAccessCommunity: boolean` 필드 추가(profile 기반 계산).
- 프론트에 gender 원값을 노출하지 않고 플래그만 소비하게 한다.

### 5. 프론트 컨텍스트 · 탭 게이팅
- `apps/web/src/components/bambi/auth-client-provider.tsx`의 `useBambiAuth()` 컨텍스트에 `canAccessCommunity` 노출(현재 `role`만).
- "수다방" 탭 3곳에서 `canAccessCommunity`일 때만 렌더:
  - `mobile-tab-bar.tsx` (items 배열 조건부)
  - `persona-nav.tsx` (MobileTabBar에 위임 — 자동 반영)
  - `responsive-shell.tsx` (`DEFAULT_NAV_ITEMS` 조건부 필터)

### 6. 페이지 가드 + 안내 화면
- `apps/web/src/app/seeker/community/page.tsx`: 서버 자격 조회 → 미자격자는 입장 자격 안내 화면.
- 신규 컴포넌트 `community-access-notice.tsx` 분기:
  - 미인증(gender null) → "휴대폰 인증하고 입장하기" (mock 인증 다이얼로그 연결)
  - 남성 업소(employer, 미광고) → "광고 등록하고 입장하기" (`/employer/promotions` 유도)
  - 남성 구직자 → "여성 회원 전용 공간" 안내(입장 불가)
- 게스트 차단(미들웨어 `resolve-gate`)은 현행 유지, 손대지 않는다.
- UI는 shadcn 컴포넌트 최대 재사용(EmptyState/Alert/Button 등), 임의 px 금지·토큰 사용, 모바일 반응형 고려.

### 7. 테스트 / 검증
- `canAccessCommunity` 헬퍼 단위 테스트: 여성/남성/미인증/업소±광고/admin/suspended 조합.
- 빌드·dev 서버·스크린샷 금지. 린트+타입체크+단위테스트만 수행, 시각 확인은 사용자에게 요청.

## 브랜치 전략

- `feat/phone-verify-gender`에서 분기한 `feat/community-access-gate` 워크트리에서 작업.
- gender가 develop에 아직 없으므로 이 브랜치는 gender 커밋을 포함한다. phone-verify-gender가 develop에 먼저 병합되면 자연 정리된다.
- 푸시·PR은 사용자의 명시적 지시가 있을 때만 수행한다.
