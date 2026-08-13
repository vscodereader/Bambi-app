# 리스팅 정원 게이트 락 + 결제 멱등 가드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보안·레이스 조사 #3(스페셜/추천 정원 게이트 check-then-act 레이스)과 #4(`setJobPostPayment` 멱등 가드 누락)를 수정한다.

**Architecture:** (#3) 배너 승인이 이미 쓰는 `pg_advisory_xact_lock` 패턴을 리스팅 섹션에도 적용한다 — 정의만 되고 미사용이던 `LISTING_CAPACITY_LOCK_KEYS`를 실제로 사용. 승인 경로는 `resolveListingPaymentExposure` 안에서(호출부 2곳이 모두 tx 안이므로 xact lock 성립), 승격 틱은 "정원 카운트→대기열 선두 선택→활성화"를 같은 락을 쥔 단일 트랜잭션으로 재구성해서 직렬화한다. (#4) `confirmPurchasePayment`(boost-options.ts:484)와 동일한 same-status 단락을 `setJobPostPayment`·`bulkSetJobPostPayment`에 추가한다 — 이미 paid인 리스팅에 결제완료를 재클릭하면 만석 섹션에서 `exposureEndsAt=null`로 재계산돼 노출 중인 광고가 대기열 맨 뒤로 강등되는 사고를 막는다.

**Tech Stack:** Drizzle ORM(PostgreSQL, `pg_advisory_xact_lock`, `FOR UPDATE`), oRPC, vitest.

## 배경 (조사 결과 요약)

- **#3**: `bambi-premium-capacity.ts`의 배너 승인 게이트(`assertPremiumApprovalWithinCapacity`)는 advisory lock으로 직렬화되지만, 리스팅(스페셜/추천) 경로는 락이 없다. ① 승인(단건 `setJobPostPayment`·일괄 `bulkSetJobPostPayment`)의 `resolveListingPaymentExposure`와 ② 60초 승격 틱(`runListingPromotionTick`)이 같은 마지막 자리를 두고 각자 `active < capacity`를 통과하면 **정원 초과 노출 + FIFO 새치기**가 난다. 틱은 카운트가 활성화 트랜잭션 **밖**에 있어서 락만 추가해서는 못 고친다.
- **#4**: `setJobPostPayment`에 same-status 단락이 없다. 결제 목록이 paid 행도 표시하므로 운영자가 재클릭/더블클릭하면 `resolveListingPaymentExposure`가 재실행돼, 만석 섹션의 **활성 리스팅이 `exposureEndsAt=null`(대기열)로 강등되고 `listingPaidAt=now`로 FIFO 순번이 맨 뒤로 리셋**된다. 배너형도 노출 시계가 부당 연장된다. `syncBundledBoostPurchasePayment`는 이미 same-status를 건너뛰므로(moderation.ts:288) 무관.

## Global Constraints

- DB 마이그레이션 없음. `db:push` 절대 금지.
- `packages/api/test/routers/bambi` 스위트는 **절대 실행하지 않는다**(dev DB 삭제 위험). 갱신만 하고 미실행임을 커밋·PR에 명시.
- services 테스트 실행은 `cwd=packages/api`에서 `pnpm vitest run test/services/...`. 워크트리에 `apps/server/.env` 복사 필요(완료됨).
- 커밋 전 `pnpm dlx ultracite fix <경로들>`(경로 인자 필수), 타입체크 `pnpm --filter @bambi-app/api check-types`.
- 커밋 메시지: 한국어 `type:` 제목 + 촘촘한 `- ` 블릿(빈 줄 없음), Git Bash에서 `git commit -F <tempfile>`.
- 서브에이전트로 실행 시 git 명령 금지 — 커밋은 컨트롤러가 순차 수행.
- 신규 라이브러리 추가 금지. UI·매뉴얼 변경 없음(동작 결함 수정만).

## 파일 구조

- Modify: `packages/api/src/services/bambi-premium-capacity.ts` — `acquireListingCapacityLock` 추가(락 획득 단일 소스).
- Modify: `packages/api/src/services/bambi-listing-promotion.ts` — 승인 경로 락 + 틱 재구성.
- Modify: `packages/api/src/routers/bambi/moderation.ts` — 멱등 가드 2곳.
- Create: `packages/api/test/services/bambi-listing-promotion.test.ts` — fake executor 단위 테스트(실행 가능, dev DB 비의존).
- Modify: `packages/api/test/routers/bambi/job-payment-queue.test.ts` — 멱등·락 케이스 추가(**미실행**).

**Workflow 병렬 매핑(선택):** Task 1(서비스 락)과 Task 3(라우터 멱등 가드)은 파일이 겹치지 않아 병렬 가능. Task 2(틱 재구성)는 Task 1의 `acquireListingCapacityLock`을 소비하므로 Task 1 뒤. Task 4(라우터 테스트 갱신)는 Task 3 뒤.

---

### Task 1: 승인 경로 섹션 advisory lock (#3-승인)

**Files:**
- Modify: `packages/api/src/services/bambi-premium-capacity.ts` (LISTING_CAPACITY_LOCK_KEYS 정의부 아래)
- Modify: `packages/api/src/services/bambi-listing-promotion.ts:62-75` (`resolveListingPaymentExposure`의 리스팅 분기)
- Test: `packages/api/test/services/bambi-listing-promotion.test.ts` (신규)

**Interfaces:**
- Consumes: `LISTING_CAPACITY_LOCK_KEYS`, `countActiveListings`, `listingSectionCapacity` (기존, bambi-premium-capacity.ts)
- Produces: `acquireListingCapacityLock(executor: QueryExecutor, type: CapacityListingExposureType): Promise<void>` — Task 2가 그대로 사용. `resolveListingPaymentExposure` 시그니처는 불변.

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/api/test/services/bambi-listing-promotion.test.ts` 신규. 실 DB 없이 fluent chain을 흉내 내는 fake executor로 "락이 카운트보다 먼저, 올바른 조건에서만 잡힌다"와 활성/대기 분기를 못박는다.

```ts
import { describe, expect, it } from "vitest";

// resolveListingPaymentExposure는 executor(Pick<db, "execute" | "select">)만 사용하므로
// 실 DB 없이 호출 순서와 분기를 결정적으로 검증할 수 있다(공유 dev DB 카운트 비의존).
const { resolveListingPaymentExposure } = await import(
	"@/services/bambi-listing-promotion"
);
const { LISTING_CAPACITY_LOCK_KEYS } = await import(
	"@/services/bambi-premium-capacity"
);

// select 필드 키로 카운트({value})·정원({specialCapacity,...}) 조회를 구분해 응답하고,
// execute(advisory lock)와 select 순서를 calls에 기록하는 fake executor.
const makeExecutor = ({ active }: { active: number }) => {
	const calls: string[] = [];
	const executedQueries: unknown[] = [];
	const executor = {
		execute: (query: unknown) => {
			calls.push("lock");
			executedQueries.push(query);
			return Promise.resolve([]);
		},
		select: (fields: Record<string, unknown>) => ({
			from: () => ({
				where: () => {
					if ("value" in fields) {
						calls.push("count");
						return Promise.resolve([{ value: active }]);
					}
					calls.push("capacity");
					// 사이트 설정 미조정(null) → 코드 기본값 폴백(special 12, recommended 20).
					return Promise.resolve([
						{ recommendedCapacity: null, specialCapacity: null },
					]);
				},
			}),
		}),
	};
	return { calls, executedQueries, executor };
};

const baseInput = {
	exposureDurationDays: 7,
	exposureType: "special",
	newPaymentStatus: "paid",
	now: new Date("2026-08-13T00:00:00Z"),
} as const;

describe("resolveListingPaymentExposure 정원 게이트 락", () => {
	it("리스팅 paid 전환은 섹션 advisory lock을 카운트보다 먼저 잡는다", async () => {
		const { calls, executedQueries, executor } = makeExecutor({ active: 0 });
		await resolveListingPaymentExposure({
			...baseInput,
			executor: executor as never,
		});
		expect(calls[0]).toBe("lock");
		expect(calls).toContain("count");
		expect(calls).toContain("capacity");
		// 락 키가 스페셜 섹션 키인지 — SQL 파라미터에 키 값이 실려 있어야 한다.
		expect(JSON.stringify(executedQueries[0])).toContain(
			String(LISTING_CAPACITY_LOCK_KEYS.special)
		);
	});

	it("정원 내면 즉시 활성화(now+기간), listingPaidAt=now", async () => {
		const { executor } = makeExecutor({ active: 11 }); // capacity 12
		const result = await resolveListingPaymentExposure({
			...baseInput,
			executor: executor as never,
		});
		expect(result.exposureEndsAt).toEqual(
			new Date(baseInput.now.getTime() + 7 * 24 * 60 * 60 * 1000)
		);
		expect(result.listingPaidAt).toEqual(baseInput.now);
	});

	it("만석이면 대기열(exposureEndsAt=null), listingPaidAt=now", async () => {
		const { executor } = makeExecutor({ active: 12 }); // capacity 12
		const result = await resolveListingPaymentExposure({
			...baseInput,
			executor: executor as never,
		});
		expect(result.exposureEndsAt).toBeNull();
		expect(result.listingPaidAt).toEqual(baseInput.now);
	});

	it("unpaid 전환·비리스팅형은 락을 잡지 않는다", async () => {
		const unpaidCase = makeExecutor({ active: 0 });
		await resolveListingPaymentExposure({
			...baseInput,
			executor: unpaidCase.executor as never,
			newPaymentStatus: "unpaid",
		});
		expect(unpaidCase.calls).not.toContain("lock");

		const bannerCase = makeExecutor({ active: 0 });
		await resolveListingPaymentExposure({
			...baseInput,
			executor: bannerCase.executor as never,
			exposureType: "premium-banner",
		});
		expect(bannerCase.calls).not.toContain("lock");
	});
});
```

`"premium-banner"`는 `AD_BANNER_EXPOSURE_TYPES`(bambi-ad-exposure.ts:60)의 실존 배너 타입이다 — 리스팅 분기에 안 걸리는 게 검증 목적.

- [ ] **Step 2: 실패 확인**

Run(cwd=`packages/api`): `pnpm vitest run test/services/bambi-listing-promotion.test.ts`
Expected: FAIL — "리스팅 paid 전환은 …" 케이스에서 `calls[0]`가 `"count"`(락 미획득).

- [ ] **Step 3: `acquireListingCapacityLock` 추가 + 승인 경로에서 호출**

`packages/api/src/services/bambi-premium-capacity.ts` — `LISTING_CAPACITY_LOCK_KEYS` 정의부(L61-67) 아래에 추가:

```ts
// 리스팅 섹션 정원 게이트 직렬화. 승인(resolveListingPaymentExposure)과 승격 틱이 같은 키를
// 잡아 "카운트→활성화" check-then-act가 한 번에 한 트랜잭션만 진행된다. xact 스코프라
// 반드시 트랜잭션 안에서 호출해야 커밋 시 해제된다(배너 게이트와 동일 패턴).
export const acquireListingCapacityLock = async (
	executor: QueryExecutor,
	type: CapacityListingExposureType
): Promise<void> => {
	await executor.execute(
		sql`select pg_advisory_xact_lock(${LISTING_CAPACITY_LOCK_KEYS[type]})`
	);
};
```

`packages/api/src/services/bambi-listing-promotion.ts` — import에 `acquireListingCapacityLock` 추가하고, `resolveListingPaymentExposure`의 리스팅 분기(L62)를:

```ts
	if (isListingExposureType(exposureType)) {
		// 정원 카운트→활성/대기 판정이 check-then-act라, 같은 섹션의 동시 승인·승격 틱과
		// 마지막 자리를 두고 경합하면 정원 초과 노출이 난다. 섹션 advisory xact lock으로
		// 직렬화한다(#3). 호출부(setJobPostPayment·bulkSetJobPostPayment)는 모두 tx 안이다.
		await acquireListingCapacityLock(executor, exposureType);
		const [active, capacity] = await Promise.all([
			countActiveListings(executor, exposureType, now),
			listingSectionCapacity(executor, exposureType),
		]);
		// (이하 기존 그대로)
```

- [ ] **Step 4: 테스트 통과 확인**

Run(cwd=`packages/api`): `pnpm vitest run test/services/bambi-listing-promotion.test.ts`
Expected: PASS (4케이스 전부)

- [ ] **Step 5: 린트·타입체크 후 커밋**

```bash
pnpm dlx ultracite fix packages/api/src/services/bambi-premium-capacity.ts packages/api/src/services/bambi-listing-promotion.ts packages/api/test/services/bambi-listing-promotion.test.ts
pnpm --filter @bambi-app/api check-types
```

커밋 제목: `fix: 리스팅 승인 경로 정원 게이트에 섹션 advisory lock 적용`

### Task 2: 승격 틱을 락 쥔 단일 트랜잭션으로 재구성 (#3-틱)

**Files:**
- Modify: `packages/api/src/services/bambi-listing-promotion.ts:88-215` (`activateQueuedHead`·`promoteSectionToCapacity`·틱 상단 ponytail 주석)

**Interfaces:**
- Consumes: `acquireListingCapacityLock` (Task 1), `countActiveListings`, `listingSectionCapacity`, `queuedListingWhere` (기존)
- Produces: `runListingPromotionTick(now: Date): Promise<number>` 시그니처·반환 의미 불변(apps/server 인터벌 등록부 무변경).

- [ ] **Step 1: `activateQueuedHead`·`promoteSectionToCapacity`를 `promoteOneSlot` 기반으로 교체**

핵심: 기존 구조는 정원 카운트(트랜잭션 밖) → 선두 선택(밖) → 활성화(tx 안 재확인)라, 카운트 시점과 활성화 시점 사이에 승인 경로가 끼어들 수 있다. 카운트→선두 선택→활성화를 **섹션 락을 쥔 하나의 트랜잭션**으로 합친다. 선두 선택 WHERE에 `queuedListingWhere`가 들어가고 `FOR UPDATE`가 READ COMMITTED 재평가(EvalPlanQual)로 방금 취소된 행을 걸러주므로, 기존 `activateQueuedHead`의 별도 재확인·`skipIds` 루프는 통째로 필요 없어진다.

`activateQueuedHead`(L88-126)와 `promoteSectionToCapacity`(L128-192)를 다음으로 교체:

```ts
// 한 자리 승격 시도: 섹션 advisory xact lock 안에서 정원 재카운트→대기열 선두 선택(FOR UPDATE)→
// 활성화를 원자적으로 수행한다(#3). 승인 경로(resolveListingPaymentExposure)와 같은 키로
// 직렬화되므로 마지막 자리를 두고 틱과 승인이 동시에 통과할 수 없다. 선두 선택 WHERE에
// queuedListingWhere가 있고 FOR UPDATE가 잠금 후 조건을 재평가하므로(READ COMMITTED),
// 동시 취소로 대기열에서 빠진 행은 자연히 걸러진다 — 별도 재확인·skip 목록이 필요 없다.
type PromoteOutcome =
	| { kind: "stop" } // 정원 참 또는 대기열 비었음 — 이 섹션 종료
	| {
			head: {
				createdByUserId: string;
				exposureDurationDays: number | null;
				id: string;
				title: string;
			};
			kind: "promoted";
	  };

const promoteOneSlot = (
	type: CapacityListingExposureType,
	now: Date
): Promise<PromoteOutcome> =>
	db.transaction(async (tx) => {
		await acquireListingCapacityLock(tx, type);
		const [active, capacity] = await Promise.all([
			countActiveListings(tx, type, now),
			listingSectionCapacity(tx, type),
		]);
		if (active >= capacity) {
			return { kind: "stop" };
		}

		const [head] = await tx
			.select({
				createdByUserId: jobPost.createdByUserId,
				exposureDurationDays: jobPost.exposureDurationDays,
				id: jobPost.id,
				title: jobPost.title,
			})
			.from(jobPost)
			.where(queuedListingWhere(type))
			.orderBy(asc(jobPost.listingPaidAt), asc(jobPost.id))
			.limit(1)
			.for("update");
		if (!head) {
			return { kind: "stop" };
		}

		await tx
			.update(jobPost)
			.set({
				exposureEndsAt: listingExposureEndsAt(now, head.exposureDurationDays),
			})
			.where(eq(jobPost.id, head.id));
		return { head, kind: "promoted" };
	});

// 한 섹션(type)의 빈 자리를 대기열 선두부터 채운다. 승격 1건당 트랜잭션 1개라 락 점유가 짧고,
// 매 반복 정원을 재카운트해 정원까지만 승격한다. 알림은 커밋 뒤에 보낸다(롤백된 승격 통지 방지).
const promoteSectionToCapacity = async (
	type: CapacityListingExposureType,
	now: Date
): Promise<number> => {
	let promoted = 0;

	while (true) {
		const outcome = await promoteOneSlot(type, now);
		if (outcome.kind === "stop") {
			break;
		}
		promoted += 1;
		// 시스템 틱이라 액터가 없어 소유자를 액터로 기록한다(구인자 본인에게 노출 시작 통지).
		await notifyBambiNotification({
			actorUserId: outcome.head.createdByUserId,
			metadata: {
				action: "listing_activated",
				exposureDurationDays: outcome.head.exposureDurationDays,
				exposureType: type,
				jobPostTitle: outcome.head.title,
			},
			recipientUserId: outcome.head.createdByUserId,
			targetId: outcome.head.id,
			targetType: "job_post",
		});
	}

	return promoted;
};
```

무한 루프 안전성: 승격된 행은 `exposureEndsAt`이 세팅돼 다음 반복의 `queuedListingWhere`에 안 걸린다(기간 null → now+0 = 즉시 만료여도 not-null이라 대기열 이탈). 매 반복 active 재카운트가 정원 도달 시 stop.

- [ ] **Step 2: 죽은 코드·주석 정리**

- `runListingPromotionTick` 상단 주석(L200-202)의 "ponytail: 전역 정원 락은 없다 …" 문단을 삭제하고 "섹션별 advisory xact lock(promoteOneSlot)으로 승인 경로와 직렬화된다 — 다중 인스턴스 동시 틱에도 정원을 넘지 않는다."로 교체.
- 더 이상 안 쓰는 import 제거: `notInArray`, `and`(둘 다 skipIds 분기 전용이었음 — 다른 사용처가 없는지 확인 후), `paymentStatus`/`status`/`exposureType` 등 이전 재확인 전용 참조.
- `isListingExposureType`은 `resolveListingPaymentExposure`가 계속 쓰므로 유지.

- [ ] **Step 3: 린트·타입체크**

```bash
pnpm dlx ultracite fix packages/api/src/services/bambi-listing-promotion.ts
pnpm --filter @bambi-app/api check-types
```

Run(cwd=`packages/api`): `pnpm vitest run test/services/bambi-listing-promotion.test.ts test/services/bambi-premium-capacity.test.ts`
Expected: PASS (기존 정원 파생 테스트 회귀 없음)

- [ ] **Step 4: 커밋**

커밋 제목: `fix: 리스팅 승격 틱을 섹션 락 쥔 단일 트랜잭션으로 재구성`

### Task 3: 결제 상태 same-status 멱등 가드 (#4)

**Files:**
- Modify: `packages/api/src/routers/bambi/moderation.ts:2110-2208` (`setJobPostPayment`), `:2762-2890` (`bulkSetJobPostPayment`)

**Interfaces:**
- Consumes: 없음(라우터 내부 변경만). `resolveListingPaymentExposure`·`assertPremiumApprovalWithinCapacity`·`syncBundledBoostPurchasePayment` 호출은 "상태가 실제로 바뀌는 경우"로만 좁혀진다.
- Produces: 프로시저 입출력 스키마 불변 — same-status 요청은 에러가 아니라 현재 행을 그대로 반환(성공)한다. `confirmPurchasePayment`(boost-options.ts:484)와 동일한 의미론.

- [ ] **Step 1: `setJobPostPayment`에 가드 추가**

트랜잭션 내부, NOT_FOUND 검사 직후에 단락을 넣는다. no-op일 때 현재 행을 그대로 반환해야 하므로 `existing` 조회를 4컬럼 부분 select에서 **전체 행 select**로 바꾼다(반환 타입은 update `.returning()`과 동일한 jobPost 행이라 클라이언트 계약 불변):

```ts
			const { changed, organizationId, updated } = await db.transaction(
				async (tx) => {
					const now = new Date();
					const [existing] = await tx
						.select()
						.from(jobPost)
						.where(eq(jobPost.id, input.jobPostId))
						.limit(1);

					if (!existing) {
						throw new ORPCError("NOT_FOUND");
					}

					// 같은 상태 재확정은 멱등 처리한다(confirmPurchasePayment와 동일 패턴) — 이미
					// paid인 리스팅에 결제완료를 다시 걸면 만석 섹션에서 exposureEndsAt=null로
					// 재계산돼 노출 중인 광고가 대기열 맨 뒤로 강등되고(listingPaidAt 리셋), 배너는
					// 노출 시계가 부당 연장된다. changed=false로 알림·캐시 동기화도 건너뛴다(#4).
					if (existing.paymentStatus === input.paymentStatus) {
						return {
							changed: false,
							organizationId: existing.organizationId,
							updated: existing,
						};
					}
					// … (기존 게이트·계산·업데이트 그대로, 반환에 changed: true 추가)
				}
			);
```

커밋 후 블록(advertiser 캐시 동기화 L2180 + 알림 L2185-2205)을 `if (changed) { … }`로 감싼다. 최종 `return updated;`는 그대로.

- [ ] **Step 2: `bulkSetJobPostPayment`에 가드 추가**

`processTarget` 안, NOT_FOUND 검사 직후:

```ts
							// 같은 상태 재확정은 항목 단위 no-op(#4, 단건과 동일). 성공으로 치되
							// 아무것도 바꾸지 않고, 커밋 후 알림·캐시 동기화 대상에서도 뺀다.
							if (existing.paymentStatus === input.paymentStatus) {
								noopJobPostIds.add(jobPostId);
								return;
							}
```

핸들러 상단(트랜잭션 밖)에 `const noopJobPostIds = new Set<string>();`를 선언하고(기존 `affectedOrganizationIds` 옆), no-op 경로는 `affectedOrganizationIds.add(...)`에 닿지 않게 한다(위 early return으로 자동 충족). 알림 루프는:

```ts
				for (const jobPostId of succeededIds) {
					if (noopJobPostIds.has(jobPostId)) {
						continue;
					}
					// … (기존 알림 그대로)
				}
```

`succeededRows`·`queuePositions` 조회(L2848-2869)는 그대로 둬도 무해하지만, `succeededIds`에서 noop을 제외한 목록으로 조회량을 줄여도 된다 — 알림 스킵만 필수.

- [ ] **Step 3: 린트·타입체크**

```bash
pnpm dlx ultracite fix packages/api/src/routers/bambi/moderation.ts
pnpm --filter @bambi-app/api check-types
```

주의: 이 라우터는 프로시저 추가 시 TS7056(선언 직렬화 한도)이 재발할 수 있으나 이번엔 프로시저 추가가 없어 해당 없음. check-types가 깨지면 `routers/bambi/index.ts`의 명시 타입 주석 패턴 참고.

- [ ] **Step 4: 커밋**

커밋 제목: `fix: 결제 상태 same-status 재확정을 멱등 처리해 리스팅 강등 사고 차단`

### Task 4: 라우터 테스트 케이스 갱신 (미실행)

**Files:**
- Modify: `packages/api/test/routers/bambi/job-payment-queue.test.ts`

**Interfaces:**
- Consumes: Task 1-3의 최종 동작. 기존 파일의 시드·헬퍼 패턴을 그대로 따른다(파일을 먼저 읽고 기존 describe 구조에 붙일 것).

- [ ] **Step 1: 케이스 추가 (작성만, 실행 금지)**

기존 파일의 시드 헬퍼 스타일에 맞춰 describe "결제 재확정 멱등(#4)"을 추가한다. 검증 의도(정확한 코드는 기존 헬퍼에 맞춰 작성):

1. **활성 리스팅 re-paid no-op**: special 활성(paid, exposureEndsAt=미래, listingPaidAt=과거) 시드 → `setJobPostPayment(paid)` 재호출 → `exposureEndsAt`·`listingPaidAt`이 **원래 값 그대로**(강등·리셋 없음).
2. **대기열 리스팅 re-paid no-op**: queued(paid, exposureEndsAt=null, listingPaidAt=T1) 시드 → 재호출 → `listingPaidAt === T1` 유지(FIFO 순번 보존).
3. **unpaid 재확정 no-op**: unpaid 행에 `setJobPostPayment(unpaid)` → 에러 없이 현재 행 반환.
4. **bulk 혼합**: [이미 paid 1건, unpaid 1건]에 `bulkSetJobPostPayment(paid)` → 둘 다 성공, 이미 paid였던 행의 `listingPaidAt` 불변.

- [ ] **Step 2: 타입체크만 수행**

Run: `pnpm --filter @bambi-app/api check-types`
**절대 실행 금지**: `pnpm vitest run test/routers/bambi/...` — dev DB를 지운다. 커밋 본문과 PR에 "라우터 테스트는 갱신만, 미실행" 명시.

- [ ] **Step 3: 커밋**

커밋 제목: `test: 결제 멱등·정원 락 라우터 케이스 추가(미실행)`

---

## 알려진 트레이드오프 (구현하지 않음, 기록만)

- **일괄 승인 교차 데드락**: `bulkSetJobPostPayment`는 한 트랜잭션에서 대상 순서대로 섹션 락(special/recommended/premium)을 잡는다. 서로 다른 순서의 bulk 두 개가 동시에 돌면 이론상 데드락 → PostgreSQL이 한쪽을 abort(전체 재시도로 복구). 운영자 소수·저빈도 작업이라 수용. 필요해지면 대상 로드 후 섹션 키 정렬 순서로 선획득.
- **틱 승격 1건당 트랜잭션 1개**: 만석 해소로 여러 자리가 한 번에 비면 승격 사이에 승인이 끼어들 수 있으나, 매 반복 정원을 재카운트하므로 초과는 없다(순서만 interleave).
- **알림은 락 밖(커밋 뒤)**: 알림 실패가 승격을 롤백하지 않고, 락 점유 시간을 늘리지 않는다.

## Self-Review 결과

- 조사 #3의 두 경합 축(승인↔승인, 승인↔틱) 모두 커버: 승인은 Task 1(락), 틱은 Task 2(락+단일 tx). 틱↔틱(다중 인스턴스)도 같은 락으로 커버.
- 조사 #4의 두 진입점(단건·일괄) 모두 커버: Task 3. `syncBundledBoostPurchasePayment`는 기존 same-status skip으로 이미 안전(변경 없음).
- 타입 일관성: `acquireListingCapacityLock(executor, type)`을 Task 1이 정의, Task 1(resolveListingPaymentExposure)·Task 2(promoteOneSlot)가 동일 시그니처로 소비. `PromoteOutcome`은 Task 2 내부 전용.
- 실행 가능한 테스트는 fake executor 단위(Task 1)뿐 — 락의 실제 상호배제는 통합 환경 없이는 결정적으로 못 본다. 라우터 케이스(Task 4)는 미실행 부채로 명시.
