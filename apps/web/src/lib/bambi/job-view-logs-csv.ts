// 운영자 사용자 관리 화면의 공고 조회 로그 CSV(업소 아웃바운드 자료용) 순수 변환.
// BOM·CRLF·전화번호 하이픈 복원 규칙은 크롤링 리드 CSV와 같아 헬퍼를 그대로 쓴다.

import { escapeCsvField, normalizePhone } from "./crawled-leads-csv";

export interface JobViewLogCsvRow {
	businessName: string;
	businessPhone: null | string;
	firstViewedAt: Date;
	jobTitle: string;
	lastViewedAt: Date;
	source: string;
	userEmail: string;
	userName: string;
	userUsername: null | string;
	viewCount: number;
}

const HEADER = [
	"이름",
	"로그인 아이디",
	"이메일",
	"업소명",
	"구분",
	"업소 연락처",
	"공고 제목",
	"조회 횟수",
	"첫 조회",
	"마지막 조회",
] as const;

const pad2 = (value: number): string => String(value).padStart(2, "0");

// 운영자가 보는 시각 = 브라우저 로컬 시각. 초는 영업 판단에 쓸모가 없어 분까지만 적는다.
const formatDateTime = (value: Date): string =>
	`${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}`;

export const buildJobViewLogsCsv = (
	rows: readonly JobViewLogCsvRow[]
): string => {
	const lines = [
		HEADER.join(","),
		...rows.map((row) =>
			[
				row.userName,
				row.userUsername ?? "",
				row.userEmail,
				row.businessName,
				// source enum 원값은 노출하지 않는다.
				row.source === "crawled" ? "수집 공고" : "회원 업소",
				normalizePhone(row.businessPhone),
				row.jobTitle,
				String(row.viewCount),
				formatDateTime(row.firstViewedAt),
				formatDateTime(row.lastViewedAt),
			]
				.map(escapeCsvField)
				.join(",")
		),
	];

	return `\uFEFF${lines.join("\r\n")}\r\n`;
};
