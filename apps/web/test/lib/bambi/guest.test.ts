import {
	createGuestToken,
	GUEST_COOKIE_NAME,
} from "@bambi-app/api/services/bambi-guest-token";
import { describe, expect, it } from "vitest";
import {
	readGuestFromCookieString,
	readGuestGenderFromCookieString,
} from "@/lib/bambi/guest";

const SECRET = "test-secret-key-with-enough-length-123456";

describe("readGuestFromCookieString", () => {
	it("게스트 쿠키(토큰)가 있으면 true", async () => {
		const token = await createGuestToken({
			gender: "female",
			maxAgeSeconds: 3600,
			now: new Date(),
			secret: SECRET,
		});

		expect(readGuestFromCookieString(`${GUEST_COOKIE_NAME}=${token}`)).toBe(
			true
		);
	});

	it("없거나 값이 비면 false", () => {
		expect(readGuestFromCookieString("other=1")).toBe(false);
		expect(readGuestFromCookieString(`${GUEST_COOKIE_NAME}=`)).toBe(false);
		expect(readGuestFromCookieString("")).toBe(false);
	});
});

describe("readGuestGenderFromCookieString", () => {
	it("토큰 페이로드에서 성별을 읽는다", async () => {
		const token = await createGuestToken({
			gender: "male",
			maxAgeSeconds: 3600,
			now: new Date(),
			secret: SECRET,
		});

		expect(
			readGuestGenderFromCookieString(`${GUEST_COOKIE_NAME}=${token}; other=1`)
		).toBe("male");
	});

	it("구 평문 쿠키(1)·부재 시 null", () => {
		expect(
			readGuestGenderFromCookieString(`${GUEST_COOKIE_NAME}=1`)
		).toBeNull();
		expect(readGuestGenderFromCookieString("")).toBeNull();
	});
});
