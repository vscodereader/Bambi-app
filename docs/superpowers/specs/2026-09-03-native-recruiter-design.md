# native 구인자 영역(공고관리·공고등록·업체정보) 설계

- 날짜: 2026-09-03
- 브랜치: `feat/native-recruiter`(base `mobile`), 작업 워크트리 `worktree-native-recruiter`
- 범위 결정: 공고등록은 **결제 제외 동등(B)**, 셸은 **하단 탭(A)**, 업체정보는 **조직 프로필+사업자 인증+설정 진입(1+2+4)**

## 1. 배경과 현재 상태

- `apps/native/app/(employer)/`에 공고 목록(`index`)·등록(`new`)·수정(`jobs/[id]/edit`)이 이미 있으나 단순 Stack이고 UI가 초기 수준이다.
- native 폼(`src/components/native-job-form.tsx`)은 서버 `jobPostInput`의 부분집합만 보낸다. web에 있는 초보환영·즉시면접·상세설명 블록·이미지 업로드·광고상품·결제·부스트가 없다.
- 업체(조직)정보 화면은 native에 없다. web은 `/employer/me`(사업자 인증)와 `/employer/settings`(조직명·팀)로 나뉜다.
- 서버·web·DB는 변경하지 않는다. 마이그레이션 없음.

## 2. 내비게이션 셸

`(employer)`를 seeker와 같은 `(employer)/(tabs)` 구조로 재편한다.

| 위치 | 화면 | 비고 |
|---|---|---|
| `(tabs)/index` | 공고관리 | 탭 1 |
| `(tabs)/chats` | 채팅 | **플레이스홀더**(업체 채팅은 후속) |
| `(tabs)/me` | 내 정보(업체정보 허브) | 탭 3 |
| `new` | 공고 등록 | Stack, 탭바 없음 |
| `jobs/[id]/edit` | 공고 수정 | Stack |
| `me/organization` | 업체 정보 수정 | Stack |
| `me/business` | 사업자 인증 | Stack |
| seeker `me/settings` | 설정 | 기존 seeker 화면 공유(라우트 그대로 push) |

- 헤더: `SeekerHomeHeader`가 role 의존 없이 쓸 수 있으면 재사용, 아니면 같은 구조의 얇은 employer 헤더를 둔다. Stack 화면은 `SeekerStackHeader`와 같은 규칙.
- 역할 게이트: `(employer)/_layout`에서 세션 role이 `employer`/`admin`이 아니면 `getNativeHomeRoute(role)`로 replace.
- seeker 탭 셸 메모리의 함정 3종(tabBarIcon `ColorValue`, insets.bottom 이중 패딩 금지, `Tabs` deprecated 유지) 준수.

## 3. 공고관리 탭

web `/employer/page.tsx` 이식. 데이터: `orpc.bambi.jobs.listMine`, `orpc.bambi.onboarding.getMine`.

- 상단: 인증 상태 배지. 미인증(`none`/`rejected`/`changes_unsubmitted`)이면 "사업자 인증하기" 유도 카드(→ `me/business`).
- **공고 등록** primary 버튼 1개(화면 내 유일 primary).
- 요약: 게시중·검수중·반려 건수(web `jobPosts.filter` 규칙과 동일).
- 목록 카드: 제목 · 상태 Pill(`jobStatusLabels` 경유, 원값 노출 금지) · 지역 · 수정일. 탭 → 수정 화면.
- 액션: 수정, 삭제. 삭제는 Dialog에서 `jobs.getDeletePointRefundPreview`로 web과 같은 환급 문구 3종을 보여준 뒤 `jobs.delete`. 성공 시 listMine invalidate + Toast.
- 정렬·필터 없음(web도 최근 수정순 단일). 광고 현황(`promotions.listMyAds`)은 결제 제외 범위라 표시하지 않는다.
- 빈 목록: StateCard "등록한 공고가 없어요" + 등록 버튼.

## 4. 공고 등록·수정 폼

기존 `native-job-form.tsx`를 확장한다. 제출 payload는 `jobPostInput` 중 아래만 채운다. `exposureType`은 항상 `"standard"`, 광고·결제·부스트·포인트 필드(`adProductId`, `exposureDurationDays`, `exposureAmount`, `paymentMethod`, `adBannerLayout`, `boostOption*`, `pointsToUse`, `detailDesign*`)는 보내지 않는다.

### 필드
- 기존: 등록 범위(조직/팀), 제목(2~80), 업종(enum 8종), 지역(`regions.list`), 급여(정수 or 협의)+단위(1~30), 근무일정(1~200), 상세설명(10~2000), 면접안내(≤500)
- 추가: `beginnerFriendly`·`instantInterview` 스위치
- 추가: `descriptionBlocks`(최대 12, 타입 `paragraph|heading|bullet_list|callout`, 텍스트 ≤800). 행마다 타입 선택 + 텍스트 입력, 위/아래 이동·삭제 버튼. 정규화 규칙은 `packages/api/src/services/bambi-job-description-blocks.ts`의 `validateJobDescriptionBlocks`/`normalizeJobDescriptionBlocks`를 **import해 재사용**(순수 함수, 서버 의존 없음이면). 의존이 있으면 규칙만 native `lib/employer/job-form.ts`로 이식.
- 추가: `media.cover` 1장, `media.detail` 최대 5장. 광고 배너 슬롯(`adHorizontal`/`adVertical`)은 다루지 않는다.

### 이미지 업로드
1. `expo-image-picker`(설치됨)로 선택.
2. `jobs.createMediaUpload({ organizationId, fileName, mimeType, byteSize, usage })` → 서명 PUT URL + storageKey.
3. `fetch(uri).blob()`으로 **실측 byteSize**를 구해 PUT(프로필 사진 업로드와 같은 패턴. `asset.fileSize`는 403 함정).
4. 제출 시 `media.{cover,detail[]}`에 `{ storageKey, fileName, mimeType, byteSize, width, height, altText: "" }`를 담는다. `sliceGroupId`/`sliceIndex`는 보내지 않는다.

**제약(확정):** 상세 이미지 슬라이싱은 native에서 하지 않는다. web은 canvas로 자르지만 native는 `expo-image-manipulator` 신규 의존성이 필요하므로 원본 그대로 올린다. 서버는 미슬라이스 원본을 허용한다.

### 수정 화면
- `jobs.getEditableById`가 내려주는 값(기존 blocks·media 포함)을 초기값으로 채운다.
- 광고가 붙은 공고는 광고 관련 필드를 기존 값 그대로 되돌려 보내야 하는지 서버 `update` 계약을 플랜 단계에서 확인한다. 되돌려 보내야 하면 `getEditableById` 값을 그대로 패스스루한다.
- 기존 이미지는 삭제·교체 가능. 삭제된 원격 객체 정리는 서버 정책을 따른다(웹과 동일).

### 안내
- 폼 하단에 "광고 노출 상품·결제는 웹에서 진행할 수 있어요" 문구 + `EXPO_PUBLIC_WEB_URL` 기반 링크(미설정 시 문구만).

## 5. 내 정보 탭(업체정보)

seeker `me.tsx` 허브 패턴(ProfileCard + ListGroup)을 재사용한다.

### 허브 `(tabs)/me`
- ProfileCard: 업체명(`employerOrganizationProfiles[0].name` 폴백 계정명), 인증 상태 배지(`verificationStatusLabels`).
- ListGroup: 업체 정보 · 사업자 인증 · 설정.
- "팀 관리는 웹에서 할 수 있어요" 안내 1줄.
- 로그아웃.

### 업체 정보 `me/organization`
- 필드: 업체명·업종·지역·소개(web `/employer/settings` + 온보딩 조직 프로필 필드 기준, 플랜에서 `upsertEmployerOrganizationProfile` 입력 스키마로 확정).
- 저장: `onboarding.upsertEmployerOrganizationProfile` → `getMine` invalidate.

### 사업자 인증 `me/business`
web `/employer/me/page.tsx` 이식.
- 입력: 사업자명·사업자등록번호·대표자 성명·개업일.
- 서류: 이미지/PDF. `expo-document-picker`(설치됨) → `prepareEmployerBusinessDocuments`로 업로드 인텐트 → 실측 byteSize PUT → `submitEmployerBusinessInfo`. 목록에서 삭제·미리보기(`createBusinessDocumentViewUrl`).
- 임시 저장: `saveEmployerBusinessDraft`.
- 상태 규칙(web과 동일): `pending`이면 입력 잠금, `verified`/`changes_unsubmitted`는 변경 시 재심사 안내 후 제출, `rejected`는 사유 표시 후 재제출. `biznumCheckedAt`·`biznumStatusCode`·`biznumCheckEnabled`로 국세청 대조 결과 문구 표시.
- 오류: oRPC 코드형 오류는 코드별 한국어 맵으로만 노출.

### 설정
- seeker `/(seeker)/me/settings`로 push(비밀번호·본인인증·로그아웃 공유). employer 전용 항목이 필요해지면 그때 분리.

## 6. 공통 규칙·검증

- 순수 로직(폼 검증, 블록 편집 상태 조작, 상태 라벨, 인증 상태 문구, 업로드 payload 빌더)은 `apps/native/src/lib/employer/*.ts`에 두고 vitest로 커버. 화면은 얇게.
- UI는 heroui-native. 착수 전 `.agents/skills/heroui-native/SKILL.md`와 `get_component_docs.mjs`로 실제 API 확인. native 확정 규칙(accent 텍스트 클래스, Surface secondary+rounded-lg, active:opacity-75, Chip 터치 타깃, 배지는 GradeBadge 방식) 준수.
- 라벨 맵: DB enum 원값 화면 노출 금지, 새 enum 값이 있으면 라벨 맵 동반.
- 검증 명령: native vitest, `check-types`, `pnpm dlx ultracite check <경로>`, `node_modules/.bin/biome check <경로>`.
- 빌드·dev 서버·에뮬레이터 조작 금지. 실기기 확인은 사용자.
- 신규 npm 의존성 없음.

## 7. 범위 밖(후속)

- 광고 상품 선택·결제·부스트·포인트 사용, 광고 현황 표시
- 상세 이미지 슬라이싱, 광고 배너 이미지, 상세 디자인 요청
- 업체 채팅(탭은 플레이스홀더), 팀 관리·멤버 초대
- 카메라 촬영·이미지 리사이즈

## 8. 완료 기준

- employer 로그인 시 3탭 셸로 진입하고 seeker/moderator는 게이트로 되돌아간다.
- 공고 목록에서 등록·수정·삭제(환급 문구 포함)가 web과 같은 결과를 낸다.
- 등록 폼에서 스위치·상세설명 블록·대표/상세 이미지를 포함해 `standard` 공고가 생성·수정된다.
- 내 정보에서 업체 정보 수정, 사업자 인증 제출·재제출·서류 업로드가 web과 같은 상태 규칙으로 동작한다.
- lib 순수 로직 vitest 통과, check-types·ultracite·biome 0건.
