import {
	POINT_DRAW_PROBABILITY_PERCENT_DECIMAL_PLACES,
	POINT_DRAW_PROBABILITY_UNITS_PER_PERCENT,
	POINT_DRAW_TOTAL_PROBABILITY_UNITS,
} from "@bambi-app/db/point-draw-constants";

export const PROBABILITY_PERCENT_DECIMAL_PLACES =
	POINT_DRAW_PROBABILITY_PERCENT_DECIMAL_PLACES;
export const PROBABILITY_UNITS_PER_PERCENT =
	POINT_DRAW_PROBABILITY_UNITS_PER_PERCENT;
export const TOTAL_PROBABILITY_UNITS = POINT_DRAW_TOTAL_PROBABILITY_UNITS;

const PROBABILITY_PERCENT_PATTERN = new RegExp(
	`^\\d+(?:\\.\\d{0,${POINT_DRAW_PROBABILITY_PERCENT_DECIMAL_PLACES}})?$`
);
const TRAILING_ZERO_PATTERN = /0+$/;

export interface ConfiguredPrize {
	id: string;
	points: number;
	probabilityUnits: null | number;
}

export interface ResolvedPrize extends ConfiguredPrize {
	appliedProbabilityUnits: number;
}

export const parseProbabilityPercent = (value: string): null | number => {
	const normalized = value.trim();
	if (!PROBABILITY_PERCENT_PATTERN.test(normalized)) {
		return null;
	}
	const [wholePart, fractionPart = ""] = normalized.split(".");
	const whole = Number(wholePart);
	const fraction = Number(
		fractionPart.padEnd(POINT_DRAW_PROBABILITY_PERCENT_DECIMAL_PLACES, "0")
	);
	const units = whole * POINT_DRAW_PROBABILITY_UNITS_PER_PERCENT + fraction;
	return Number.isSafeInteger(units) ? units : null;
};

export const formatProbabilityPercent = (units: number): string => {
	if (!Number.isSafeInteger(units) || units < 0) {
		throw new Error("당첨 확률 값이 올바르지 않습니다.");
	}
	const whole = Math.floor(units / POINT_DRAW_PROBABILITY_UNITS_PER_PERCENT);
	const fraction = String(units % POINT_DRAW_PROBABILITY_UNITS_PER_PERCENT)
		.padStart(POINT_DRAW_PROBABILITY_PERCENT_DECIMAL_PLACES, "0")
		.replace(TRAILING_ZERO_PATTERN, "");
	return fraction ? `${whole}.${fraction}` : String(whole);
};

export const resolvePrizeProbabilities = <T extends ConfiguredPrize>(
	prizes: readonly T[]
): Array<T & ResolvedPrize> => {
	if (prizes.length === 0) {
		throw new Error("활성 당첨 설정이 없습니다.");
	}
	let fixedTotal = 0;
	let automaticCount = 0;
	for (const prize of prizes) {
		if (prize.probabilityUnits === null) {
			automaticCount += 1;
			continue;
		}
		if (
			!Number.isSafeInteger(prize.probabilityUnits) ||
			prize.probabilityUnits <= 0 ||
			prize.probabilityUnits > POINT_DRAW_TOTAL_PROBABILITY_UNITS
		) {
			throw new Error("직접 입력한 당첨 확률이 올바르지 않습니다.");
		}
		fixedTotal += prize.probabilityUnits;
	}

	const remaining = POINT_DRAW_TOTAL_PROBABILITY_UNITS - fixedTotal;
	if (automaticCount === 0) {
		if (remaining !== 0) {
			throw new Error("활성 당첨 확률의 합계는 100%여야 합니다.");
		}
		return prizes.map((prize) => ({
			...prize,
			appliedProbabilityUnits: prize.probabilityUnits as number,
		}));
	}
	if (remaining < automaticCount) {
		throw new Error("자동 계산할 수 있는 남은 당첨 확률이 부족합니다.");
	}

	const automaticShare = Math.floor(remaining / automaticCount);
	const automaticRemainder = remaining % automaticCount;
	let automaticIndex = 0;
	return prizes.map((prize) => {
		if (prize.probabilityUnits !== null) {
			return { ...prize, appliedProbabilityUnits: prize.probabilityUnits };
		}
		automaticIndex += 1;
		return {
			...prize,
			appliedProbabilityUnits:
				automaticShare +
				(automaticIndex === automaticCount ? automaticRemainder : 0),
		};
	});
};

export const selectProbabilityPrize = <T extends ResolvedPrize>(
	prizes: readonly T[],
	randomOffset: number
): T => {
	if (
		!Number.isInteger(randomOffset) ||
		randomOffset < 0 ||
		randomOffset >= POINT_DRAW_TOTAL_PROBABILITY_UNITS
	) {
		throw new Error("난수 범위가 올바르지 않습니다.");
	}
	let cursor = 0;
	for (const prize of prizes) {
		cursor += prize.appliedProbabilityUnits;
		if (randomOffset < cursor) {
			return prize;
		}
	}
	throw new Error("당첨 결과를 선택하지 못했습니다.");
};
