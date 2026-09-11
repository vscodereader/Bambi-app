import { describe, expect, it } from "vitest";
import {
	bytesToBase64,
	dataUrlToBytes,
	safeFileName,
} from "@/src/lib/managed-file-policy";

describe("managed file helpers", () => {
	it("파일 시스템 예약 문자를 치환하고 빈 이름은 기본값을 쓴다", () => {
		expect(safeFileName("a/b:c?.pdf")).toBe("a_b_c_.pdf");
		expect(safeFileName("  ")).toBe("download");
	});
	it("바이트를 base64로 바꾼다", () => {
		expect(bytesToBase64(new Uint8Array([0x41, 0x42, 0x43]))).toBe("QUJD");
	});
	it("base64 이미지 data URL을 fetch 없이 바이트로 복원한다", () => {
		const bytes = Uint8Array.from([0, 1, 127, 128, 255]);
		expect(
			dataUrlToBytes(`data:image/png;base64,${bytesToBase64(bytes)}`)
		).toEqual(bytes);
		expect(dataUrlToBytes("https://example.com/image.png")).toBeNull();
	});
});
