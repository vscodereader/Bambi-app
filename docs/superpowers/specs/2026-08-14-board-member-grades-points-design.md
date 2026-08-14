# 게시판 회원 등급 & 등급별 포인트 지급 설계

> 작성일 2026-08-14 · 워크트리 `board-member-grades-points` · 통합 브랜치 `feat/board-member-grades-points`

## 목표

커뮤니티 게시판 활동(글·댓글 작성)에 포인트를 지급하고, 누적 포인트로 회원 **등급**을 산정해
게시판·마이페이지·운영자 화면에 뱃지로 노출한다. 등급표와 게시판별 적립 금액은 운영자가 편집한다.

## 핵심 원칙

- **포인트 원장은 기존 `bambi_point_transaction` 재사용.** 신규 원장 테이블을 만들지 않는다.
  잔액 = 계정 행 합산(`SUM(amount)`), 지금도 출석·운영자 지급이 이 방식이다.
- **등급 산정 = 포인트 순합계(net balance).** 삭제·회수 시 잔액이 줄어 **등급도 내려갈 수 있다** —
  작성·삭제 반복으로 등급을 부풀리는 어뷰징 방지의 핵심이다. (지금은 포인트 사용처가 없어
  "누적 적립"과 순합계가 사실상 같다. 나중에 '소비' 기능이 생기면 등급 기준을 재검토한다.)
- **적립 상태는 오직 `published`에서만 유지된다.** 글/댓글이 published를 벗어나면(작성자 삭제·
  운영자 삭제·운영자 숨김) 회수하고, published로 복구되면 재적립한다. "누가 눌렀나"가 아니라
  **상태 전이**가 트리거다.
- **회원(계정)만 적립 대상.** 게스트(비회원 토큰) 글·댓글은 `author_user_id`가 없어 자연히 제외된다.
- **소급 없음.** 이 기능 배포 이전의 기존 글/댓글에는 포인트를 소급 지급하지 않는다(신규 작성분부터).

## 범위

- **이번 구현**: 게시판 글/댓글 적립·회수 + 등급 체계 + 뱃지 표시 3곳 + 운영자 관리(등급 CRUD,
  게시판별 적립 금액 편집, 사용자 목록 등급 표시).
- **후속(자리만 마련)**: 구직자가 공고 보고 채팅 시작 시 적립, 구인자 채용 성사 시 적립.
  award 헬퍼에 `reason`만 추가하면 꽂히도록 설계하되 **이번엔 구현하지 않는다.**

---

## 데이터 모델

### 1. `community_board` — 게시판별 적립 금액 (컬럼 2개 추가)

```
post_points     integer NOT NULL DEFAULT 0   -- 이 게시판에 회원 글 작성 시 적립할 포인트
comment_points  integer NOT NULL DEFAULT 0   -- 이 게시판에 회원 댓글 작성 시 적립할 포인트
```

- 기본 0 = 포인트 미지급 게시판. 운영자가 게시판별로 값을 편집한다.
- 시드: **자유수다**(`key='free'`, 사용자가 말한 "수다방") `post_points=100`, `comment_points=50`.
  나머지 게시판(공지사항·밤문화 이야기·중고거래·법률자문)은 0 유지.

### 2. `community_post` / `community_comment` — 적립 스냅샷 (각 컬럼 1개 추가)

```
points_awarded  integer NOT NULL DEFAULT 0   -- 이 글/댓글에 "현재 적립돼 있는" 포인트
```

- 회수·재적립 금액을 정확히 맞추는 열쇠다. 지급 시 적립액을 저장하고, 회수 시 그만큼 되돌린다.
  운영자가 도중에 게시판 적립 금액을 바꿔도 회수 금액이 원래 지급액과 어긋나지 않는다.
- 게스트 글/댓글, 적립 금액 0 게시판 글은 `points_awarded=0`으로 남아 회수 대상이 아니다.
- 중복 지급 방지: 이미 `points_awarded>0`이면 재지급하지 않는다(reconcile 규칙이 보장, 아래).

### 3. `bambi_member_grade` — 등급 정의 (신규 테이블, 운영자 CRUD)

```
id          uuid PK DEFAULT gen_random_uuid()
name        text NOT NULL              -- 등급명 (예: 새싹, 우수회원)
min_points  integer NOT NULL UNIQUE    -- 이 등급이 되기 위한 누적 포인트 임계값
color       text                       -- 뱃지 색(hex, nullable). null이면 기본색.
created_at  timestamp NOT NULL DEFAULT now()
updated_at  timestamp NOT NULL DEFAULT now() (onUpdate)
```

- `min_points` UNIQUE로 구간 경계가 겹치지 않게 DB가 보장한다.
- **기본 등급(`min_points=0`)이 항상 하나 존재**해야 모든 회원이 등급을 갖는다. 시드로 넣고,
  운영자 삭제 API에서 마지막 0 등급은 지우지 못하게 막는다.
- 시드 기본값(운영자가 편집 가능한 출발점):

  | name | min_points |
  |---|---|
  | 새싹 | 0 |
  | 일반 | 1000 |
  | 우수회원 | 5000 |
  | 열혈회원 | 20000 |
  | VIP | 50000 |

---

## 적립·회수 로직

### award 헬퍼 (services/bambi-member-points.ts, 신규)

트랜잭션 핸들(`tx`)을 받아 원장에 델타 행을 쌓는 순수한 부수효과 함수. 재사용 단위.

- `awardContentPoints(tx, { userId, amount, reason })` — `amount>0`일 때만 `bambi_point_transaction`에
  `{ userId, amount, reason }` 삽입. 미래의 채팅/채용 적립도 이 함수에 `reason`만 달리해 재사용.
- reason 문자열(현재 text 유지, 사용처 늘면 enum 승격 검토):
  - 적립: `community_post`, `community_comment`
  - 회수: `community_post_revoke`, `community_comment_revoke`

### reconcile 규칙 (상태 전이에 얹기)

각 핸들러는 이미 "노출성 전이에서만" 카운트 캐시를 증감한다(`setCommentStatusByAdmin`의
`wasVisible/willVisible` 분기가 표준 형태). **같은 트랜잭션·같은 전이 가드**에 포인트를 얹는다.

목표 적립액 `N` = (회원 작성 & 대상 게시판 `*_points`) 값.

- **published 진입**(작성 or 복구)이고 `points_awarded == 0`이고 `N > 0`:
  원장 `+N`(reason `community_post`/`community_comment`) 삽입 → `points_awarded = N`.
- **published 이탈**(삭제·숨김)이고 `points_awarded > 0`:
  원장 `-points_awarded`(reason `*_revoke`) 삽입 → `points_awarded = 0`.
- 그 외 전이(hidden→deleted, published→published 등)·게스트·`N=0`: 아무것도 안 함(멱등).

### 훅 지점 (packages/api/src/routers/bambi/community.ts)

| 핸들러 | 현재 상태 | 조치 |
|---|---|---|
| `createPost` (1505) | 회원/게스트 분기 후 insert | 회원 & `board.post_points>0`이면 `+N`, `points_awarded=N` (같은 tx) |
| `createComment` (1874) | 위와 동일 | 회원 & `board.comment_points>0`이면 `+N`, `points_awarded=N` |
| `deletePost` (1729) | **tx 아님**, `status:"deleted"`만 갱신 | tx로 감싸고 `points_awarded>0`이면 `-points_awarded`, 0으로 |
| `deleteComment` (2058) | 소프트 삭제 | 위와 동일 |
| `setPostStatusByAdmin` (2141) | tx, 카운트 부수효과 없음 | `wasVisible/willVisible` 분기 추가해 회수·재적립 |
| `setCommentStatusByAdmin` (2216) | tx, `commentCount` 전이 증감 | 기존 분기에 회수·재적립 추가 |

- `createPost`/`createComment`는 대상 게시판 행에서 `*_points`를 함께 읽어 `N`을 얻는다(이미 board 조회함).
- `deletePost`/`deleteComment`는 `findPublishedPost`로 published만 대상이라 `wasVisible`이 항상 참 →
  회수만 발생. tx로 감싸 상태 갱신과 원장 삽입을 원자화한다.
- admin setter는 `existing` 조회에 `author_user_id`, `points_awarded`, 대상 게시판 `*_points`를 추가한다.

---

## 등급 산정 & 표시

### 등급 해석 (services/bambi-member-points.ts)

- `resolveGrade(balance, grades)` — `min_points <= balance`인 등급 중 `min_points` 최댓값을 고른다.
  `balance < 0`(운영자 과다 차감 등)이면 기본 등급(`min_points=0`)으로 클램프.
- `getPointBalances(userIds)` — `SELECT user_id, COALESCE(SUM(amount),0) FROM bambi_point_transaction
  WHERE user_id = ANY(...) GROUP BY user_id`. 결과에 없는 userId는 잔액 0 → 기본 등급.
- **캐시 없음(읽기 시점 계산).** 목록 한 페이지의 작성자 수만큼만 배치 조회하며 기존
  `bambi_point_transaction_user_id_idx`를 탄다. 성능 문제 시 캐시는 후속(YAGNI).

### 뱃지 노출 3곳

1. **게시판 글·댓글**: 서버 응답에 `authorGrade { name, color }`를 실어 작성자 표시명 옆에 뱃지 렌더.
   - `author_user_id`는 익명성 때문에 응답에서 계속 제외한다. 등급은 신원이 아니므로 노출해도 무방하다.
   - 익명 게시판에서 같은 작성자 글을 등급으로 약하게 연관지을 여지는 있으나 통상 허용 범위로 본다.
   - 게스트 작성 글/댓글은 등급 없음(뱃지 미표시).
2. **마이페이지 / 출석 화면**: 본인 포인트 잔액 + 현재 등급 + 다음 등급까지 남은 포인트
   (`다음 등급 min_points − balance`). 최고 등급이면 "최고 등급" 표시.
3. **운영자 사용자 목록** (`/moderator/users`): 회원별 잔액·현재 등급 컬럼.

### 뱃지 컴포넌트 (apps/web)

- `lib/bambi`에 등급→뱃지 매핑(색 폴백) 유틸, 재사용 `<GradeBadge>` 컴포넌트 1개.
- enum 원값 노출 금지 규칙과 무관(등급명은 운영자 입력 라벨 자체).

---

## 운영자 관리 UI

1. **회원 관리 > 등급 관리** (신규 `/moderator/member-grades`)
   - 신규 라우터 `member-grades.ts`(adminProcedure): `list` / `create` / `update` / `remove`.
   - `create`/`update` 입력: `name`, `min_points`(≥0 정수), `color`(선택).
   - 가드: `min_points` 중복 금지(DB UNIQUE + 친절한 메시지), 마지막 `min_points=0` 등급 삭제 금지.
   - 화면: 등급 목록(임계 오름차순) + 추가/수정/삭제. 기존 운영자 페이지 패턴·shadcn 재사용.
   - `moderator-navigation.ts` "회원 관리" 그룹에 `{ href: "/moderator/member-grades", label: "등급 관리" }` 추가.

2. **게시판 관리** (`/moderator/community-boards`, 기존)
   - `community-boards.ts`의 `createBoardInput`/`updateBoardInput`에 `postPoints`/`commentPoints`(정수 ≥0) 추가.
   - `create`/`update` 핸들러가 두 컬럼을 함께 저장. `list`/조회에 두 값 포함.
   - `page.tsx` 게시판 추가/수정 폼에 "글 포인트 / 댓글 포인트" 입력 추가.

3. **사용자 목록** (`/moderator/users`, 기존)
   - 목록 응답에 회원별 잔액·등급을 배치로 실어 컬럼 표시.

---

## 마이그레이션 & 시드

- Drizzle: 스키마 수정 후 `drizzle-kit generate`로 마이그레이션 생성(사용자 명시 지시 시 Claude가 generate/migrate 실행, 적용 검증 필수. `db:push` 금지).
- 마이그레이션에 포함:
  - `community_board.post_points` / `comment_points` 추가(DEFAULT 0).
  - `community_post.points_awarded` / `community_comment.points_awarded` 추가(DEFAULT 0).
  - `bambi_member_grade` 테이블 생성.
  - 시드: 등급 5행(위 표), 자유수다(`key='free'`) `post_points=100`·`comment_points=50` UPDATE.
    (시드는 마이그레이션 내 idempotent UPSERT 또는 별도 시드 스크립트로. 기존 시드 관례 따름.)

---

## 테스트 전략

- **순수 단위** (services 테스트, dev DB 미접촉):
  - `resolveGrade`: 경계값(정확히 min_points, −1, 0 미만, 최고 등급 초과) 매핑.
  - reconcile 규칙: 작성(+N)/삭제(−N)/복구(재적립)/게스트(무동작)/포인트 0 게시판(무동작)/
    이미 적립됨 재지급 안 함 — 델타 계산을 순수 함수로 뽑아 단정.
- **서비스 테스트** (dev DB): 회원 글 작성 → 잔액 +N, 삭제 → 순합계 0, 등급 전이 확인.
  픽스처 createdAt 수동 지정 관례 준수.
- 라우터 스위트(`test/routers/bambi`)는 dev DB 오염 위험으로 **실행하지 않는다**.
- 검증: `packages/api` `check-types` + `ultracite`(경로 인자 필수) + `test/services`.

---

## 파일 구조

**신규**
- `packages/api/src/services/bambi-member-points.ts` — award/revoke 헬퍼, `resolveGrade`, `getPointBalances`.
- `packages/api/src/routers/bambi/member-grades.ts` — 등급 CRUD(adminProcedure).
- `apps/web/src/app/moderator/member-grades/page.tsx` — 등급 관리 화면.
- `apps/web/src/components/bambi/grade-badge.tsx`(또는 lib 유틸) — 뱃지 렌더.
- 테스트: `packages/api/test/services/bambi-member-points.test.ts`.

**수정**
- `packages/db/src/schema/bambi.ts` — 컬럼 2 + 1 + 1, 신규 테이블.
- `packages/db/migrations/*` — 생성물 + 시드.
- `packages/api/src/routers/bambi/community.ts` — 6개 핸들러에 award/revoke 훅.
- `packages/api/src/routers/bambi/community-boards.ts` — 입력·핸들러에 `postPoints/commentPoints`.
- `packages/api/src/routers/bambi/index.ts` — `memberGrades` 라우터 등록.
- `packages/api/src/routers/bambi/moderation.ts` 또는 users 목록 라우터 — 사용자 목록에 잔액·등급.
- `apps/web/src/lib/bambi/moderator-navigation.ts` — 등급 관리 메뉴.
- `apps/web/src/app/moderator/community-boards/page.tsx` — 포인트 입력 필드.
- `apps/web/src/app/moderator/users/*` — 등급 컬럼.
- 게시판 글/댓글 렌더 컴포넌트(작성자 표시 부분) — 뱃지.
- 마이페이지/출석 화면 — 잔액·등급·다음 등급까지 남은 포인트.

## 미해결/후속

- **"수다방" = 자유수다(`key='free'`)로 해석**해 시드했다. 다른 게시판(예: 밤문화 이야기)도
  적립하려면 운영자 화면에서 값만 넣으면 된다. 시드 대상이 다르면 알려달라.
- 시드 등급명·임계값은 위 기본표로 두되 운영자가 편집. 특정 값 선호가 있으면 시드만 교체.
- 채팅/채용 적립: 후속 스펙에서 award 헬퍼에 reason 추가로 구현.
- 뱃지 시각 디자인(색·아이콘·크기)은 구현 시 frontend-design으로 다듬는다(스펙은 데이터·배치까지).
