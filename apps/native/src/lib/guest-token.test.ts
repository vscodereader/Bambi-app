import { describe, expect, it } from "vitest";

import {
	type GuestVisitor,
	isCommunityGuest,
	resolveGuestVisitor,
} from "./guest-token";

const B64_PLUS = /\+/g;
const B64_SLASH = /\//g;
const B64_PADDING = /=+$/;

// 서버가 발급하는 "payloadB64url.sigB64url" 포맷을 흉내낸다. 서명은 검증하지 않으므로
// 서명부는 아무 값이나 붙인다.
const makeToken = (payload: Record<string, unknown>): string => {
	const b64url = Buffer.from(JSON.stringify(payload))
		.toString("base64")
		.replace(B64_PLUS, "-")
		.replace(B64_SLASH, "_")
		.replace(B64_PADDING, "");
	return `${b64url}.signature`;
};

const NOW = new Date("2026-09-02T00:00:00Z");
const FUTURE = Math.floor(NOW.getTime() / 1000) + 3600;
const PAST = Math.floor(NOW.getTime() / 1000) - 1;

describe("resolveGuestVisitor", () => {
	it("유효 토큰의 성별·gid를 읽는다", () => {
		const token = makeToken({
			exp: FUTURE,
			gender: "female",
			gid: "g-1",
			v: 2,
		});
		expect(resolveGuestVisitor(token, NOW)).toEqual({
			gender: "female",
			gid: "g-1",
			token,
		});
	});

	it("만료된 토큰은 null이다", () => {
		const token = makeToken({ exp: PAST, gender: "female", gid: "g-1", v: 2 });
		expect(resolveGuestVisitor(token, NOW)).toBeNull();
	});

	it("깨진 문자열은 null이다", () => {
		expect(resolveGuestVisitor("not-a-token", NOW)).toBeNull();
		expect(resolveGuestVisitor(null, NOW)).toBeNull();
		expect(resolveGuestVisitor("!!!.sig", NOW)).toBeNull();
	});

	it("gid 없는 v1 토큰은 gid가 null이다", () => {
		const token = makeToken({ exp: FUTURE, gender: "male", v: 1 });
		expect(resolveGuestVisitor(token, NOW)).toEqual({
			gender: "male",
			gid: null,
			token,
		});
	});
});

describe("isCommunityGuest", () => {
	const withGid = (gender: GuestVisitor["gender"]): GuestVisitor => ({
		gender,
		gid: "g-1",
		token: "t",
	});

	it("여성 + gid면 커뮤니티 게스트다", () => {
		expect(isCommunityGuest(withGid("female"))).toBe(true);
	});

	it("남성이면 gid가 있어도 아니다", () => {
		expect(isCommunityGuest(withGid("male"))).toBe(false);
	});

	it("gid가 없으면 아니다", () => {
		expect(isCommunityGuest({ gender: "female", gid: null, token: "t" })).toBe(
			false
		);
		expect(isCommunityGuest(null)).toBe(false);
	});
});
