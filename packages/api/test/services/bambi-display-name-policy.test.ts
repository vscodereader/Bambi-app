import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/bambi-banned-words", () => ({
	getActiveBannedWords: vi.fn(() =>
		Promise.resolve([
			{ normalizedTerm: "admin", term: "Admin" },
			{ normalizedTerm: "관리자", term: "관리자" },
		])
	),
}));

import { assertDisplayNameAllowed } from "@/services/bambi-display-name-policy";

describe("bambi display name policy", () => {
	it("일반 회원의 예약어와 공백·기호 우회를 차단한다", async () => {
		for (const value of ["Admin", "myADMIN", "A d-m_i.n", "관 리-자"]) {
			await expect(
				assertDisplayNameAllowed(value, { isAdmin: false })
			).rejects.toBeInstanceOf(ORPCError);
		}
	});

	it("운영자는 예약어를 사용할 수 있다", async () => {
		await expect(
			assertDisplayNameAllowed("밤비 관리자", { isAdmin: true })
		).resolves.toBeUndefined();
	});

	it("일반 회원의 정상 이름은 허용한다", async () => {
		await expect(
			assertDisplayNameAllowed("ㅇㅇ", { isAdmin: false })
		).resolves.toBeUndefined();
	});
});
