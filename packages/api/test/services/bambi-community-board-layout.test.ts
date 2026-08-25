import { ORPCError } from "@orpc/server";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

dotenv.config({ path: "../../apps/server/.env" });
process.env.DATABASE_URL ||= "postgres://placeholder/community-layout";
process.env.BETTER_AUTH_SECRET ||= "community-layout-test-secret-32-chars-min";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
process.env.CORS_ORIGIN ||= "http://localhost:3001";

const { assertLayoutBoardsUnique } = await import(
	"@/routers/bambi/community-boards"
);

const codeOf = (rows: string[][]): string | undefined => {
	try {
		assertLayoutBoardsUnique(rows);
	} catch (error) {
		return error instanceof ORPCError ? error.code : "not-orpc-error";
	}
	return;
};

describe("게시판 화면별 배치", () => {
	it("공지사항·베스트글을 어느 행으로든 이동하거나 제거할 수 있다", () => {
		expect(
			codeOf([
				["free", "best"],
				["work_talk", "notice"],
			])
		).toBeUndefined();
		expect(codeOf([["free"], ["work_talk"]])).toBeUndefined();
	});

	it("한 표면 안에 같은 게시판을 두 번 넣으면 거부한다", () => {
		expect(codeOf([["notice", "free"], ["notice"]])).toBe("BAD_REQUEST");
	});
});
