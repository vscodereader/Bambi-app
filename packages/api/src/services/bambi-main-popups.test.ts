import { describe, expect, it } from "vitest";
import {
	hasPopupContent,
	isInternalPopupPath,
	isPopupScheduledNow,
} from "./bambi-main-popups";

describe("main popup policy", () => {
	it("accepts only application-internal paths", () => {
		expect(isInternalPopupPath("/seeker/jobs/1?from=popup")).toBe(true);
		expect(isInternalPopupPath("https://example.com")).toBe(false);
		expect(isInternalPopupPath("//example.com/path")).toBe(false);
		expect(isInternalPopupPath("/\\example.com")).toBe(false);
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
