import { describe, expect, it } from "vitest";
import {
	detectImageSignature,
	isPdfSignature,
	isSignatureMismatch,
} from "./image-signature";

const blobFromBytes = (bytes: number[]): Blob =>
	new Blob([new Uint8Array(bytes)]);

// RIFF....WEBP: 0-3 "RIFF", 4-7 size(임의), 8-11 "WEBP"
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0];

describe("detectImageSignature", () => {
	it("PNG 매직넘버를 image/png로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(PNG))).toBe("image/png");
	});
	it("JPEG 매직넘버를 image/jpeg로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(JPEG))).toBe("image/jpeg");
	});
	it("WebP(RIFF..WEBP)를 image/webp로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(WEBP))).toBe("image/webp");
	});
	it("GIF8을 image/gif로 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes(GIF))).toBe("image/gif");
	});
	it("정체불명 바이트는 null을 반환한다", async () => {
		expect(await detectImageSignature(blobFromBytes([1, 2, 3, 4]))).toBeNull();
	});
	it("12바이트 미만이어도 안전하게 판정한다", async () => {
		expect(await detectImageSignature(blobFromBytes([0xff, 0xd8, 0xff]))).toBe(
			"image/jpeg"
		);
	});
});

describe("isPdfSignature", () => {
	it("%PDF- 로 시작하면 true", async () => {
		// "%PDF-1.7"
		expect(
			await isPdfSignature(
				blobFromBytes([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
			)
		).toBe(true);
	});
	it("확장자만 pdf인 다른 파일(JPEG 바이트)은 false", async () => {
		expect(await isPdfSignature(blobFromBytes(JPEG))).toBe(false);
	});
	it("5바이트 미만이어도 안전하게 false", async () => {
		expect(await isPdfSignature(blobFromBytes([0x25, 0x50]))).toBe(false);
	});
});

describe("isSignatureMismatch", () => {
	it("선언 mime과 실제가 일치하면 false", () => {
		expect(isSignatureMismatch("image/png", "image/png")).toBe(false);
	});
	it("png 선언인데 실제 jpeg면 true", () => {
		expect(isSignatureMismatch("image/png", "image/jpeg")).toBe(true);
	});
	it("판정 불가(null)면 true", () => {
		expect(isSignatureMismatch("image/png", null)).toBe(true);
	});
});
