# 사업자 문서 비공개 버킷 전환 설계

날짜: 2026-08-13
브랜치: `security/business-doc-private-bucket`
배경: 보안 종합 조사 #2 — 사업자등록증 등 민감 서류가 공개 버킷(`bambi-storage-public`)에
저장되어 URL만 알면 누구나 열람 가능한 상태. (구현 중 실측 보정: 공개 버킷의 `allUsers`는
`objectViewer`가 아니라 `legacyObjectReader`(objects.list 없음)로 확인되어 버킷 열거는
불가능했다 — 위험의 본질은 URL 유출·공유 시 무제한 열람이며 이는 그대로 유효.)

## 목적

민감 파일(현재는 구인자 사업자 문서)을 **비공개 버킷**으로 옮기고, 조회를
**매 요청 세션 검증**을 거치는 앱 라우트로 바꿔 URL 유출·공유가 무의미해지게 한다.

## 확정 결정 사항

| 결정 | 내용 |
|---|---|
| 기존 객체 | 사용자 없음 → 이관·정리하지 않고 무시. 옛 키를 가진 행은 조회 시 404 허용 |
| env 미설정 시 | 프로덕션에서 `GCS_PRIVATE_BUCKET` 미설정이면 업로드 **거부**(default-deny) |
| 조회 방식 | **B-2안**: 세션 검증 앱 라우트 → TTL 60초 서명 GET URL로 302 리다이렉트 |
| 업로드 방식 | 서명 PUT URL 유지(TTL 5분, Content-Type·Length 바인딩). Vercel 요청 본문 한도(4.5MB) 때문에 업로드 프록시는 불가 |
| 운영자 권한 | 타인 민감 파일 조회·삭제 가능. 이번에 운영자 삭제 프로시저+버튼 추가. 대리 업로드는 UI가 생길 때 같은 가드로 추가 |

### 서명 URL 유출에 대한 입장

서명 URL은 소지자 토큰(bearer)이라 유출 시 TTL 내 누구나 사용할 수 있고, GCS는
요청자의 앱 세션을 알 수 없다. 그래서 조회는 서버가 요청 경로 위에 서는 B-2안을
택했다. 잔여 위험은 "302로 받은 60초짜리 GCS URL을 즉시 재공유"뿐인데, 이는 이미
열람한 사람이 파일 자체를 공유하는 것과 등가라 방어 실익이 없다. 업로드 서명 URL
유출의 최악은 "서버가 정한 단일 키를 5분 내 같은 타입·크기 파일로 덮어쓰기"로,
DB 등록은 여전히 본인 세션+키 소유 검사를 거치므로 감수한다.

## 비공개 버킷 키 구조 (전 서비스 공통 규칙)

```
bambi-storage-private/
├─ seeker/{userId}/{uuid}-{정규화된 파일명}            ← 구직자 민감 파일 (규칙만 예약)
└─ employer/{orgId}/{userId}/{uuid}-{정규화된 파일명}  ← 사업자 문서 (이번 구현)
```

- 구인자 파일은 조직이 소유 경계(DB `organizationId`)이므로 키에 조직 경계를 드러내
  조직 단위 일괄 정리·감사가 프리픽스만으로 가능하게 한다. 구직자는 조직 개념이
  없어 2단이면 충분하다.
- 키는 항상 서버가 생성한다(클라이언트가 경로를 고르지 못함). 파일명 정규화는 기존
  `normalizeFileNameForStorage` 재사용.
- 기존 `bambi-business-documents/{orgId}/{userId}/` 규칙은 폐기.

## 권한 모델

| 행위자 | 업로드 | 조회 | 삭제 |
|---|---|---|---|
| 올린 본인(`createdByUserId`) | ✅ | ✅ | ✅ |
| 같은 조직의 다른 멤버 | ❌ | ❌ | ❌ |
| 운영자 | (UI 없음 — 이번 범위 제외) | ✅ | ✅ |

- 소유 판정 축이 "조직 owner" → "**올린 사용자 본인**"으로 바뀐다.
- 알려진 엣지: 조직 owner가 바뀌면 새 owner는 이전 owner가 올린 문서를 관리할 수
  없다(운영자에게 요청). 현재 owner 이전 기능이 없어 실질 영향 없음 — 의도된 규칙.
- 업로드·삭제의 조직 소속/상태 가드(`requireBusinessDocumentOrganization`, pending 중
  변경 금지, verified→changes_unsubmitted 전이)는 기존 그대로 유지한다.

## 아키텍처

### 1) env — `packages/env/src/server.ts`

- `GCS_PRIVATE_BUCKET: z.string().optional()` 추가.

### 2) GCS 서비스 — `packages/api/src/services/gcs.ts`

내부 서명·삭제 로직을 버킷 인자를 받는 공용 헬퍼로 뽑고, 기존 public export는
시그니처 그대로 유지한다(채팅·공고·에디터 미디어 호출자 무변경). 추가 export:

- `isPrivateBucketConfigured()`, `shouldUsePrivateBucket()`
  (= `NODE_ENV === "production" && GCS_PRIVATE_BUCKET 설정`)
- `createPrivateSignedUploadUrl({ byteSize, mimeType, storageKey })` — 서명 PUT, TTL 5분
- `createPrivateSignedReadUrl({ download, fileName, storageKey })` — 서명 GET, **TTL 60초**,
  `download`면 `Content-Disposition: attachment` 포함
- `deletePrivateObjects(storageKeys)`

### 3) 저장 서비스 — `packages/api/src/services/bambi-storage.ts`

- 키 빌더: `buildPrivateEmployerKeyPrefix({ organizationId, userId })` =
  `employer/{orgId}/{userId}/`. (seeker 프리픽스는 규칙만 문서화, 코드는 필요할 때.)
- `isOwnedBusinessDocumentKey`: 새 프리픽스 + `..` 차단으로 교체. 인자 모양 유지.
- `createBusinessDocumentUploadIntent` 분기 교체:
  - production + private 설정 → private 버킷 서명 PUT
  - production + 미설정 → 에러 throw ("사업자 문서 저장소가 구성되지 않았습니다" —
    라우터에서 ORPCError INTERNAL_SERVER_ERROR로 변환)
  - dev → 기존 로컬 플레이스홀더 URL 유지
- `getBusinessDocumentObjectUrl` 제거하고, 목록 응답의 `objectUrl` 값은 앱 조회
  라우트 경로(`/bambi/business-documents/{documentId}`)로 바꾼다. 필드명은
  `objectUrl` 그대로 두어 프론트 타입·링크 변경을 최소화한다.

### 4) 조회 라우트 — `apps/web/src/app/bambi/business-documents/[documentId]/route.ts` (신규)

구현 확정(계획 단계 보정): oRPC API는 apps/server(Fastify)에서 돌고 web(Vercel)에는
DB·GCS 접근이 없다. 따라서 웹 라우트는 검증을 직접 하지 않고, **매 요청** 들어온
헤더(세션 쿠키 포함)를 기존 SSR 포워딩 인프라(`@/utils/orpc`의 `client`)로 API 서버에
넘겨 프로시저를 호출한다.

- 신규 프로시저 `onboarding.createBusinessDocumentViewUrl({ documentId, download })`
  (protectedProcedure): 문서 조회(없으면 NOT_FOUND) → `createdByUserId === 나`가
  아니면 `requireAdminProfile`(운영자만 통과, 아니면 FORBIDDEN) →
  `shouldUsePrivateBucket()`이면 60초 서명 GET URL, dev면 로컬 플레이스홀더 URL 반환.
  `download: true`면 서명에 `Content-Disposition: attachment`를 실어 다운로드를 강제한다
  (302 후 크로스 오리진이라 `<a download>` 속성이 안 먹는 것의 대체).
- 웹 라우트 `GET`: 프로시저 호출 성공 시 302(`Cache-Control: no-store`),
  ORPCError 코드를 401/403/404로 매핑, 그 외 500.

효과는 동일: 화면에 노출되는 URL은 앱 경로뿐이라 유출·공유돼도 세션 없이는 무용지물.
프론트는 일반 `<a href>` 새 탭 링크를 유지한다(팝업 차단 우회 불필요). 목록 응답의
`objectUrl` 값은 `/bambi/business-documents/{id}`(+다운로드 링크는 `?download=1`)다.

### 5) 로컬 플레이스홀더 라우트 — `apps/web/src/app/bambi/local-chat-attachments/route.ts`

`BUSINESS_DOCUMENT_KEY_PREFIX`(`bambi-business-documents/`) 기반 경로 검사를 새 키
루트(`employer/`)로 갱신한다. dev 전용 동작은 그대로.

### 6) 삭제

- 구인자 본인: `deleteBusinessDocument`의 `deletePublicObjects` →
  `deletePrivateObjects`. 나머지 가드·상태 전이는 무변경.
- 운영자(신규): `moderation.deleteBusinessDocument(documentId)` — 문서 존재 확인 →
  DB 행 삭제 → `deletePrivateObjects`. 조직 `verificationStatus` 전이는 하지 않는다
  (부적절 문서 대응은 기존 반려 플로우가 담당; 이 프로시저는 파일 제거 수단).

### 7) 프론트 (2 화면)

- `business-document-uploader.tsx`: `objectUrl` 링크 그대로(값만 앱 라우트로 바뀜).
- `moderator/employers/page.tsx`: 링크 그대로 + 문서 항목에 **삭제 버튼**
  (AlertDialog 확인 → `moderation.deleteBusinessDocument` 뮤테이션 → 목록 refetch).

## 에러 처리

| 상황 | 응답 |
|---|---|
| 업로드 인텐트: 프로덕션 + private 미설정 | ORPCError INTERNAL_SERVER_ERROR("사업자 문서 저장소가 구성되지 않았습니다") |
| 조회 라우트: 비로그인 | 401 |
| 조회 라우트: 문서 없음(옛 키 포함 GCS 404는 GCS가 응답) | 404 |
| 조회 라우트: 본인 아님 + 운영자 아님 | 403 |
| 운영자 삭제: 문서 없음 | NOT_FOUND |
| GCS 객체 삭제 실패 | 기존 방침 유지 — DB가 정본, API 실패로 번지지 않음 |

## 테스트

- `packages/api/test/services/bambi-storage.test.ts`: 새 키 프리픽스, `isOwnedBusinessDocumentKey`
  교체 규칙(`..` 차단 포함), 업로드 인텐트 3분기(private 서명/거부/로컬) — services라 실행 가능.
- `packages/api/test/routers/bambi/business-documents.test.ts`: objectUrl 값 변화·운영자
  삭제 프로시저 반영해 갱신하되, 라우터 스위트 실행 금지 규칙에 따라 실행하지 않는다.
- `apps/web/test/`: 조회 라우트 핸들러 단위 테스트(세션 없음 401 / 타인 403 / 본인·운영자
  302) — better-auth·db는 vi.mock. 기존 uploader 테스트 영향 시 갱신.
- 마무리: ultracite + `check-types`.

## 배포 체크리스트 (코드 밖, 사용자 작업)

1. GCS 버킷 `bambi-storage-private` 생성 — asia-northeast3, **PAP(공개 액세스 방지) 켠 채
   유지**, UBLA, `allUsers` 바인딩 없음.
2. 서버 SA `bambi-storage@bambi-app-501604.iam.gserviceaccount.com`에 버킷 단위
   `roles/storage.objectUser` 부여. (signBlob용 TokenCreator는 기존 구성 재사용.)
3. CORS 설정(gcloud 전용): 서명 PUT을 보내는 web origin들(`https://test.bambialba.com`,
   실서비스 도메인) — GET은 302 내비게이션이라 CORS 무관.
4. API가 도는 모든 런타임에 `GCS_PRIVATE_BUCKET=bambi-storage-private` env 추가.
   미설정 시 사업자 문서 업로드가 에러로 거부된다(의도된 default-deny).
5. (선택) 공개 버킷의 `bambi-business-documents/` 잔여 객체 수동 삭제 — 사용자 없음
   확인됨이라 필수는 아님.

## 범위 밖 / 이연

- 구직자 민감 파일: 키 규칙(`seeker/{userId}/`)만 예약. 실제 업로드 기능이 생길 때
  같은 가드·라우트 패턴으로 구현.
- 운영자 대리 업로드: UI가 생길 때 같은 권한 규칙으로 추가.
- 채팅 첨부 공개 URL: 별도 항목(chat-hardening 후속)으로 관리, 이번 범위 아님.
- 조직 owner 이전 시 문서 관리 이관: owner 이전 기능 자체가 없어 보류.
