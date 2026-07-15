# 수다방(커뮤니티) 게시판 설계

작성일: 2026-07-15

## 1. 목적

접근 게이트만 있고 "준비 중" 자리표시자로 비어 있는 수다방(`/seeker/community`)에 실제
게시판 UI와 백엔드를 구현한다. 레퍼런스(queenalba 커뮤니티 인덱스 + 게시판 리스트,
`docs/queenalba-benchmark-2026-06-29.md` 참고)에서 **구조**(인덱스형 홈 + 게시판별 목록 +
번호 페이지네이션)만 가져오고, 비주얼은 밤비 디자인시스템(shadcn/base-ui + 코럴 토큰)을
따른다.

## 2. 범위

이번 단계에 포함:

- 게시판 4개: **베스트글**(자동 큐레이션·읽기전용) · **자유수다** · **일 이야기** · **중고거래**
- 글 목록(번호 페이지네이션) / 글 상세(조회수) / 글 작성·수정·삭제
- 평면 댓글(작성·삭제, 대댓글 없음)
- 추천(좋아요) 토글
- 글 신고(기존 `report` 테이블·`moderation.createReport` 연계)

비범위(후속 작업):

- `/seeker` 홈 급구↔추천 사이 커뮤니티 섹션 삽입 (사용자가 명시적으로 나중에 하기로 함)
- 대댓글, 댓글 신고, 비밀글, 이미지 첨부, 검색, 운영자 커뮤니티 관리 큐(숨김 처리 UI)
- native 앱

## 3. 접근 제어

- 자격 규칙은 기존 그대로: `정지 아님 AND (admin | 여성회원 | 광고 중 업소)` —
  `resolveCommunityAccess` 재사용.
- 클라이언트 게이트(`RequireCommunityAccess`)와 Edge 게이트(`resolve-gate.ts`,
  `/seeker/community` prefix)는 이미 완성. 하위 라우트는 prefix 매칭으로 자동 커버.
- **신규: 서버 강제.** 지금은 서버에 커뮤니티 자격 검사가 없다. 모든 커뮤니티 프로시저가
  호출하는 `requireCommunityMember(session)` 서비스 헬퍼를 신설한다
  (`requireActiveBambiProfile` → 라이브 `hasActiveAdvertiserCampaign` →
  `resolveCommunityAccess`, 미자격 시 FORBIDDEN).
- 수정은 작성자 본인만, 삭제(글·댓글)는 작성자 본인 + admin.

## 4. 데이터 모델 (packages/db)

- `community_board` pgEnum: `free | work_talk | market`. 베스트글은 DB에 없는 **가상
  게시판**(추천수 큐레이션 뷰)이다.
- `community_content_status` pgEnum: `published | hidden | deleted`. 삭제는 소프트
  삭제(`deleted`), `hidden`은 후속 운영자 기능용으로 값만 확보.
- `community_post`: id(uuid), board, authorUserId(→user, cascade), title, body,
  viewCount, likeCount(캐시), commentCount(캐시), status, createdAt, updatedAt.
  `updatedAt`은 `$onUpdate` 없이 수정 프로시저에서만 명시 갱신(조회수 증가로 "수정됨"이
  갱신되는 것을 방지).
- `community_comment`: id, postId(→community_post, cascade), authorUserId, body,
  status, createdAt, updatedAt.
- `community_post_like`: id, postId(cascade), userId(cascade), createdAt,
  `(postId, userId)` unique.
- `moderation_target_type` enum에 `community_post` 값 추가(맨 뒤 append) — 기존
  `report`/`admin_moderation_action`/`bambi_notification`이 그대로 커뮤니티 글을 대상으로
  삼을 수 있다.
- 캐시 정합성: likeCount/commentCount는 추천 토글·댓글 작성/삭제 트랜잭션에서 함께
  증감한다. 진실값은 라이크/댓글 테이블 집계.

## 5. API (packages/api — oRPC)

`packages/api/src/routers/bambi/community.ts` 신설, `bambiRouter.community`로 등록.
전부 `protectedProcedure` + `requireCommunityMember`.

- `overview()` → 홈 인덱스용. 게시판별 최신 4개(베스트는 큐레이션 4개).
- `listPosts({ board: best|free|work_talk|market, page≥1 })` →
  `{ items, page, pageSize: 20, totalCount }`. offset 기반 번호 페이지네이션.
  목록 아이템: id, board, title, authorName(bambiProfile.displayName), viewCount,
  likeCount, commentCount, createdAt.
- `getPost({ postId })` → 본문 + `isLiked`, `canEdit`(본인), `canDelete`(본인|admin).
  호출 시 viewCount 원자 증가(`SET view_count = view_count + 1`).
- `createPost({ board: free|work_talk|market, title 2–100, body 2–5000 })`
- `updatePost({ postId, title, body })` — 작성자만.
- `deletePost({ postId })` — 작성자|admin, status→deleted.
- `toggleLike({ postId })` → `{ isLiked, likeCount }` — 트랜잭션으로 라이크 행 삽입/삭제
  + likeCount 캐시 증감.
- `listComments({ postId })` → published 댓글 오래된순, 최대 200개(페이지네이션 없음,
  YAGNI). 아이템에 `canDelete`.
- `createComment({ postId, body 1–1000 })` / `deleteComment({ commentId })` —
  commentCount 캐시 증감 동반.
- 신고는 신설하지 않고 기존 `moderation.createReport`에 `targetType: "community_post"`로
  보낸다(zod enum에 값 추가).

**베스트글 선정 규칙(verbatim):** `status = published AND createdAt ≥ now−30일 AND
likeCount ≥ 1`을 `likeCount DESC, createdAt DESC`로 정렬.

## 6. 웹 UI (apps/web)

라우트(전부 client screen + `RequireCommunityAccess`, 컨테이너는 `SEEKER_CONTENT_WIDTH`로
통일 — 기존 `min(80%,72rem)` 교체):

- `/seeker/community` — 홈 인덱스. 게시판별 미리보기 카드 2열 그리드(모바일 1열):
  섹션 헤더(액센트 바 + 게시판명 + 더보기 링크) + 최신글 4행(제목 truncate·댓글수·날짜).
  `visual-job-exposure-sections.tsx`의 섹션 헤더 문법을 따른다.
- `/seeker/community/[board]` — 게시판 목록. slug: `best|free|work-talk|market`.
  글 행(제목+댓글수 칩 / 작성자·날짜·조회·추천 메타), 번호 페이지네이션(`?page=` URL
  동기화), 쓰기 가능 게시판이면 "글쓰기" 버튼(primary — 페이지 주 액션).
- `/seeker/community/[board]/write`, `/seeker/community/[board]/[postId]/edit` —
  공용 폼(`community-post-form.tsx`): Input(제목) + Textarea(본문), 컨트롤드 상태,
  새 라이브러리 없음.
- `/seeker/community/[board]/[postId]` — 상세: 본문, 메타(작성자·날짜·조회·추천),
  추천 토글 버튼, 신고 Dialog(기존 사유 enum 한국어 라벨), 수정/삭제(권한 시),
  댓글 목록 + 작성 폼.
- 게시판 메타(라벨·slug·설명·writable)는 `apps/web/src/lib/bambi/community.ts` 상수.
  날짜 표기 `YYYY.MM.DD`. authorName null이면 "회원".
- 페이지네이션 UI는 shadcn `pagination`을 `packages/ui`에 추가(순수 UI, 의존성 없음,
  base-ui 재테마 컨벤션 적용).
- 신고 사유 한국어 라벨은 `my-reports-screen.tsx`의 로컬 상수를
  `lib/bambi/report-labels.ts`로 승격해 공유(해당 화면도 임포트로 전환), 대상 타입 라벨에
  `community_post: "커뮤니티 글"` 추가.

## 7. 테스트·검증

- API: `packages/api/src/routers/bambi/community.test.ts` — 실 DB 통합 테스트
  (`reviews.test.ts` 픽스처 패턴). 자격 거부, CRUD, 페이지네이션, 추천 토글 왕복,
  댓글 카운트 캐시, 권한(남의 글 수정/삭제), 소프트 삭제 후 미노출, 베스트 큐레이션.
- 웹: `lib/bambi/community.ts` 유틸 단위 테스트(slug 매핑, 날짜 포맷, 페이지 수 계산,
  페이지 아이템 윈도우).
- 빌드/실행 금지 — `ultracite fix` + `check-types` + vitest까지만, 시각 확인은 사용자.
- 마이그레이션: 스키마 코드만 작성하고 `db:generate`/`db:migrate` 실행은 사용자.
