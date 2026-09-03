import { describe, expect, it } from "vitest";

import {
	isImageMimeType,
	toPickedAttachment,
	validatePickedAttachment,
} from "@/src/lib/chat/chat-attachment-picker";

describe("toPickedAttachment", () => {
	it("피커 결과의 빈 필드를 폴백으로 채운다", () => {
		expect(
			toPickedAttachment(
				{ fileName: null, mimeType: null, size: 1234, uri: "file:///a/b.jpg" },
				"image/jpeg"
			)
		).toEqual({
			byteSize: 1234,
			fileName: "b.jpg",
			mimeType: "image/jpeg",
			uri: "file:///a/b.jpg",
		});
	});

	it("size가 없으면 0으로 두고 호출부가 blob 크기로 덮는다", () => {
		expect(
			toPickedAttachment({ uri: "file:///x.pdf" }, "application/pdf").byteSize
		).toBe(0);
	});
});

describe("validatePickedAttachment", () => {
	it("허용 mime·크기면 ok", () => {
		expect(
			validatePickedAttachment({
				byteSize: 10,
				fileName: "a.png",
				mimeType: "image/png",
				uri: "u",
			})
		).toEqual({ ok: true });
	});

	it("10MB 초과는 안내 문구", () => {
		expect(
			validatePickedAttachment({
				byteSize: 10 * 1024 * 1024 + 1,
				fileName: "a.png",
				mimeType: "image/png",
				uri: "u",
			})
		).toEqual({ message: "10MB 이하 파일만 보낼 수 있어요.", ok: false });
	});

	it("gif는 거절", () => {
		expect(
			validatePickedAttachment({
				byteSize: 10,
				fileName: "a.gif",
				mimeType: "image/gif",
				uri: "u",
			})
		).toEqual({
			message: "JPG·PNG·WebP 이미지 또는 PDF만 보낼 수 있어요.",
			ok: false,
		});
	});
});

describe("isImageMimeType", () => {
	it("image/* 만 true", () => {
		expect(isImageMimeType("image/webp")).toBe(true);
		expect(isImageMimeType("application/pdf")).toBe(false);
	});
});
