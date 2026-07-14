import { describe, expect, it } from "vitest";

import {
	JOB_POST_DETAIL_IMAGE_LIMIT,
	JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
	JOB_POST_IMAGE_MAX_BYTES,
	type JobPostMediaPolicyInput,
	validateJobPostImageUpload,
	validateJobPostMediaSet,
} from "./bambi-job-media-policy";

const createMedia = (
	overrides: Partial<JobPostMediaPolicyInput> = {}
): JobPostMediaPolicyInput => ({
	altText: "업무 공간 사진",
	byteSize: 512_000,
	fileName: "workspace.jpg",
	mimeType: "image/jpeg",
	storageKey: "bambi-job-post-media/org/user/file.jpg",
	usage: "detail",
	...overrides,
});

describe("bambi job media policy", () => {
	it("allows JPEG, PNG, and WebP images up to 8 MB", () => {
		expect(
			validateJobPostImageUpload({
				byteSize: JOB_POST_IMAGE_MAX_BYTES,
				fileName: "cover.jpg",
				mimeType: "image/jpeg",
			})
		).toEqual({ ok: true });

		expect(
			validateJobPostImageUpload({
				byteSize: 512_000,
				fileName: "detail.png",
				mimeType: "image/png",
			})
		).toEqual({ ok: true });

		expect(
			validateJobPostImageUpload({
				byteSize: 512_000,
				fileName: "detail.webp",
				mimeType: "image/webp",
			})
		).toEqual({ ok: true });
	});

	it("rejects oversized images, PDFs, and executable MIME types", () => {
		expect(
			validateJobPostImageUpload({
				byteSize: JOB_POST_IMAGE_MAX_BYTES + 1,
				fileName: "large.jpg",
				mimeType: "image/jpeg",
			})
		).toEqual({
			code: "file_too_large",
			maxBytes: JOB_POST_IMAGE_MAX_BYTES,
			ok: false,
		});

		expect(
			validateJobPostImageUpload({
				byteSize: 128_000,
				fileName: "guide.pdf",
				mimeType: "application/pdf",
			})
		).toEqual({ code: "unsupported_type", ok: false });

		expect(
			validateJobPostImageUpload({
				byteSize: 128_000,
				fileName: "installer.exe",
				mimeType: "application/x-msdownload",
			})
		).toEqual({ code: "unsupported_type", ok: false });
	});

	it("allows animated GIF for ad banners only", () => {
		for (const usage of ["ad_horizontal", "ad_vertical"] as const) {
			expect(
				validateJobPostImageUpload({
					byteSize: 2_000_000,
					fileName: "banner.gif",
					mimeType: "image/gif",
					usage,
				})
			).toEqual({ ok: true });
		}

		for (const usage of ["cover", "detail"] as const) {
			expect(
				validateJobPostImageUpload({
					byteSize: 2_000_000,
					fileName: "banner.gif",
					mimeType: "image/gif",
					usage,
				})
			).toEqual({ code: "unsupported_type", ok: false });
		}
	});

	it("rejects GIF when the upload intent omits the usage", () => {
		// usage를 못 받으면 가장 좁은 규칙(썸네일·상세)으로 검사한다. 배너에 GIF를 올리려면
		// 클라이언트가 usage를 반드시 함께 보내야 한다.
		expect(
			validateJobPostImageUpload({
				byteSize: 2_000_000,
				fileName: "banner.gif",
				mimeType: "image/gif",
			})
		).toEqual({ code: "unsupported_type", ok: false });
	});

	it("still enforces the size cap and aspect ratio for GIF banners", () => {
		expect(
			validateJobPostImageUpload({
				byteSize: JOB_POST_IMAGE_MAX_BYTES + 1,
				fileName: "banner.gif",
				mimeType: "image/gif",
				usage: "ad_horizontal",
			})
		).toEqual({
			code: "file_too_large",
			maxBytes: JOB_POST_IMAGE_MAX_BYTES,
			ok: false,
		});

		expect(
			validateJobPostMediaSet([
				createMedia({
					fileName: "banner.gif",
					height: 600,
					mimeType: "image/gif",
					usage: "ad_horizontal",
					width: 1400,
				}),
			]).ok
		).toBe(true);

		expect(
			validateJobPostMediaSet([
				createMedia({
					fileName: "banner.gif",
					height: 600,
					mimeType: "image/gif",
					usage: "ad_horizontal",
					width: 600,
				}),
			]).issues.map((issue) => issue.code)
		).toContain("banner_aspect_ratio_mismatch");
	});

	it("rejects a GIF submitted through a detail slot in the media set", () => {
		expect(
			validateJobPostMediaSet([
				createMedia({
					fileName: "detail.gif",
					mimeType: "image/gif",
					usage: "detail",
				}),
			]).issues.map((issue) => issue.code)
		).toContain("unsupported_type");
	});

	it("rejects empty filenames before upload intent creation", () => {
		expect(
			validateJobPostImageUpload({
				byteSize: 128_000,
				fileName: "   ",
				mimeType: "image/png",
			})
		).toEqual({ code: "empty_file_name", ok: false });
	});

	it("allows one cover image and five detail images", () => {
		const media = [
			createMedia({ usage: "cover" }),
			...Array.from({ length: JOB_POST_DETAIL_IMAGE_LIMIT }, (_, index) =>
				createMedia({
					fileName: `detail-${index}.jpg`,
					storageKey: `bambi-job-post-media/org/user/detail-${index}.jpg`,
				})
			),
		];

		expect(validateJobPostMediaSet(media)).toEqual({ issues: [], ok: true });
	});

	it("rejects more than one cover image", () => {
		expect(
			validateJobPostMediaSet([
				createMedia({ fileName: "cover-1.jpg", usage: "cover" }),
				createMedia({ fileName: "cover-2.jpg", usage: "cover" }),
			])
		).toEqual({
			issues: [{ code: "too_many_cover_images", maxCoverImages: 1 }],
			ok: false,
		});
	});

	it("rejects more than five detail images", () => {
		const media = Array.from(
			{ length: JOB_POST_DETAIL_IMAGE_LIMIT + 1 },
			(_, index) =>
				createMedia({
					fileName: `detail-${index}.jpg`,
					storageKey: `bambi-job-post-media/org/user/detail-${index}.jpg`,
				})
		);

		expect(validateJobPostMediaSet(media)).toEqual({
			issues: [
				{
					code: "too_many_detail_images",
					maxDetailImages: JOB_POST_DETAIL_IMAGE_LIMIT,
				},
			],
			ok: false,
		});
	});

	it("rejects blank filenames and alt text over 120 characters", () => {
		expect(
			validateJobPostMediaSet([
				createMedia({ fileName: "   " }),
				createMedia({
					altText: "가".repeat(JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH + 1),
					fileName: "long-alt.jpg",
				}),
			])
		).toEqual({
			issues: [
				{
					code: "empty_file_name",
					storageKey: "bambi-job-post-media/org/user/file.jpg",
				},
				{
					code: "alt_text_too_long",
					maxLength: JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
					storageKey: "bambi-job-post-media/org/user/file.jpg",
				},
			],
			ok: false,
		});
	});
});
