import { describe, expect, it } from "vitest";

import {
	JOB_POST_DETAIL_IMAGE_LIMIT,
	JOB_POST_IMAGE_ALT_TEXT_MAX_LENGTH,
	JOB_POST_IMAGE_MAX_BYTES,
	type JobPostMediaPolicyInput,
	planDetailSlices,
	validateJobPostImageUpload,
	validateJobPostMediaSet,
} from "@/services/bambi-job-media-policy";

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

	it("still enforces the size cap for GIF banners", () => {
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

		// 정사각형(800×800) GIF도 크기 하한만 넘으면 서버는 통과시킨다. 비율 반려는 클라이언트
		// 몫이라 서버는 치수 하한만 재확인한다.
		expect(
			validateJobPostMediaSet([
				createMedia({
					fileName: "banner.gif",
					height: 800,
					mimeType: "image/gif",
					usage: "ad_horizontal",
					width: 800,
				}),
			]).ok
		).toBe(true);
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

	it("accepts a banner at exactly the 700x300 floor", () => {
		// 하한 수치 그대로인 700×300(정확히 7:3)이 통과한다. 서버는 크기 하한만 재확인한다.
		expect(
			validateJobPostMediaSet([
				createMedia({
					height: 300,
					usage: "ad_horizontal",
					width: 700,
				}),
			])
		).toEqual({ issues: [], ok: true });
	});

	it("accepts off-ratio creatives above the floor since the server checks only size", () => {
		// 서버는 비율을 보지 않는다(비율 반려는 클라이언트 몫). 세로 표준 1080×1920과
		// 정사각형 900×900은 비율이 어긋나도 크기 하한만 넘으면 서버에선 통과한다.
		expect(
			validateJobPostMediaSet([
				createMedia({ height: 1920, usage: "ad_vertical", width: 1080 }),
			])
		).toEqual({ issues: [], ok: true });

		expect(
			validateJobPostMediaSet([
				createMedia({ height: 900, usage: "ad_horizontal", width: 900 }),
			])
		).toEqual({ issues: [], ok: true });
	});

	it("rejects a horizontal banner narrower than the minimum width", () => {
		// 400×320은 세로 320으로 하한 300은 넘지만 가로 400이 하한 700에 못 미쳐 걸린다.
		const { issues } = validateJobPostMediaSet([
			createMedia({
				height: 320,
				usage: "ad_horizontal",
				width: 400,
			}),
		]);

		expect(issues.map((issue) => issue.code)).toEqual(["banner_too_small"]);
		expect(issues[0]).toMatchObject({ minHeight: 300, minWidth: 700 });
	});

	it("requires banner dimensions to be present", () => {
		// 하한을 재려면 치수가 있어야 한다. 비율 규칙이 사라져도 이 요구는 그대로다.
		expect(
			validateJobPostMediaSet([
				createMedia({ usage: "ad_horizontal", width: 1400 }),
			]).issues.map((issue) => issue.code)
		).toEqual(["banner_dimensions_required"]);
	});

	it("does not require any particular resolution above the minimum", () => {
		// 하한(가로 700·세로 300) 이상이면 비율과 무관하게 서버에선 통과한다.
		for (const [width, height] of [
			[700, 300],
			[1200, 500],
			[1400, 600],
			[2800, 1200],
		]) {
			expect(
				validateJobPostMediaSet([
					createMedia({ height, usage: "ad_horizontal", width }),
				]).ok
			).toBe(true);
		}
	});

	it("enforces the 400x900 floor on vertical banners", () => {
		// 세로형은 예전엔 크기 하한이 없었지만 이제 400×900을 강제한다.
		const { issues } = validateJobPostMediaSet([
			createMedia({
				height: 450,
				usage: "ad_vertical",
				width: 200,
			}),
		]);

		expect(issues.map((issue) => issue.code)).toEqual(["banner_too_small"]);
		expect(issues[0]).toMatchObject({ minHeight: 900, minWidth: 400 });

		expect(
			validateJobPostMediaSet([
				createMedia({ height: 900, usage: "ad_vertical", width: 400 }),
			]).ok
		).toBe(true);
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

describe("planDetailSlices", () => {
	it("임계값 이하면 자르지 않는다", () => {
		expect(planDetailSlices(3000, 3500)).toEqual([]);
	});

	it("균등 분할하고 합이 원본 높이와 같다", () => {
		const plans = planDetailSlices(8000, 3500);

		expect(plans).toHaveLength(3);
		expect(plans.reduce((sum, plan) => sum + plan.height, 0)).toBe(8000);
		expect(plans[0].offsetY).toBe(0);
		expect(plans[1].offsetY).toBe(plans[0].height);
		for (const plan of plans) {
			expect(plan.height).toBeLessThanOrEqual(3500);
		}
	});

	it("유한하지 않은 높이는 자르지 않는다", () => {
		expect(planDetailSlices(Number.NaN, 3500)).toEqual([]);
	});
});
