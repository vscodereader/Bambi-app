# 무료 법률 자문 게시판 — 설계

날짜: 2026-08-05 · 브랜치: `feat/guest-community-post` (base, 게스트 회원 수다방 개방 병합 후 착수)

## 목적

수다방에 "무료 법률 자문" 게시판(`legal`)을 추가한다. 질문 글은 전부 비밀글(비밀번호 필수)이며, 지정된 "법률 자문 계정"(신설 역할 `legal_advisor`)과 운영자가 잠긴 글을 열람하고 답변(댓글)할 수 있다. 운영자 관리 페이지에서 법률자문 역할을 지정·해제할 수 있어야 한다.

## 정책 결정 (확정)

- **작성 자격**: 수다방 자격자 전부 — 여성 회원·광고 중인 업소회원·여성 성인인증 게스트. 게스트 쓰기 허용 보드에 `legal` 추가(자유수다·일수다·법률).
- **잠금**: legal 보드 글은 **잠금 필수 + 비밀번호 필수**(회원 포함 — 다른 보드는 선택인 잠금이 여기선 강제). 게스트의 "잠금글 작성 금지" 가드는 legal에서만 예외(강제 잠금 — 게스트도 비번으로 자기 글을 열람 가능해 모순 없음).
- **연락처**: 글 작성 시 연락처(휴대폰 번호) **선택** 입력. 잠금 해제 열람자(작성자·운영자·법률자문)에게만 표시. 답변 문자 발송 기능은 후속 — 지금은 저장만.
- **법률 자문 계정**: `bambi_user_role`에 `legal_advisor` 신설. better-auth admin plugin/createAccessControl 도입은 하지 않는다(user 테이블 플러그인 스키마 + 기존 role 축과 이중화 — 과함).
- **베스트 큐레이션 제외**: legal 글은 전부 잠금이라 마스킹 제목만 노출될 것이므로 best에서 제외.
- **공개 `/board` 미포함**: 상담 글 특성상 비공개 유지(`PUBLIC_COMMUNITY_BOARDS` 무변경).

## DB (마이그레이션 1건)

- `community_board` enum 끝에 `legal` append.
- `bambi_user_role` enum 끝에 `legal_advisor` append.
- `community_post`에 `contact_phone`(text, nullable) 추가.

## API

### 보드 규칙 (`community.ts` + `bambi-community-authz.ts`)
- `createPost`: legal 보드는 회원·게스트 모두 `isLocked: true` + 비밀번호(4자 이상) 강제, `contactPhone` 선택 입력 저장. 수정도 동일 규칙 유지(잠금 해제 불가).
- 게스트 허용 보드 `free`·`work_talk`에 `legal` 추가, 게스트 잠금 금지 가드에 legal 예외.
- `getPost`: 잠금 해제 열람 시에만 `contactPhone` 반환(마스킹 경로에서는 미포함).
- 베스트 큐레이션 쿼리에서 `legal` 제외.

### 잠금 열람 권한
- `canBypassLock` 확장: `profile.role === "legal_advisor"` && 글 board가 `legal`이면 통과(목록 제목 마스킹 해제 포함). 다른 보드 잠금글은 기존대로 불가. 운영자(admin)는 기존 규칙 유지.
- `resolveCommunityAccess`(수다방 입장): `legal_advisor`는 성별·광고 무관 입장 허용.
- 법률자문 계정은 legal 보드 잠금글에 댓글(답변) 작성 가능. 작성자 역할 라벨 맵에 `legal_advisor: "법률자문"` 추가(답변 뱃지 표시).

### 운영자 역할 지정
- moderation 라우터에 adminProcedure `setUserRole`: **구직자 ↔ 법률자문** 양방향 전환만 허용. 구인자 계정은 조직·팀·공고 결합 때문에 전환 거부(안내 메시지). `adminModerationAction`에 `set_role:legal_advisor` / `set_role:job_seeker` 감사 기록(기존 `set_status` 패턴).

## Web UI

- **홈 수다방 섹션**(`CommunityOverviewGrid` — seeker 홈·수다방 홈 공유): 중고거래 카드 자리를 좌우로 반 나눠 **중고거래 | 무료 법률 자문** 나란히 배치(모바일은 세로 스택). overview API 응답에 legal 목록 추가.
- **게시판**: `COMMUNITY_BOARDS`에 `{ key: "legal", label: "무료 법률 자문", slug: "legal" }` 추가(중고거래 다음) — 탭·목록·경로 자동 반영. 목록은 전 글 잠금이라 제목 마스킹 표시(법률자문·운영자·작성자 제외).
- **글쓰기 폼**(`CommunityPostForm`): legal 보드 선택 시 잠금 토글 숨김(강제 잠금 안내), 비밀번호 필수, 연락처(선택) 입력 필드. 게스트 모드도 동일.
- **상세**: 연락처는 열람 권한자에게만 표시. 법률자문 계정의 답변 댓글에 "법률자문" 뱃지.
- **운영자 회원 상세**(`/moderator/users/[id]`): "법률자문 지정/해제" 액션(확인 다이얼로그 + 사유, 기존 제재 액션 문법 재사용). 역할 표기 라벨 맵에 "법률자문" 반영.

## 에러 처리

- legal 보드에 비밀번호 없이 작성 시도: 400 (기존 잠금 비번 규칙 문구 축).
- 법률자문이 legal 외 보드 잠금글 열람 시도: 기존 비번 요구 그대로.
- 구인자 계정 역할 전환 시도: 400 + 안내.

## 테스트·검증

- 순수 가드(잠금 강제·legal 예외·canBypassLock 확장·역할 전환 허용 축) 단위 테스트(`bambi-community-authz.test.ts` 축).
- `check-types` 4패키지 + ultracite(경로 인자) 통과. 마이그레이션은 drizzle generate 후 적용 검증(db:push 금지).
- 매뉴얼(`docs/manual/*`)·테스트 플로우 문서에 법률 자문 게시판 반영.
