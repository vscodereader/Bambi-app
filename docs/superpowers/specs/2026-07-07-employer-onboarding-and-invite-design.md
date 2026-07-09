# 구인자 온보딩 재구성 + 팀 초대 대상 제한 설계

작성일: 2026-07-07

## 배경 / 문제

현재 구인자(employer) 온보딩과 팀 초대는 다음과 같이 동작한다.

- **회원가입**: 업소회원 가입 시 이름·업체명·이메일·비밀번호를 받고, `registerEmployer`가
  `organization` + `member(owner)` + `bambiProfile(employer)` + `employerOrganizationProfile(pending)`을
  한 번에 생성한다. 가입 직후 `/employer` 레이아웃이 화면을 통째로 **승인 대기 화면(`EmployerPending`)**으로
  대체한다(nav도 숨김).
- **팀 초대**: owner가 임의의 이메일을 입력하고 권한·팀을 골라 초대하면 `invitation` 테이블에
  `pending` 레코드만 생성된다. 초대 대상에 제한이 없다.

이를 다음으로 바꾼다.

1. 업소회원 가입은 **이름·이메일·비밀번호만** 받는다. 가입 시점엔 employer 프로필만 만들고,
   승인 대기 페이지 없이 바로 `/employer`로 보낸다.
2. 업체정보(**업체명 + 사업자등록번호**)를 `/employer/me`에서 제출해야 조직이 생성되고, **운영자 승인**을
   받아야 구인자 관리·새 공고 등록·조직 설정을 조작할 수 있다. 미제출·미승인 구인자는 해당 화면이
   **보이되 조작이 비활성화**되고 안내 문구가 표시된다.
3. 팀 초대는 **현재 employer로 가입된 계정만** 대상으로 하며, 이메일 입력 시 아래에 **검색 매칭된
   (이메일 + 이름) 리스트**가 노출된다.

## 스코프

포함:
- 회원가입 폼/플로우 변경 (업체명 필드 제거, 가입 시 employer 프로필만 생성)
- 업체정보 제출 → 조직 생성(pending) → 운영자 승인 게이팅
- 게이팅 방식 전환: 화면 통짜 대체 → 조작 요소 disabled + 안내 배너 (프론트 + 서버 방어)
- 팀 초대 대상 제한(employer만) + 검색 매칭 자동완성(이메일 + 이름)

제외(후속 논의):
- 초대 **수락(accept) · member/teamMember 합류** 플로우. 이번엔 초대 대상 제한 + 자동완성까지만.
- 초대 이메일 발송 / 초대 링크

## 결정 사항 (확정)

| 항목 | 결정 |
|---|---|
| 조직 생성 시점 | **업체정보 제출 시** 생성(`pending`). 승인 시 `verified`로 전환. |
| 게이팅 방식 | 화면은 보이되 **조작 요소 disabled + 안내 문구**. 서버에서도 방어. |
| 업체정보 입력 위치 | **`/employer/me`** (업체 정보 페이지) |
| 초대 대상 범위 | **모든 employer 프로필**(승인 여부 무관) |
| 자동완성 방식 | **검색 매칭**(입력값으로 서버 필터, 상위 N개). 전체 목록 무차별 노출 안 함. |

## 설계

### A. 회원가입

**웹 회원가입 폼** — `apps/web/src/components/bambi/screens/auth-screen.tsx`
- 업소회원 모드에서 **업체명(`orgName`) 입력 필드 제거**. 이름·이메일·비밀번호만 받는다.
- 안내 문구를 "가입 후 업체정보를 입력하면 운영자 승인 후 이용 가능"으로 조정.
- `signupRole` 토글(개인/업소)은 유지.

**가입 직후 처리** — `finishSignup`
- 업소회원 → `registerEmployer` 대신 **`createEmployerProfile`**(이미 존재, `bambiProfile` role=employer만
  생성)를 호출하고 `/employer`로 이동.
- 조직·member·orgProfile은 이 시점에 만들지 않는다.

**서버** — `packages/api/src/routers/bambi/onboarding.ts`
- `registerEmployer`(조직까지 생성)는 회원가입 경로에서 더 이상 쓰지 않는다. 조직 생성 로직은
  아래 `submitEmployerBusinessInfo`로 이관한다. (기존 프로시저는 제거하거나 신규 mutation으로 대체)

### B. 업체정보 제출 + 조직 생성

**신규 mutation** — `submitEmployerBusinessInfo({ displayName, businessRegistrationNumber })`
(`onboarding.ts`), `protectedProcedure` + employer 프로필 필수. upsert 성격:
- **조직 없음(가입 직후)**: 트랜잭션으로 `organization` + `member(role="owner")` +
  `employerOrganizationProfile(verificationStatus="pending", displayName, businessRegistrationNumber)` 생성.
  (기존 `registerEmployer` 트랜잭션 로직 재사용)
- **조직 있음(반려 후 재제출 등)**: 해당 `employerOrganizationProfile`의 displayName·
  businessRegistrationNumber를 update하고 `verificationStatus="pending"`으로 세팅.

입력 검증:
- 업체명: 비어 있지 않음.
- 사업자등록번호: `000-00-00000` 형식(하이픈 포함 10자리) 검증.

**스키마**: `employerOrganizationProfile.businessRegistrationNumber`(nullable text)와
`employer_verification_status` enum(`none|pending|verified|rejected`)이 **이미 존재** → 마이그레이션 불필요.

**업체정보 화면** — `apps/web/src/app/employer/me/page.tsx`
- 현재 조회 전용인 화면에 **업체명 + 사업자등록번호 입력 폼**을 추가하고 `submitEmployerBusinessInfo`를 호출.
- 제출 후 상태(`none`/`pending`/`rejected`)를 표시. 이 페이지는 게이팅과 무관하게 **항상 활성**.

### C. 승인 게이팅 전환

**레이아웃** — `apps/web/src/app/employer/layout.tsx`
- 현재: `resolveEmployerAccess().verified`가 false면 nav를 숨기고 children 대신 `<EmployerPending />`을 렌더.
- 변경: **항상 nav + children을 렌더**. `employerApprovalStatus`(none/pending/rejected/verified)를
  하위 화면으로 전달한다. `resolveEmployerAccess`는 리다이렉트(role 불일치) 검사는 유지하되 화면을
  가로막지 않는다.

**조작 비활성화 지점** (미승인 = `verified` 아님일 때 disabled + 안내)
- 새 공고 등록: `app/employer/page.tsx`(대시보드의 "새 공고" 링크/버튼, 공고 "수정" 링크),
  `app/employer/new/page.tsx`(제출 버튼/폼).
- 조직 설정: `components/bambi/org-profile-form.tsx`(저장 버튼·입력), `app/employer/settings/page.tsx`,
  `app/employer/settings/teams/page.tsx`(팀 관리).
- 안내 배너 공용 컴포넌트를 하나 만들어 상태별 문구를 재사용:
  - `none`(업체정보 미제출): "공고를 등록하려면 업체명과 사업자등록번호를 입력하세요." + `/employer/me` 링크.
  - `pending`: "운영자 승인 대기 중입니다."
  - `rejected`: 반려 사유 + 재제출 유도(`/employer/me`).
- `EmployerPending` 컴포넌트는 제거하고 로직을 안내 배너로 흡수.

**서버 방어** (프론트 disabled만으로 불충분)
- `jobs.create`(`jobs.ts`), `organizations.updateProfile`·팀/조직 설정 관련 mutation에 **`verified` 검사**를
  추가. 미승인이면 FORBIDDEN. (기존 member/role 검사에 승인 상태 조건을 더한다.)

### D. 팀 초대 대상 제한 + 자동완성

**자동완성 쿼리** — 신규 프로시저(예: `teams.searchEmployerInvitees({ organizationId, query })`)
- `bambiProfile.role="employer"`인 유저를 `user` 테이블과 join해 **(userId, email, name)**를 반환.
- `query`(입력값)로 email/name을 **서버 필터링**하고 상위 N개(예: 10개)만 반환. 전체를 무차별 노출하지 않는다.
- 제외 대상: 본인, 해당 조직의 기존 member, 이미 `pending` 초대가 있는 이메일.

**초대 폼 UI** — `apps/web/src/components/bambi/team-member-list.tsx`
- 이메일 입력 필드를 shadcn **Combobox/Command** 기반 검색 입력으로 바꾸고, 입력 아래에 매칭된
  **이메일 + 이름** 리스트를 노출. 항목 선택 시 해당 이메일로 확정.
- 권한(role)·팀 선택은 기존대로 유지.

**서버 검증** — `inviteMember`(`teams.ts`)
- 입력 이메일이 **employer 프로필을 보유한 계정인지** 확인. 아니면 에러(초대 불가).
- 기존 권한 검사(`canInviteMembers`), 팀 소속 검사는 유지.

## 데이터 모델 영향

- **스키마 변경 없음.** `businessRegistrationNumber`, `employer_verification_status`가 이미 존재.
- 가입 직후 employer는 조직이 0개 → `getMyRouting`의 `employerApprovalStatus`가
  `deriveEmployerApprovalStatus([])` = `"none"`. 게이팅은 이 값으로 판단.
- 향후 "다른 owner 초대로 팀 합류" 시 남의 조직 member가 되면 `getMyRouting`이 그 조직의
  `verificationStatus`를 읽어 자연스럽게 처리(구조가 이미 수용). 단, 수락 플로우 구현은 이번 스코프 밖.

## 테스트 관점

- 회원가입: 업소회원 가입 후 조직 없이 employer 프로필만 생성되고 `/employer`로 이동, 대시보드가
  잠금 + "업체정보 입력" 안내 상태인지.
- 업체정보 제출: 최초 제출 시 organization + member(owner) + orgProfile(pending)이 생성되는지,
  재제출 시 update + pending으로 전환되는지, 사업자번호 형식 검증.
- 승인 게이팅: `none`/`pending`/`rejected`에서 새 공고·조직 설정 조작이 프론트에서 disabled이고
  서버에서도 FORBIDDEN인지. `verified`가 되면 통과하는지.
- 초대: employer가 아닌 이메일 초대 시 서버 거부, 자동완성이 검색어로 필터되고 본인·기존 멤버·
  pending을 제외하는지, 이메일+이름이 함께 표시되는지.

## 미해결 / 후속

- 초대 수락(accept) · member/teamMember 합류 · 이메일 발송은 이번 스코프 완료 후 별도 설계.
