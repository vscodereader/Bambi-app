import { db } from "@bambi-app/db";
import { region as regionTable } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray } from "drizzle-orm";

// 지역 마스터 한 행의 읽기 모양. 화면·검증 어느 쪽도 sortOrder·isActive를 들고 다닐 일이
// 없어 세 칸만 뽑는다.
export interface RegionRow {
	code: string;
	label: string;
	sigungu: null | string;
}

// 공고·업소에 저장되는 지역 한 벌. 코드가 진실값이고 문자열 두 칸은 표시용 복사본이다.
export interface RegionSelection {
	district: null | string;
	districtCode: null | string;
	region: string;
	regionCode: string;
}

const REGION_SELECT = {
	code: regionTable.code,
	label: regionTable.label,
	sigungu: regionTable.sigungu,
} as const;

// 사용자가 보낸 지역 코드를 지역 마스터에 대조한다. 트러스트 바운더리다 — 코드는
// 클라이언트가 보내는 값이라 존재·활성 여부는 물론 **레벨과 소속까지** 여기서 확인해야
// 한다. 확인하지 않으면 "서울 + 해운대구"나 시/도 코드를 세부지역 자리에 넣은 조합이
// 그대로 저장되고, 코드 기준 목록 필터가 그 공고를 영영 못 찾는다.
export const resolveRegionSelection = async (input: {
	districtCode?: null | string;
	regionCode: string;
}): Promise<RegionSelection> => {
	const codes = input.districtCode
		? [input.regionCode, input.districtCode]
		: [input.regionCode];
	const rows = await db
		.select(REGION_SELECT)
		.from(regionTable)
		.where(
			and(inArray(regionTable.code, codes), eq(regionTable.isActive, true))
		);
	// sigungu가 null인 행만 시/도 자리에 올 수 있다.
	const regionRow = rows.find(
		(row) => row.code === input.regionCode && row.sigungu === null
	);

	if (!regionRow) {
		throw new ORPCError("BAD_REQUEST", {
			message: "지역을 다시 선택해 주세요.",
		});
	}

	if (!input.districtCode) {
		return {
			district: null,
			districtCode: null,
			region: regionRow.label,
			regionCode: regionRow.code,
		};
	}

	const districtRow = rows.find(
		(row) => row.code === input.districtCode && row.sigungu !== null
	);

	if (!districtRow || districtRow.label !== regionRow.label) {
		throw new ORPCError("BAD_REQUEST", {
			message: "세부지역을 다시 선택해 주세요.",
		});
	}

	return {
		district: districtRow.sigungu,
		districtCode: districtRow.code,
		region: regionRow.label,
		regionCode: regionRow.code,
	};
};

// 지역 선택이 필수가 아닌 자리(업소 프로필)용. 코드가 없으면 세 칸 모두 null이라 저장부가
// 분기 없이 그대로 펼칠 수 있다. district 문자열 칸이 없는 테이블이라 표시용 문자열은
// region 하나만 내려간다.
export const resolveOptionalRegion = async (input: {
	districtCode?: null | string;
	regionCode?: null | string;
}): Promise<{
	districtCode: null | string;
	region: null | string;
	regionCode: null | string;
}> => {
	if (!input.regionCode) {
		// 세부지역만 온 요청은 거른다 — 시/도 없이 저장하면 어느 시/도의 세부지역인지
		// 알 수 없는 행이 남는다.
		if (input.districtCode) {
			throw new ORPCError("BAD_REQUEST", {
				message: "지역을 먼저 선택해 주세요.",
			});
		}

		return { districtCode: null, region: null, regionCode: null };
	}

	const { district: _district, ...selection } = await resolveRegionSelection({
		districtCode: input.districtCode,
		regionCode: input.regionCode,
	});

	return selection;
};

// 자유 문자열 → 코드 해석용 색인. 크롤 수집과 백필이 같은 규칙을 써야 같은 원문이 경로에
// 따라 다른 코드로 굳지 않는다.
export interface RegionIndex {
	// 시/도 라벨 → 시/도 코드.
	byLabel: Map<string, string>;
	// `${라벨}|${시군구명}` → 시/군/구 코드. 같은 이름의 "중구"가 여러 시/도에 있어
	// 시군구명 단독으로는 키가 되지 않는다.
	bySigungu: Map<string, string>;
}

export const loadRegionIndex = async (): Promise<RegionIndex> => {
	const rows = await db.select(REGION_SELECT).from(regionTable);
	const index: RegionIndex = { byLabel: new Map(), bySigungu: new Map() };

	for (const row of rows) {
		if (row.sigungu === null) {
			index.byLabel.set(row.label, row.code);
		} else {
			index.bySigungu.set(`${row.label}|${row.sigungu}`, row.code);
		}
	}

	return index;
};

// 행정구역명이 아니라 상권명으로만 도는 자리. 원본 사이트가 이 이름으로 공고를 낸다.
const DISTRICT_ALIASES: Record<string, string> = {
	서면: "부산진구",
};

// 구 데이터·크롤 원문은 접미사를 떼고 쓴다("강남", "부천"). 원문 그대로 먼저 맞춰보고,
// 실패하면 접미사를 하나씩 붙여 다시 맞춘다.
const DISTRICT_SUFFIXES = ["", "구", "시", "군"] as const;

// 지역 문자열 한 벌을 코드로 해석한다. 맞는 코드가 없으면 null이다 — 매칭 실패로 행을
// 버리거나 막지 않는다(원문은 표시용으로 그대로 남는다).
export const matchRegionCodes = (
	index: RegionIndex,
	input: { district?: null | string; region?: null | string }
): { districtCode: null | string; regionCode: null | string } => {
	const label = input.region?.trim();
	const regionCode = (label ? index.byLabel.get(label) : null) ?? null;

	// 시/도를 못 찾으면 세부지역도 포기한다. 시/도 없이 "중구"만 보고 고르면 여섯 개
	// 후보 중 아무거나 박힌다.
	if (!(label && regionCode)) {
		return { districtCode: null, regionCode: null };
	}

	const raw = input.district?.trim();

	if (!raw) {
		return { districtCode: null, regionCode };
	}

	const name = DISTRICT_ALIASES[raw] ?? raw;

	for (const suffix of DISTRICT_SUFFIXES) {
		const districtCode = index.bySigungu.get(`${label}|${name}${suffix}`);

		if (districtCode) {
			return { districtCode, regionCode };
		}
	}

	return { districtCode: null, regionCode };
};
