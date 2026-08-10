import { describe, expect, it } from "vitest";

import {
	hashCommunityPassword,
	verifyCommunityPassword,
} from "@/services/bambi-community-password";

describe("community password hashing", () => {
	it("해시는 salt:hash 형태이고 원문과 다르다", () => {
		const stored = hashCommunityPassword("pw1234");
		expect(stored).toContain(":");
		expect(stored).not.toContain("pw1234");
	});

	it("같은 비밀번호는 검증에 성공하고 다른 비밀번호·손상된 저장값은 실패한다", () => {
		const stored = hashCommunityPassword("pw1234");
		expect(verifyCommunityPassword("pw1234", stored)).toBe(true);
		expect(verifyCommunityPassword("wrong!", stored)).toBe(false);
		expect(verifyCommunityPassword("pw1234", "broken")).toBe(false);
	});

	it("같은 비밀번호라도 salt가 달라 저장값이 매번 다르다", () => {
		expect(hashCommunityPassword("pw1234")).not.toBe(
			hashCommunityPassword("pw1234")
		);
	});
});
