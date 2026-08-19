# 인증 테이블(본인인증 수집 로그) — 설계

날짜: 2026-08-05 · 브랜치: `feat/guest-community-post` (base)

## 목적

비회원·구직자·구인자가 포트원 본인인증을 할 때 확인되는 생년월일·휴대폰 번호·성별과 "구분"(비회원/구직자/구인자)을 별도 테이블에 수집한다. 이 테이블은 **개발자 SQL 전용**이다 — 조회 API·관리자 화면을 일절 만들지 않는다(운영자 비노출).

## 정책 결정 (확정)

- 수집 항목은 생년월일(YYYYMMDD)·휴대폰 번호·성별·구분·이름(name). (~~이름(name)은 저장하지 않는다(PII 최소화).~~ — **2026-08-19 정책 변경**: 포트원 인증 결과의 실명(name)도 nullable로 함께 저장한다. 미제공 시 null.)
- 구분은 인증 시점에 모를 수 있다(가입 전 인증) — nullable로 두고, 비회원 흐름은 즉시 `guest`, 회원은 가입 완료 시점에 역할로 채운다.
- **사람당 1행**: (생년월일, 휴대폰 번호)가 사람 식별 upsert 키다. 같은 사람이 재인증하면(포트원 인증 건 ID는 실패·재시도마다 새로 발급) 기존 행이 최신 상태로 갱신된다. 번호가 null인 행은 사람을 특정할 수 없어 그냥 insert(부분 unique 인덱스 제외 대상).
- 비회원으로 인증한 사람이 이어서 가입하면 구분을 가입 역할로 **덮어쓴다**(최종 상태 보존).
- 기존 회원의 재인증(`verifyMyPhone`)도 기록한다(구분 = 해당 회원 역할).
- 평문 저장 — 기존 `bambi_profile`의 번호·생년월일 저장 축과 동일. 보존 기간은 별도 정책 없음(무기한, 파기 정책 필요 시 후속).
- 개발 목(mock) 인증(포트원 미구성)은 기록하지 않는다.

## DB (마이그레이션 1건)

`bambi_identity_verification_log`:

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid pk | |
| `identity_verification_id` | text (일반 index) | 이 행을 마지막으로 갱신한 포트원 인증 건 ID(최근 인증 건 추적용) |
| `phone_number` | text | |
| `birth_date` | varchar(8) | YYYYMMDD |
| `gender` | `bambi_gender` nullable | 포트원 미제공 시 null |
| `name` | text nullable | 실명(포트원 `verifiedCustomer.name`). 2026-08-19 추가, 미제공 시 null |
| `kind` | `bambi_user_role` nullable | 구분 — guest/job_seeker/employer 사용(admin 미사용) |
| `created_at` / `updated_at` | timestamp | |

사람 식별 unique 인덱스: `(birth_date, phone_number)` 부분 unique — `WHERE phone_number IS NOT NULL`.

enum은 기존 `bambi_user_role`·`bambi_gender` 재사용 — 새 enum 불필요.

## 기록 지점 (모든 실인증이 지나는 `resolveVerifiedIdentity` 호출부)

1. **`checkIdentityForSignup`** (onboarding 라우터, public): 인증 성공 시 번호·성별·생년월일 upsert. 입력에 `source: "guest"` 선택 필드를 추가하고, web `/api/guest` 라우트가 이 플래그로 호출하면 `kind = 'guest'`까지 기록한다(플래그 없으면 kind 미변경 — 가입 전 사전확인 호출).
2. **`createBambiProfile`** (가입 완료, 인증 건 최종 소진): 같은 사람 행의 `kind`를 가입 역할(job_seeker/employer)로 upsert.
3. **`verifyMyPhone`** (기존 회원 재인증): upsert, `kind` = 프로필 역할.

기록은 인증 흐름과 같은 경로에서 straight insert/upsert 한다(별도 try/catch로 삼키지 않음 — 수집 누락 방지가 목적이므로 실패는 실패로 드러낸다).

## 비노출 원칙

- oRPC 프로시저·관리자 화면·클라이언트 접근 경로 없음. 쓰기 코드만 존재한다.
- 열람은 개발자가 DB에 직접 SQL로만 한다.

## 테스트·검증

- 순수 로직(기록 값 구성)이 생기면 단위 테스트, DB upsert는 check-types + 코드 리뷰(라우터 통합 스위트는 dev DB 파괴 문제로 실행 금지).
- `check-types` + ultracite(경로 인자) 통과. 마이그레이션은 drizzle generate 후 적용 검증(db:push 금지).
