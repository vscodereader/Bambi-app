# 테스트 사이트 계정 제재·운영자 채팅·페이지네이션 QA 개선 계획

**Goal:** 최신 `develop`이 배포된 테스트 사이트에서 확인된 다섯 가지 회귀를 한 번에 수정한다. 이용정지 회원의 허용 범위를 운영자 `1:1 상담`으로 제한하고, 탈퇴 회원이 포함된 신고 채팅도 운영자가 원문과 첨부를 열람하게 하며, 모든 공용 페이지 이동 컨트롤에 개별 총 페이지 수를 표시한다. 사용자 경고 되돌리기 확인창은 현재 화면 중앙에 띄우고, 이용정지 구인자의 모든 신규 공고 등록 진입점을 차단한다.

**Architecture:** 최신 `origin/develop`에서 만든 통합 브랜치 하나를 사용한다. 계정 제재 판정은 기존 `onboarding.getMine`의 `bambiProfile.status`를 클라이언트 공통 인증 컨텍스트에서 재사용하고, 서버의 `requireActiveBambiProfile`을 최종 방어선으로 유지한다. 운영자 상담 채팅은 현재처럼 일반 활성 프로필 가드를 거치지 않는 별도 `supportChat` 경로를 유지한다. 운영자 채팅 열람은 참가자의 탈퇴 상태와 무관한 admin 전용 조회로 보강하고 탈퇴 시점과 이름을 함께 반환한다. 페이지 수 표시는 공통 `PageControls`가 전달받은 `pageCount`를 직접 렌더링하도록 해 각 목록의 독립적인 총 페이지 수를 사용한다. DB 스키마 변경은 없다.

**Branch / worktree:**

- Branch: `fix/test-site-account-moderation-pagination-qa`
- Worktree: `C:\Users\user\bambi\.worktrees\test-site-account-moderation-pagination-qa`
- Base: `origin/develop` `2f55ba24b7cb12daa0f6886107940a5507ace72a`
- 사용자가 직접 커밋·푸시하며 Codex는 커밋·푸시·머지를 수행하지 않는다.

## 확정 요구사항

1. 이용정지된 구직자와 구인자에게 허용하는 유일한 예외 기능은 화면 우측 하단의 `1:1 상담`(운영자 문의) 위젯이다.
2. 이용정지 구직자는 기존처럼 공고 지원 채팅, 수다방, 글·댓글 작성 등 나머지 기능을 이용할 수 없다.
3. 이용정지된 여성 구직자가 수다방 카드·더보기를 누르면 일반 자격 미달 문구보다 정지 상태가 우선하며 `차단된 유저는 확인이 불가합니다`를 표시한다.
4. 수다방 라우트를 직접 열어도 같은 정지 안내를 표시하고 구직자 홈으로 돌려보낸다.
5. 운영자는 신고 검토 화면과 채팅 관리 화면에서 구인자 또는 구직자가 탈퇴했어도 채팅방 전체 대화와 첨부파일을 열람할 수 있다.
6. 탈퇴 회원은 기존 이름을 유지하고 이름 옆에 `탈퇴` 표시를 추가한다. 일반 회원 화면의 `탈퇴한 회원` 마스킹 정책은 변경하지 않는다.
7. 공용 페이지 이동 UI의 기존 왼쪽 화살표·숫자 입력·오른쪽 화살표 모양은 유지하고 입력 필드 오른쪽에 `/ 총 페이지 수`를 표시한다.
8. 총 페이지 수는 화면별 하드코딩 없이 각 호출부가 계산한 `pageCount`를 사용한다.
9. 공용 컴포넌트의 직접 사용처와 `DataTable`을 통한 간접 사용처를 모두 반영한다.
10. 사용자 상세의 `경고 보내기`·`이용 정지` 제재 확인창과 `최근 경고 1회 되돌리기` 확인창은 문서 하단이 아니라 현재 뷰포트 중앙에 표시한다. 데스크톱·모바일 모두 버튼을 누른 즉시 추가 스크롤 없이 창 전체와 조작 버튼을 볼 수 있어야 한다.
11. 이용정지 구인자의 모든 `새 공고 등록`·`공고 등록` 진입점을 비활성화한다.
12. 이용정지 구인자가 주소를 직접 입력해 `/employer/new`로 접근하면 폼을 렌더링하지 않고 한국어 이용정지 안내 화면을 표시한다.
13. 신규 공고 등록 서버 mutation의 기존 이용정지 거부는 유지해 UI 우회를 막는다.
14. 운영자 사용자 상세의 제재 이력은 최신순으로 한 페이지에 10개씩 조회하며, 이력이 10개를 넘으면 공용 `< 숫자 입력 / 총 페이지 수 >` 페이지네이션으로 이동한다.

## 현재 코드 확인 결과

- `AuthClientProvider`가 역할과 `accountStatus`를 이미 공통 제공한다.
- 수다방 홈 진입은 `HomeCommunitySection`이 `canAccessCommunity`만 보고 일반 자격 미달 문구를 표시하며, 직접 진입은 `RequireCommunityAccess`가 별도의 일반 문구를 사용한다. 두 곳 모두 정지 우선 분기가 없다.
- 우측 하단 `1:1 상담`은 `supportChat`의 `publicProcedure`와 회원 ID/게스트 쿠키 식별을 사용한다. 회원 메시지 전송은 프로필·역할 확인에 활성 상태 가드를 사용하면 정지 회원까지 거부하므로, 프로필 존재 확인만 사용해 상담 예외를 보장해야 한다.
- 일반 공고 지원 채팅·커뮤니티 작성·공고 등록 등 보호 기능은 서버의 `requireActiveBambiProfile` 또는 범위별 제재 가드로 정지 계정을 거부한다.
- 신고 상세의 채팅 내역은 공용 `ChatHistoryContent`와 admin 전용 `getChatMessagesForModeration`을 사용하지만, 응답에 참가자 탈퇴 상태가 없고 방·공고·사용자 조인이 모두 필수 조인이다. 탈퇴 보존 상태를 명시적으로 다루는 테스트도 없다.
- `PageControls`는 이미 각 화면의 `pageCount`를 입력받지만 숫자 입력만 렌더링한다. 직접 사용처는 구인자 내 공고·프로모션, 운영자 출석·채팅·수집 공고·수집 커뮤니티·후기, 내 신고이며 `DataTable`을 통해 추가 목록이 간접 사용한다.
- 사용자 상세의 제재 이력은 서버가 최신 50건을 한 번에 반환하고 화면이 모두 렌더링해, 기록이 많으면 상세 화면이 지나치게 길어지고 50건 이전 기록에는 접근할 수 없다.
- 사용자 상세의 제재 적용과 경고 되돌리기 확인창은 긴 상세 컨테이너 기준 `positioning="absolute"`를 사용하면 페이지 하단으로 밀린다. 같은 확인 컴포넌트가 뷰포트 기준 `fixed` 위치를 이미 지원한다.
- 구인자 대시보드의 `NewJobButton`은 업체 승인 여부만 확인하고, 데스크톱 nav와 모바일 하단 nav도 정지 상태를 확인하지 않는다. `/employer/new` 페이지는 역할·등록 범위만 확인한 뒤 폼을 보여 주므로 정지 회원도 제출 직전까지 진입한다.

## 구현 단위 1 — 이용정지 구직자의 수다방 안내 우선순위와 상담 예외

**예상 커밋:** `fix: 이용정지 구직자 접근 안내 정리`

**Files:**

- Modify: `apps/web/src/components/bambi/home-community-section.tsx`
- Modify: `apps/web/src/components/bambi/require-community-access.tsx`
- Create or modify: 관련 Web 테스트
- Modify: `docs/manual/seeker-manual.md`
- Modify: `docs/test-flows/seeker-test-flow.md`

### 동작 계약

- `accountStatus === "suspended"`를 일반 `canAccessCommunity === false`보다 먼저 판정한다.
- 홈 수다방 카드와 `더보기` 클릭은 `차단된 유저는 확인이 불가합니다` 토스트를 표시하고 이동하지 않는다.
- `/seeker/community` 및 하위 라우트 직접 접근은 같은 토스트를 한 번만 표시하고 `/seeker`로 교체 이동한다.
- 정지가 아닌 미자격 회원은 기존 문구와 흐름을 유지한다.
- 비회원 여성 인증 게스트, 정상 여성 구직자, 광고 중인 구인자, 법률자문 계정의 기존 접근 규칙은 변경하지 않는다.
- `1:1 상담` 위젯의 읽기·새 대화·메시지 전송은 정지 구직자와 정지 구인자 모두에게 계속 허용한다. `supportChat.sendMessage`는 프로필 존재와 운영자 역할만 확인하고 활성 상태 가드를 사용하지 않는다.
- 상담 운영자가 별도로 차단한 `support_chat_room.isBlocked` 정책은 계정 이용정지와 별개이므로 그대로 유지한다.

### 테스트

- 정지 회원이 홈 수다방 링크를 누르면 정지 문구가 일반 자격 문구보다 우선하는지 검증한다.
- 정지 회원의 직접 수다방 진입이 동일 문구와 `/seeker` 복귀를 사용하는지 검증한다.
- 정상 미자격 회원은 기존 일반 문구를 유지하는지 검증한다.
- `supportChat` 라우터가 회원 식별 시 `requireBambiAccessProfile`로 프로필과 역할만 확인하고, 계정 상태와 무관하게 전송을 허용하는 계약을 소스 또는 라우터 테스트로 고정한다.

## 구현 단위 2 — 탈퇴 참가자가 포함된 운영자 신고 채팅 전체 열람

**예상 커밋:** `fix: 탈퇴 회원 신고 채팅 운영자 열람 보장`

**Files:**

- Modify: `packages/api/src/routers/bambi/moderation.ts`
- Modify: `packages/api/test/routers/bambi/moderation-chats.test.ts`
- Modify: `apps/web/src/app/moderator/chats/chat-history-dialog.tsx`
- Modify: 관련 Web 테스트
- Modify: `docs/manual/moderator-manual.md`
- Modify: `docs/test-flows/moderator-test-flow.md`

### 서버 계약

- `getChatMessagesForModeration`은 admin 전용 읽기 API를 유지하며 일반 사용자 채팅의 탈퇴·차단·신고 가드를 재사용하지 않는다.
- 채팅방을 정본으로 조회하고 공고 및 양 참가자 표시 정보는 운영자 열람을 막지 않도록 보존 가능한 조인으로 구성한다.
- soft withdrawal의 `user.deletedAt`과 채팅방의 참가자 나감 시각을 함께 고려해 각 참가자의 `withdrawn` 여부를 반환한다.
- 사용자 행이 개인정보 파기 이후에도 채팅방과 메시지가 보존되어 있다면 방·메시지 열람 자체는 실패시키지 않고 안전한 대체 표시명을 사용한다. soft withdrawal 기간에는 원래 이름을 유지한다.
- 모든 메시지를 `createdAt`, `id` 오름차순으로 반환하고, 각 메시지의 이미지·PDF 첨부 메타데이터와 운영자 전용 object URL을 계속 포함한다.
- 열람 감사 로그 `view_messages`는 유지한다.

### 화면 계약

- 신고 검토와 운영자 채팅 관리가 동일한 `ChatHistoryContent`를 사용한다.
- 탈퇴 참가자는 기존 이름 옆에 `탈퇴` 배지를 표시한다.
- 대화 송수신 불가 표시는 운영자 열람을 막지 않으며 입력창은 원래부터 없는 읽기 전용 상태를 유지한다.
- 메시지 본문, 면접·연락처 시스템 메시지, 이미지·PDF 첨부를 모두 렌더링한다.
- 조회 실패 시에만 오류 상태를 표시하고 단순 탈퇴를 오류로 취급하지 않는다.

### 테스트

- 정상 참가자 방의 기존 조회를 유지한다.
- 구직자만 탈퇴, 구인자만 탈퇴, 양쪽 모두 탈퇴한 방을 각각 조회할 수 있는지 검증한다.
- 탈퇴 전 이름과 `withdrawn=true`가 함께 반환되는지 검증한다.
- 탈퇴 방의 일반 메시지와 첨부파일이 누락되지 않는지 검증한다.
- 존재하지 않는 방과 비운영자 접근은 기존처럼 거부하는지 검증한다.

## 구현 단위 3 — 공용 페이지 이동에 개별 총 페이지 수 표시

**예상 커밋:** `fix: 공용 페이지네이션 총 페이지 수 표시`

**Files:**

- Modify: `apps/web/src/components/bambi/page-controls.tsx`
- Modify or create: `apps/web/test/components/bambi/page-controls.test.tsx` 또는 현재 테스트 구조에 맞는 계약 테스트
- 필요 시 Modify: 공용 컴포넌트를 우회하는 페이지네이션 화면
- Modify: `docs/test-flows/moderator-test-flow.md`
- Modify: 관련 구직자·구인자 테스트 플로우 문서

### 표시 계약

- 기본 모양은 `이전 버튼 → 숫자 입력 → / 총 페이지 수 → 다음 버튼`이다.
- 예: 총 8페이지의 1페이지는 `< [1] / 8 >`로 표시한다.
- 총 페이지 수는 `Math.max(pageCount, 1)`로 안전하게 표시하고 호출부별 `pageCount`를 사용한다.
- 숫자 입력의 기존 Enter·blur 제출, 숫자 외 문자 제거, 1~마지막 페이지 범위 보정 규칙을 유지한다.
- `showPageInput=false`인 호출부는 기존처럼 숫자 입력과 총 페이지 수를 함께 숨긴다.
- 스크린리더가 현재 페이지 입력과 총 페이지 수를 구분해 읽도록 총 페이지 수에 접근 가능한 문맥을 제공한다.

### 적용 범위 조사

- `PageControls` 직접 사용처 전부.
- `DataTable` 내부 사용과 이를 소비하는 운영자·구인자 목록 전부.
- 동일한 숫자 입력 형태를 자체 구현한 화면이 있다면 공용 컴포넌트로 전환하거나 동일 계약을 적용한다.
- 공개 게시판의 번호 링크형 페이지네이션처럼 형태가 다른 UI는 이번 `< 입력 / 총 페이지 >` 요구 대상에서 제외한다.

### 테스트

- `page=1, pageCount=8`에서 `/ 8`을 표시한다.
- 각기 다른 `pageCount`를 전달하면 해당 목록의 값으로 갱신된다.
- 페이지 입력 보정과 이동 콜백이 기존대로 동작한다.
- `showPageInput=false`에서는 `/ 총 페이지 수`도 표시하지 않는다.

### 사용자 제재 이력 추가 계약

- `listUserModerationActions`는 `page`, `pageSize`를 받아 전체 건수와 현재 페이지 항목을 반환한다.
- 기본 페이지 크기는 10이며 안정적인 최신순을 위해 `createdAt`, `id` 내림차순으로 정렬한다.
- 사용자 상세는 이력이 10건을 넘을 때만 공용 `PageControls`를 표시하고, 페이지 이동 중 중복 이동을 막는다.
- 서버 페이지 조회를 사용해 50건을 넘는 과거 이력도 끝까지 열람할 수 있게 한다.
- DB 스키마와 감사 이력 저장 방식은 변경하지 않는다.

## 구현 단위 4 — 경고 되돌리기 확인창을 현재 화면 중앙에 표시

**예상 커밋:** `fix: 경고 되돌리기 확인창 위치 안정화`

**Files:**

- Modify: `apps/web/src/components/bambi/screens/moderator.tsx`
- Modify or create: 관련 Web 계약 테스트
- Modify: `docs/manual/moderator-manual.md`
- Modify: `docs/test-flows/moderator-test-flow.md`

### 동작 계약

- 사용자 상세의 `경고 보내기`·`이용 정지`와 `최근 경고 1회 되돌리기`는 모두 `ReasonConfirmSheet`의 뷰포트 기준 `fixed` 배치를 사용한다.
- 데스크톱은 현재 화면 중앙, 모바일은 안전 영역을 고려한 중앙에 표시하고 높이가 작을 때 내부 스크롤로 모든 필드와 버튼에 접근할 수 있게 한다.
- 배경 오버레이, 포커스 트랩, Escape/취소 동작, 확인 중 중복 제출 방지는 기존 확인 컴포넌트 계약을 유지한다.
- 버튼을 누를 때 문서 하단이나 푸터로 자동 이동하지 않는다.
- 다른 목록 일괄 제재 확인창의 기존 위치는 변경하지 않는다.

### 테스트

- 사용자 상세 제재 적용과 경고 되돌리기 호출부가 모두 `fixed` 배치를 사용하는지 검증한다.
- 확인창이 포털/고정 오버레이로 렌더링되고 제목·사유·취소·확인 요소를 제공하는지 검증한다.
- 모바일·데스크톱 클래스가 viewport 중앙과 최대 높이 스크롤 계약을 만족하는지 검증한다.

## 구현 단위 5 — 이용정지 구인자의 신규 공고 등록 진입점과 직접 URL 차단

**예상 커밋:** `fix: 이용정지 구인자 공고 등록 진입 차단`

**Files:**

- Modify: `apps/web/src/app/employer/page.tsx`
- Modify: `apps/web/src/app/employer/new/page.tsx`
- Modify: `apps/web/src/app/employer/layout.tsx`
- Modify: `apps/web/src/components/bambi/persona-nav.tsx`
- 필요 시 Modify/Create: 정지 상태를 nav에 전달하는 작은 공용 컴포넌트 또는 헬퍼
- Modify or create: 관련 Web 테스트
- Modify: `docs/manual/employer-manual.md`
- Modify: `docs/test-flows/employer-test-flow.md`

### 진입점 계약

- 구인자 대시보드의 상단/빈 상태 `새 공고 등록` 버튼을 disabled 버튼으로 표시한다.
- 데스크톱 구인자 nav의 `공고 등록` 항목은 정지 상태에서 이동하지 않는 비활성 항목으로 표시한다.
- 모바일 하단 nav의 `공고 등록` 탭도 정지 상태에서 이동하지 않고 disabled 접근성 상태를 제공한다.
- 분석·광고 안내 등 다른 화면에서 `/employer/new`로 향하는 `새 공고 등록` 링크도 조사해 같은 정지 가드를 적용한다.
- 정상·경고 구인자의 기존 등록 흐름과 업체 미승인 disabled 규칙은 유지한다.

### 직접 URL 계약

- `/employer/new`는 프로필 로딩이 끝난 뒤 `profile.status === "suspended"`를 역할·업체 범위 검사보다 우선 처리한다.
- 정지 시 `새 공고 등록` 페이지 셸 안에 한국어 제목과 설명을 표시하고 폼과 제출 mutation을 렌더링하지 않는다.
- 안내는 계정이 이용정지되어 새 공고를 등록할 수 없으며 운영자 `1:1 상담`을 이용할 수 있음을 명확히 한다.
- 서버 `jobs.create`의 이용정지 거부는 유지한다.

### 테스트

- 정지 구인자의 대시보드·데스크톱 nav·모바일 nav 등록 진입이 비활성인지 검증한다.
- 정지 구인자가 `/employer/new`로 직접 접근해도 폼이 나타나지 않고 한국어 안내가 표시되는지 검증한다.
- 정상 구인자는 기존 링크와 폼을 사용할 수 있다.
- 정지 구인자의 서버 `jobs.create` 호출이 계속 `FORBIDDEN`인지 기존 API 테스트를 확인한다.

## 접근성·UX 기준

- 비활성 등록 진입점은 시각적 disabled 상태뿐 아니라 `aria-disabled` 또는 실제 `disabled`를 제공하고 키보드·포인터 이동을 막는다.
- 정지 안내는 영어 서버 오류를 사용자 화면에 노출하지 않는다.
- 경고 되돌리기 확인창은 열릴 때 제목 또는 첫 입력으로 포커스를 이동하고 닫힐 때 트리거로 복귀한다.
- 탈퇴 배지는 이름과 함께 읽히며 첨부 링크는 기존 파일명과 타입 정보를 유지한다.
- 페이지네이션 총 페이지 수는 입력 필드와 간격을 두되 모바일에서도 한 줄을 유지한다.

## DB 및 migration

- DB 스키마 변경 없음.
- 신규 Drizzle migration 생성 없음. 기능 코드 자체의 스키마 변경도 없다.
- `db:push` 사용 없음.
- 로컬 `bambi_dev`에서 문의 채팅 테이블이 없는 상태로 더 높은 시각의 다른 브랜치 마이그레이션 이력이 존재해 0094·0095가 건너뛰어진 환경 충돌을 확인했다. 새 마이그레이션을 만들지 않고 저장소의 기존 0094·0095 SQL만 로컬 DB에 적용해 정합을 복구했다.

## 구현 순서

1. 공통 인증 상태와 수다방 진입 안내를 수정하고 상담 예외 회귀 테스트를 추가한다.
2. 운영자 채팅 API와 화면 응답에 탈퇴 상태를 추가하고 탈퇴 참가자 테스트를 보강한다.
3. 공통 `PageControls`에 총 페이지 수를 추가하고 모든 사용처를 재검색한다.
4. 경고 되돌리기 호출부를 viewport 기준 확인창으로 수정한다.
5. 구인자 등록 진입점과 `/employer/new` 직접 접근을 정지 상태로 차단한다.
6. 매 단위의 문서와 테스트를 동기화한 뒤 전체 변경을 교차 검증한다.

## 자동 검증 계획

```powershell
Set-Location 'C:\Users\user\bambi\.worktrees\test-site-account-moderation-pagination-qa'

if (-not (Test-Path 'apps\server\.env')) {
    Copy-Item 'C:\Users\user\bambi\apps\server\.env' 'apps\server\.env'
}

if (-not (Test-Path 'apps\web\.env')) {
    Copy-Item 'C:\Users\user\bambi\apps\web\.env' 'apps\web\.env'
}

pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/moderation-chats.test.ts
pnpm --filter web exec vitest run <이번 작업에서 추가·변경한 테스트 파일>
pnpm --filter @bambi-app/api check-types
pnpm --filter web check-types
pnpm exec ultracite check <변경한 TypeScript·TSX 파일>
git diff --check
```

## 수동 검증 시나리오

- 이용정지 여성 구직자로 홈 수다방 글과 더보기를 눌러 정지 전용 문구가 표시되고 이동하지 않는지 확인한다.
- 같은 계정으로 수다방 URL을 직접 열면 동일 안내 후 구직자 홈으로 돌아가는지 확인한다.
- 이용정지 구직자와 이용정지 구인자로 각각 우측 하단 `1:1 상담`을 열고 기존 대화 조회·새 문의 생성·메시지 전송이 가능한지 확인한다.
- 같은 계정의 공고 지원 채팅·수다방 등 나머지 금지 기능이 여전히 차단되는지 확인한다.
- 한쪽과 양쪽 참가자가 탈퇴한 신고 채팅을 Admin이 열어 기존 이름·`탈퇴` 배지·전체 메시지·이미지/PDF 첨부를 확인한다.
- 서로 다른 총 페이지 수를 가진 수집 공고, 수집 커뮤니티, 사용자, 신고, 채팅, 출석, 후기, 구인자 목록에서 각각 `< 입력 / 해당 총 페이지 >`가 표시되는지 확인한다.
- 제재 이력이 11건 이상인 사용자 상세에서 첫 페이지에 최신 10건이 표시되고, `< 입력 / 총 페이지 >`로 다음 페이지의 과거 이력을 조회할 수 있는지 확인한다.
- 사용자 상세를 중간까지 스크롤한 데스크톱과 모바일에서 이용 정지와 경고 되돌리기를 각각 눌러 현재 화면 중앙에 확인창이 나타나는지 확인한다.
- 이용정지 구인자에게 대시보드·데스크톱 nav·모바일 nav의 공고 등록 진입점이 비활성인지 확인한다.
- 이용정지 구인자가 `/employer/new`를 직접 열면 한국어 안내만 표시되는지 확인한다.

## PR 준비 기준

- 구현 완료 후 이 문서의 완료 조건과 실제 검증 결과를 갱신한다.
- PR 직전 최신 `origin/develop`을 다시 fetch하고 rebase 필요 여부와 충돌을 확인한다.
- CMU02의 최신 이슈·PR·커밋 형식을 확인해 같은 구조와 문체로 이슈와 PR을 작성한다.
- PR 본문에는 변경 목적, 작업 내용, 자동·수동 검증 결과, `Closes #이슈번호`를 포함한다.
- 사용자가 직접 실행할 제목+본문 커밋 명령과 push 명령을 PowerShell 형식으로 제공한다.
- Codex는 커밋·푸시·최종 머지를 수행하지 않는다.

## 완료 조건

- [x] 정지 구직자는 `1:1 상담`만 계속 이용할 수 있고 나머지 기존 제한은 유지된다.
- [x] 정지 구직자의 수다방 접근에 정지 전용 문구가 우선한다.
- [x] Admin은 탈퇴 회원이 포함된 신고 채팅의 이름·탈퇴 표시·전체 대화·첨부를 열람한다.
- [x] 공용 숫자 입력 페이지네이션이 각 목록의 총 페이지 수를 표시한다.
- [x] 사용자 상세의 제재 이력이 서버 기준 10건씩 페이지 조회되고 모든 과거 기록에 접근할 수 있다.
- [x] 사용자 제재 적용과 경고 되돌리기 확인창이 데스크톱·모바일 현재 화면 중앙에 표시된다.
- [x] 정지 구인자의 모든 신규 공고 등록 진입점과 직접 URL 접근이 차단된다.
- [x] DB 변경과 migration이 없다.
- [x] 관련 대상 API/Web 테스트, 타입 검사, Biome, `git diff --check`가 통과한다.
- [x] 실제 검증 결과와 남은 수동 검증 항목을 이 문서에 기록한다.

## 구현 검증 기록

- `supportChat`은 로그인 회원 ID 또는 게스트 상담 쿠키를 식별자로 사용하는 public 경로를 유지했다. 회원 전송 시 `requireActiveBambiProfile` 대신 `requireBambiAccessProfile`을 사용해 이용정지 회원의 새 문의와 메시지 전송을 허용하면서 운영자 발신 금지는 유지했다.
- 홈 수다방과 수다방 직접 진입 모두 `accountStatus === "suspended"`를 일반 자격 미달보다 먼저 안내한다.
- 신고 맥락의 채팅방 상태는 참가자 계정 또는 방 나감 시각이 있으면 `정상` 대신 `탈퇴`로 표시한다.
- Admin 채팅 내역 조회는 공고·사용자 표시 정보에 left join을 사용해 참가자 탈퇴 때문에 방·메시지 조회가 사라지지 않게 했고, soft withdrawal 이름과 이미지·PDF 첨부를 유지한다.
- `PageControls`가 호출부의 `pageCount`를 `/ N`으로 렌더링하며, `DataTable`의 숫자 입력 표시 기본값도 활성화해 직접·간접 사용처에 같은 계약을 적용했다.
- 사용자 제재 이력 API를 전체 건수 포함 서버 페이지네이션으로 전환했다. 화면은 최신순 10건씩 표시하고, 이력이 11건 이상일 때 공용 페이지 이동 UI를 노출하며 제재 변경 후 관련 페이지 캐시를 갱신한다.
- 사용자 상세의 제재 적용과 경고 되돌리기 호출을 `positioning="fixed"`로 전환하고 고정 카드에 viewport 최대 높이와 내부 스크롤을 적용했다.
- 정지 구인자의 내 공고·성과 분석 버튼, 데스크톱 헤더 nav, 모바일 하단 nav를 비활성화했다. 인증 상태를 불러오는 동안에도 등록 진입점을 잠그며 `/employer/new`는 정지 한국어 안내만 렌더링한다.
- `pnpm --filter web exec vitest run test/components/bambi/test-site-account-moderation-pagination-qa.test.ts`: 1개 파일, 6개 테스트 통과.
- `pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/moderation.test.ts -t "제재 이력에 사유와 처리한 운영자 이름이 담긴다"`: 대상 1개 테스트 통과.
- `pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/support-chat.test.ts test/services/bambi-support-chat.test.ts`: 2개 파일, 11개 테스트 통과. 이용정지 구직자·구인자의 새 문의 생성과 첫 메시지 저장을 실제 DB 경로로 검증했다.
- `pnpm --filter @bambi-app/api exec vitest run test/routers/bambi/moderation-chats.test.ts test/services/bambi-policy.test.ts`: 2개 파일, 35개 테스트 통과.
- `pnpm --filter web check-types`, `pnpm --filter @bambi-app/api check-types`: 통과.
- 변경 TypeScript·TSX 15개 파일 대상 `pnpm exec biome check`: 통과.
- `git diff --check`: 통과.
- 기존 `apps/web/test/app/moderator/chats/page.test.ts`의 `scrollIntoView` 소스 문자열 단언은 최신 `develop` 구현이 이미 `scrollTo`로 변경된 상태라 기준선에서도 불일치한다. 이번 변경은 해당 스크롤 로직을 수정하지 않았으며 대상 QA 테스트와 타입 검사는 통과했다.
- 로컬 DB에서 `support_chat_room` 조회가 PostgreSQL `42P01`로 실패하는 것을 통합 테스트로 재현했다. 로컬 마이그레이션 원장 최고 시각이 현재 브랜치 0094·0095보다 높아 `db:migrate`가 두 파일을 건너뛴 것이 원인이었으며, 기존 두 SQL 적용 후 같은 테스트가 통과했다. `db:push`는 사용하지 않았다.
- 실제 테스트 사이트 계정과 화면이 필요한 5개 수동 시나리오는 사용자 또는 배포 환경 수동 검증 대상으로 남긴다.

## 설계 확정 기록

- 2026-08-18: 정지 구직자에게 허용할 예외는 우측 하단 운영자 `1:1 상담` 위젯 하나로 확정했다.
- 2026-08-18: 정지 여성 구직자의 수다방 안내는 `차단된 유저는 확인이 불가합니다`로 확정했다.
- 2026-08-18: 탈퇴 참가자의 기존 이름을 유지하고 `탈퇴` 표시와 함께 대화·첨부 전체를 Admin에게 제공하기로 확정했다.
- 2026-08-18: 공용 숫자 입력 페이지네이션은 기존 모양을 유지하고 입력 옆에 호출부별 총 페이지 수를 표시하기로 확정했다.
- 2026-08-18: 경고 되돌리기 확인창은 사진의 빨간 영역처럼 현재 뷰포트 중앙에 표시하기로 확정했다.
- 2026-08-18: 정지 구인자의 모든 공고 등록 진입점을 비활성화하고 직접 URL에는 한국어 안내를 표시하기로 확정했다.
