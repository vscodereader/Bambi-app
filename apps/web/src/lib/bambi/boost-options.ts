// 공고 끌어올리기 옵션의 화면 표시용 순수 라벨·포매터. DB enum(job_boost_option_type)
// 원값이 그대로 렌더되지 않도록 라벨 맵을 거친다. 가격 표기는 소비처에서
// formatAdPrice(@/lib/bambi/ad-catalog)를 쓰므로 여기선 스펙 요약만 만든다.

export type JobBoostOptionTypeKey =
	| "auto_period"
	| "manual_count"
	| "manual_period";

export const JOB_BOOST_OPTION_TYPE_LABELS: Record<
	JobBoostOptionTypeKey,
	string
> = {
	auto_period: "자동 끌어올리기",
	manual_count: "끌어올리기 횟수권",
	manual_period: "끌어올리기",
};

/**
 * 옵션 스펙 한 줄 요약. 기간제(manual_period·auto_period)는 "하루 2회 · 30일",
 * 횟수권(manual_count)은 "10회 충전". 스냅샷/카탈로그에 아직 값이 안 채워진(null)
 * 항목은 빼고 남은 것만 이어붙인다(재료가 하나도 없으면 빈 문자열).
 */
export function formatBoostOptionSpec(option: {
	boostCount: null | number;
	boostsPerDay: null | number;
	durationDays: null | number;
	optionType: JobBoostOptionTypeKey;
}): string {
	if (option.optionType === "manual_count") {
		return option.boostCount === null ? "" : `${option.boostCount}회 충전`;
	}

	const parts: string[] = [];
	if (option.boostsPerDay !== null) {
		parts.push(`하루 ${option.boostsPerDay}회`);
	}
	if (option.durationDays !== null) {
		parts.push(`${option.durationDays}일`);
	}
	return parts.join(" · ");
}
