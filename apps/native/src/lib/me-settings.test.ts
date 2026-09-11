import { describe, expect, it } from "vitest";

import {
	formatBirthDate8,
	formatPhoneNumber,
	genderLabel,
	PROFILE_IMAGE_MAX_BYTES,
	resolveProfileImageUpload,
	validateDisplayName,
} from "./me-settings";

describe("genderLabel", () => {
	it("성별 enum을 한국어 라벨로 옮긴다", () => {
		expect(genderLabel("male")).toBe("남성");
		expect(genderLabel("female")).toBe("여성");
	});

	it("인증 전 계정(null)은 미설정으로 떨어진다", () => {
		expect(genderLabel(null)).toBe("미설정");
		expect(genderLabel(undefined)).toBe("미설정");
	});
});

describe("formatBirthDate8", () => {
	it("YYYYMMDD 8자리를 점 표기로 옮긴다", () => {
		expect(formatBirthDate8("19900102")).toBe("1990.01.02");
	});

	it("자릿수·형식이 어긋나거나 없으면 미입력이다", () => {
		expect(formatBirthDate8("1990010")).toBe("미입력");
		expect(formatBirthDate8("1990-01-02")).toBe("미입력");
		expect(formatBirthDate8(null)).toBe("미입력");
	});
});

describe("formatPhoneNumber", () => {
	it("휴대폰 11자리에 하이픈을 넣는다", () => {
		expect(formatPhoneNumber("01012345678")).toBe("010-1234-5678");
	});

	it("서울 10자리는 국번을 4자리로 끊는다", () => {
		expect(formatPhoneNumber("0212345678")).toBe("02-1234-5678");
	});

	it("그 외 10자리는 3-3-4로 끊는다", () => {
		expect(formatPhoneNumber("0311234567")).toBe("031-123-4567");
	});

	it("숫자가 아닌 자유 입력 연락처는 원문 그대로 둔다", () => {
		expect(formatPhoneNumber("kakao_id")).toBe("kakao_id");
		expect(formatPhoneNumber("+821012345678")).toBe("+821012345678");
	});
});

describe("validateDisplayName", () => {
	it("저장할 수 있으면 null이다", () => {
		expect(validateDisplayName("밤비", "구직자")).toBeNull();
	});

	it("트림 후 2자 미만이면 막는다", () => {
		expect(validateDisplayName("밤", "구직자")).toBe("2자 이상 입력해 주세요.");
		expect(validateDisplayName("   ", "구직자")).toBe(
			"2자 이상 입력해 주세요."
		);
	});

	it("트림 후 80자를 넘으면 막는다", () => {
		expect(validateDisplayName("가".repeat(80), "구직자")).toBeNull();
		expect(validateDisplayName("가".repeat(81), "구직자")).toBe(
			"80자까지 입력할 수 있어요."
		);
	});

	it("공백만 다른 기존 이름은 같은 값으로 본다", () => {
		expect(validateDisplayName("  밤비  ", "밤비")).toBe("기존 이름과 같아요.");
	});
});

describe("resolveProfileImageUpload", () => {
	it("화이트리스트 MIME은 그대로 통과한다", () => {
		expect(
			resolveProfileImageUpload(
				{
					fileName: "셀카.png",
					mimeType: "image/png",
					uri: "file:///tmp/셀카.png",
				},
				1024
			)
		).toEqual({ byteSize: 1024, fileName: "셀카.png", mimeType: "image/png" });
	});

	it("iOS 원본 HEIC는 막는다", () => {
		expect(
			resolveProfileImageUpload(
				{
					fileName: "IMG_0001.HEIC",
					mimeType: "image/heic",
					uri: "file:///tmp/IMG_0001.HEIC",
				},
				1024
			)
		).toEqual({ error: "JPG, PNG, WebP 이미지만 등록할 수 있어요." });
	});

	it("mimeType이 없으면 파일명·uri 확장자에서 유도한다", () => {
		expect(
			resolveProfileImageUpload(
				{ fileName: "photo.JPG", uri: "file:///tmp/x" },
				10
			)
		).toEqual({ byteSize: 10, fileName: "photo.JPG", mimeType: "image/jpeg" });
		expect(
			resolveProfileImageUpload(
				{ fileName: null, uri: "file:///tmp/photo.webp?ts=1" },
				10
			)
		).toEqual({ byteSize: 10, fileName: "photo.webp", mimeType: "image/webp" });
	});

	it("서버 상한을 넘거나 빈 파일이면 막는다", () => {
		const asset = { mimeType: "image/jpeg", uri: "file:///tmp/a.jpg" };

		expect(
			resolveProfileImageUpload(asset, PROFILE_IMAGE_MAX_BYTES + 1)
		).toEqual({ error: "프로필 사진은 5MB 이하만 등록할 수 있어요." });
		expect(resolveProfileImageUpload(asset, 0)).toEqual({
			error: "사진을 불러오지 못했어요. 다시 선택해 주세요.",
		});
	});

	it("파일명이 없으면 uri 세그먼트 → 기본명 순으로 폴백한다", () => {
		expect(
			resolveProfileImageUpload(
				{ fileName: "  ", mimeType: "image/jpeg", uri: "file:///tmp/a.jpg" },
				10
			)
		).toEqual({ byteSize: 10, fileName: "a.jpg", mimeType: "image/jpeg" });
		expect(
			resolveProfileImageUpload({ mimeType: "image/png", uri: "" }, 10)
		).toEqual({ byteSize: 10, fileName: "profile.png", mimeType: "image/png" });
	});

	it("서버 zod max(180)에 맞춰 파일명을 자른다", () => {
		const resolved = resolveProfileImageUpload(
			{
				fileName: `${"가".repeat(200)}.jpg`,
				mimeType: "image/jpeg",
				uri: "file:///tmp/a.jpg",
			},
			10
		);

		expect("error" in resolved ? "" : resolved.fileName).toHaveLength(180);
	});
});
