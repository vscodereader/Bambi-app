// 운영자 크롤러 화면의 영업 리드 CSV 내보내기(외부 전달용) 순수 변환.
// Excel 더블클릭 호환이 목표라 BOM(한글 인코딩 인식)·CRLF를 쓰고, 하이픈 없는
// 전화번호는 하이픈 형식으로 되돌린다 — 숫자만 있는 셀은 Excel이 수치로 읽어
// 앞자리 0을 지우기 때문이다.

export interface CrawledLeadRow {
	contactPhone: string | null;
	district: string | null;
	industryCategory: string | null;
	industryRaw: string | null;
	region: string | null;
	shopName: string | null;
}

const HEADER = ["업소명", "전화번호", "지역", "업종"] as const;
const DIGITS_ONLY = /^\d+$/;
const NEEDS_CSV_QUOTING = /[",\n\r]/;

// 국내 번호 자리수별 하이픈 위치. 서울(02)만 지역번호가 2자리다. 어느 패턴에도
// 안 맞는 자리수는 판단하지 않고 그대로 둔다.
const formatDigitsOnlyPhone = (digits: string): string => {
	if (digits.startsWith("02")) {
		if (digits.length === 10) {
			return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
		}
		if (digits.length === 9) {
			return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
		}
		return digits;
	}
	if (digits.length === 11) {
		return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
	}
	if (digits.length === 10) {
		return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
	}
	// 1588-xxxx류 전국 대표번호
	if (digits.length === 8) {
		return `${digits.slice(0, 4)}-${digits.slice(4)}`;
	}
	return digits;
};

const normalizePhone = (phone: string | null): string => {
	const trimmed = phone?.trim() ?? "";
	return DIGITS_ONLY.test(trimmed) ? formatDigitsOnlyPhone(trimmed) : trimmed;
};

const escapeCsvField = (value: string): string =>
	NEEDS_CSV_QUOTING.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export const buildCrawledLeadsCsv = (
	rows: readonly CrawledLeadRow[]
): string => {
	const lines = [
		HEADER.join(","),
		...rows.map((row) =>
			[
				row.shopName ?? "",
				normalizePhone(row.contactPhone),
				// 지역은 화면 표기와 같은 규칙: 시·도와 구·군을 공백으로 잇고 빈 값은 뺀다.
				[row.region, row.district].filter(Boolean).join(" "),
				// 업종 enum 값이 곧 한국어 라벨. 미분류(needs_review)는 원본 직종 문구로 폴백.
				row.industryCategory ?? row.industryRaw ?? "",
			]
				.map(escapeCsvField)
				.join(",")
		),
	];

	return `\uFEFF${lines.join("\r\n")}\r\n`;
};
