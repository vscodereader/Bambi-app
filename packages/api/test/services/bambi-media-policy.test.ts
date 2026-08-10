import { describe, expect, it } from "vitest";

import { validateChatMediaUpload } from "@/services/bambi-media-policy";

describe("bambi media policy", () => {
	it("allows JPEG, PNG, and WebP images up to 10 MB", () => {
		expect(
			validateChatMediaUpload({
				byteSize: 10 * 1024 * 1024,
				fileName: "photo.jpg",
				mimeType: "image/jpeg",
			})
		).toEqual({ category: "image", ok: true });

		expect(
			validateChatMediaUpload({
				byteSize: 512_000,
				fileName: "capture.png",
				mimeType: "image/png",
			})
		).toEqual({ category: "image", ok: true });

		expect(
			validateChatMediaUpload({
				byteSize: 512_000,
				fileName: "preview.webp",
				mimeType: "image/webp",
			})
		).toEqual({ category: "image", ok: true });
	});

	it("allows PDF files up to 10 MB", () => {
		expect(
			validateChatMediaUpload({
				byteSize: 10 * 1024 * 1024,
				fileName: "contract.pdf",
				mimeType: "application/pdf",
			})
		).toEqual({ category: "pdf", ok: true });
	});

	it("rejects oversized images", () => {
		expect(
			validateChatMediaUpload({
				byteSize: 10 * 1024 * 1024 + 1,
				fileName: "large.jpg",
				mimeType: "image/jpeg",
			})
		).toEqual({
			code: "file_too_large",
			maxBytes: 10 * 1024 * 1024,
			ok: false,
		});
	});

	it("rejects executable MIME types", () => {
		expect(
			validateChatMediaUpload({
				byteSize: 128_000,
				fileName: "installer.exe",
				mimeType: "application/x-msdownload",
			})
		).toEqual({ code: "unsupported_type", ok: false });
	});

	it("rejects empty filenames", () => {
		expect(
			validateChatMediaUpload({
				byteSize: 128_000,
				fileName: "   ",
				mimeType: "application/pdf",
			})
		).toEqual({ code: "empty_file_name", ok: false });
	});
});
