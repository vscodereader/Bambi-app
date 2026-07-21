import { describe, expect, it } from "vitest";

const SHA256_HEX = /^[0-9a-f]{64}$/;

import {
	hashCi,
	isAdultBirth8,
	mapPortOneGender,
	toBirth8,
} from "./portone-identity";

describe("toBirth8", () => {
	it("포트원 birthDate(1995-01-01)를 YYYYMMDD로 바꾼다", () => {
		expect(toBirth8("1995-01-01")).toBe("19950101");
	});

	it("이미 8자리면 그대로 통과한다", () => {
		expect(toBirth8("19950101")).toBe("19950101");
	});

	it("자릿수가 어긋나면 null", () => {
		expect(toBirth8("1995-1-1")).toBeNull();
		expect(toBirth8(undefined)).toBeNull();
		expect(toBirth8("")).toBeNull();
	});
});

describe("isAdultBirth8 — 만 19세 경계(KST)", () => {
	// 2026-07-21 12:00 KST = 2026-07-21 03:00 UTC.
	const now = new Date("2026-07-21T03:00:00Z");

	it("19번째 생일 당일부터 성인이다", () => {
		expect(isAdultBirth8("20070721", now)).toBe(true);
	});

	it("생일이 하루라도 남았으면 미성년이다", () => {
		expect(isAdultBirth8("20070722", now)).toBe(false);
	});

	it("UTC로는 전날이어도 KST 날짜로 판정한다", () => {
		// 2026-07-20 23:00 UTC = 2026-07-21 08:00 KST → KST 기준 생일 당일.
		const utcEvening = new Date("2026-07-20T23:00:00Z");
		expect(isAdultBirth8("20070721", utcEvening)).toBe(true);
	});

	it("형식이 어긋난 생년월일은 성인이 아니다(안전 기본값)", () => {
		expect(isAdultBirth8("2007-07-21", now)).toBe(false);
		expect(isAdultBirth8("", now)).toBe(false);
	});
});

describe("mapPortOneGender", () => {
	it("MALE/FEMALE을 프로필 enum으로 바꾼다(대소문자 무관)", () => {
		expect(mapPortOneGender("MALE")).toBe("male");
		expect(mapPortOneGender("female")).toBe("female");
	});

	it("그 외 값·누락은 null", () => {
		expect(mapPortOneGender("OTHER")).toBeNull();
		expect(mapPortOneGender(undefined)).toBeNull();
	});
});

describe("hashCi", () => {
	it("64자리 hex를 결정적으로 만든다", async () => {
		const first = await hashCi("ci-sample-value");
		const second = await hashCi("ci-sample-value");
		expect(first).toBe(second);
		expect(first).toMatch(SHA256_HEX);
	});

	it("다른 CI는 다른 해시", async () => {
		expect(await hashCi("ci-a")).not.toBe(await hashCi("ci-b"));
	});
});
