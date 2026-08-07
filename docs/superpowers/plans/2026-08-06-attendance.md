# 출석체크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구직자·업소 회원이 하루 1회 버튼으로 출석을 남기고(보상 없음, 기록·연속일·월 달력만), 운영자가 사용자별 출석 현황을 목록표로 보는 기능을 스펙 §5 그대로 구현한다. 출석 알림은 만들지 않는다(보상이 없어 리마인드는 스팸 — 스펙 §5.3 명시).

**Architecture:** 날짜 판정은 전부 **서버 KST 기준**이다. `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })` 한 곳에서 "오늘"을 만들고, 연속 출석일 계산까지 순수 함수(`packages/api/src/services/bambi-attendance.ts`, vitest 동거)로 분리해 DB 없이 검증한다. 저장은 `bambi_attendance(user_id, attended_on)` **복합 PK** 한 장 — 하루 1회 제약을 애플리케이션 조건문이 아니라 DB 제약이 보장하고, 라우터는 `onConflictDoNothing`으로 멱등만 지킨다. 읽기는 `getMine`(본인 전체 출석일 1회 조회 → 총계·연속·월 필터를 TS에서 파생)과 `adminList`(상관 서브쿼리 집계 + 검색·역할·정렬·오프셋 커서)로 나뉜다. 화면은 공통 컴포넌트 `AttendancePanel` 1개를 `/seeker/attendance`·`/employer/attendance` 두 라우트가 재사용하고, 운영자는 raw shadcn `Table` 목록표(`/moderator/attendance`)를 쓴다. 달력은 라이브러리 없이 Tailwind 7열 grid + 순수 그리드 빌더(`apps/web/src/lib/bambi/attendance-calendar.ts`, vitest 동거)로 그린다.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query + oRPC(`@orpc/tanstack-query`), Drizzle ORM / PostgreSQL, zod, shadcn(base-ui) + Tailwind v4, Vitest, pnpm workspace + Turbo.

## Global Constraints

아래는 이 리포의 강제 규칙이다. 태스크 안에서 어긋나는 지시가 있으면 이쪽이 우선한다.

- **빌드·dev 서버 실행 금지**(사용자가 IDE에서 web/server를 항상 띄워 두고 HMR로 반영한다). 검증은 `check-types` + `ultracite` + 순수 vitest만. 스크린샷·브라우저 확인 금지 — 시각 확인은 사용자 검수 대상이다.
- **pnpm 필터명**: `web`/`server`는 scope가 없다(`pnpm --filter web check-types`, `pnpm --filter server check-types`). db/api만 scope가 붙는다(`@bambi-app/db`, `@bambi-app/api`).
- **ultracite는 경로 인자 필수**: `pnpm dlx ultracite fix <경로...>`. 인자를 빼면 0파일을 검사하고 조용히 통과한다.
- **`packages/api/src/routers/bambi` vitest 스위트 실행 금지** — 이 스위트가 dev DB를 파괴한다(site-settings 테스트가 운영 설정 행을 delete). DB 의존 라우터 테스트는 **작성만 하고 실행은 보류**하며, 그 사실을 커밋 메시지에 남긴다.
- **DB**: `db:push` 절대 금지. `drizzle-kit generate`로 마이그레이션 **파일 생성까지만** 하고 `migrate` 적용은 사용자 명시 지시를 기다린다. 이 브랜치에서는 알림 플랜도 같은 스키마 파일을 건드리므로 **실행 순서에 따라 마이그레이션 번호가 달라진다** — generate는 실제 실행 시점에 순차로 돌리고, 생성된 파일명을 그대로 받아들인다(현재 최신은 `0069_optimal_scream.sql`이므로 단독 실행 시 `0070_*`).
- **npm 의존성 추가 금지.** 달력 라이브러리(date-fns·dayjs·react-day-picker 등) 추가 금지 — 월 달력은 Tailwind grid로 직접 구현한다.
- **커밋**: 한국어 `type: 제목` + 촘촘한 `- ` 블릿 본문(블릿 사이 빈 줄 없음). Bash(Git Bash)에서는 PowerShell here-string(`@'...'@`)이 리터럴 `@`를 남기므로 **임시 파일 + `git commit -F <file>`**를 쓴다. 커밋 후 `git log -1 --format=%B`로 확인한다. **구현 서브에이전트는 커밋하지 않는다 — 커밋은 컨트롤러(부모 세션)가 태스크 단위로 순차 수행한다.**
- **UI**: shadcn 컴포넌트 우선(`@bambi-app/ui/components/*`), 인라인 `style` 금지·Tailwind만, base-ui라 `asChild`가 아니라 `render` prop(그리고 `render`가 `<Button>`이면 `nativeButton` 생략, `Link`/`Input` 등 비-button 렌더에만 `nativeButton={false}`), DB enum 원값 화면 노출 금지(`lib/bambi`의 라벨 맵 경유), 임의 px(`[16px]`) 금지·Tailwind 스케일 토큰 사용, 모바일 반응형 필수, 빈 상태는 `EmptyState`(`Empty` 래퍼), 표는 raw shadcn `Table`(DataTable 재발명 금지), 카드는 `CardHeader/CardTitle/CardContent` 풀 구성.
- **primary 버튼 위계**: 화면당 primary(기본 variant)는 주요 액션 한 곳만. 출석 화면에서 primary는 "출석하기" 버튼 하나다 — 달력 칸·내비는 primary 솔리드를 쓰지 않는다.
- **테스트 픽스처**: `organization`·`member` 시드 시 `createdAt`을 수동 지정해야 한다(컬럼에 default 없음). `user`·`bambi_profile`은 default가 있어 생략 가능하다.
- TS 설정에 `noUncheckedIndexedAccess`·`noUnusedLocals`·`noUnusedParameters`가 켜져 있다. 배열 인덱싱 결과는 `| undefined`다 — 구조분해 destructure로 날짜 문자열을 쪼개지 말고 `slice`를 쓴다.
- 주석·사용자 노출 문구는 한국어, 줄바꿈 LF(`.gitattributes`).
- 워크트리에서 vitest를 돌린다(리포 루트에서 경로 필터로 돌리면 다른 워크트리까지 긁는다). 커밋 전 `pnpm install`이 되어 있어야 한다.

---

## Task 1: KST 날짜·연속 출석일 순수 모듈

DB도 라우터도 없는 순수 계산부터 만든다. 이후 모든 태스크(라우터·SQL 집계·화면)가 여기서 나오는 "오늘"을 단일 기준으로 쓴다.

**Files:**

- Create: `packages/api/src/services/bambi-attendance.test.ts`
- Create: `packages/api/src/services/bambi-attendance.ts`

**Interfaces (Produces):**

```ts
// packages/api/src/services/bambi-attendance.ts
export const getKstDateString: (now?: Date) => string;          // "YYYY-MM-DD" (Asia/Seoul 달력일)
export const shiftKstDate: (isoDate: string, days: number) => string;
export const countAttendanceStreak: (
  attendedDatesDesc: readonly string[],   // 내림차순(최신 우선) "YYYY-MM-DD"
  today: string
) => number;
```

**Consumes:** 없음(외부 의존 0, Node 내장 `Intl`만).

- [ ] **Step 1: 실패하는 테스트 작성**

  `packages/api/src/services/bambi-attendance.test.ts`를 아래 내용 그대로 만든다.

  ```ts
  import { describe, expect, it } from "vitest";

  import {
  	countAttendanceStreak,
  	getKstDateString,
  	shiftKstDate,
  } from "./bambi-attendance";

  describe("bambi attendance KST 날짜", () => {
  	it("UTC가 아니라 서울 달력일을 돌려준다", () => {
  		// 2026-08-06T15:30Z = 2026-08-07 00:30 KST — 서울에서는 이미 다음 날이다.
  		expect(getKstDateString(new Date("2026-08-06T15:30:00.000Z"))).toBe(
  			"2026-08-07"
  		);
  		// 2026-08-06T14:59Z = 2026-08-06 23:59 KST — 아직 같은 날이다.
  		expect(getKstDateString(new Date("2026-08-06T14:59:00.000Z"))).toBe(
  			"2026-08-06"
  		);
  	});

  	it("월·연 경계를 넘겨 날짜를 이동한다", () => {
  		expect(shiftKstDate("2026-08-01", -1)).toBe("2026-07-31");
  		expect(shiftKstDate("2026-01-01", -1)).toBe("2025-12-31");
  		expect(shiftKstDate("2026-02-28", 1)).toBe("2026-03-01");
  		expect(shiftKstDate("2026-08-06", 0)).toBe("2026-08-06");
  	});
  });

  describe("bambi attendance 연속 출석일", () => {
  	it("오늘로 끝나는 연속 구간을 센다", () => {
  		expect(
  			countAttendanceStreak(
  				["2026-08-06", "2026-08-05", "2026-08-04"],
  				"2026-08-06"
  			)
  		).toBe(3);
  	});

  	it("오늘 출석 전에도 어제까지의 연속은 살아 있다", () => {
  		expect(
  			countAttendanceStreak(["2026-08-05", "2026-08-04"], "2026-08-06")
  		).toBe(2);
  	});

  	it("마지막 출석이 그저께 이전이면 0이다", () => {
  		expect(countAttendanceStreak(["2026-08-03"], "2026-08-06")).toBe(0);
  	});

  	it("첫 구멍에서 멈춘다", () => {
  		expect(
  			countAttendanceStreak(
  				["2026-08-06", "2026-08-05", "2026-08-03"],
  				"2026-08-06"
  			)
  		).toBe(2);
  	});

  	it("기록이 없으면 0이다", () => {
  		expect(countAttendanceStreak([], "2026-08-06")).toBe(0);
  	});
  });
  ```

- [ ] **Step 2: 실패 확인**

  워크트리 안에서 실행한다.

  ```
  pnpm --filter @bambi-app/api exec vitest run src/services/bambi-attendance.test.ts
  ```

  기대 출력: `Failed to load url ./bambi-attendance` 또는 `Cannot find module` 계열 에러로 파일 전체가 실패한다(구현이 아직 없다).

- [ ] **Step 3: 최소 구현**

  `packages/api/src/services/bambi-attendance.ts`를 아래 내용 그대로 만든다.

  ```ts
  // 출석체크의 날짜 계산. 출석 단위는 "서울에서의 하루"라 서버 로캘·UTC 자정과 무관하게
  // KST 달력일로만 판정한다(클라이언트 시계는 신뢰하지 않는다 — 스펙 §5.1).
  // 달력 라이브러리를 붙이지 않고 Intl + UTC 산술만 쓴다(의존성 추가 금지 규칙).

  // en-CA 로캘은 YYYY-MM-DD를 그대로 내주므로 조립 없이 date 컬럼 값으로 쓸 수 있다.
  const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  	day: "2-digit",
  	month: "2-digit",
  	timeZone: "Asia/Seoul",
  	year: "numeric",
  });

  export const getKstDateString = (now: Date = new Date()): string =>
  	KST_DATE_FORMAT.format(now);

  // YYYY-MM-DD를 UTC 자정으로 해석해 일수만 더한다. 시각이 없는 달력 산술이라
  // 로컬 타임존·서머타임이 끼어들 여지가 없다.
  export const shiftKstDate = (isoDate: string, days: number): string => {
  	const shifted = new Date(`${isoDate}T00:00:00.000Z`);
  	shifted.setUTCDate(shifted.getUTCDate() + days);
  	return shifted.toISOString().slice(0, 10);
  };

  /**
   * 연속 출석일. 내림차순(최신 우선) 출석일 배열을 앞에서부터 하루씩 이어 세고 첫 구멍에서 멈춘다.
   * 기준일(today) 당일 또는 **전날**에서 시작하는 연속만 살아 있는 것으로 본다 — 오늘 출석을
   * 누르기 전에도 "연속 N일"이 보여야 버튼을 누를 이유가 생기고, 자정 직후 0으로 리셋돼
   * 보이는 착시를 막는다.
   */
  export const countAttendanceStreak = (
  	attendedDatesDesc: readonly string[],
  	today: string
  ): number => {
  	const latest = attendedDatesDesc[0];

  	if (!latest || (latest !== today && latest !== shiftKstDate(today, -1))) {
  		return 0;
  	}

  	let streak = 1;
  	let expected = shiftKstDate(latest, -1);

  	for (const attendedOn of attendedDatesDesc.slice(1)) {
  		if (attendedOn !== expected) {
  			break;
  		}
  		streak += 1;
  		expected = shiftKstDate(attendedOn, -1);
  	}

  	return streak;
  };
  ```

- [ ] **Step 4: 통과 확인**

  ```
  pnpm --filter @bambi-app/api exec vitest run src/services/bambi-attendance.test.ts
  pnpm --filter @bambi-app/api check-types
  pnpm dlx ultracite fix packages/api/src/services/bambi-attendance.ts packages/api/src/services/bambi-attendance.test.ts
  ```

  기대 출력: vitest `Test Files 1 passed`, `Tests 7 passed`. check-types 무출력 종료. ultracite `Checked 2 files` + 오류 0.

- [ ] **Step 5: 커밋(컨트롤러 수행)**

  ```
  feat: 출석체크 KST 날짜·연속일 순수 모듈 추가
  - packages/api/src/services/bambi-attendance.ts 신설 — Intl en-CA(Asia/Seoul)로 "오늘"을 만드는 getKstDateString, UTC 자정 산술만 쓰는 shiftKstDate, 내림차순 출석일 배열에서 첫 구멍까지 세는 countAttendanceStreak 3종
  - 연속일은 당일뿐 아니라 전날에서 시작하는 구간도 살아 있는 것으로 판정 — 오늘 출석 전에 0으로 보이면 버튼을 누를 이유가 사라진다
  - 달력 라이브러리 없이 Intl + UTC 산술만 사용(의존성 추가 금지 규칙)
  - vitest 7건 통과, @bambi-app/api check-types·ultracite 통과
  ```

---

## Task 2: `bambi_attendance` 스키마 + 마이그레이션 생성

**Files:**

- Modify: `packages/db/src/schema/bambi.ts` (pg-core import 목록에 `date`·`primaryKey` 추가, `bambiNotification` 테이블 정의 **바로 뒤**에 새 테이블 추가)
- Create: `packages/db/src/migrations/00NN_*.sql` (drizzle generate 산출물 — 번호·이름은 실행 시점에 결정된다)
- Modify: `packages/db/src/migrations/meta/*` (generate가 자동 갱신)

**Interfaces (Produces):**

```ts
// @bambi-app/db/schema/bambi
export const bambiAttendance: PgTable; // { userId: string; attendedOn: string; createdAt: Date }
// PK: (user_id, attended_on) / index: bambi_attendance_attended_on_idx
```

**Consumes:** `user`(auth 스키마, 이미 import돼 있음).

> 스키마 자체에는 순수 단위 테스트가 없다(리포에 스키마 테스트 관례가 없고, 만들면 drizzle 정의를 두 번 쓰는 중복이 된다). 이 태스크의 검증은 `check-types` + **generate가 뽑아낸 SQL 원문 확인**이고, 실제 동작 검증은 Task 3의 DB 의존 라우터 테스트가 담당한다(작성만, 실행 보류).

- [ ] **Step 1: pg-core import 확장**

  `packages/db/src/schema/bambi.ts` 상단 import를 아래처럼 만든다(기존 목록에 `date`, `primaryKey` 두 개만 알파벳 순서 자리에 끼워 넣는다).

  ```ts
  import {
  	type AnyPgColumn,
  	boolean,
  	check,
  	date,
  	index,
  	integer,
  	jsonb,
  	pgEnum,
  	pgTable,
  	primaryKey,
  	text,
  	timestamp,
  	uniqueIndex,
  	uuid,
  	varchar,
  } from "drizzle-orm/pg-core";
  ```

- [ ] **Step 2: 테이블 정의 추가**

  `bambiNotification` 테이블 정의가 끝나는 `);` 바로 다음 줄에 빈 줄 하나를 두고 아래를 넣는다(그 아래 `communityPost` 정의 앞).

  ```ts
  // 출석체크. 보상이 없어 (누가, 며칠) 두 축이면 충분하다 — 복합 PK가 "하루 1회"를 DB에서
  // 보장하므로 애플리케이션은 조건 분기 없이 onConflictDoNothing으로 멱등만 지키면 된다.
  // attended_on은 KST 달력일이다(서버가 services/bambi-attendance의 getKstDateString으로
  // 계산해 넣는다 — 클라이언트 시계 불신). 보상 도입 시 컬럼 추가로 확장한다.
  export const bambiAttendance = pgTable(
  	"bambi_attendance",
  	{
  		userId: text("user_id")
  			.notNull()
  			.references(() => user.id, { onDelete: "cascade" }),
  		attendedOn: date("attended_on").notNull(),
  		createdAt: timestamp("created_at").defaultNow().notNull(),
  	},
  	(table) => [
  		primaryKey({ columns: [table.userId, table.attendedOn] }),
  		// 운영자 목록의 "오늘 출석자 수" 요약이 날짜 한 값으로 전 계정을 훑는다.
  		index("bambi_attendance_attended_on_idx").on(table.attendedOn),
  	]
  );
  ```

- [ ] **Step 3: 마이그레이션 생성**

  ```
  pnpm --filter @bambi-app/db db:generate
  ```

  기대 출력: `1 tables` / `Your SQL migration file ➜ src/migrations/00NN_xxx.sql 🚀`.

  > **주의:** 이 브랜치에서는 알림 플랜도 `schema/bambi.ts`를 수정한다. 두 플랜의 실행 순서에 따라 번호가 `0070`이 아닐 수 있다 — generate를 **실행 시점에 순차로** 돌리고 생성된 파일명을 그대로 쓴다. 이미 다른 미적용 마이그레이션이 있어도 손대지 않는다.

- [ ] **Step 4: 생성된 SQL 확인**

  생성 파일을 열어 아래 3가지가 있는지 눈으로 확인한다(없으면 Step 2를 잘못 넣은 것이다).

  - `CREATE TABLE "bambi_attendance" (... "attended_on" date NOT NULL ...)`
  - `CONSTRAINT "bambi_attendance_user_id_attended_on_pk" PRIMARY KEY("user_id","attended_on")`
  - `ON DELETE cascade` FK + `CREATE INDEX "bambi_attendance_attended_on_idx"`

  그리고 **이 마이그레이션에 출석 외 다른 변경이 섞여 있지 않은지** 확인한다(섞였으면 알림 플랜 변경분이 함께 잡힌 것이므로 컨트롤러에 보고한다).

- [ ] **Step 5: 검증**

  ```
  pnpm --filter @bambi-app/db check-types
  pnpm dlx ultracite fix packages/db/src/schema/bambi.ts
  ```

  기대 출력: 둘 다 오류 0.

  **`db:migrate`는 실행하지 않는다** — 적용은 사용자 명시 지시 후다.

- [ ] **Step 6: 커밋(컨트롤러 수행)**

  ```
  feat: bambi_attendance 테이블 추가(마이그레이션 생성까지)
  - (user_id, attended_on) 복합 PK로 "하루 1회"를 DB 제약이 보장 — 라우터는 onConflictDoNothing 멱등만 담당하고 조회-후-삽입 경합이 원천 차단됨
  - attended_on은 KST 달력일(date), user FK는 cascade, 운영자 요약의 "오늘 출석자 수"용 attended_on 인덱스 동반
  - 보상 없는 기록형이라 컬럼은 두 축 + created_at만 — 보상 도입 시 컬럼 추가로 확장
  - drizzle generate로 마이그레이션 파일만 생성, db:push·db:migrate 미실행(적용은 사용자 지시 대기)
  ```

---

## Task 3: `attendance` 라우터 — `checkIn` / `getMine`

**Files:**

- Create: `packages/api/src/routers/bambi/attendance.ts`
- Create: `packages/api/src/routers/bambi/attendance.test.ts` (**작성만, 실행 보류**)
- Modify: `packages/api/src/routers/bambi/index.ts`

**Interfaces (Consumes):**

- `getKstDateString`, `countAttendanceStreak` (Task 1)
- `bambiAttendance` (Task 2)
- 기존: `protectedProcedure` (`packages/api/src/index.ts`), `requireActiveBambiProfile`·`SessionLike` (`packages/api/src/services/bambi-authz.ts`)

**Interfaces (Produces):**

```ts
// orpc.bambi.attendance.*
checkIn(): Promise<{ alreadyAttended: boolean; attendedOn: string }>;
// alreadyAttended=true면 이번 클릭이 새 기록이 아니었다는 뜻이다. 성공 응답 자체가
// "오늘 출석 상태"를 의미한다(스펙 §5.2의 "응답에 오늘 출석 여부 반영").

getMine(input: { month?: string }): Promise<{
  attendedDates: string[];   // 해당 월(YYYY-MM)의 출석일, 내림차순 "YYYY-MM-DD"
  checkedInToday: boolean;
  month: string;             // 실제 조회한 달 "YYYY-MM"
  streakDays: number;
  today: string;             // 서버 KST 오늘 "YYYY-MM-DD"
  totalDays: number;
}>;
```

- [ ] **Step 1: 라우터 구현**

  `packages/api/src/routers/bambi/attendance.ts`를 아래 내용 그대로 만든다.

  ```ts
  import { db } from "@bambi-app/db";
  import { bambiAttendance } from "@bambi-app/db/schema/bambi";
  import { ORPCError } from "@orpc/server";
  import { desc, eq } from "drizzle-orm";
  import z from "zod";

  import { protectedProcedure } from "../../index";
  import {
  	countAttendanceStreak,
  	getKstDateString,
  } from "../../services/bambi-attendance";
  import {
  	type BambiAccessProfile,
  	requireActiveBambiProfile,
  	type SessionLike,
  } from "../../services/bambi-authz";

  // 출석 대상 역할. 운영자·법률자문·게스트는 출석 대상이 아니다. 허용 목록으로 고정해
  // bambi_user_role에 값이 하나 늘어도 기본 판정이 "거부"가 되게 한다(bambi-authz 관례).
  const ATTENDANCE_ROLES = new Set<string>(["job_seeker", "employer"]);

  const getMineInput = z.object({
  	// YYYY-MM. 생략하면 서버 KST 기준 이번 달.
  	month: z
  		.string()
  		.regex(/^\d{4}-\d{2}$/)
  		.optional(),
  });

  const requireAttendanceProfile = async (
  	session: SessionLike | null | undefined
  ): Promise<BambiAccessProfile> => {
  	const profile = await requireActiveBambiProfile(session);

  	if (!ATTENDANCE_ROLES.has(profile.role)) {
  		throw new ORPCError("FORBIDDEN", {
  			message: "출석체크는 구직자·업소 회원만 이용할 수 있어요.",
  		});
  	}

  	return profile;
  };

  export const attendanceRouter = {
  	checkIn: protectedProcedure.handler(async ({ context }) => {
  		const profile = await requireAttendanceProfile(context.session);
  		const attendedOn = getKstDateString();

  		// 복합 PK가 하루 1회를 보장하므로 중복 클릭·동시 클릭은 충돌을 무시하고 성공으로 끝낸다.
  		// 삽입된 행이 없으면 이미 출석한 날이다(조회 후 삽입하면 그 사이 경합에서 500이 난다).
  		const inserted = await db
  			.insert(bambiAttendance)
  			.values({ attendedOn, userId: profile.userId })
  			.onConflictDoNothing()
  			.returning({ attendedOn: bambiAttendance.attendedOn });

  		return {
  			alreadyAttended: inserted.length === 0,
  			attendedOn,
  		};
  	}),

  	getMine: protectedProcedure
  		.input(getMineInput)
  		.handler(async ({ context, input }) => {
  			const profile = await requireAttendanceProfile(context.session);
  			const today = getKstDateString();
  			const month = input.month ?? today.slice(0, 7);

  			// 출석은 하루 한 행이라 계정당 행 수가 가입 일수를 넘지 않는다. 총계·연속·월 달력이
  			// 전부 같은 목록에서 나오므로 쿼리를 셋으로 쪼개지 않고 한 번에 읽는다.
  			const rows = await db
  				.select({ attendedOn: bambiAttendance.attendedOn })
  				.from(bambiAttendance)
  				.where(eq(bambiAttendance.userId, profile.userId))
  				.orderBy(desc(bambiAttendance.attendedOn));
  			const attendedDatesDesc = rows.map((row) => row.attendedOn);

  			return {
  				attendedDates: attendedDatesDesc.filter((attendedOn) =>
  					attendedOn.startsWith(month)
  				),
  				checkedInToday: attendedDatesDesc[0] === today,
  				month,
  				streakDays: countAttendanceStreak(attendedDatesDesc, today),
  				today,
  				totalDays: attendedDatesDesc.length,
  			};
  		}),
  };
  ```

- [ ] **Step 2: 라우터 등록**

  `packages/api/src/routers/bambi/index.ts`에 import와 엔트리를 알파벳 순서 자리에 추가한다.

  ```ts
  import { analyticsRouter } from "./analytics";
  import { attendanceRouter } from "./attendance";
  import { bannedWordsRouter } from "./banned-words";
  ```

  ```ts
  	analytics: analyticsRouter,
  	attendance: attendanceRouter,
  	bannedWords: bannedWordsRouter,
  ```

- [ ] **Step 3: DB 의존 라우터 테스트 작성(실행하지 않는다)**

  `packages/api/src/routers/bambi/attendance.test.ts`를 아래 내용 그대로 만든다. 기존 `reviews.test.ts`의 동적 import + `createProcedureClient` 관례를 그대로 따른다.

  ```ts
  import { randomUUID } from "node:crypto";

  import { createProcedureClient } from "@orpc/server";
  import dotenv from "dotenv";
  import { eq, inArray } from "drizzle-orm";
  import { describe, expect, it } from "vitest";

  import type { Context } from "../../context";

  dotenv.config({
  	path: "../../apps/server/.env",
  });

  const [{ db }, authSchema, bambiSchema, { attendanceRouter }, attendanceService] =
  	await Promise.all([
  		import("@bambi-app/db"),
  		import("@bambi-app/db/schema/auth"),
  		import("@bambi-app/db/schema/bambi"),
  		import("./attendance"),
  		import("../../services/bambi-attendance"),
  	]);

  const { user } = authSchema;
  const { bambiAttendance, bambiProfile } = bambiSchema;

  const createContextForUser = (userId: string): Context =>
  	({
  		auth: null,
  		session: { user: { id: userId } },
  	}) as Context;

  const createUser = async (role: "admin" | "employer" | "job_seeker") => {
  	const userId = `user_test_attendance_${randomUUID()}`;
  	await db.insert(user).values({
  		email: `attendance-${randomUUID()}@bambi.test`,
  		id: userId,
  		name: "출석 테스트 계정",
  	});
  	await db
  		.insert(bambiProfile)
  		.values({ isPhoneVerified: true, role, status: "active", userId });
  	return userId;
  };

  const cleanup = async (userIds: string[]) => {
  	await db
  		.delete(bambiAttendance)
  		.where(inArray(bambiAttendance.userId, userIds));
  	await db.delete(bambiProfile).where(inArray(bambiProfile.userId, userIds));
  	await db.delete(user).where(inArray(user.id, userIds));
  };

  describe("bambi attendance router", () => {
  	it("두 번 눌러도 행이 하나만 남고 두 번째는 alreadyAttended다", async () => {
  		const userId = await createUser("job_seeker");
  		const checkIn = createProcedureClient(attendanceRouter.checkIn, {
  			context: createContextForUser(userId),
  		});

  		try {
  			const first = await checkIn({});
  			const second = await checkIn({});

  			expect(first.alreadyAttended).toBe(false);
  			expect(second.alreadyAttended).toBe(true);
  			expect(second.attendedOn).toBe(attendanceService.getKstDateString());

  			const rows = await db
  				.select({ attendedOn: bambiAttendance.attendedOn })
  				.from(bambiAttendance)
  				.where(eq(bambiAttendance.userId, userId));
  			expect(rows).toHaveLength(1);
  		} finally {
  			await cleanup([userId]);
  		}
  	});

  	it("업소 회원도 출석할 수 있고 운영자는 거부된다", async () => {
  		const employerUserId = await createUser("employer");
  		const adminUserId = await createUser("admin");

  		try {
  			await expect(
  				createProcedureClient(attendanceRouter.checkIn, {
  					context: createContextForUser(employerUserId),
  				})({})
  			).resolves.toMatchObject({ alreadyAttended: false });

  			await expect(
  				createProcedureClient(attendanceRouter.checkIn, {
  					context: createContextForUser(adminUserId),
  				})({})
  			).rejects.toThrow();
  		} finally {
  			await cleanup([employerUserId, adminUserId]);
  		}
  	});

  	it("getMine이 해당 월 출석일·연속·총계를 함께 돌려준다", async () => {
  		const userId = await createUser("job_seeker");
  		const today = attendanceService.getKstDateString();
  		const yesterday = attendanceService.shiftKstDate(today, -1);
  		// 연속이 끊긴 과거 기록 하나 — 총계에는 들어가고 연속에는 안 들어가야 한다.
  		const longAgo = attendanceService.shiftKstDate(today, -30);

  		try {
  			await db.insert(bambiAttendance).values([
  				{ attendedOn: today, userId },
  				{ attendedOn: yesterday, userId },
  				{ attendedOn: longAgo, userId },
  			]);

  			const result = await createProcedureClient(attendanceRouter.getMine, {
  				context: createContextForUser(userId),
  			})({});

  			expect(result.today).toBe(today);
  			expect(result.month).toBe(today.slice(0, 7));
  			expect(result.checkedInToday).toBe(true);
  			expect(result.streakDays).toBe(2);
  			expect(result.totalDays).toBe(3);
  			expect(result.attendedDates).toContain(today);
  			// 다른 달 기록은 이번 달 배열에 섞이지 않는다.
  			for (const attendedOn of result.attendedDates) {
  				expect(attendedOn.startsWith(result.month)).toBe(true);
  			}
  		} finally {
  			await cleanup([userId]);
  		}
  	});
  });
  ```

  **이 파일을 실행하지 않는다.** `packages/api/src/routers/bambi` 스위트는 dev DB를 파괴한다(Global Constraints). 커밋 메시지에 "작성만, 실행 보류"를 남긴다.

- [ ] **Step 4: 검증**

  ```
  pnpm --filter @bambi-app/api check-types
  pnpm dlx ultracite fix packages/api/src/routers/bambi/attendance.ts packages/api/src/routers/bambi/attendance.test.ts packages/api/src/routers/bambi/index.ts
  pnpm --filter server check-types
  ```

  기대 출력: 셋 다 오류 0. (`server`는 api 라우터를 그대로 마운트하므로 타입이 여기서 함께 깨진다.)

  > 실패 시 확인 포인트: `date()` 컬럼은 drizzle 기본 `mode: "string"`이라 `attendedOn`이 `string`이어야 한다. `Date`로 잡히면 Task 2의 컬럼 정의를 다시 본다.

- [ ] **Step 5: 커밋(컨트롤러 수행)**

  ```
  feat: 출석 라우터 checkIn·getMine 추가
  - routers/bambi/attendance.ts 신설 — checkIn은 KST 오늘 행을 onConflictDoNothing으로 넣고 삽입 행 유무로 alreadyAttended를 판정(조회-후-삽입 경합 없음), getMine은 본인 출석일 1회 조회에서 월 배열·연속·총계·오늘 여부를 전부 파생
  - 역할 게이트는 job_seeker·employer 허용 목록 — 운영자·법률자문·게스트는 FORBIDDEN(역할 enum이 늘어도 기본이 거부)
  - month 입력은 YYYY-MM 정규식, 생략 시 서버 KST 기준 이번 달 — 클라이언트가 "이번 달"을 계산하지 않게 응답에 today·month를 함께 실음
  - routers/bambi/index.ts에 attendance 등록
  - DB 의존 라우터 테스트 attendance.test.ts는 작성만 하고 실행 보류(routers/bambi 스위트가 dev DB를 파괴)
  - @bambi-app/api·server check-types, ultracite 통과
  ```

---

## Task 4: `attendance.adminList` — 운영자 집계 조회

**Files:**

- Modify: `packages/api/src/routers/bambi/attendance.ts`
- Modify: `packages/api/src/routers/bambi/attendance.test.ts` (**작성만, 실행 보류**)

**Interfaces (Consumes):** Task 3의 `attendanceRouter`, Task 1의 `getKstDateString`, 기존 `adminProcedure`(`packages/api/src/index.ts`).

**Interfaces (Produces):**

```ts
orpc.bambi.attendance.adminList(input: {
  cursor?: number;                                     // 오프셋 커서, 기본 0
  limit?: number;                                      // 1~100, 기본 20
  role?: "employer" | "job_seeker";
  search?: string;                                     // 닉네임(user.name) / 아이디(login_id)
  sort?: "idle" | "month" | "recent" | "total";        // 기본 "recent"
}): Promise<{
  items: {
    attendedToday: boolean;
    displayName: string;
    idleDays: number | null;      // 마지막 출석 이후 경과일, 무기록이면 null
    lastAttendedOn: string | null;
    loginId: string | null;
    monthDays: number;
    role: "admin" | "employer" | "guest" | "job_seeker" | "legal_advisor";
    totalDays: number;
    userId: string;
  }[];
  nextCursor: number | null;
  summary: { attendedToday: number; eligibleUsers: number };
}>;
```

- [ ] **Step 1: import 확장**

  `packages/api/src/routers/bambi/attendance.ts`의 import 3줄을 아래로 교체한다.

  ```ts
  import { db } from "@bambi-app/db";
  import { user } from "@bambi-app/db/schema/auth";
  import { bambiAttendance, bambiProfile } from "@bambi-app/db/schema/bambi";
  import { ORPCError } from "@orpc/server";
  import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
  import z from "zod";

  import { adminProcedure, protectedProcedure } from "../../index";
  ```

- [ ] **Step 2: 입력 스키마 추가**

  `getMineInput` 정의 바로 아래에 넣는다.

  ```ts
  const adminListInput = z.object({
  	// 오프셋 커서. 정렬 축이 전부 집계 파생값이라 keyset 커서는 컬럼별 tie-break를 네 벌
  	// 만들어야 한다 — 운영자 전용 화면이고 대상 계정도 수천 단위라 오프셋으로 끊는다.
  	// ponytail: 오프셋 페이지네이션, 대상 계정이 수만 단위가 되면 keyset으로 교체.
  	cursor: z.number().int().min(0).default(0),
  	limit: z.number().int().min(1).max(100).default(20),
  	role: z.enum(["job_seeker", "employer"]).optional(),
  	search: z.string().trim().max(100).optional(),
  	// recent=마지막 출석 최신순, idle=오래 안 온 순, total=총 출석일, month=이번 달 출석일
  	sort: z.enum(["recent", "idle", "total", "month"]).default("recent"),
  });
  ```

- [ ] **Step 3: `adminList` 핸들러 추가**

  `attendanceRouter` 객체 안, `checkIn` **앞**(알파벳 순서)에 넣는다.

  ```ts
  	adminList: adminProcedure.input(adminListInput).handler(async ({ input }) => {
  		const today = getKstDateString();
  		const monthStart = `${today.slice(0, 7)}-01`;

  		// 집계는 전부 상관 서브쿼리로 뽑는다 — 조인으로 붙이면 출석일 수만큼 user row가
  		// 뻥튀기돼 검색·정렬·페이지네이션이 전부 어긋난다(moderation.listUsers와 같은 이유).
  		const totalDaysSql = sql<number>`(
  			select count(*)::int from ${bambiAttendance}
  			where ${bambiAttendance.userId} = ${user.id}
  		)`;
  		// 출석일은 미래가 될 수 없으므로(서버가 오늘만 기록) 상한 없이 월초 이후만 세면 된다.
  		const monthDaysSql = sql<number>`(
  			select count(*)::int from ${bambiAttendance}
  			where ${bambiAttendance.userId} = ${user.id}
  				and ${bambiAttendance.attendedOn} >= ${monthStart}::date
  		)`;
  		const lastAttendedOnSql = sql<null | string>`(
  			select max(${bambiAttendance.attendedOn})::text from ${bambiAttendance}
  			where ${bambiAttendance.userId} = ${user.id}
  		)`;
  		// 미출석 경과일. 한 번도 출석하지 않은 계정은 null이라 "0일"과 구분된다.
  		const idleDaysSql = sql<null | number>`(
  			select (${today}::date - max(${bambiAttendance.attendedOn}))::int
  			from ${bambiAttendance}
  			where ${bambiAttendance.userId} = ${user.id}
  		)`;
  		const attendedTodaySql = sql<boolean>`exists (
  			select 1 from ${bambiAttendance}
  			where ${bambiAttendance.userId} = ${user.id}
  				and ${bambiAttendance.attendedOn} = ${today}::date
  		)`;

  		const keyword = input.search?.trim();
  		const where = and(
  			// 탈퇴 계정은 출석 대상이 아니다(파기 배치 전까지 목록에 남아 카운트를 흐린다).
  			isNull(user.deletedAt),
  			input.role
  				? eq(bambiProfile.role, input.role)
  				: inArray(bambiProfile.role, ["job_seeker", "employer"]),
  			keyword
  				? or(
  						ilike(user.name, `%${keyword}%`),
  						ilike(user.login_id, `%${keyword}%`)
  					)
  				: undefined
  		);

  		// 정렬 축이 전부 파생값이라 컬럼 참조가 아닌 SQL 조각으로 ORDER BY를 만든다.
  		// 무기록 계정은 recent에서 맨 뒤로, idle(오래 안 온 순)에서는 맨 앞으로 보낸다.
  		const orderByClause = {
  			idle: sql`${lastAttendedOnSql} asc nulls first`,
  			month: sql`${monthDaysSql} desc`,
  			recent: sql`${lastAttendedOnSql} desc nulls last`,
  			total: sql`${totalDaysSql} desc`,
  		}[input.sort];

  		const rows = await db
  			.select({
  				attendedToday: attendedTodaySql,
  				displayName: user.name,
  				idleDays: idleDaysSql,
  				lastAttendedOn: lastAttendedOnSql,
  				loginId: user.login_id,
  				monthDays: monthDaysSql,
  				role: bambiProfile.role,
  				totalDays: totalDaysSql,
  				userId: user.id,
  			})
  			.from(user)
  			// 출석 대상은 프로필 역할로 정해지므로 프로필이 없는(온보딩 전) 계정은 제외한다.
  			.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
  			.where(where)
  			// 동률에서 페이지 경계가 흔들리지 않도록 항상 id로 갈라 준다.
  			.orderBy(orderByClause, asc(user.id))
  			.limit(input.limit + 1)
  			.offset(input.cursor);

  		// 요약은 현재 필터(검색·역할)를 그대로 따른다 — 화면에 보이는 모집단과 숫자가 어긋나면
  		// 운영자가 "오늘 3명"을 전체 수치로 오독한다.
  		const [summary] = await db
  			.select({
  				attendedToday: sql<number>`(count(*) filter (where ${attendedTodaySql}))::int`,
  				eligibleUsers: sql<number>`count(*)::int`,
  			})
  			.from(user)
  			.innerJoin(bambiProfile, eq(bambiProfile.userId, user.id))
  			.where(where);

  		const hasMore = rows.length > input.limit;

  		return {
  			items: rows.slice(0, input.limit),
  			nextCursor: hasMore ? input.cursor + input.limit : null,
  			summary: summary ?? { attendedToday: 0, eligibleUsers: 0 },
  		};
  	}),
  ```

- [ ] **Step 4: 라우터 테스트에 adminList 케이스 추가(실행하지 않는다)**

  `packages/api/src/routers/bambi/attendance.test.ts`의 `describe` 블록 마지막에 추가한다.

  ```ts
  	it("adminList가 집계·검색·요약을 함께 돌려준다", async () => {
  		const seekerUserId = await createUser("job_seeker");
  		const adminUserId = await createUser("admin");
  		const today = attendanceService.getKstDateString();

  		try {
  			await db.insert(bambiAttendance).values([
  				{ attendedOn: today, userId: seekerUserId },
  				{
  					attendedOn: attendanceService.shiftKstDate(today, -1),
  					userId: seekerUserId,
  				},
  			]);

  			const result = await createProcedureClient(attendanceRouter.adminList, {
  				context: createContextForUser(adminUserId),
  			})({ search: "출석 테스트 계정" });

  			const row = result.items.find((item) => item.userId === seekerUserId);
  			expect(row?.totalDays).toBe(2);
  			expect(row?.attendedToday).toBe(true);
  			expect(row?.lastAttendedOn).toBe(today);
  			expect(row?.idleDays).toBe(0);
  			// 운영자 계정은 출석 대상이 아니라 목록에 없다.
  			expect(
  				result.items.some((item) => item.userId === adminUserId)
  			).toBe(false);
  			expect(result.summary.attendedToday).toBeGreaterThanOrEqual(1);
  		} finally {
  			await cleanup([seekerUserId, adminUserId]);
  		}
  	});

  	it("adminList는 운영자만 부를 수 있다", async () => {
  		const seekerUserId = await createUser("job_seeker");

  		try {
  			await expect(
  				createProcedureClient(attendanceRouter.adminList, {
  					context: createContextForUser(seekerUserId),
  				})({})
  			).rejects.toThrow();
  		} finally {
  			await cleanup([seekerUserId]);
  		}
  	});
  ```

  **실행하지 않는다**(Global Constraints).

- [ ] **Step 5: 검증**

  ```
  pnpm --filter @bambi-app/api check-types
  pnpm --filter server check-types
  pnpm dlx ultracite fix packages/api/src/routers/bambi/attendance.ts packages/api/src/routers/bambi/attendance.test.ts
  ```

  기대 출력: 셋 다 오류 0.

- [ ] **Step 6: 커밋(컨트롤러 수행)**

  ```
  feat: 운영자 출석 집계 조회 adminList 추가
  - 총 출석일·이번 달 출석일·마지막 출석일·미출석 경과일·오늘 출석 여부를 상관 서브쿼리로 산출(조인 시 출석일 수만큼 user row가 뻥튀기돼 검색·정렬·페이지네이션이 어긋남)
  - 닉네임(user.name)·아이디(login_id) ilike 검색, 역할 필터(미지정 시 job_seeker·employer), 정렬 4종(recent·idle·total·month), 탈퇴 계정 제외
  - 페이지네이션은 오프셋 커서 — 정렬 축이 전부 집계 파생값이라 keyset은 tie-break를 네 벌 만들어야 해 운영자 화면 규모에 과함(ponytail 주석으로 교체 조건 명시)
  - 요약 카운트(오늘 출석자 수·대상 사용자 수)는 목록과 동일한 where를 써 화면 모집단과 숫자가 어긋나지 않게 함
  - adminProcedure 미들웨어 게이트, 라우터 테스트 2건 추가(작성만, 실행 보류)
  ```

---

## Task 5: 월 달력 그리드 순수 모듈 + 공통 출석 화면 + 2개 라우트·진입점

**Files:**

- Create: `apps/web/src/lib/bambi/attendance-calendar.test.ts`
- Create: `apps/web/src/lib/bambi/attendance-calendar.ts`
- Create: `apps/web/src/components/bambi/attendance-panel.tsx`
- Create: `apps/web/src/app/seeker/attendance/page.tsx`
- Create: `apps/web/src/app/employer/attendance/page.tsx`
- Modify: `apps/web/src/components/bambi/my-page-shell.tsx` (사이드바 메뉴)
- Modify: `apps/web/src/components/bambi/screens/seeker.tsx` (내 정보 허브 카드)
- Modify: `apps/web/src/app/employer/layout.tsx` (상단 내비)
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (모바일 하단 탭 유지 경로)

**Interfaces (Consumes):** Task 3의 `orpc.bambi.attendance.getMine` / `checkIn`.

**Interfaces (Produces):**

```ts
// apps/web/src/lib/bambi/attendance-calendar.ts
export interface MonthCell { date: null | string; key: string; }
export const shiftMonth: (month: string, delta: number) => string;   // "YYYY-MM"
export const buildMonthGrid: (month: string) => MonthCell[];          // 일요일 시작, 선행 공백 포함

// apps/web/src/components/bambi/attendance-panel.tsx
export function AttendancePanel(): React.JSX.Element;
```

- [ ] **Step 1: 실패하는 달력 테스트 작성**

  `apps/web/src/lib/bambi/attendance-calendar.test.ts`:

  ```ts
  import { describe, expect, it } from "vitest";

  import { buildMonthGrid, shiftMonth } from "./attendance-calendar";

  describe("attendance calendar", () => {
  	it("연 경계를 넘겨 달을 이동한다", () => {
  		expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  		expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  		expect(shiftMonth("2026-08", 0)).toBe("2026-08");
  	});

  	it("일요일 시작 그리드에 선행 공백 칸을 넣는다", () => {
  		// 2026-08-01은 토요일이라 앞에 빈 칸 6개가 붙는다(31일 + 6 = 37칸).
  		const cells = buildMonthGrid("2026-08");

  		expect(cells).toHaveLength(37);
  		expect(cells.slice(0, 6).every((cell) => cell.date === null)).toBe(true);
  		expect(cells[6]?.date).toBe("2026-08-01");
  		expect(cells.at(-1)?.date).toBe("2026-08-31");
  	});

  	it("1일이 일요일이면 선행 공백이 없다", () => {
  		// 2026-02-01은 일요일, 2026년은 윤년이 아니라 28일이다.
  		const cells = buildMonthGrid("2026-02");

  		expect(cells).toHaveLength(28);
  		expect(cells[0]?.date).toBe("2026-02-01");
  		expect(cells.at(-1)?.date).toBe("2026-02-28");
  	});

  	it("모든 칸의 key가 유일하다", () => {
  		const cells = buildMonthGrid("2026-08");

  		expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
  	});
  });
  ```

- [ ] **Step 2: 실패 확인**

  ```
  pnpm --filter web exec vitest run src/lib/bambi/attendance-calendar.test.ts
  ```

  기대 출력: 모듈 해석 실패로 파일 전체 실패.

- [ ] **Step 3: 달력 모듈 구현**

  `apps/web/src/lib/bambi/attendance-calendar.ts`:

  ```ts
  // 출석 월 달력 그리드. 달력 라이브러리를 붙이지 않고 Date의 UTC 산술만 쓴다
  // (의존성 추가 금지 규칙). 값은 전부 "YYYY-MM-DD" 문자열이라 서버가 내려주는
  // 출석일 배열과 파싱 없이 그대로 대조된다.

  export interface MonthCell {
  	// null이면 첫 주의 빈 칸이다.
  	date: null | string;
  	// 렌더 key. 빈 칸도 유일한 key를 갖게 여기서 만들어 준다 —
  	// JSX에서 map 인덱스를 key로 쓰지 않기 위한 것이다.
  	key: string;
  }

  // "YYYY-MM"을 숫자 두 개로. 구조분해 destructure는 noUncheckedIndexedAccess 때문에
  // undefined가 섞이므로 slice로 자른다.
  const parseMonth = (month: string): { month: number; year: number } => ({
  	month: Number(month.slice(5, 7)),
  	year: Number(month.slice(0, 4)),
  });

  export const shiftMonth = (month: string, delta: number): string => {
  	const parsed = parseMonth(month);
  	const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1));
  	return shifted.toISOString().slice(0, 7);
  };

  /**
   * 일요일 시작 그리드. 첫 주의 빈 칸만 채우고 마지막 주 뒤쪽은 비워 둔다
   * (grid가 남은 칸을 알아서 접으므로 더미를 만들 이유가 없다).
   */
  export const buildMonthGrid = (month: string): MonthCell[] => {
  	const parsed = parseMonth(month);
  	const firstDay = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
  	// 다음 달 0일 = 이번 달 마지막 날.
  	const dayCount = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
  	const cells: MonthCell[] = [];

  	for (let blank = 0; blank < firstDay.getUTCDay(); blank += 1) {
  		cells.push({ date: null, key: `${month}-blank-${blank}` });
  	}

  	for (let day = 1; day <= dayCount; day += 1) {
  		const date = `${month}-${String(day).padStart(2, "0")}`;
  		cells.push({ date, key: date });
  	}

  	return cells;
  };
  ```

- [ ] **Step 4: 통과 확인**

  ```
  pnpm --filter web exec vitest run src/lib/bambi/attendance-calendar.test.ts
  ```

  기대 출력: `Test Files 1 passed`, `Tests 4 passed`.

- [ ] **Step 5: 공통 출석 컴포넌트 작성**

  `apps/web/src/components/bambi/attendance-panel.tsx`:

  ```tsx
  "use client";

  // 밤비 — 출석체크 패널. /seeker/attendance·/employer/attendance 두 라우트가 그대로
  // 재사용한다(역할별 문구 차이가 없어 컴포넌트를 나누지 않는다). 보상 없는 기록형 기능이라
  // 화면 요소는 오늘 버튼 + 월 달력 + 연속/총 스탯 셋뿐이다.
  // 달력은 라이브러리 없이 Tailwind 7열 grid로 직접 그린다(의존성 추가 금지).

  import { Button } from "@bambi-app/ui/components/button";
  import {
  	Card,
  	CardContent,
  	CardHeader,
  	CardTitle,
  } from "@bambi-app/ui/components/card";
  import { Skeleton } from "@bambi-app/ui/components/skeleton";
  import { cn } from "@bambi-app/ui/lib/utils";
  import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
  import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
  import { useState } from "react";
  import { toast } from "sonner";
  import { EmptyState } from "@/components/bambi/empty-state";
  import { buildMonthGrid, shiftMonth } from "@/lib/bambi/attendance-calendar";
  import { orpc } from "@/utils/orpc";

  const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

  const monthLabel = (month: string): string =>
  	`${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;

  export function AttendancePanel() {
  	const queryClient = useQueryClient();
  	// null이면 서버가 정한 이번 달(KST)을 본다 — 클라이언트가 "이번 달"을 따로 계산하면
  	// 자정 전후 시계 차이로 서버와 다른 달을 요청하게 된다.
  	const [month, setMonth] = useState<null | string>(null);

  	const mineQuery = useQuery(
  		orpc.bambi.attendance.getMine.queryOptions({
  			input: month === null ? {} : { month },
  		})
  	);
  	const checkIn = useMutation(
  		orpc.bambi.attendance.checkIn.mutationOptions({
  			onError: (error) => toast.error(error.message || "출석하지 못했어요."),
  			onSuccess: async (result) => {
  				toast.success(
  					result.alreadyAttended
  						? "오늘은 이미 출석했어요."
  						: "출석했어요. 내일도 만나요."
  				);
  				// 달을 이동한 상태여도 모든 월 캐시를 함께 갱신한다.
  				await queryClient.invalidateQueries({
  					queryKey: orpc.bambi.attendance.getMine.key(),
  				});
  			},
  		})
  	);

  	if (mineQuery.isPending) {
  		return (
  			<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6 md:px-6">
  				<Skeleton className="h-32 w-full rounded-xl" />
  				<Skeleton className="h-80 w-full rounded-xl" />
  			</div>
  		);
  	}

  	if (mineQuery.isError || !mineQuery.data) {
  		return (
  			<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6 md:px-6">
  				<EmptyState
  					description="출석 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
  					title="불러오기 실패"
  				/>
  			</div>
  		);
  	}

  	const { attendedDates, checkedInToday, streakDays, today, totalDays } =
  		mineQuery.data;
  	const viewMonth = mineQuery.data.month;
  	const attended = new Set(attendedDates);

  	return (
  		<div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 py-6 md:px-6">
  			<div className="flex flex-col gap-1">
  				<h1 className="m-0 font-extrabold text-2xl">출석체크</h1>
  				<p className="m-0 text-muted-foreground text-sm">
  					하루에 한 번 출석 도장을 찍어요. 별도 보상은 없고 기록만 남아요.
  				</p>
  			</div>

  			<Card>
  				<CardHeader>
  					<CardTitle className="text-base">오늘 출석</CardTitle>
  				</CardHeader>
  				<CardContent className="flex flex-wrap items-center justify-between gap-4">
  					<dl className="m-0 flex gap-8">
  						<div className="flex flex-col gap-0.5">
  							<dt className="m-0 text-muted-foreground text-xs">연속 출석</dt>
  							<dd className="m-0 font-extrabold text-xl">{`${streakDays}일`}</dd>
  						</div>
  						<div className="flex flex-col gap-0.5">
  							<dt className="m-0 text-muted-foreground text-xs">총 출석</dt>
  							<dd className="m-0 font-extrabold text-xl">{`${totalDays}일`}</dd>
  						</div>
  					</dl>
  					<Button
  						disabled={checkedInToday || checkIn.isPending}
  						onClick={() => checkIn.mutate({})}
  						size="lg"
  					>
  						{checkedInToday ? "오늘 출석 완료" : "출석하기"}
  					</Button>
  				</CardContent>
  			</Card>

  			<Card>
  				<CardHeader className="flex flex-row items-center justify-between gap-2">
  					<CardTitle className="text-base">{monthLabel(viewMonth)}</CardTitle>
  					<div className="flex gap-1">
  						<Button
  							aria-label="이전 달"
  							onClick={() => setMonth(shiftMonth(viewMonth, -1))}
  							size="icon-sm"
  							variant="outline"
  						>
  							<ChevronLeftIcon />
  						</Button>
  						<Button
  							aria-label="다음 달"
  							onClick={() => setMonth(shiftMonth(viewMonth, 1))}
  							size="icon-sm"
  							variant="outline"
  						>
  							<ChevronRightIcon />
  						</Button>
  					</div>
  				</CardHeader>
  				<CardContent>
  					<div className="grid grid-cols-7 gap-1">
  						{WEEKDAY_LABELS.map((label) => (
  							<div
  								className="py-1 text-center font-bold text-muted-foreground text-xs"
  								key={label}
  							>
  								{label}
  							</div>
  						))}
  						{buildMonthGrid(viewMonth).map((cell) =>
  							cell.date === null ? (
  								<div key={cell.key} />
  							) : (
  								<div
  									className={cn(
  										"flex aspect-square items-center justify-center rounded-md border border-transparent text-sm",
  										attended.has(cell.date)
  											? "bg-primary/15 font-bold text-primary"
  											: "text-muted-foreground",
  										cell.date === today && "border-primary"
  									)}
  									key={cell.key}
  								>
  									{Number(cell.date.slice(8, 10))}
  								</div>
  							)
  						)}
  					</div>
  					<p className="mt-3 mb-0 text-muted-foreground text-xs">
  						색이 채워진 날이 출석한 날이에요. 테두리는 오늘이에요.
  					</p>
  				</CardContent>
  			</Card>
  		</div>
  	);
  }
  ```

  > primary 솔리드 버튼은 "출석하기" 하나뿐이다. 달력 칸은 `bg-primary/15`, 달 이동은 `outline` — primary 위계 규칙을 지킨다.

- [ ] **Step 6: 두 라우트 추가**

  `apps/web/src/app/seeker/attendance/page.tsx`:

  ```tsx
  import { AttendancePanel } from "@/components/bambi/attendance-panel";
  import { RequireAuth } from "@/components/bambi/require-auth";

  export default function SeekerAttendancePage() {
  	return (
  		<RequireAuth>
  			<AttendancePanel />
  		</RequireAuth>
  	);
  }
  ```

  `apps/web/src/app/employer/attendance/page.tsx`:

  ```tsx
  import { AttendancePanel } from "@/components/bambi/attendance-panel";
  import { RequireAuth } from "@/components/bambi/require-auth";

  export default function EmployerAttendancePage() {
  	return (
  		<RequireAuth>
  			<AttendancePanel />
  		</RequireAuth>
  	);
  }
  ```

- [ ] **Step 7: 구직자 진입점 2곳**

  `apps/web/src/components/bambi/my-page-shell.tsx`의 `NAV_ITEMS`에서 `계정 설정` 항목 **앞**에 추가한다(아이콘은 이미 import된 `ClockIcon`을 재사용해 import를 늘리지 않는다).

  ```ts
  	{
  		href: "/seeker/attendance" as Route,
  		icon: <ClockIcon />,
  		label: "출석체크",
  	},
  ```

  `apps/web/src/components/bambi/screens/seeker.tsx`의 `seekerMeSections`에서 `계정 설정` 항목 **앞**에 추가한다.

  ```ts
  	{
  		href: "/seeker/attendance" as Route,
  		icon: <ClockIcon />,
  		label: "출석체크",
  		description: "하루 한 번 출석하고 연속 기록을 확인해요.",
  	},
  ```

  > 이 메뉴는 구인자도 헤더 "내 정보"로 들어와 함께 본다(`/seeker/me` 공유 선례와 동일). 클릭 시 seeker 셸로 전환되지만 서버 역할 게이트가 job_seeker·employer를 모두 허용하므로 동작에 문제가 없다.

- [ ] **Step 8: 구인자 진입점 + 모바일 하단 탭 유지**

  `apps/web/src/app/employer/layout.tsx`의 `EMPLOYER_NAV_ITEMS`에서 `광고 안내` 다음에 추가한다.

  ```ts
  	{ href: "/employer/attendance" as Route, label: "출석체크" },
  ```

  `apps/web/src/components/bambi/persona-nav.tsx`의 `SeekerNav` `showNav` 조건에 한 줄 추가한다.

  ```ts
  	const showNav =
  		path === "/seeker" ||
  		path === "/seeker/attendance" ||
  		path === "/seeker/chats" ||
  		path === "/seeker/community" ||
  		path === "/seeker/me" ||
  		path.startsWith("/seeker/me/");
  ```

  같은 파일 `EmployerNav`의 `showNav` 조건에도 추가한다(빠지면 모바일에서 되돌아갈 길이 없어진다 — 광고 안내에서 실제로 났던 결함).

  ```ts
  	const showNav =
  		path === "/employer" ||
  		path === "/employer/new" ||
  		path === "/employer/me" ||
  		path.startsWith("/employer/ad-guide") ||
  		path.startsWith("/employer/attendance") ||
  		path.startsWith("/employer/promotions") ||
  		path.startsWith("/employer/analytics") ||
  		path.startsWith("/employer/settings");
  ```

- [ ] **Step 9: 검증**

  ```
  pnpm --filter web exec vitest run src/lib/bambi/attendance-calendar.test.ts
  pnpm --filter web check-types
  pnpm dlx ultracite fix apps/web/src/lib/bambi/attendance-calendar.ts apps/web/src/lib/bambi/attendance-calendar.test.ts apps/web/src/components/bambi/attendance-panel.tsx apps/web/src/app/seeker/attendance/page.tsx apps/web/src/app/employer/attendance/page.tsx apps/web/src/components/bambi/my-page-shell.tsx apps/web/src/components/bambi/screens/seeker.tsx apps/web/src/app/employer/layout.tsx apps/web/src/components/bambi/persona-nav.tsx
  ```

  기대 출력: vitest 4건 통과, check-types 오류 0, ultracite 오류 0.

  > `href`에 `as Route` 캐스팅이 필요한 이유: Next typedRoutes가 아직 새 라우트를 모른다(기존 파일들의 주석과 동일한 처리다). check-types가 `Route` 관련으로 실패하면 캐스팅이 빠진 곳을 찾는다.

- [ ] **Step 10: 커밋(컨트롤러 수행)**

  ```
  feat: 구직자·업소 출석체크 화면 추가
  - 공통 컴포넌트 attendance-panel.tsx 1개를 /seeker/attendance·/employer/attendance 두 라우트가 재사용(역할별 문구 차이가 없어 분기 없음)
  - 오늘 출석 버튼(완료 시 비활성 + "오늘 출석 완료" 표시)·연속/총 출석 스탯·월 달력 그리드 구성, 달 이동은 서버가 내려준 month 기준으로만 계산해 자정 전후 클라이언트 시계와 어긋나지 않게 함
  - 달력은 라이브러리 없이 Tailwind 7열 grid + 순수 모듈 attendance-calendar.ts(일요일 시작·선행 공백 칸·유일 key)로 구현, vitest 4건 동거
  - primary 솔리드는 "출석하기" 한 곳만 유지(달력 칸은 bg-primary/15, 달 이동은 outline)
  - 진입점: 내 정보 사이드바·허브 카드(구직자), 상단 내비(구인자) + 모바일 하단 탭 유지 경로 등록(빠지면 모바일에서 되돌아갈 길이 없음)
  - web check-types·ultracite·vitest 통과
  ```

---

## Task 6: 운영자 출석 관리 화면 `/moderator/attendance`

**Files:**

- Create: `apps/web/src/app/moderator/attendance/page.tsx`
- Modify: `apps/web/src/app/moderator/layout.tsx` (데스크톱 상단 내비)
- Modify: `apps/web/src/components/bambi/screens/moderator.tsx` (모바일 "더보기" 시트)
- Modify: `apps/web/src/components/bambi/persona-nav.tsx` (더보기 탭 활성 경로)

**Interfaces (Consumes):** Task 4의 `orpc.bambi.attendance.adminList`, 기존 `userRoleLabel`(`@/lib/bambi/moderation-labels`), `formatDate`(`@/lib/bambi-format`).

**Interfaces (Produces):** 라우트 `/moderator/attendance`(운영자 접근은 `app/moderator/layout.tsx`의 `enforceModeratorAccess()`가 이미 서버에서 막는다 — 페이지에 별도 게이트를 두지 않는다).

- [ ] **Step 1: 목록 화면 작성**

  `apps/web/src/app/moderator/attendance/page.tsx`:

  ```tsx
  "use client";

  // 밤비 — 운영자 출석 관리. 사용자별 총 출석일·이번 달·마지막 출석일·미출석 경과일을
  // 서버 집계(attendance.adminList)로 받아 표로 보여준다. 검색·역할 필터·정렬·페이지네이션이
  // 전부 서버 입력이라 다른 운영자 화면(클라이언트 필터)과 달리 useInfiniteQuery로 이어 받는다.
  // 개인 상세·차트는 후속 범위다(스펙 §8).

  import { Badge } from "@bambi-app/ui/components/badge";
  import { Button } from "@bambi-app/ui/components/button";
  import {
  	Card,
  	CardContent,
  	CardHeader,
  	CardTitle,
  } from "@bambi-app/ui/components/card";
  import { Input } from "@bambi-app/ui/components/input";
  import { Label } from "@bambi-app/ui/components/label";
  import {
  	Select,
  	SelectContent,
  	SelectItem,
  	SelectTrigger,
  	SelectValue,
  } from "@bambi-app/ui/components/select";
  import { Skeleton } from "@bambi-app/ui/components/skeleton";
  import {
  	Table,
  	TableBody,
  	TableCell,
  	TableHead,
  	TableHeader,
  	TableRow,
  } from "@bambi-app/ui/components/table";
  import { useInfiniteQuery } from "@tanstack/react-query";
  import { ArrowDownIcon, ArrowUpDownIcon } from "lucide-react";
  import { useState } from "react";
  import { EmptyState } from "@/components/bambi/empty-state";
  import { userRoleLabel } from "@/lib/bambi/moderation-labels";
  import { formatDate } from "@/lib/bambi-format";
  import { orpc } from "@/utils/orpc";

  const PAGE_SIZE = 20;

  type SortKey = "recent" | "idle" | "total" | "month";

  const ROLE_FILTER_ITEMS: Record<string, string> = {
  	all: "전체",
  	job_seeker: userRoleLabel("job_seeker"),
  	employer: userRoleLabel("employer"),
  };

  // 정렬 가능한 열. 값이 곧 서버 sort 입력이라 화면과 서버가 어긋날 여지가 없다.
  const SORTABLE_COLUMNS: { key: SortKey; label: string }[] = [
  	{ key: "total", label: "총 출석" },
  	{ key: "month", label: "이번 달" },
  	{ key: "recent", label: "마지막 출석" },
  	{ key: "idle", label: "미출석" },
  ];

  export default function ModeratorAttendancePage() {
  	const [search, setSearch] = useState("");
  	const [roleFilter, setRoleFilter] = useState("all");
  	const [sort, setSort] = useState<SortKey>("recent");

  	const listQuery = useInfiniteQuery(
  		orpc.bambi.attendance.adminList.infiniteOptions({
  			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  			initialPageParam: 0,
  			input: (cursor: number) => ({
  				cursor,
  				limit: PAGE_SIZE,
  				role:
  					roleFilter === "all"
  						? undefined
  						: (roleFilter as "employer" | "job_seeker"),
  				search: search.trim() || undefined,
  				sort,
  			}),
  		})
  	);

  	const pages = listQuery.data?.pages ?? [];
  	// 페이지 사이에 출석이 끼어들면 오프셋이 밀려 같은 계정이 겹칠 수 있어 userId로 걸러낸다.
  	const items = [
  		...new Map(
  			pages.flatMap((page) => page.items).map((item) => [item.userId, item])
  		).values(),
  	];
  	const summary = pages[0]?.summary ?? { attendedToday: 0, eligibleUsers: 0 };

  	return (
  		<div className="mx-auto flex w-full flex-col gap-4 px-5 py-6 md:px-6">
  			<div className="flex flex-col gap-1">
  				<h1 className="m-0 font-extrabold text-2xl">출석 관리</h1>
  				<p className="m-0 text-muted-foreground text-sm">
  					구직자·업소 회원의 출석 현황이에요. 검색·역할·정렬 조건은 요약 숫자에도
  					함께 적용돼요.
  				</p>
  			</div>

  			<div className="grid gap-3 sm:grid-cols-2">
  				<Card>
  					<CardHeader>
  						<CardTitle className="text-muted-foreground text-sm">
  							오늘 출석자
  						</CardTitle>
  					</CardHeader>
  					<CardContent>
  						<p className="m-0 font-extrabold text-2xl">{`${summary.attendedToday}명`}</p>
  					</CardContent>
  				</Card>
  				<Card>
  					<CardHeader>
  						<CardTitle className="text-muted-foreground text-sm">
  							출석 대상 회원
  						</CardTitle>
  					</CardHeader>
  					<CardContent>
  						<p className="m-0 font-extrabold text-2xl">{`${summary.eligibleUsers}명`}</p>
  					</CardContent>
  				</Card>
  			</div>

  			<div className="flex flex-wrap items-end gap-4">
  				<div className="flex flex-col gap-1.5">
  					<Label htmlFor="attendance-search">검색</Label>
  					<Input
  						className="w-64 max-w-full"
  						id="attendance-search"
  						onChange={(event) => setSearch(event.target.value)}
  						placeholder="닉네임·아이디 검색"
  						value={search}
  					/>
  				</div>
  				<div className="flex flex-col gap-1.5">
  					<Label htmlFor="attendance-role">역할</Label>
  					<Select
  						items={ROLE_FILTER_ITEMS}
  						onValueChange={(value) => setRoleFilter(String(value))}
  						value={roleFilter}
  					>
  						<SelectTrigger className="w-36" id="attendance-role">
  							<SelectValue />
  						</SelectTrigger>
  						<SelectContent>
  							{Object.entries(ROLE_FILTER_ITEMS).map(([value, label]) => (
  								<SelectItem key={value} value={value}>
  									{label}
  								</SelectItem>
  							))}
  						</SelectContent>
  					</Select>
  				</div>
  			</div>

  			{listQuery.isPending ? (
  				<div className="flex flex-col gap-2">
  					<Skeleton className="h-10 w-full" />
  					<Skeleton className="h-10 w-full" />
  					<Skeleton className="h-10 w-full" />
  				</div>
  			) : null}

  			{listQuery.isError ? (
  				<EmptyState
  					description="목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
  					title="불러오기 실패"
  				/>
  			) : null}

  			{!(listQuery.isPending || listQuery.isError) && items.length === 0 ? (
  				<EmptyState
  					description={
  						search.trim()
  							? "검색 조건에 맞는 회원이 없어요."
  							: "출석 대상 회원이 없어요."
  					}
  					title="표시할 회원이 없어요"
  				/>
  			) : null}

  			{items.length > 0 ? (
  				<div className="overflow-x-auto rounded-xl border border-border">
  					<Table>
  						<TableHeader>
  							<TableRow>
  								<TableHead>회원</TableHead>
  								<TableHead>역할</TableHead>
  								{SORTABLE_COLUMNS.map((column) => (
  									<TableHead key={column.key}>
  										<button
  											className="-mx-2 flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-muted/50"
  											onClick={() => setSort(column.key)}
  											type="button"
  										>
  											{column.label}
  											{sort === column.key ? (
  												<ArrowDownIcon className="size-3.5 text-muted-foreground" />
  											) : (
  												<ArrowUpDownIcon className="size-3.5 text-muted-foreground/50" />
  											)}
  										</button>
  									</TableHead>
  								))}
  							</TableRow>
  						</TableHeader>
  						<TableBody>
  							{items.map((item) => (
  								<TableRow key={item.userId}>
  									<TableCell>
  										<div className="flex flex-col gap-0.5">
  											<span className="flex items-center gap-1.5 font-medium text-foreground">
  												{item.displayName}
  												{item.attendedToday ? (
  													<Badge variant="success">오늘 출석</Badge>
  												) : null}
  											</span>
  											<span className="max-w-40 truncate text-muted-foreground text-xs">
  												{item.loginId ?? "-"}
  											</span>
  										</div>
  									</TableCell>
  									<TableCell className="text-muted-foreground">
  										{userRoleLabel(item.role)}
  									</TableCell>
  									<TableCell className="whitespace-nowrap">{`${item.totalDays}일`}</TableCell>
  									<TableCell className="whitespace-nowrap">{`${item.monthDays}일`}</TableCell>
  									<TableCell className="whitespace-nowrap text-muted-foreground">
  										{item.lastAttendedOn
  											? formatDate(item.lastAttendedOn)
  											: "기록 없음"}
  									</TableCell>
  									<TableCell className="whitespace-nowrap text-muted-foreground">
  										{item.idleDays === null ? "-" : `${item.idleDays}일`}
  									</TableCell>
  								</TableRow>
  							))}
  						</TableBody>
  					</Table>
  				</div>
  			) : null}

  			{listQuery.hasNextPage ? (
  				<div className="flex justify-center">
  					<Button
  						disabled={listQuery.isFetchingNextPage}
  						onClick={() => listQuery.fetchNextPage()}
  						variant="outline"
  					>
  						{listQuery.isFetchingNextPage ? "불러오는 중" : "더 보기"}
  					</Button>
  				</div>
  			) : null}
  		</div>
  	);
  }
  ```

  > `formatDate`는 `Asia/Seoul` 타임존으로 포맷한다. `lastAttendedOn`은 이미 KST 달력일 문자열이라 `new Date("YYYY-MM-DD")`가 UTC 자정으로 해석돼도 서울 09:00이 되어 같은 날로 표시된다 — 하루 밀림 없음.

- [ ] **Step 2: 데스크톱 상단 내비 진입점**

  `apps/web/src/app/moderator/layout.tsx`의 `MODERATOR_NAV_ITEMS` → `회원 관리` 그룹 `items` 끝에 추가한다.

  ```ts
  			{ href: "/moderator/attendance" as Route, label: "출석 관리" },
  ```

- [ ] **Step 3: 모바일 "더보기" 시트 진입점**

  `apps/web/src/components/bambi/screens/moderator.tsx`의 `MOD_MORE_GROUPS`에서 `승인 관리` 그룹 **다음**에 그룹 하나를 추가한다.

  ```ts
  	{
  		label: "회원",
  		items: [{ href: "/moderator/attendance" as Route, label: "출석 관리" }],
  	},
  ```

- [ ] **Step 4: 더보기 탭 활성 경로 등록**

  `apps/web/src/components/bambi/persona-nav.tsx`의 `ModeratorShell`에서 `tab = "more"`로 떨어지는 조건 목록에 추가한다(빠지면 이 화면에서 하단 탭이 아무것도 활성화되지 않는다).

  ```ts
  	} else if (
  		path.startsWith("/moderator/attendance") ||
  		path.startsWith("/moderator/employers") ||
  		path.startsWith("/moderator/team-invites") ||
  		path.startsWith("/moderator/payments") ||
  		path.startsWith("/moderator/content") ||
  		path.startsWith("/moderator/support") ||
  		path.startsWith("/moderator/banned-words")
  	) {
  		tab = "more";
  	}
  ```

- [ ] **Step 5: 검증**

  ```
  pnpm --filter web check-types
  pnpm dlx ultracite fix apps/web/src/app/moderator/attendance/page.tsx apps/web/src/app/moderator/layout.tsx apps/web/src/components/bambi/screens/moderator.tsx apps/web/src/components/bambi/persona-nav.tsx
  ```

  기대 출력: 둘 다 오류 0.

  > `Badge variant="success"`가 타입 에러면 `packages/ui/src/components/badge.tsx`의 실제 variant 목록을 확인해 존재하는 값(`secondary` 등)으로 바꾼다 — 새 variant를 추가하지 않는다.

- [ ] **Step 6: 커밋(컨트롤러 수행)**

  ```
  feat: 운영자 출석 관리 화면 추가
  - /moderator/attendance 신설 — raw shadcn Table 목록표(회원·역할·총 출석·이번 달·마지막 출석·미출석 경과일) + 상단 요약 카드 2종(오늘 출석자·출석 대상 회원)
  - 검색·역할 필터·정렬은 전부 서버 입력(adminList)이라 화면 상태와 집계가 어긋나지 않음, 정렬 헤더 값이 곧 서버 sort 키
  - 페이지네이션은 오프셋 커서 기반 useInfiniteQuery "더 보기", 페이지 경계에서 겹치는 계정은 userId로 제거
  - 역할은 userRoleLabel 경유로 표시(enum 원값 노출 금지), 빈 상태는 EmptyState 재사용
  - 진입점: 데스크톱 상단 내비 "회원 관리" 그룹 + 모바일 더보기 시트 "회원" 그룹, ModeratorShell의 more 탭 활성 경로 등록
  - web check-types·ultracite 통과
  ```

---

## Task 7: 전체 검증

앞 태스크들이 각자 부분 검증을 했으므로, 여기서는 **네 패키지 전체**를 한 번에 돌려 교차 회귀가 없는지 본다.

**Files:** 변경 없음(수정이 필요하면 해당 태스크로 되돌아간다).

- [ ] **Step 1: 타입체크 4종**

  ```
  pnpm --filter web check-types
  pnpm --filter server check-types
  pnpm --filter @bambi-app/api check-types
  pnpm --filter @bambi-app/db check-types
  ```

  기대 출력: 넷 다 오류 없이 종료(성공 시 무출력).

- [ ] **Step 2: ultracite 전체 변경 경로**

  ```
  pnpm dlx ultracite fix packages/db/src/schema/bambi.ts packages/api/src/services/bambi-attendance.ts packages/api/src/services/bambi-attendance.test.ts packages/api/src/routers/bambi/attendance.ts packages/api/src/routers/bambi/attendance.test.ts packages/api/src/routers/bambi/index.ts apps/web/src/lib/bambi/attendance-calendar.ts apps/web/src/lib/bambi/attendance-calendar.test.ts apps/web/src/components/bambi/attendance-panel.tsx apps/web/src/components/bambi/my-page-shell.tsx apps/web/src/components/bambi/persona-nav.tsx apps/web/src/components/bambi/screens/seeker.tsx apps/web/src/components/bambi/screens/moderator.tsx apps/web/src/app/seeker/attendance/page.tsx apps/web/src/app/employer/attendance/page.tsx apps/web/src/app/employer/layout.tsx apps/web/src/app/moderator/attendance/page.tsx apps/web/src/app/moderator/layout.tsx
  ```

  기대 출력: `Checked 18 files` + 오류 0. **경로 인자를 반드시 붙인다**(빼면 0파일을 검사하고 통과한 것처럼 보인다).

  ultracite가 파일을 고쳤으면 Step 1을 다시 돌린다.

- [ ] **Step 3: 순수 vitest 2종**

  ```
  pnpm --filter @bambi-app/api exec vitest run src/services/bambi-attendance.test.ts
  pnpm --filter web exec vitest run src/lib/bambi/attendance-calendar.test.ts
  ```

  기대 출력: 각각 `Tests 7 passed`, `Tests 4 passed`.

  **`packages/api/src/routers/bambi` 스위트는 절대 실행하지 않는다.**

- [ ] **Step 4: 미적용 마이그레이션 확인**

  ```
  git status --short packages/db/src/migrations
  ```

  기대: 새 `.sql` 1개 + `meta/` 갱신만 보인다. `db:migrate`는 실행하지 않았음을 보고에 명시한다.

- [ ] **Step 5: 최종 보고(커밋 없음)**

  컨트롤러에 아래를 보고한다.

  - 브랜치 `worktree-notifications-attendance`, 태스크별 커밋 위치
  - 검증 결과(타입체크 4종·ultracite 18파일·vitest 11건)
  - **미적용 마이그레이션 파일명** — 사용자가 `pnpm --filter @bambi-app/db db:migrate`를 지시할 때까지 대기
  - 사용자 시각 검수가 필요한 화면 3개: `/seeker/attendance`, `/employer/attendance`, `/moderator/attendance`

---

## 스펙 §5 대비 커버리지

| 스펙 요구사항 | 커버 태스크 |
|---|---|
| §5.1 `bambi_attendance` 복합 PK + `created_at`, user FK cascade | Task 2 |
| §5.1 KST 날짜를 서버에서 `Intl` 순수 함수로 계산 + vitest | Task 1 |
| §5.2 `checkIn()` role 게이트(job_seeker·employer) | Task 3 |
| §5.2 `checkIn()` `onConflictDoNothing` 멱등 + 오늘 출석 여부 응답 | Task 3 |
| §5.2 `getMine({month?})` 월 출석일·연속·총 | Task 3 |
| §5.2 연속일 순수 함수 + vitest | Task 1 |
| §5.2 `adminList` SQL 집계·검색·역할 필터·정렬·페이지네이션·요약 카운트 | Task 4 |
| §5.3 공통 출석 컴포넌트(버튼·월 달력·스탯) + 두 라우트 재사용 | Task 5 |
| §5.3 각 역할 셸 메뉴 진입점 | Task 5 |
| §5.3 달력 라이브러리 추가 없이 Tailwind grid | Task 5 |
| §5.3 `/moderator/attendance` raw Table + 검색·필터·정렬·페이지네이션 + 요약 | Task 6 |
| §5.3 출석 알림 미생성 | 전 태스크 — 알림 코드 없음 |
| §7 순수 vitest(KST·연속일) / DB 라우터 테스트 작성만 | Task 1·5 / Task 3·4 |
| §7 web·server·api·db check-types + ultracite(경로) | Task 7 |
| §7 마이그레이션 generate까지, migrate 대기 | Task 2·7 |
