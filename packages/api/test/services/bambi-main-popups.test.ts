import { describe, expect, it } from "vitest";
import {
	hasPopupContent,
	isInternalPopupPath,
	isPopupScheduledNow,
	normalizePopupLink,
} from "@/services/bambi-main-popups";

describe("main popup policy", () => {
	it("accepts only application-internal paths", () => {
		expect(isInternalPopupPath("/seeker/jobs/1?from=popup")).toBe(true);
		expect(isInternalPopupPath("https://example.com")).toBe(false);
		expect(isInternalPopupPath("//example.com/path")).toBe(false);
		expect(isInternalPopupPath("/\\example.com")).toBe(false);
	});

	it("normalizes deployed and localhost URLs to the same internal path", () => {
		expect(
			normalizePopupLink(
				"http://localhost:23001/seeker/community/notice/post-1?from=popup#top"
			)
		).toBe("/seeker/community/notice/post-1?from=popup#top");
		expect(
			normalizePopupLink(
				"https://www.bambialba.com/seeker/community/notice/post-2"
			)
		).toBe("/seeker/community/notice/post-2");
		expect(
			normalizePopupLink("https://test.bambialba.com/seeker/community/free")
		).toBe("/seeker/community/free");
		expect(
			normalizePopupLink("https://preview.qa.bambialba.com/employer")
		).toBe("/employer");
		expect(() => normalizePopupLink("https://example.com/seeker")).toThrow(
			"localhost 또는 bambialba.com 내부 주소"
		);
		expect(() =>
			normalizePopupLink("https://bambialba.com.evil.test/seeker")
		).toThrow("localhost 또는 bambialba.com 내부 주소");
	});

	it("uses an inclusive start and exclusive end", () => {
		const now = new Date("2026-08-05T03:00:00.000Z");
		expect(isPopupScheduledNow(now, null, now)).toBe(true);
		expect(isPopupScheduledNow(null, now, now)).toBe(false);
		expect(
			isPopupScheduledNow(
				new Date("2026-08-05T02:59:00.000Z"),
				new Date("2026-08-05T03:01:00.000Z"),
				now
			)
		).toBe(true);
	});

	it("does not expose empty popup content", () => {
		expect(
			hasPopupContent({
				contentType: "image",
				editedImage: null,
				textDocument: null,
			})
		).toBe(false);
		expect(
			hasPopupContent({
				contentType: "text",
				editedImage: null,
				textDocument: { content: [{ type: "paragraph" }], type: "doc" },
			})
		).toBe(false);
	});
});
