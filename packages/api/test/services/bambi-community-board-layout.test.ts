import { ORPCError } from "@orpc/server";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });
process.env.DATABASE_URL ||= "postgres://placeholder/community-layout";
process.env.BETTER_AUTH_SECRET ||= "community-layout-test-secret-32-chars-min";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
process.env.CORS_ORIGIN ||= "http://localhost:3001";

const { assertHomeLayoutFixedSlots } = await import(
	"@/routers/bambi/community-boards"
);

const codeOf = (rows: string[][]): string | undefined => {
	try {
		assertHomeLayoutFixedSlots(rows);
	} catch (error) {
		return error instanceof ORPCError ? error.code : "not-orpc-error";
	}
	return;
};

describe("수다방 홈 고정 슬롯", () => {
	it("1행 공지사항·2행 첫 칸 베스트글 배치를 허용한다", () => {
		expect(
			codeOf([
				["notice"],
				["best", "free", "work_talk"],
				["secret", "market", "legal"],
			])
		).toBeUndefined();
	});

	it("공지사항 전용 행을 바꾸거나 늘리면 거부한다", () => {
		expect(codeOf([["notice", "free"], ["best"]])).toBe("BAD_REQUEST");
		expect(codeOf([["free"], ["best"]])).toBe("BAD_REQUEST");
	});

	it("2행 첫 칸에서 베스트글을 제거하거나 이동하면 거부한다", () => {
		expect(codeOf([["notice"], ["free", "best"]])).toBe("BAD_REQUEST");
		expect(codeOf([["notice"], ["free"], ["best"]])).toBe("BAD_REQUEST");
	});
});
