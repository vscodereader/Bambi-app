import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// resolveListingPaymentExposure는 executor(Pick<db, "execute" | "select">)만 사용하므로
// 실 DB 없이 호출 순서와 분기를 결정적으로 검증할 수 있다(공유 dev DB 카운트 비의존).
// 다만 모듈이 최상단에서 @bambi-app/db를 정적 import하므로 env가 먼저 로드돼야 한다.
dotenv.config({ path: "../../apps/server/.env" });

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
