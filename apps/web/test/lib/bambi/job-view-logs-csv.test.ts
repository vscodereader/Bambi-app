import { describe, expect, it } from "vitest";

import { buildJobViewLogsCsv } from "@/lib/bambi/job-view-logs-csv";

describe("buildJobViewLogsCsv", () => {
	it("BOM·헤더로 시작하고 구분 라벨·하이픈 복원·쉼표 따옴표를 적용한다", () => {
		const csv = buildJobViewLogsCsv([
			{
				businessName: "밤비 라운지",
				businessPhone: "01012345678",
				firstViewedAt: new Date(2026, 8, 1, 9, 5),
				jobTitle: "홀,서빙 구합니다",
				lastViewedAt: new Date(2026, 8, 11, 21, 30),
				source: "crawled",
				userEmail: "a@example.com",
				userName: "김밤비",
				userUsername: null,
				viewCount: 3,
			},
		]);

		expect(csv).toBe(
			"\uFEFF이름,로그인 아이디,이메일,업소명,구분,업소 연락처,공고 제목,조회 횟수,첫 조회,마지막 조회\r\n" +
				'김밤비,,a@example.com,밤비 라운지,수집 공고,010-1234-5678,"홀,서빙 구합니다",3,2026-09-01 09:05,2026-09-11 21:30\r\n'
		);
	});

	it("회원 업소는 source 원값 대신 한국어 라벨로 적는다", () => {
		const csv = buildJobViewLogsCsv([
			{
				businessName: "바니",
				businessPhone: null,
				firstViewedAt: new Date(2026, 0, 2, 3, 4),
				jobTitle: "주방",
				lastViewedAt: new Date(2026, 0, 2, 3, 4),
				source: "member",
				userEmail: "b@example.com",
				userName: "이밤비",
				userUsername: "bambi2",
				viewCount: 1,
			},
		]);

		expect(csv.split("\r\n")[1]).toBe(
			"이밤비,bambi2,b@example.com,바니,회원 업소,,주방,1,2026-01-02 03:04,2026-01-02 03:04"
		);
	});
});
