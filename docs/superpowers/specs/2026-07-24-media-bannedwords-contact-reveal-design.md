# 이미지 검증 강화 · 금칙어 관리 · 연락처 공개 재설계 — 설계 스펙

> 우산 스펙 1개, 3개 독립 워크스트림(A 이미지 검증 / B 금칙어 관리 / C 연락처 공개 재설계).
> 각 워크스트림은 단독으로 리뷰·구현·테스트 가능하다.

**작성일**: 2026-07-24
**베이스 브랜치**: `fix/welcome-page` (tip `7a9d6af`)
**작업 워크트리/브랜치**: `chat-reveal-redesign` / `worktree-chat-reveal-redesign`

---

## 확정된 설계 결정 (사용자 승인)

1. **스펙 구조**: 우산 1개 + 3 워크스트림 (하나의 워크플로우로 병렬 구현).
2. **이미지 "메타데이터 체크"**: 파일 시그니처(매직넘버)까지 **실제 형식 검증** + 상한 **10MB**를 공고·커뮤니티·채팅 전역 공통화.
3. **연락처 공개 요청 왕복 저장·표시**: **채팅 인라인 시스템 메시지**(chat_message에 `kind`+`metadata`). 채팅 말풍선은 **shadcn `@shadcn/message` 컴포넌트**로 전환(현재는 손수 만든 말풍선).
4. **요청 선행조건**: **본인인증된 구인자면 언제든** 요청 가능(면접 확정 불필요).

### 기본값으로 진행(승인됨)
- 공고 상세에 노출할 구인자 번호 출처 = `job_post.createdByUserId` 계정의 `bambi_profile.phone_number`(`isPhoneVerified`일 때만).
- per-user 채팅 소프트삭제 = `chat_room`에 `seeker_deleted_at`·`employer_deleted_at` 2컬럼.
- 운영자 채팅 관리 페이지 = nav "회원 관리" 그룹.
- 운영자 행 "회원 상세" 이동 = 구직자·구인자 두 참여자 모두 제공.

### 리스크 플래그
- **(A)** 이미지 시그니처 검증은 **클라이언트 1차 방어**다. 서버는 업로드된 실제 바이트를 열지 않으므로(클라 선언 mimeType/byteSize만 신뢰) 악의적 우회는 완전 차단 못 함. 서버 실바이트 검증은 이번 범위 밖(후속).
- **(C)** `contact_reveal_consent` 테이블 **drop**이 이번 유일한 파괴적 스키마 작업. dev 전용 + 폐기되는 기능이라 진행.

---

## Workstream A — 공통 이미지 검증 강화 (10MB + 시그니처)

### 목표
이미지 업로드 시 (1) 상한 10MB, (2) 파일 앞바이트(매직넘버) 기반 실제 형식 검증을 공고·커뮤니티·채팅 전역 공통으로 적용한다.

### 현 상태 (탐색 결과)
- 상한 `8MB`가 서로 독립된 3곳에 하드코딩:
  - `packages/api/src/services/bambi-job-media-policy.ts:17` `JOB_POST_IMAGE_MAX_BYTES`(정본)
  - `apps/web/src/lib/bambi-job-form.ts:26` `IMAGE_MAX_BYTES`(클라 복사본)
  - `packages/api/src/services/bambi-media-policy.ts:25` 채팅 `IMAGE_MAX_BYTES`(PDF는 `:26` `PDF_MAX_BYTES = 10MB`)
- 형식 검증은 **mime 문자열 화이트리스트만**(클라 `File.type`, 서버 클라선언값). 실제 파일 시그니처 검사 전무.
- GCS signed URL이 content-type/content-length를 서명에 묶지만(강제) 기준은 "클라 선언값".

### 변경
1. **10MB 통일**: 위 3곳 상수를 `10 * 1024 * 1024`로 변경. 채팅 PDF는 기존 10MB 유지. 각 상수 주석에 "세 파일 동기화" 명시(패키지 경계로 단일 소스화는 불가).
2. **시그니처 검증 헬퍼 신설**: `apps/web/src/lib/bambi/image-signature.ts`
   - `export type DetectedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";`
   - `export async function detectImageSignature(file: File): Promise<DetectedImageType | null>` — `file.slice(0, 12).arrayBuffer()`로 앞 12바이트를 읽어 판정:
     - JPEG: `FF D8 FF`
     - PNG: `89 50 4E 47 0D 0A 1A 0A`
     - GIF: `47 49 46 38` ("GIF8")
     - WebP: `52 49 46 46`(RIFF, 0–3) + `57 45 42 50`(WEBP, 8–11)
     - 아니면 `null`.
   - `export function isSignatureMismatch(declared: string, detected: DetectedImageType | null): boolean` — detected가 null이거나 declared와 다르면 true.
3. **소비 지점 3곳에 삽입**(파일 선택 시점에 async 검증):
   - `apps/web/src/components/bambi/job-post-media-uploader.tsx` `createMediaItemFromFile`(~59–68): 파일 선택 시 `detectImageSignature` 호출, 불일치면 항목을 에러로 표시(업로드 차단).
   - `apps/web/src/components/bambi/community-editor.tsx`(~256–262): 에디터 이미지 삽입 전 동일 검증.
   - `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx` 채팅 첨부 선택부: 동일 검증(이미지 첨부만; PDF는 시그니처 검증 대상 아님).
4. **서버 상한 반영**: `bambi-job-media-policy.ts`·`bambi-media-policy.ts`의 10MB 상수만 갱신(mime 화이트리스트는 유지). 서버 시그니처 검증은 하지 않음(리스크 플래그 A).

### 테스트
- `apps/web/src/lib/bambi/image-signature.test.ts`: 각 형식 매직넘버 샘플(정상) + 위조(png 확장자인데 실제 다른 바이트) + 잘린 파일(12바이트 미만) → 판정 정확도. `isSignatureMismatch` 경계.
- 서버 정책 10MB 경계 테스트(기존 미디어 정책 테스트 파일에 10MB 통과/10MB+1 실패 케이스 추가).

---

## Workstream B — 금칙어 관리 (CSV · 가나다 정렬 · 검색)

### 목표
운영자 금칙어 페이지에 CSV 일괄 추가, 금칙어 컬럼 가나다순 정렬, 검색을 추가한다.

### 현 상태 (탐색 결과)
- 스키마 `banned_word`(`packages/db/src/schema/bambi.ts:1155`): `term`, `normalizedTerm`(매칭용), `isActive`, 생성자/시각. **카테고리 없음**. `normalizedTerm` unique.
- 라우터 `packages/api/src/routers/bambi/banned-words.ts`(전부 `adminProcedure`): `list`(이미 `orderBy(asc(term))` — 가나다순), `create`(단건, 정규화·중복·빈값 검증 + 캐시 무효화), `setActive`, `remove`.
- 서비스 `packages/api/src/services/bambi-banned-words.ts`: `normalizeForMatch`, 60초 TTL 캐시, `invalidateBannedWordCache`.
- UI `apps/web/src/app/moderator/banned-words/page.tsx`: **원시 `Table`**. 검색·정렬 헤더·CSV·`DataTable`/`RowActions` 없음.
- 공용 정렬 테이블 `apps/web/src/components/bambi/data-table.tsx`: `DataColumn.sortValue`로 헤더 토글 정렬(문자열은 `localeCompare` → 가나다 자동), `pageSize` 페이지네이션 내장.
- 참고 검색 패턴 `apps/web/src/app/moderator/jobs/page.tsx`: `Input` + `useMemo` `includes` 클라 필터.
- CSV 라이브러리 미설치, 기존 CSV 파싱 코드 없음(단일 컬럼이라 불필요).

### 변경
1. **서버 `createMany` 프로시저 추가** (`banned-words.ts`, `adminProcedure`):
   - input: `{ terms: z.array(z.string().trim().min(1).max(100)).min(1).max(500) }`
   - 처리: 각 term `normalizeForMatch` → 빈값 스킵, 배치 내 중복(normalizedTerm 기준) 스킵, 기존 DB `normalizedTerm`과 충돌 스킵, 나머지 일괄 insert. 캐시 **1회** 무효화.
   - 반환: `{ added: number, skipped: Array<{ term: string; reason: "duplicate" | "empty" }> }`.
2. **CSV 파싱 헬퍼**: `apps/web/src/lib/bambi/banned-words-csv.ts`
   - `export function parseBannedWordsCsv(text: string): string[]` — 개행·쉼표로 split, trim, 빈값 제거, 배치 내 중복 제거. (헤더 행 개념 없음: 단일 컬럼 단어 목록.)
3. **UI 개편** (`banned-words/page.tsx`):
   - 원시 `Table` → `DataTable`. 컬럼: `term`(`sortValue: r => r.term` → 가나다 정렬), `normalizedTerm`(Badge), `isActive`(Switch → `setActive`), actions(삭제; 기존 `remove`). `pageSize` 지정.
   - 상단 검색 `Input` + `useMemo`로 `term`/`normalizedTerm` `toLowerCase().includes` 필터.
   - CSV 업로드: 숨김 `<input type="file" accept=".csv,text/csv">` + "CSV로 추가" 버튼 → `await file.text()` → `parseBannedWordsCsv` → `createMany` 뮤테이션 → 결과 토스트("추가 N건, 스킵 M건"). 성공 시 `list` 쿼리 무효화.

### 테스트
- api: `banned-words.createMany` — 정규화, 배치 내/DB 중복 스킵, 빈값 스킵, added/skipped 집계. (bambi_dev 실DB)
- unit: `parseBannedWordsCsv` — 개행/쉼표 혼합, 공백 trim, 중복 제거.
- web 소스 스캔: 페이지에 `DataTable`, 검색 `Input`, CSV `input[type=file]`, `createMany` 호출 존재.

---

## Workstream C — 연락처 공개 재설계 (큰 작업)

### 목표
기존 "구인자가 자기 번호를 폼에 재입력해 공개"(단방향, 별도 페이지)를 폐기하고:
- 구인자 인증번호를 **공고 상세·채팅에 자동 노출**,
- 구인자가 **구직자 번호를 채팅에서 요청** → 구직자가 공개/거절,
- 채팅 **per-user 소프트삭제/신고/차단**,
- 운영자 **채팅 관리 페이지**(하드삭제·회원 이동)를 신설한다.

### 현 상태 (탐색 결과 요약)
- 기존 공개 흐름: 페이지 `apps/web/src/app/seeker/chats/[id]/reveal/page.tsx` → `contact-reveal.tsx`(`ContactRevealApi`). **구인자만** 자기 연락처를 폼(`contactMethod`/`contactValue` 평문)으로 입력 → `contact_reveal_consent` 행 존재 = 공개됨. confirmed/completed 면접 필요.
- 라우터 `packages/api/src/routers/bambi/chats.ts`(전부 `protectedProcedure`): `getById`(587), `listMine`(447), `sendMessage`(703), `proposeInterview`(873, 구인자만), `setInterviewStatus`(908), `getContactReveal`(970), `revealContact`(1064) 등. 역할 판정은 방의 `employerUserId`/`jobSeekerUserId` vs 세션 userId.
- 채팅 상세 UI `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx`:
  - 메시지 렌더(202–239): **손수 만든 말풍선**(내=`coral-500`, 상대=`secondary`). shadcn message 미사용.
  - 면접 일정 Card(1239–1353): 구인자만 `InterviewProposalForm`. "연락처 공개하기"(구인자)/"연락처 보기"(구직자) 버튼(1343–1352) → `/reveal`로 push.
  - 신고 버튼·차단(`ChatBlockTrigger`)은 방 내부에 이미 존재.
- 채팅 목록 UI `apps/web/src/components/bambi/screens/seeker-chat-list-responsive.tsx`(160–203): 각 방 `<button>`(열기만). **삭제/신고/차단 액션 없음**.
- 스키마(`packages/db/src/schema/bambi.ts`):
  - `chat_room`(648–684): `employerUserId`, `jobSeekerUserId`, `isBlocked`(667). **소프트삭제 컬럼 없음**.
  - `chat_message`(686–704): `chatRoomId`, `senderUserId`, `body`, `riskFlags`, `createdAt`. **타입/시스템메시지 개념 없음**.
  - `interview_schedule`(762–785), `contact_reveal_consent`(787–808, 평문), `user_block`(839–860, 대인 양방향), `report`(897–922, `moderationTargetType`에 `chat_room`/`chat_message` 이미 포함), `admin_moderation_action`(924–944).
- 본인인증 번호: `bambi_profile.phone_number`(225) + `is_phone_verified`(224). 구인자·구직자 공통 테이블(role로 구분), 사용자당 1개.
- 공고 상세: `apps/web/src/components/bambi/screens/seeker-job-detail-responsive.tsx` — InfoTile 스택. 급여(152)·근무시간(157)·고용형태(162)·후기(167). **근무시간↔고용형태 삽입 위치 = 161↔162행**. (참고: "고용형태"는 실제로 `industryCategory` 재활용, 별도 컬럼 아님 — 이번 작업과 무관, 건드리지 않음.) 값 매핑은 `apps/web/src/components/bambi/screens/api-job-mapper.ts`(hours=`163`, type=`180`).
- 공고 작성자: `job_post.createdByUserId`(schema `316`) 존재.
- 운영자 콘솔: nav 6그룹(`apps/web/src/app/moderator/layout.tsx:16–24` "회원 관리"). `RowActions`(`row-actions.tsx`), `DataTable`, `jobs/page.tsx`가 표준 목록 패턴. 회원 상세 `/moderator/users/${id}`. 제재 `moderation.setUserStatus`. 신규 admin 프로시저는 `adminProcedure`(`packages/api/src/index.ts:30`) 권장.

### 스키마 변경 (db:generate → db:migrate)
1. `chat_message`에 컬럼 추가:
   - `kind: text("kind").notNull().default("text")` — 값: `"text" | "contact_request"`.
   - `metadata: jsonb("metadata")` — `contact_request`일 때 `{ status: "pending" | "revealed" | "declined", requesterUserId: string, targetUserId: string }`.
2. `chat_room`에 컬럼 추가: `seekerDeletedAt: timestamp("seeker_deleted_at")`, `employerDeletedAt: timestamp("employer_deleted_at")`.
3. `contact_reveal_consent` 테이블 **제거**(스키마에서 삭제 → drop 마이그레이션). 리스크 플래그 C.

### 연락처 요청 왕복 데이터 흐름 (인라인 메시지 1건 + 역할·상태별 렌더)
`contact_request` 메시지 **한 건**을 진실원으로 두고, 응답은 같은 메시지의 `metadata.status`를 전이한다. 별도 응답 메시지·별도 테이블 없음. 렌더는 **뷰어 역할 + status** 조합으로 분기:

| status | 구직자(target) 뷰 | 구인자(requester) 뷰 |
|---|---|---|
| pending | "{구인자}님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?" + [공개][거절] | "연락처 공개를 요청했습니다. (응답 대기 중)" |
| revealed | "연락처를 공개했습니다." | "{구직자}님이 연락처를 공개했습니다: {구직자 인증번호}" |
| declined | "연락처 공개를 거절했습니다." | "{구직자}님이 연락처 공개를 거절하셨습니다." |

- 구직자 인증번호는 **DB metadata에 저장하지 않고**, 서버가 응답 조립 시 `status==="revealed"` + 뷰어가 구인자일 때만 `bambi_profile.phone_number`를 실어 준다(평문 저장 최소화).

### API 변경 (`chats.ts`)
- **제거**: `revealContact`, `getContactReveal`.
- **추가**:
  - `requestContactReveal({ chatRoomId: uuid })` — `requireChatParticipant`; 호출자가 구인자(`userId === room.employerUserId`)일 것; 구인자 `isPhoneVerified`일 것(아니면 FORBIDDEN/BAD_REQUEST); 방에 `status="pending"`인 `contact_request` 메시지가 없을 것(중복 방지); `chat_message`(kind=`contact_request`, sender=구인자, body="연락처 공개를 요청했습니다.", metadata `{status:"pending", requesterUserId, targetUserId: jobSeekerUserId}`) insert; 구직자에게 알림 발행. 반환: 생성 메시지.
  - `respondContactReveal({ messageId: uuid, decision: "reveal" | "decline" })` — `requireChatParticipant`; 대상 메시지가 `contact_request` & `status="pending"` & 호출자가 `metadata.targetUserId`(구직자)일 것; `reveal`이면 구직자 `isPhoneVerified` 확인 후 `status="revealed"`, `decline`이면 `status="declined"`(낙관적: `status="pending"` 조건부 update); 구인자에게 알림 발행. 반환: 갱신 메시지.
  - `deleteChatRoom({ chatRoomId: uuid })` — `requireChatParticipant`; 호출자 역할에 따라 `seekerDeletedAt`/`employerDeletedAt = now()` set(소프트). 반환: ok.
- **수정**:
  - `getById`(587): 응답에 `employerVerifiedPhone: string | null`(방의 `employerUserId` 프로필이 `isPhoneVerified`면 phone, 아니면 null) 추가. 메시지 목록 조립 시, `contact_request` & revealed & **뷰어가 구인자**면 해당 메시지에 구직자 phone을 실어 준다(예: `metadata.revealedPhone` 주입 — DB엔 미저장, 응답에서만).
  - `listMine`(447): WHERE에 자기쪽 미삭제 조건 추가 — `(jobSeekerUserId = me AND seekerDeletedAt IS NULL) OR (employerUserId = me AND employerDeletedAt IS NULL)`.
  - `sendMessage`(703): 새 메시지 도착 시 **양쪽 `deletedAt`을 clear**(NULL) → 소프트삭제한 방에 새 메시지가 오면 다시 목록에 노출(메시지 유실 방지). 카카오톡류 "삭제 후 새 대화 시 재등장" 동작. (설계 결정: 삭제는 "숨김"이며 새 메시지로 해제된다.)

### 웹 UI 변경 (apps/web)
1. **공고 상세** `seeker-job-detail-responsive.tsx` 161↔162행 사이에 구인자 번호 블록:
   - `job.employerVerifiedPhone`가 있으면 렌더, 없으면 블록 미표시.
   - 카피: 번호 강조(`tel:` 링크) + 안내문 muted 톤 —
     `{번호}` 다음 줄/괄호: `("밤비알바 보고 전화드렸는데요"라고 하시면 정확한 상담 받으실 수 있습니다.)`
   - `Job` 타입(`apps/web/src/components/bambi/screens/types.ts`)에 `employerVerifiedPhone?: string | null` 추가, `api-job-mapper.ts`에서 서버 공고 상세 응답의 값을 매핑. → **서버 공고 상세 프로시저**가 `createdByUserId` 프로필의 인증번호를 반환하도록 확장(해당 프로시저 위치는 구현 시 `jobs`/공개 상세 라우터에서 확인).
2. **채팅방** `seeker-chat-room-responsive.tsx`:
   - 말풍선 렌더(202–239)를 **shadcn `message`** 컴포넌트로 교체. `text` 메시지는 일반 말풍선, `contact_request`는 위 표대로 역할·status 분기 렌더(구직자·pending일 때 [공개][거절] 버튼 = `respondContactReveal`).
   - 면접 일정 Card(1239–1353):
     - 구직자 뷰: `roomQuery.data.employerVerifiedPhone` 있으면 구인자 인증번호 표시(공고 상세와 동일 카피 톤).
     - 구인자 뷰: "연락처 공개하기" 버튼(1343–1352) → **"연락처 공개 요청"** 버튼(`requestContactReveal` 뮤테이션)으로 교체. `getRevealButtonLabel`·`/reveal` push·`revealQuery`(getContactReveal) 사용 제거.
3. **채팅 목록** `seeker-chat-list-responsive.tsx`(160–203): 각 방 항목에 액션 메뉴(케밥/`RowActions`) — 삭제(`deleteChatRoom`), 신고(기존 `ReportDialog`/`moderation.createReport`, targetType `chat_room`), 차단(기존 `blocks.blockUser`). 셋 다 성공 시 자기쪽 소프트삭제로 목록에서 숨김 + `listMine` 무효화. (신고/차단은 기존 프로시저 재사용 + 삭제 프로시저로 숨김 처리.)
4. **삭제**: `apps/web/src/app/seeker/chats/[id]/reveal/page.tsx`, `apps/web/src/components/bambi/screens/contact-reveal.tsx`. `[id]/page.tsx` 래퍼(17)의 `onReveal`/reveal 라우팅 제거.

### 운영자 채팅 관리 (apps/web + api)
1. nav: `moderator/layout.tsx` "회원 관리" 그룹(16–24)에 `{ href: "/moderator/chats" as Route, label: "채팅" }` 추가.
2. 페이지: `apps/web/src/app/moderator/chats/page.tsx` — `jobs/page.tsx` 패턴 복제(`DataTable` + `RowActions` + orpc + 사유 Dialog).
   - 컬럼: 공고 제목 / 구인자 / 구직자 / 상태(삭제·차단·신고 배지) / 최근 메시지 시각.
   - RowActions: **삭제**(하드삭제, `variant="destructive"`, 사유 Dialog) → `hardDeleteChatRoom`; **구직자 상세** `href /moderator/users/${jobSeekerUserId}`; **구인자 상세** `href /moderator/users/${employerUserId}`.
3. 서버(`packages/api/src/routers/bambi/moderation.ts`, `adminProcedure` 신규 방식):
   - `listChatsForModeration` — 삭제됨(`seekerDeletedAt`/`employerDeletedAt` not null) OR 차단됨(`isBlocked`) OR 신고됨(`report` targetType `chat_room`/`chat_message`가 해당 방 참조) 방 목록 + 참여자·상태 플래그·최근 메시지 시각.
   - `hardDeleteChatRoom({ chatRoomId, reason })` — 트랜잭션으로 `chat_message_read_receipt` → `chat_attachment` → `chat_message` → `interview_schedule` → `chat_room` 순 delete(FK 순서 준수) + `admin_moderation_action`(targetType `chat_room`, action `hard_delete`, reason) 로그. 사유 2자 이상.

### shadcn message 컴포넌트 도입
- `pnpm dlx shadcn@latest add @shadcn/message`로 추가(설치 위치는 `packages/ui`; components.json 확인). **base-ui 호환**(프레젠테이셔널, radix 의존 없음) 확인 후 밤비 코럴로 재테마(내 메시지=coral, 상대=secondary), `rounded-none` 제거(반경 토큰). **`message-scroller`는 도입하지 않음**(`@shadcn/react` 의존 — 기존 스크롤 유지). 추가된 소스가 base-ui 규약(render prop, 반경 토큰)에 맞는지 커밋 전 검수.

### 정책/정리
- `packages/api/src/services/bambi-policy.ts`의 `canRevealContact`·`canViewCounterpartContact`·`isContactRevealEligibleInterviewStatus`가 미사용되면 제거. `canStartChat`(폰인증 요구)은 유지.

### 테스트
- api(bambi_dev 실DB):
  - `requestContactReveal`: 구인자만·폰인증 필수·pending 중복 차단.
  - `respondContactReveal`: 대상(구직자)만·pending 상태만; reveal→구인자 응답에 구직자 phone 포함, decline→status=declined.
  - `deleteChatRoom`: 소프트삭제 후 `listMine`에서 숨김; 상대는 계속 보임; `sendMessage`로 재노출.
  - `listChatsForModeration`: 삭제/차단/신고 상태 필터 정확도.
  - `hardDeleteChatRoom`: 연관 행 cascade delete + `admin_moderation_action` 로그 1건.
- web 소스 스캔:
  - 공고 상세에 안내 카피 문자열(`밤비알바 보고 전화드렸는데요`) 존재.
  - 채팅방에 "연락처 공개 요청" 버튼 라벨·shadcn message import 존재, `/reveal` push·`getContactReveal` 미사용.
  - 운영자 `moderator/chats` 페이지에 `hardDeleteChatRoom`·회원 상세 href·`DataTable` 존재.
  - reveal 페이지 파일 부재.

---

## 워크스트림 간 의존성 / 병렬화
- **A, B, C는 서로 독립**(다른 파일군). 병렬 구현 가능.
- C 내부 순서: **C0 스키마(마이그레이션) → 나머지**. C0가 `chat_message.kind/metadata`·`chat_room.deletedAt`·`contact_reveal_consent` drop을 확정해야 API·UI가 그 위에 얹힌다. C의 API(요청 왕복 / 목록 삭제 / 운영자)와 UI(공고 상세 / 채팅방 / 목록 / 운영자 페이지)는 스키마 확정 후 상당 부분 병렬.
- shadcn `message` 추가는 채팅방 UI 착수 전 1회 선행.

## 검증 게이트 (커밋 전)
- `pnpm check-types`(파이프 마스킹 주의: `${PIPESTATUS[0]}` 또는 unpiped로 exit code 확인) 전 패키지 통과.
- `pnpm dlx ultracite fix` 클린(cognitive complexity ≤ 20 등 Biome 규칙).
- 신규/변경 api 테스트 통과(bambi_dev), web 소스 스캔 테스트 통과.
- 빌드/개발서버 기동 금지(HMR로 사용자가 육안 확인).
