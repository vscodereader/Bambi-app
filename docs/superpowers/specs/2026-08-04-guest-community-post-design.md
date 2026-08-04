# 비회원 성인인증 수다방 글·댓글·추천 작성 — 설계

날짜: 2026-08-04 · 브랜치: `feat/guest-community-post` (base: `develop`)

## 목적

비회원(비로그인)도 성인인증(포트원 본인인증)을 통과하면 수다방에서 글 작성·댓글·추천을 할 수 있게 한다. 기존 게스트 인증 인프라(공개 `startIdentityVerification`/`checkIdentityForSignup` + 서명 게스트 쿠키 `bambi_guest`)는 현재 읽기 게이트 통과 전용이며, 이번 작업은 이 신원을 API 서버까지 전달해 쓰기 경로를 여는 것이다.

## 정책 결정 (확정)

- **허용 범위**: 글 작성 + 댓글 + 추천.
- **게시판**: `free`(자유수다)·`work_talk`(일수다)만. 공지는 관리자 전용, 중고거래·베스트는 비로그인 비공개라 제외.
- **자격**: 게스트 토큰 유효 + `gender === "female"` (회원의 여성 전용 입장 규칙과 동일 축). 성인(만 19세) 판정은 토큰 발급 시점에 이미 완료.
- **소유권**: 게스트 글·댓글은 **비밀번호 필수**(4자 이상). 수정·삭제는 비밀번호 검증으로만 가능. 잠금글(비밀글) 작성은 불가 — 공개 경로에서 잠금글이 숨겨져 본인도 못 읽게 되기 때문. `password_hash`는 소유권 증명 전용이며 `is_locked`는 false 유지.
- **작성인 이름**: 기본값 "비회원", 자유 수정 가능하되 회원과 동일하게 `assertDisplayNameAllowed` 금칙어 검사 적용.

## 아키텍처

### ① 게스트 신원 기반 (공통)

- `apps/web/src/lib/bambi/guest-token.ts`의 토큰 생성·검증 로직을 `packages/api/src/services/bambi-guest-token.ts`로 이동 (env·db 무의존, Web Crypto — `portone-identity.ts`와 같은 공유 패턴). web 사용처(`proxy.ts`, `visitor.ts`, `api/guest/route.ts`)는 import 교체. dev 폴백 시크릿 문자열 3곳 중복도 상수 하나로 정리.
- 토큰 페이로드 **v2**: `{ exp, gender, v: 2, gid }` — `gid`는 발급 시 `crypto.randomUUID()`. 추천 중복방지·레이트리밋 키로 사용. v1 토큰은 읽기 게이트에서 계속 유효, 쓰기는 `gid` 필수(없으면 재인증 유도).
- 전달 경로: 게스트 쿠키는 `httpOnly:false`·host-only라 API 서버(별도 호스트)에 실리지 않음 → 클라 oRPC 링크에서 쿠키 값을 `x-bambi-guest` 헤더로 첨부 → `packages/api/src/context.ts`가 서명·만료 검증 후 `context.guest = { gid, gender }` 세팅. `BAMBI_GUEST_TOKEN_SECRET`을 server env에도 추가.

### ② DB (마이그레이션 1건)

- `community_post`: `author_user_id` nullable화 + `author_guest_id`(text, nullable) 추가. 작성자는 정확히 한쪽만 채워지는 CHECK.
- `community_comment`: 동일하게 `author_user_id` nullable화 + `author_guest_id` + `password_hash`(회원은 빈 문자열 — 글과 같은 관례) 추가.
- `community_post_like`: `user_id` nullable화 + `guest_id` 추가 + `(post_id, guest_id)` unique. 한쪽만 채워지는 CHECK.
- `bambi_user_role` enum 끝에 `guest` append(마이그레이션 관례) + 라벨 맵에 "비회원" 추가.

### ③ API

- `resolveCommunityActor(context)` 신설: 회원이면 기존 `requireCommunityMember` 결과, 아니면 `context.guest` 검증(여성) 후 게스트 actor 반환. 실패 시 UNAUTHORIZED.
- `createPost`·`updatePost`·`deletePost`·`toggleLike`·`createComment`·`updateComment`·`deleteComment`·`listComments`를 `publicProcedure` + actor 기반으로 전환. 기존 검증(금칙어·tiptap 스키마·보드 규칙·notice/promotion 제한)은 그대로 한 곳 유지.
- 게스트 분기: 보드 제한(free·work_talk), 비밀번호 필수(기존 scrypt 해시 재사용), `author_role: "guest"`, `author_guest_id` 저장. 수정·삭제·(잠금글과 동일한) 비번 검증 흐름.
- 레이트리밋: 게스트는 `gid` 버킷 + IP 이중 (선례: `account-recovery.ts`의 공개 쓰기 + IP 레이트리밋).
- `listComments`는 공개 보드 한정 public화(비로그인 상세 댓글 표시용).

### ④ Web UI

- 게스트 동선은 기존 공개 영역 `/board`에 얹는다(게이트 수정 불필요): 게시판·상세에 글쓰기·댓글·추천 UI 추가 → 미인증 게스트면 기존 본인인증 다이얼로그(`phone-verify-dialog`) → 인증 후 작성.
- 글쓰기 폼은 `CommunityPostForm` 재사용 + 게스트 모드(작성인 기본 "비회원", 비밀번호 입력 필수). 수정·삭제는 비밀번호 입력 다이얼로그.
- 회원 영역(`/seeker/community`)은 변경 없음.

## 에러 처리

- 토큰 무효·만료·v1(gid 없음): 401 + 클라에서 재인증 다이얼로그 유도.
- 남성 게스트: 403 (회원 입장 거부와 같은 메시지 축).
- 게스트가 비허용 보드·잠금글·공지 작성 시도: 400.
- 비밀번호 불일치 수정·삭제: 403.

## 테스트·검증

- api 테스트: actor 해석(회원/게스트/무효 토큰), 게스트 보드 제한, 비밀번호 소유권(수정·삭제), 추천 중복방지(gid unique).
- `check-types` + ultracite lint(경로 인자 필수) 통과.
- 마이그레이션은 drizzle generate 후 적용 검증 (db:push 금지).
