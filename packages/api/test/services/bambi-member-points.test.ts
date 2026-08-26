import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// 모듈이 @bambi-app/db를 정적 import하므로 env 먼저 로드(다른 서비스 테스트와 동일 패턴).
dotenv.config({ path: "../../apps/server/.env" });

const {
	applyPointsCap,
	assertGradeDeletable,
	isPointsCapAllowed,
	nextGrade,
	reconcilePoints,
	resolveCommentAward,
	resolveGrade,
	rollCommentBonus,
} = await import("@/services/bambi-member-points");

// 순차 random 스텁: rollCommentBonus는 최대 두 번(확률 판정→금액) 부른다. 값이 떨어지면 마지막 값을 반복.
function seq(...values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

const BONUS_ON = {
	enabled: true,
	chancePercent: 10,
	minPoints: 5,
	maxPoints: 50,
};

const GRADES = [
	{ id: "g0", name: "새싹", minPoints: 0, color: null },
	{ id: "g1", name: "일반", minPoints: 1000, color: null },
	{ id: "g2", name: "우수회원", minPoints: 5000, color: null },
];

describe("reconcilePoints", () => {
	it("작성: 0에서 목표 N으로 가면 +N 적립하고 스냅샷 N", () => {
		expect(reconcilePoints(0, 100)).toEqual({ delta: 100, nextAwarded: 100 });
	});
	it("삭제/숨김: 목표 0이면 −현재 회수하고 스냅샷 0", () => {
		expect(reconcilePoints(100, 0)).toEqual({ delta: -100, nextAwarded: 0 });
	});
	it("복구: 0에서 다시 N이면 재적립", () => {
		expect(reconcilePoints(0, 50)).toEqual({ delta: 50, nextAwarded: 50 });
	});
	it("이미 적립됨(목표=현재): 델타 0(중복 지급 없음)", () => {
		expect(reconcilePoints(100, 100)).toEqual({ delta: 0, nextAwarded: 100 });
	});
	it("음수 목표는 0으로 클램프", () => {
		expect(reconcilePoints(0, -5)).toEqual({ delta: 0, nextAwarded: 0 });
	});
});

describe("resolveGrade", () => {
	it("경계값 정확히 min_points면 그 등급", () => {
		expect(resolveGrade(1000, GRADES)?.name).toBe("일반");
	});
	it("구간 안이면 하위 등급 유지", () => {
		expect(resolveGrade(999, GRADES)?.name).toBe("새싹");
		expect(resolveGrade(4999, GRADES)?.name).toBe("일반");
	});
	it("최고 등급 초과면 최고 등급", () => {
		expect(resolveGrade(999_999, GRADES)?.name).toBe("우수회원");
	});
	it("음수 잔액은 기본(0) 등급으로 클램프", () => {
		expect(resolveGrade(-10, GRADES)?.name).toBe("새싹");
	});
	it("등급이 없으면 null", () => {
		expect(resolveGrade(100, [])).toBeNull();
	});
});

describe("nextGrade", () => {
	it("현재 잔액보다 큰 첫 등급을 돌려준다", () => {
		expect(nextGrade(500, GRADES)?.name).toBe("일반");
	});
	it("최고 등급이면 null(다음 없음)", () => {
		expect(nextGrade(6000, GRADES)).toBeNull();
	});
});

describe("assertGradeDeletable", () => {
	it("마지막 min_points=0 기본 등급은 삭제 불가", () => {
		expect(assertGradeDeletable({ minPoints: 0 }, 1)).toBe(false);
	});
	it("0 등급이라도 다른 0 등급이 또 있으면 삭제 가능", () => {
		expect(assertGradeDeletable({ minPoints: 0 }, 2)).toBe(true);
	});
	it("0이 아닌 등급은 언제나 삭제 가능", () => {
		expect(assertGradeDeletable({ minPoints: 1000 }, 1)).toBe(true);
	});
});

describe("applyPointsCap", () => {
	it("상한 없음(null)이면 델타 그대로", () => {
		expect(applyPointsCap(100, 900, null)).toBe(100);
	});
	it("회수(델타 ≤ 0)는 상한과 무관하게 그대로", () => {
		expect(applyPointsCap(-100, 5000, 1000)).toBe(-100);
	});
	it("여유가 충분하면 델타 그대로", () => {
		expect(applyPointsCap(100, 800, 1000)).toBe(100);
	});
	it("여유가 부족하면 남은 만큼만 잘라 적립", () => {
		expect(applyPointsCap(100, 950, 1000)).toBe(50);
	});
	it("이미 상한에 도달했으면 0(적립 없음)", () => {
		expect(applyPointsCap(100, 1000, 1000)).toBe(0);
	});
	it("이미 상한을 넘었어도 음수로 만들지 않는다", () => {
		expect(applyPointsCap(100, 1200, 1000)).toBe(0);
	});
});

describe("isPointsCapAllowed", () => {
	it("상한 없음(null)은 항상 허용", () => {
		expect(isPointsCapAllowed(null, 50_000)).toBe(true);
	});
	it("최고 등급 기준 이상이면 허용", () => {
		expect(isPointsCapAllowed(50_000, 50_000)).toBe(true);
		expect(isPointsCapAllowed(60_000, 50_000)).toBe(true);
	});
	it("최고 등급 기준보다 낮으면 거부", () => {
		expect(isPointsCapAllowed(49_999, 50_000)).toBe(false);
	});
	it("등급이 없어(최고 기준 0) 어떤 상한도 허용", () => {
		expect(isPointsCapAllowed(0, 0)).toBe(true);
	});
});

describe("resolveCommentAward", () => {
	it("타인 글에 회원이 단 댓글: 게시판 댓글 포인트 적립", () => {
		expect(resolveCommentAward("u1", "u2", 50)).toBe(50);
	});
	it("자기 글에 자기가 단 댓글: 0(셀프 적립 방지)", () => {
		expect(resolveCommentAward("u1", "u1", 50)).toBe(0);
	});
	it("게스트 댓글(userId null): 0", () => {
		expect(resolveCommentAward(null, "u2", 50)).toBe(0);
	});
	it("글 작성자 없음(수집 글 등 null): 회원 댓글은 포인트 적립", () => {
		expect(resolveCommentAward("u1", null, 50)).toBe(50);
	});
	it("게시판 댓글 포인트가 0이면 0", () => {
		expect(resolveCommentAward("u1", "u2", 0)).toBe(0);
	});
});

describe("rollCommentBonus", () => {
	it("비활성이면 당첨 random이라도 0", () => {
		expect(rollCommentBonus({ ...BONUS_ON, enabled: false }, 50, seq(0))).toBe(
			0
		);
	});
	it("기본 적립 0 이하(게스트·셀프)면 0", () => {
		expect(rollCommentBonus(BONUS_ON, 0, seq(0))).toBe(0);
	});
	it("확률 0 이하면 0", () => {
		expect(
			rollCommentBonus({ ...BONUS_ON, chancePercent: 0 }, 50, seq(0))
		).toBe(0);
	});
	it("꽝: random*100이 확률 이상이면 0(경계 =확률도 꽝)", () => {
		// 확률 10 → 0.10*100=10 >= 10 → 꽝
		expect(rollCommentBonus(BONUS_ON, 50, seq(0.1))).toBe(0);
	});
	it("당첨 경계: random*100 < 확률이면 지급 구간 정수", () => {
		// 확률 10 → 0.099*100=9.9 < 10 → 당첨
		const bonus = rollCommentBonus(BONUS_ON, 50, seq(0.099, 0));
		expect(bonus).toBe(5); // 금액 random 0 → min
	});
	it("금액 random이 상한 근처면 max까지(floor로 초과 안 함)", () => {
		const bonus = rollCommentBonus(BONUS_ON, 50, seq(0, 0.999_999));
		expect(bonus).toBe(50);
	});
	it("min==max면 그 값 고정", () => {
		const bonus = rollCommentBonus(
			{ enabled: true, chancePercent: 100, minPoints: 20, maxPoints: 20 },
			50,
			seq(0, 0.5)
		);
		expect(bonus).toBe(20);
	});
	it("min>max 방어: max를 min으로 끌어올려 역구간 방지", () => {
		const bonus = rollCommentBonus(
			{ enabled: true, chancePercent: 100, minPoints: 50, maxPoints: 5 },
			50,
			seq(0, 0.999)
		);
		expect(bonus).toBe(50);
	});
	it("음수 방어: min 음수는 0으로 클램프", () => {
		const bonus = rollCommentBonus(
			{ enabled: true, chancePercent: 100, minPoints: -10, maxPoints: 0 },
			50,
			seq(0, 0)
		);
		expect(bonus).toBe(0);
	});
	it("항상 정수이고 [min,max] 범위 안", () => {
		for (let r = 0; r < 1; r += 0.017) {
			const bonus = rollCommentBonus(BONUS_ON, 50, seq(0, r));
			expect(Number.isInteger(bonus)).toBe(true);
			expect(bonus).toBeGreaterThanOrEqual(5);
			expect(bonus).toBeLessThanOrEqual(50);
		}
	});
});
