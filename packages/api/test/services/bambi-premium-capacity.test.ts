import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// 이 파일은 순수 함수만 검증하지만, 모듈이 최상단에서 @bambi-app/db를 정적 import하므로
// env가 먼저 로드돼야 한다. 다른 실 DB 테스트와 동일하게 dotenv 후 동적 import한다.
dotenv.config({ path: "../../apps/server/.env" });

const {
	computeCapacityQueue,
	computePremiumQueue,
	DEFAULT_RECOMMENDED_CAPACITY,
	DEFAULT_SPECIAL_CAPACITY,
	listingCapacityFullMessage,
	PREMIUM_AD_CAPACITY,
} = await import("@/services/bambi-premium-capacity");

// 순수 파생 로직 검증(DB 미접촉). 실제 카운트 조회는 전역이라 공유 dev DB에서 결정적으로
// 단정할 수 없어, 정원 공식·대기열 순번은 여기서 순수 단위로 못박고 게이트 배선만 실 DB로 본다.
describe("computePremiumQueue", () => {
	it("remaining = 정원 − active − pending, active가 만료로 1 줄면 remaining이 1 는다", () => {
		const pending = ["a", "b"];
		const before = computePremiumQueue(PREMIUM_AD_CAPACITY - 4, pending);
		// active 6, pending 2 → 10 − 6 − 2 = 2.
		expect(before.remaining).toBe(2);

		// 광고 1건 만료 → active 5 → remaining 3 (자동 +1).
		const after = computePremiumQueue(PREMIUM_AD_CAPACITY - 5, pending);
		expect(after.remaining).toBe(before.remaining + 1);
	});

	it("정원이 active+pending로 가득 차면 remaining은 0 밑으로 내려가지 않는다", () => {
		const queue = computePremiumQueue(PREMIUM_AD_CAPACITY, ["a", "b", "c"]);
		expect(queue.remaining).toBe(0);
	});

	it("대기열 순번을 createdAt 정렬 순서대로 진행 가능/대기로 파생한다", () => {
		// active 8 → progressableSlots = 2. 앞 2건 진행 가능, 나머지는 대기열 1·2번째.
		const queue = computePremiumQueue(8, [
			"first",
			"second",
			"third",
			"fourth",
		]);

		expect(queue.ranksByJobId.get("first")).toEqual({
			progressable: true,
			queuePosition: null,
			rank: 1,
		});
		expect(queue.ranksByJobId.get("second")).toEqual({
			progressable: true,
			queuePosition: null,
			rank: 2,
		});
		expect(queue.ranksByJobId.get("third")).toEqual({
			progressable: false,
			queuePosition: 1,
			rank: 3,
		});
		expect(queue.ranksByJobId.get("fourth")).toEqual({
			progressable: false,
			queuePosition: 2,
			rank: 4,
		});
	});

	it("active가 정원을 채우면 모든 pending이 대기열로 밀린다", () => {
		const queue = computePremiumQueue(PREMIUM_AD_CAPACITY, ["a", "b"]);
		expect(queue.ranksByJobId.get("a")?.progressable).toBe(false);
		expect(queue.ranksByJobId.get("a")?.queuePosition).toBe(1);
		expect(queue.ranksByJobId.get("b")?.queuePosition).toBe(2);
	});

	it("프리미엄 래퍼는 정원을 PREMIUM_AD_CAPACITY로 고정해 위임한다", () => {
		const wrapped = computePremiumQueue(3, ["a", "b"]);
		const direct = computeCapacityQueue(PREMIUM_AD_CAPACITY, 3, ["a", "b"]);
		expect(wrapped.capacity).toBe(PREMIUM_AD_CAPACITY);
		expect(wrapped.remaining).toBe(direct.remaining);
		expect(wrapped.ranksByJobId.get("a")).toEqual(direct.ranksByJobId.get("a"));
	});
});

// 정원을 파라미터로 받는 일반화 로직 — 스페셜(12)·추천(20)에 그대로 재사용된다.
describe("computeCapacityQueue", () => {
	it("정원 파라미터가 progressableSlots·remaining을 결정한다(스페셜 12 기준)", () => {
		// active 10 → progressableSlots = 12 − 10 = 2. 앞 2건 진행 가능, 나머지 대기.
		const queue = computeCapacityQueue(DEFAULT_SPECIAL_CAPACITY, 10, [
			"a",
			"b",
			"c",
		]);
		expect(queue.capacity).toBe(12);
		expect(queue.ranksByJobId.get("a")?.progressable).toBe(true);
		expect(queue.ranksByJobId.get("b")?.progressable).toBe(true);
		expect(queue.ranksByJobId.get("c")).toEqual({
			progressable: false,
			queuePosition: 1,
			rank: 3,
		});
		// remaining = max(0, 12 − 10 − 3) = 0.
		expect(queue.remaining).toBe(0);
	});

	it("같은 active·pending도 정원이 크면 remaining이 커진다(추천 20 기준)", () => {
		const special = computeCapacityQueue(DEFAULT_SPECIAL_CAPACITY, 5, [
			"a",
			"b",
		]);
		const recommended = computeCapacityQueue(DEFAULT_RECOMMENDED_CAPACITY, 5, [
			"a",
			"b",
		]);
		// 12 − 5 − 2 = 5 vs 20 − 5 − 2 = 13.
		expect(special.remaining).toBe(5);
		expect(recommended.remaining).toBe(13);
	});

	it("progressable 경계: rank가 정확히 progressableSlots면 진행 가능, +1이면 대기 1번", () => {
		// active 18, 추천 정원 20 → progressableSlots = 2.
		const queue = computeCapacityQueue(DEFAULT_RECOMMENDED_CAPACITY, 18, [
			"first",
			"second",
			"third",
		]);
		expect(queue.ranksByJobId.get("second")).toEqual({
			progressable: true,
			queuePosition: null,
			rank: 2,
		});
		expect(queue.ranksByJobId.get("third")).toEqual({
			progressable: false,
			queuePosition: 1,
			rank: 3,
		});
	});

	it("active가 정원 이상이면 progressableSlots는 0으로 바닥을 친다", () => {
		const queue = computeCapacityQueue(DEFAULT_SPECIAL_CAPACITY, 15, ["a"]);
		expect(queue.ranksByJobId.get("a")).toEqual({
			progressable: false,
			queuePosition: 1,
			rank: 1,
		});
		expect(queue.remaining).toBe(0);
	});
});

// 만석 메시지 — enum 원값이 아니라 사람이 읽는 라벨(스페셜 채용/추천 채용)과 정원을 담는다.
describe("listingCapacityFullMessage", () => {
	it("섹션 라벨과 정원 자릿수를 문구에 넣는다", () => {
		expect(listingCapacityFullMessage("special", 12)).toContain("스페셜 채용");
		expect(listingCapacityFullMessage("special", 12)).toContain("12자리");
		expect(listingCapacityFullMessage("recommended", 20)).toContain(
			"추천 채용"
		);
		expect(listingCapacityFullMessage("recommended", 20)).toContain("20자리");
	});
});
