export interface WeightedPrize {
	id: string;
	points: number;
	weight: number;
}

export function selectWeightedPrize<T extends WeightedPrize>(
	prizes: readonly T[],
	randomOffset: number
): T {
	if (prizes.length === 0) {
		throw new Error("활성 당첨 설정이 없습니다.");
	}
	const totalWeight = prizes.reduce((sum, prize) => {
		if (!Number.isSafeInteger(prize.weight) || prize.weight <= 0) {
			throw new Error("당첨 가중치는 양의 안전 정수여야 합니다.");
		}
		return sum + prize.weight;
	}, 0);
	if (!Number.isSafeInteger(totalWeight) || totalWeight <= 0) {
		throw new Error("당첨 가중치 합계가 올바르지 않습니다.");
	}
	if (
		!Number.isInteger(randomOffset) ||
		randomOffset < 0 ||
		randomOffset >= totalWeight
	) {
		throw new Error("난수 범위가 올바르지 않습니다.");
	}
	let cursor = 0;
	for (const prize of prizes) {
		cursor += prize.weight;
		if (randomOffset < cursor) {
			return prize;
		}
	}
	throw new Error("당첨 결과를 선택하지 못했습니다.");
}

export const sumPrizeWeights = (prizes: readonly WeightedPrize[]): number =>
	prizes.reduce((sum, prize) => sum + prize.weight, 0);
