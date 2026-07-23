# 연락처 확인 페이지(웹) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구인자·구직자가 **양쪽 모두** 연락처 공개에 동의한 경우, 웹에서 상대방 연락처를 실제로 조회·확인할 수 있게 한다.

**Architecture:** 현재 `revealContact`는 내 연락처를 `contact_reveal_consent`에 저장만 하는 **쓰기 전용** 기능이고, 이 테이블을 SELECT하는 코드가 레포에 하나도 없다. 따라서 (1) 상호 동의를 판정하는 순수 정책 함수를 추가하고, (2) 채팅방 기준으로 내 동의·상대 동의를 조회하는 신규 프로시저 `chats.getContactReveal`을 만들고, (3) 기존 `/seeker/chats/[id]/reveal` 페이지를 "동의 제출 + 연락처 확인" 화면으로 확장한다. **DB 스키마 변경은 없다** — 기존 테이블을 읽기만 한다.

**Tech Stack:** oRPC(protectedProcedure) + Drizzle + PostgreSQL, Next.js(App Router, RSC) + TanStack Query, vitest.

## Global Constraints

- **웹 전용.** `apps/native`는 이번 범위에서 **수정하지 않는다**. (native의 `app/(seeker)/chats/[id]/reveal.tsx`는 동의 제출 화면 그대로 둔다.)
- **DB 스키마 변경 금지.** `contact_reveal_consent`·`interview_schedule`을 **읽기만** 한다. 마이그레이션 파일을 만들지 않는다. `db:push`·`db:generate`·`db:migrate`를 실행하지 않는다.
- **라이브러리 추가 금지.** 새 npm 의존성을 설치하지 않는다.
- **빌드·dev 서버 실행 금지.** 검증은 `vitest` + `check-types` + `ultracite`만 사용한다. 시각 확인은 사용자가 한다.
- **커밋 메시지**: 한국어 `type: 제목` + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). 멀티라인은 임시 파일 + `git commit -F`.
- **web UI 규칙**: `apps/web/CLAUDE.md` 준수. 단 `components/bambi/screens/contact-reveal.tsx`는 기존 프로토타입 DS(`../ds`의 `Card`/`Button`/`Badge`)를 쓰고 있으므로 **주변 코드의 기존 패턴을 그대로 따른다**(점진 전환 대상 파일, 새 스타일 체계로 갈아엎지 않는다).
- **DB 통합 테스트는 실제 DB가 필요하다.** `packages/api`의 `chats.test.ts`는 `apps/server/.env`를 읽어 실DB에 붙는다. DB가 없으면 Task 2의 테스트는 실행할 수 없다 — 그 경우 Task 1(순수 함수)·Task 3(웹)만 검증하고, Task 2 테스트는 사용자에게 실행을 요청한다.
- **상호주의 원칙**: 상대 연락처는 **내가 먼저 동의했을 때만** 응답에 포함한다. (내가 동의 안 하고 상대 것만 받아가는 무임승차 차단)

---

## 배경: 지금 무엇이 끊겨 있는가

| 단계 | 현재 상태 |
|---|---|
| DB 저장 | 동작 — `contact_reveal_consent`(`packages/db/src/schema/bambi.ts:531-552`), unique(`interviewScheduleId`,`userId`,`contactMethod`) |
| 상대 동의 판정 | **없음** — `packages/api/src/routers/bambi/chats.ts:974`에서 `ownerConsented: true` 하드코딩 |
| 서버 조회(SELECT) | **없음** — `contactRevealConsent`를 SELECT하는 코드 0건 |
| API 응답 | `revealContact`는 **내가 방금 입력한 내 연락처**만 반환(`chats.ts:1013`) |
| UI 표시 | **없음** — `contact-reveal.tsx:274-298`의 `savedContact`는 뮤테이션 응답(내 것). 새로고침하면 사라진다 |

**부수 사실**: `canRevealContact`(`packages/api/src/services/bambi-policy.ts:116-121`)의 `ownerConsented` 파라미터는 호출부가 상수 `true`라 **죽은 인자**다. 이 계획에서는 이 함수를 건드리지 않고(동의 제출 조건은 그대로 유지), **조회용 판정 함수를 새로 만든다**. 동의 제출 시점에 상대 동의를 요구하면 아무도 먼저 동의할 수 없는 닭-달걀이 되기 때문이다.

**범위 밖(별도 작업)**: 구인자는 `employer` 내비게이션에 채팅 링크가 없어(`apps/web/src/app/employer/layout.tsx:10-15`) `/seeker/chats/*`에 URL 직접 입력 외에는 도달할 수 없다. 백엔드·채팅방 컴포넌트는 구인자를 지원하므로(`chats.ts:445-449`, `seeker-chat-room-responsive.tsx:922`) **이 계획의 결과물은 구인자에게도 그대로 동작하지만**, 진입 링크 추가는 별도 이슈로 남긴다.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `packages/api/src/services/bambi-policy.ts` | 순수 정책 함수. 상호 동의 판정 `canViewCounterpartContact` 추가 | 수정 |
| `packages/api/src/services/bambi-policy.test.ts` | 위 함수의 진리표 테스트 | 수정 |
| `packages/api/src/routers/bambi/chats.ts` | `getContactReveal` 프로시저 신설(조회 전용) | 수정 |
| `packages/api/src/routers/bambi/chats.test.ts` | 프로시저 통합 테스트(상호 동의/단독 동의/비참여자) | 수정 |
| `apps/web/src/components/bambi/screens/contact-reveal.tsx` | 동의 폼 + **상대 연락처 확인 카드**. 로컬 state 대신 서버 쿼리를 진실의 원천으로 | 수정 |

라우트(`apps/web/src/app/seeker/chats/[id]/reveal/page.tsx`)는 **수정하지 않는다** — 이미 `roomId`를 넘기고 있고, 화면 내부만 바뀐다.

---

## Task 1: 상호 동의 판정 정책 함수

**Files:**
- Modify: `packages/api/src/services/bambi-policy.ts`
- Test: `packages/api/src/services/bambi-policy.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces:
  ```ts
  export interface CanViewCounterpartContactInput {
  	counterpartConsented: boolean;
  	interviewStatus: string;
  	mineConsented: boolean;
  }
  export const canViewCounterpartContact: (
  	input: CanViewCounterpartContactInput
  ) => boolean;
  ```
  Task 2가 이 함수를 import 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/services/bambi-policy.test.ts` 파일 끝(마지막 `});` 앞이 아니라 **파일 최상위**, 기존 `describe` 블록들과 형제 레벨)에 아래를 추가한다:

```ts
describe("canViewCounterpartContact", () => {
	it("allows viewing only when the interview is confirmed and both sides consented", () => {
		expect(
			canViewCounterpartContact({
				counterpartConsented: true,
				interviewStatus: "confirmed",
				mineConsented: true,
			})
		).toBe(true);
	});

	it("hides the counterpart contact until I consent myself", () => {
		// 무임승차 차단: 내가 동의하지 않으면 상대가 동의했어도 못 본다.
		expect(
			canViewCounterpartContact({
				counterpartConsented: true,
				interviewStatus: "confirmed",
				mineConsented: false,
			})
		).toBe(false);
	});

	it("hides the counterpart contact while the counterpart has not consented", () => {
		expect(
			canViewCounterpartContact({
				counterpartConsented: false,
				interviewStatus: "confirmed",
				mineConsented: true,
			})
		).toBe(false);
	});

	it("requires a confirmed interview", () => {
		for (const interviewStatus of ["proposed", "rejected", "cancelled"]) {
			expect(
				canViewCounterpartContact({
					counterpartConsented: true,
					interviewStatus,
					mineConsented: true,
				})
			).toBe(false);
		}
	});
});
```

그리고 파일 상단 import에 `canViewCounterpartContact`를 추가한다(기존 import 블록에 알파벳 순으로 끼워 넣는다 — biome이 정렬을 강제한다).

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/api && pnpm vitest run src/services/bambi-policy.test.ts`
Expected: FAIL — `canViewCounterpartContact is not a function` 또는 import 에러.

- [ ] **Step 3: 최소 구현**

`packages/api/src/services/bambi-policy.ts`의 `canRevealContact` **바로 아래**에 추가한다:

```ts
export interface CanViewCounterpartContactInput {
	counterpartConsented: boolean;
	interviewStatus: string;
	mineConsented: boolean;
}

// 상대 연락처는 양쪽이 모두 동의해야 보인다. 내가 동의하지 않은 채 상대 것만 받아가는
// 무임승차를 막으려고 mineConsented를 함께 요구한다.
export const canViewCounterpartContact = ({
	counterpartConsented,
	interviewStatus,
	mineConsented,
}: CanViewCounterpartContactInput): boolean =>
	interviewStatus === "confirmed" && mineConsented && counterpartConsented;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/api && pnpm vitest run src/services/bambi-policy.test.ts`
Expected: PASS (기존 테스트 포함 전부 통과)

- [ ] **Step 5: 린트 + 타입체크**

Run:
```bash
pnpm dlx ultracite fix packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-policy.test.ts
cd packages/api && pnpm check-types
```
Expected: 린트 클린, 타입 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/services/bambi-policy.ts packages/api/src/services/bambi-policy.test.ts
printf '%s\n' \
  'feat(api): 연락처 상호 공개 판정 함수 추가' '' \
  '- canViewCounterpartContact 신설: 면접 confirmed + 양쪽 동의일 때만 상대 연락처 열람 허용' \
  '- 내가 동의하지 않으면 상대가 동의했어도 못 보게 해 무임승차 차단' \
  '- 진리표 테스트 추가(양쪽 동의/내 미동의/상대 미동의/미확정 일정)' > /tmp/bambi-commit-1.txt
git commit -F /tmp/bambi-commit-1.txt
```

---

## Task 2: 연락처 조회 프로시저 `chats.getContactReveal`

**Files:**
- Modify: `packages/api/src/routers/bambi/chats.ts`
- Test: `packages/api/src/routers/bambi/chats.test.ts`

**Interfaces:**
- Consumes: `canViewCounterpartContact`(Task 1)
- Produces: 프로시저 `chats.getContactReveal`
  ```ts
  // 입력
  { chatRoomId: string /* uuid */ }
  // 출력
  {
    canViewCounterpart: boolean;
    confirmedSchedule: { id: string; scheduledAt: Date; locationNote: string | null } | null;
    counterpartContacts: { contactMethod: string; contactValue: string }[]; // canViewCounterpart=false면 항상 []
    mineContacts: { contactMethod: string; contactValue: string }[];
  }
  ```
  Task 3(웹)이 이 응답 형태에 의존한다.

**설계 메모:**
- 채팅방 기준으로 **확정(confirmed) 일정 1건**을 잡는다. 확정 일정이 없으면 전부 빈 값 + `canViewCounterpart: false`.
- 한 사용자가 `phone`/`kakao`/`email`을 각각 동의할 수 있으므로(unique 키에 `contactMethod` 포함) **배열**로 반환한다.
- 권한: `requireChatParticipant` → 차단 여부(`throwIfChatBlocked`). 기존 `revealContact`와 동일한 가드를 쓴다.
- **상대 연락처는 `canViewCounterpart`가 true일 때만 채운다.** false면 서버가 아예 값을 싣지 않는다(클라이언트에서 거르지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/src/routers/bambi/chats.test.ts` 파일 끝에 새 `describe` 블록을 추가한다. 기존 헬퍼(`createChatFixture`, `cleanupChatFixture`, `createContextForUser`, `expectOrpcCode`)와 스키마(`contactRevealConsent`, `interviewSchedule`)는 이미 파일 상단에서 import 돼 있으니 그대로 쓴다.

```ts
describe("bambi chats router contact reveal", () => {
	const confirmInterview = async (fixture: ChatFixture): Promise<string> => {
		const [schedule] = await db
			.insert(interviewSchedule)
			.values({
				chatRoomId: fixture.chatRoomId,
				proposedByUserId: fixture.employerUserId,
				scheduledAt: new Date(Date.now() + 86_400_000),
				status: "confirmed",
			})
			.returning();

		return schedule.id;
	};

	const consent = async (
		scheduleId: string,
		userId: string,
		contactValue: string
	): Promise<void> => {
		await db.insert(contactRevealConsent).values({
			contactMethod: "phone",
			contactValue,
			interviewScheduleId: scheduleId,
			userId,
		});
	};

	it("hides the counterpart contact when only the counterpart consented", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await consent(scheduleId, fixture.employerUserId, "010-1111-2222");

			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.canViewCounterpart).toBe(false);
			expect(result.counterpartContacts).toEqual([]);
			expect(result.mineContacts).toEqual([]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("returns the counterpart contact once both sides consented", async () => {
		const fixture = await createChatFixture();

		try {
			const scheduleId = await confirmInterview(fixture);
			await consent(scheduleId, fixture.employerUserId, "010-1111-2222");
			await consent(scheduleId, fixture.jobSeekerUserId, "010-3333-4444");

			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.canViewCounterpart).toBe(true);
			expect(result.counterpartContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-1111-2222" },
			]);
			expect(result.mineContacts).toEqual([
				{ contactMethod: "phone", contactValue: "010-3333-4444" },
			]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});

	it("hides everything when no interview is confirmed", async () => {
		const fixture = await createChatFixture();

		try {
			const getContactReveal = createProcedureClient(
				chatsRouter.getContactReveal,
				{
					context: createContextForUser(fixture.jobSeekerUserId),
					path: ["bambi", "chats", "getContactReveal"],
				}
			);
			const result = await getContactReveal({
				chatRoomId: fixture.chatRoomId,
			});

			expect(result.canViewCounterpart).toBe(false);
			expect(result.confirmedSchedule).toBeNull();
			expect(result.counterpartContacts).toEqual([]);
		} finally {
			await cleanupChatFixture(fixture);
		}
	});
});
```

**주의:** `cleanupChatFixture`는 현재 `contactRevealConsent`를 `jobSeekerUserId` 기준으로만 지운다(`chats.test.ts:157-158`). 위 테스트는 **employer의 동의 행도** 만들므로, `cleanupChatFixture` 안의 삭제 조건을 두 사용자 모두로 넓힌다:

```ts
	await db
		.delete(contactRevealConsent)
		.where(
			inArray(contactRevealConsent.userId, [
				fixture.employerUserId,
				fixture.jobSeekerUserId,
			])
		);
```
(`inArray`는 파일 상단에서 이미 import 돼 있다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/chats.test.ts -t "contact reveal"`
Expected: FAIL — `chatsRouter.getContactReveal is undefined`.

DB에 붙지 못해 실패한다면(연결 에러) Global Constraints의 DB 항목대로 사용자에게 알리고, Task 3으로 넘어가되 이 테스트는 미검증으로 보고한다.

- [ ] **Step 3: 프로시저 구현**

`packages/api/src/routers/bambi/chats.ts`:

(a) import에 `canViewCounterpartContact`를 추가한다(기존 `canRevealContact`를 가져오는 import 블록에 함께, biome 정렬 순서 유지).

(b) 입력 스키마를 `revealContactInput`(`chats.ts:96-100`) 아래에 추가한다:

```ts
const getContactRevealInput = z.object({
	chatRoomId: z.string().uuid(),
});
```

(c) `revealContact` 프로시저 **바로 앞**에 아래 프로시저를 추가한다:

```ts
	// 조회 전용. 상대 연락처는 canViewCounterpart가 true일 때만 응답에 싣는다.
	getContactReveal: protectedProcedure
		.input(getContactRevealInput)
		.handler(async ({ context, input }) => {
			const { profile, room } = await requireChatParticipant(
				input.chatRoomId,
				context.session
			);

			await throwIfChatBlocked({
				actorUserId: profile.userId,
				employerUserId: room.employerUserId,
				isBlocked: room.isBlocked,
				jobSeekerUserId: room.jobSeekerUserId,
			});

			const [confirmedSchedule] = await db
				.select({
					id: interviewSchedule.id,
					locationNote: interviewSchedule.locationNote,
					scheduledAt: interviewSchedule.scheduledAt,
				})
				.from(interviewSchedule)
				.where(
					and(
						eq(interviewSchedule.chatRoomId, room.id),
						eq(interviewSchedule.status, "confirmed")
					)
				)
				.limit(1);

			if (!confirmedSchedule) {
				return {
					canViewCounterpart: false,
					confirmedSchedule: null,
					counterpartContacts: [],
					mineContacts: [],
				};
			}

			const counterpartUserId =
				profile.userId === room.jobSeekerUserId
					? room.employerUserId
					: room.jobSeekerUserId;

			const consents = await db
				.select({
					contactMethod: contactRevealConsent.contactMethod,
					contactValue: contactRevealConsent.contactValue,
					userId: contactRevealConsent.userId,
				})
				.from(contactRevealConsent)
				.where(
					eq(contactRevealConsent.interviewScheduleId, confirmedSchedule.id)
				);

			const mineContacts = consents
				.filter((row) => row.userId === profile.userId)
				.map(({ contactMethod, contactValue }) => ({
					contactMethod,
					contactValue,
				}));
			const counterpartRows = consents.filter(
				(row) => row.userId === counterpartUserId
			);

			const canViewCounterpart = canViewCounterpartContact({
				counterpartConsented: counterpartRows.length > 0,
				interviewStatus: "confirmed",
				mineConsented: mineContacts.length > 0,
			});

			return {
				canViewCounterpart,
				confirmedSchedule,
				counterpartContacts: canViewCounterpart
					? counterpartRows.map(({ contactMethod, contactValue }) => ({
							contactMethod,
							contactValue,
						}))
					: [],
				mineContacts,
			};
		}),
```

`and`가 이 파일에 import 돼 있지 않다면 `drizzle-orm` import에 추가한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd packages/api && pnpm vitest run src/routers/bambi/chats.test.ts -t "contact reveal"`
Expected: PASS (3개)

- [ ] **Step 5: 린트 + 타입체크**

Run:
```bash
pnpm dlx ultracite fix packages/api/src/routers/bambi/chats.ts packages/api/src/routers/bambi/chats.test.ts
cd packages/api && pnpm check-types
```
Expected: 린트 클린, 타입 에러 0.

- [ ] **Step 6: 커밋**

```bash
git add packages/api/src/routers/bambi/chats.ts packages/api/src/routers/bambi/chats.test.ts
printf '%s\n' \
  'feat(api): 연락처 조회 프로시저 getContactReveal 추가' '' \
  '- 채팅방 기준 확정 면접 일정의 내 동의·상대 동의를 조회하는 읽기 전용 프로시저 신설' \
  '- 상대 연락처는 양쪽 동의(canViewCounterpartContact)일 때만 응답에 포함, 아니면 서버가 아예 싣지 않음' \
  '- 연락 방식(phone·kakao·email)별로 여러 건 동의 가능하므로 배열로 반환' \
  '- 가드는 revealContact와 동일(requireChatParticipant + 차단 검사)' \
  '- cleanupChatFixture가 구인자 동의 행도 정리하도록 삭제 조건 확장' \
  '- 테스트 추가: 상대만 동의 시 미노출, 양쪽 동의 시 노출, 확정 일정 없으면 전부 빈 값' > /tmp/bambi-commit-2.txt
git commit -F /tmp/bambi-commit-2.txt
```

---

## Task 3: 연락처 확인 화면 (웹)

**Files:**
- Modify: `apps/web/src/components/bambi/screens/contact-reveal.tsx`

**Interfaces:**
- Consumes: `orpc.bambi.chats.getContactReveal`(Task 2)
- Produces: 없음(말단 화면)

**바꾸는 것 (3가지):**
1. `savedContact` **로컬 state를 제거**하고 서버 쿼리(`getContactReveal`)를 진실의 원천으로 삼는다. 지금은 뮤테이션 성공 시에만 내 연락처가 보이고 **새로고침하면 사라진다** — 이것 자체가 버그다.
2. **상대 연락처 카드**를 추가한다. 상태는 셋 중 하나다:
   - 내가 아직 동의 안 함 → "내가 먼저 동의해야 상대 연락처를 볼 수 있어요"
   - 나만 동의함 → "상대방의 동의를 기다리는 중이에요"
   - 양쪽 동의 → **상대 연락처 표시**
3. 하단 "채팅방으로 돌아가기" 버튼의 `disabled` 조건을 `savedContact` → `mineContacts.length > 0`으로 바꾼다.

- [ ] **Step 1: 쿼리 추가 + 로컬 state 제거**

`ContactRevealApi` 안에서:

(a) `savedContact` state 선언(`contact-reveal.tsx:74-77`)을 **삭제**한다.

(b) `roomQuery` 아래에 조회 쿼리를 추가한다:

```ts
	const revealQuery = useQuery(
		orpc.bambi.chats.getContactReveal.queryOptions({
			input: { chatRoomId: roomId },
		})
	);
	const mineContacts = revealQuery.data?.mineContacts ?? [];
	const counterpartContacts = revealQuery.data?.counterpartContacts ?? [];
	const canViewCounterpart = revealQuery.data?.canViewCounterpart ?? false;
	const hasMineConsent = mineContacts.length > 0;
```

(c) 뮤테이션의 `onSuccess`에서 `setSavedContact(...)`를 지우고, 대신 조회 쿼리를 무효화한다:

```ts
			onSuccess: async () => {
				setErrorMessage(null);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.chats.getById.queryKey({
							input: { id: roomId },
						}),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.chats.getContactReveal.queryKey({
							input: { chatRoomId: roomId },
						}),
					}),
				]);
			},
```

- [ ] **Step 2: 내 연락처 카드를 서버 데이터로 전환**

`savedContact ? (...) : null` 블록(`contact-reveal.tsx:274-298`)을 아래로 교체한다:

```tsx
				{hasMineConsent ? (
					<Card className="rounded-lg" pad="lg" tone="outline">
						<div className="flex items-center gap-3">
							<div className="inline-flex size-11 items-center justify-center rounded-xl bg-coral-50 text-coral-700">
								<span className="inline-flex size-[22px]">
									<PhoneIcon />
								</span>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<Badge tone="success">
										<span className="inline-flex size-3">
											<CheckIcon />
										</span>
										내가 공개함
									</Badge>
								</div>
								{mineContacts.map((contact) => (
									<p
										className="mt-2 mb-0 break-words font-extrabold text-foreground text-lg"
										key={`${contact.contactMethod}-${contact.contactValue}`}
									>
										{contactMethodLabels[contact.contactMethod as ContactMethod]}{" "}
										· {contact.contactValue}
									</p>
								))}
							</div>
						</div>
					</Card>
				) : null}
```

- [ ] **Step 3: 상대 연락처 카드 추가**

Step 2의 카드 **바로 아래**에 추가한다:

```tsx
				<Card className="rounded-lg" pad="lg" tone="outline">
					<div className="flex items-center justify-between gap-3">
						<h2 className="m-0 font-extrabold text-lg">상대방 연락처</h2>
						<Badge tone={canViewCounterpart ? "success" : "pending"}>
							{canViewCounterpart ? "공개됨" : "비공개"}
						</Badge>
					</div>
					{canViewCounterpart ? (
						<div className="mt-3 flex flex-col gap-2">
							{counterpartContacts.map((contact) => (
								<p
									className="m-0 break-words font-extrabold text-foreground text-lg"
									key={`${contact.contactMethod}-${contact.contactValue}`}
								>
									{contactMethodLabels[contact.contactMethod as ContactMethod]} ·{" "}
									{contact.contactValue}
								</p>
							))}
						</div>
					) : (
						<p className="mt-3 mb-0 text-muted-foreground text-sm">
							{hasMineConsent
								? "상대방의 동의를 기다리는 중이에요. 상대가 동의하면 여기에 표시됩니다."
								: "내 연락처를 먼저 공개해야 상대방 연락처를 볼 수 있어요."}
						</p>
					)}
				</Card>
```

- [ ] **Step 4: 하단 버튼 조건 교체**

`contact-reveal.tsx:300-310`의 `disabled={!savedContact}` / `variant={savedContact ? ... }`를 아래로 바꾼다:

```tsx
				<Button
					block
					disabled={!hasMineConsent}
					onClick={onDone}
					size="lg"
					variant={hasMineConsent ? "primary" : "secondary"}
				>
					채팅방으로 돌아가기
				</Button>
```

- [ ] **Step 5: 안내 문구 정정**

`contact-reveal.tsx:185-188`의 문구를 상호주의에 맞게 바꾼다:

```tsx
						<p className="m-0 max-w-[320px] text-muted-foreground text-sm leading-[1.55]">
							양쪽 모두 동의해야 서로의 연락처가 공개돼요. 내가 먼저 동의해도
							상대가 동의하기 전까지는 상대 연락처가 보이지 않아요.
						</p>
```

- [ ] **Step 6: 린트 + 타입체크**

Run:
```bash
pnpm dlx ultracite fix apps/web/src/components/bambi/screens/contact-reveal.tsx
cd apps/web && pnpm check-types
```
Expected: 린트 클린, 타입 에러 0. (`savedContact` 잔여 참조가 있으면 여기서 잡힌다.)

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/components/bambi/screens/contact-reveal.tsx
printf '%s\n' \
  'feat(web): 연락처 확인 화면 추가 - 상호 동의 시 상대 연락처 표시' '' \
  '- getContactReveal 쿼리를 진실의 원천으로 삼아 내 공개 연락처를 표시(기존 로컬 state는 새로고침 시 사라지던 문제)' \
  '- 상대방 연락처 카드 신설: 내 미동의·상대 대기·양쪽 동의 3가지 상태를 구분해 안내' \
  '- 동의 저장 성공 시 getContactReveal 캐시를 함께 무효화해 즉시 반영' \
  '- 하단 버튼 활성 조건을 서버가 확인한 내 동의 여부로 교체' \
  '- 상호 동의가 필요하다는 점을 상단 안내 문구에 명시' > /tmp/bambi-commit-3.txt
git commit -F /tmp/bambi-commit-3.txt
```

---

## Task 4: 채팅방 진입 버튼 라벨 상태 반영 (선택)

**Files:**
- Modify: `apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx:1302-1311`

채팅방의 "연락처 공개하기" 버튼은 이미 동의를 마쳤든 아니든 항상 같은 문구다. 상호 동의가 끝났으면 "연락처 보기"로 바꿔주는 편이 자연스럽다.

- [ ] **Step 1: 쿼리 추가**

`seeker-chat-room-responsive.tsx`의 채팅방 데이터 로딩부 근처에 추가한다(`roomId`가 있는 스코프):

```ts
	const revealQuery = useQuery(
		orpc.bambi.chats.getContactReveal.queryOptions({
			input: { chatRoomId: roomId },
		})
	);
```

- [ ] **Step 2: 버튼 문구 분기**

`onClick={onReveal}` 버튼의 라벨을 바꾼다:

```tsx
						{revealQuery.data?.canViewCounterpart
							? "연락처 보기"
							: "연락처 공개하기"}
```

- [ ] **Step 3: 린트 + 타입체크 + 커밋**

```bash
pnpm dlx ultracite fix apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx
cd apps/web && pnpm check-types
git add apps/web/src/components/bambi/screens/seeker-chat-room-responsive.tsx
printf '%s\n' \
  'feat(web): 채팅방 연락처 버튼을 공개 상태에 맞게 표기' '' \
  '- 상호 동의가 끝난 방에서는 버튼 문구를 "연락처 보기"로 전환' > /tmp/bambi-commit-4.txt
git commit -F /tmp/bambi-commit-4.txt
```

---

## 최종 검증

- [ ] `cd packages/api && pnpm vitest run` — 전체 통과 (DB 미연결 시 `chats.test.ts`·`job-post-media.test.ts`는 실패할 수 있음. **이 두 파일의 DB 연결 실패는 기존부터 있던 문제**이니 baseline과 비교해 새로 깨진 게 없는지 확인한다.)
- [ ] `cd packages/api && pnpm check-types` — 에러 0
- [ ] `cd apps/web && pnpm check-types` — 에러 0
- [ ] `pnpm dlx ultracite check` (변경 파일들) — 클린
- [ ] 시각 확인은 **사용자에게 요청**한다(dev 서버 실행 금지). 확인 요청 시나리오:
  1. `owner@bambi.dev` / `seeker@bambi.dev` (비번 `Bambi1234!`)로 각각 로그인
  2. 면접이 `confirmed`인 채팅방에서 `/seeker/chats/{id}/reveal` 진입
  3. 구직자만 동의 → "상대방의 동의를 기다리는 중" 노출 확인
  4. 구인자도 동의 → 양쪽 화면에서 상대 연락처가 보이는지 확인
  5. 새로고침해도 내 공개 연락처가 유지되는지 확인

## 남기는 것 (이 계획의 범위 밖)

- **구인자 채팅 진입 링크 부재** — `employer/layout.tsx`에 채팅 링크가 없어 URL 직접 입력 외 도달 불가. 별도 작업.
- **`canRevealContact`의 죽은 `ownerConsented` 인자** — 호출부가 상수 `true`. 동작에 영향 없어 이번엔 두지만, 정리하려면 시그니처 변경 + 테스트 수정이 필요하다.
- **native 앱** — 동의 제출 화면만 있는 상태 유지.
