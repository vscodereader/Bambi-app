import { describe, expect, it } from "vitest";

import {
	JOB_IMAGE_MAX_BYTES,
	resolveJobImagePick,
	toJobMediaItem,
} from "@/src/lib/employer/job-media";

describe("resolveJobImagePick", () => {
	it("정상 이미지를 payload 초안으로 옮긴다(치수 포함)", () => {
		const result = resolveJobImagePick(
			{
				fileName: "cover.png",
				height: 800,
				mimeType: "image/png",
				uri: "file:///cover.png",
				width: 1200,
			},
			1024
		);

		expect(result).toEqual({
			byteSize: 1024,
			fileName: "cover.png",
			height: 800,
			mimeType: "image/png",
			uri: "file:///cover.png",
			width: 1200,
		});
	});

	it("Android generic mime는 확장자로 유도한다", () => {
		const result = resolveJobImagePick(
			{
				fileName: "a.jpg",
				mimeType: "application/octet-stream",
				uri: "file:///a.jpg",
			},
			10
		);

		expect("error" in result).toBe(false);
		if (!("error" in result)) {
			expect(result.mimeType).toBe("image/jpeg");
		}
	});

	it("허용 밖 형식은 오류", () => {
		expect(
			resolveJobImagePick({ fileName: "a.heic", uri: "file:///a.heic" }, 10)
		).toEqual({ error: "JPG, PNG, WebP 이미지만 등록할 수 있어요." });
	});

	it("10MB 초과는 오류", () => {
		expect(
			resolveJobImagePick(
				{ fileName: "a.png", mimeType: "image/png", uri: "file:///a.png" },
				JOB_IMAGE_MAX_BYTES + 1
			)
		).toEqual({ error: "이미지는 한 장당 10MB 이하만 등록할 수 있어요." });
	});

	it("빈 파일은 오류", () => {
		expect(
			resolveJobImagePick(
				{ fileName: "a.png", mimeType: "image/png", uri: "file:///a.png" },
				0
			)
		).toEqual({ error: "이미지를 불러오지 못했어요. 다시 선택해 주세요." });
	});
});

describe("toJobMediaItem", () => {
	it("storageKey를 붙이고 altText는 빈 문자열로 채운다", () => {
		expect(
			toJobMediaItem(
				{
					byteSize: 10,
					fileName: "a.png",
					height: 800,
					mimeType: "image/png",
					uri: "file:///a.png",
					width: 1200,
				},
				"orgs/o1/x.png"
			)
		).toEqual({
			altText: "",
			byteSize: 10,
			fileName: "a.png",
			height: 800,
			mimeType: "image/png",
			storageKey: "orgs/o1/x.png",
			width: 1200,
		});
	});

	it("슬라이스 그룹 메타가 있으면 통과시키고 없으면 생략한다", () => {
		const withSlice = toJobMediaItem(
			{
				byteSize: 10,
				fileName: "a.png",
				mimeType: "image/png",
				sliceGroupId: "11111111-1111-1111-1111-111111111111",
				sliceIndex: 2,
				uri: "file:///a.png",
			},
			"orgs/o1/x.png"
		);

		expect(withSlice.sliceGroupId).toBe("11111111-1111-1111-1111-111111111111");
		expect(withSlice.sliceIndex).toBe(2);

		const withoutSlice = toJobMediaItem(
			{
				byteSize: 10,
				fileName: "a.png",
				mimeType: "image/png",
				uri: "file:///a.png",
			},
			"orgs/o1/x.png"
		);

		expect("sliceGroupId" in withoutSlice).toBe(false);
		expect("sliceIndex" in withoutSlice).toBe(false);
	});
});
