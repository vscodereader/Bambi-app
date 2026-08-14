import { describe, expect, it } from "vitest";

import {
	isWithdrawnAccount,
	resolveVisibleDisplayName,
	WITHDRAWN_DISPLAY_NAME,
} from "@/services/bambi-withdrawn-display";

describe("resolveVisibleDisplayName", () => {
	it("탈퇴 계정은 원본 이름 대신 탈퇴 문구를 돌려준다", () => {
		expect(
			resolveVisibleDisplayName(
				{ deletedAt: new Date("2026-01-01T00:00:00Z"), name: "지민" },
				null
			)
		).toBe(WITHDRAWN_DISPLAY_NAME);
	});

	it("활성 계정은 원본 이름을 그대로 돌려준다", () => {
		expect(
			resolveVisibleDisplayName({ deletedAt: null, name: "지민" }, null)
		).toBe("지민");
	});

	it("이름이 없는 행은 호출부가 정한 fallback으로 떨어진다", () => {
		expect(
			resolveVisibleDisplayName({ deletedAt: null, name: null }, "비회원")
		).toBe("비회원");
	});

	it("행 자체가 없으면(leftJoin 미스) fallback으로 떨어진다", () => {
		expect(resolveVisibleDisplayName(undefined, "알 수 없는 사용자")).toBe(
			"알 수 없는 사용자"
		);
		expect(resolveVisibleDisplayName(null, null)).toBeNull();
	});

	it("탈퇴 계정은 이름이 비어 있어도 fallback이 아니라 탈퇴 문구다", () => {
		expect(
			resolveVisibleDisplayName(
				{ deletedAt: new Date("2026-01-01T00:00:00Z"), name: null },
				"비회원"
			)
		).toBe(WITHDRAWN_DISPLAY_NAME);
	});
});

describe("isWithdrawnAccount", () => {
	it("deletedAt 유무로만 판정한다", () => {
		expect(isWithdrawnAccount({ deletedAt: new Date() })).toBe(true);
		expect(isWithdrawnAccount({ deletedAt: null })).toBe(false);
		expect(isWithdrawnAccount(null)).toBe(false);
	});
});
