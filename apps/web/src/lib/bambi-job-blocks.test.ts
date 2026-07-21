import { describe, expect, it } from "vitest";

import {
	type JobDescriptionBlockFormValue,
	type JobForm,
	type JobFormMediaItem,
	validateJobForm,
} from "./bambi-job-form";

const baseForm: JobForm = {
	adProductId: null,
	beginnerFriendly: false,
	description: "기본 상세 설명입니다.",
	district: "강남",
	exposureAmount: null,
	exposureDurationDays: null,
	exposureType: "standard",
	industryCategory: "라운지",
	instantInterview: false,
	interviewNotes: "",
	organizationId: "org-1",
	payAmount: "180000",
	paymentMethod: null,
	payUnit: "일급",
	region: "서울",
	teamId: "",
	title: "블록 테스트 공고",
	workSchedule: "20:00-02:00",
};

const createDetailImage = (
	index: number,
	overrides: Partial<JobFormMediaItem> = {}
): JobFormMediaItem => ({
	altText: `상세 이미지 ${index + 1}`,
	byteSize: 128_000,
	fileName: `detail-${index}.jpg`,
	mimeType: "image/jpeg",
	storageKey: `bambi-job-post-media/org-1/user-1/detail-${index}.jpg`,
	...overrides,
});

const createBannerImage = (
	usage: "ad_horizontal" | "ad_vertical",
	overrides: Partial<JobFormMediaItem> = {}
): JobFormMediaItem => ({
	altText: "광고 배너",
	byteSize: 256_000,
	fileName: `${usage}.jpg`,
	mimeType: "image/jpeg",
	storageKey: `bambi-job-post-media/org-1/user-1/${usage}.jpg`,
	...overrides,
});

describe("bambi job block form helpers", () => {
	it("falls back to the current description when the block list is empty", () => {
		const result = validateJobForm(baseForm, { descriptionBlocks: [] });

		expect(result).toMatchObject({
			input: {
				description: "기본 상세 설명입니다.",
				descriptionBlocks: [],
			},
			ok: true,
		});
	});

	it("normalizes block text into the submitted description", () => {
		const descriptionBlocks: JobDescriptionBlockFormValue[] = [
			{ id: "heading", text: " 주요 업무 ", type: "heading" },
			{
				id: "paragraph",
				text: " 고객 응대와 예약 관리 ",
				type: "paragraph",
			},
		];
		const result = validateJobForm(baseForm, { descriptionBlocks });

		expect(result).toMatchObject({
			input: {
				description: "주요 업무\n\n고객 응대와 예약 관리",
				descriptionBlocks: [
					{ id: "heading", text: "주요 업무", type: "heading" },
					{
						id: "paragraph",
						text: "고객 응대와 예약 관리",
						type: "paragraph",
					},
				],
			},
			ok: true,
		});
	});

	it("allows an omitted cover image", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: null,
				adVertical: null,
				cover: null,
				detail: [createDetailImage(0)],
			},
		});

		expect(result).toMatchObject({
			input: {
				media: {
					adHorizontal: undefined,
					adVertical: undefined,
					cover: undefined,
					detail: [createDetailImage(0)],
				},
			},
			ok: true,
		});
	});

	it("rejects more than five detail images", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: null,
				adVertical: null,
				cover: null,
				detail: Array.from({ length: 6 }, (_, index) =>
					createDetailImage(index)
				),
			},
		});

		expect(result).toMatchObject({
			errors: {
				media: "상세 이미지는 최대 5장까지 등록할 수 있습니다.",
			},
			ok: false,
		});
	});

	it("rejects alt text over 120 characters", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: null,
				adVertical: null,
				cover: createDetailImage(0, {
					altText: "가".repeat(121),
					fileName: "cover.jpg",
				}),
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media: "이미지 설명은 120자 이하로 입력해 주세요.",
			},
			ok: false,
		});
	});

	it("accepts ad banners that match the 7:3 and 4:9 specs", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 600,
					width: 1400,
				}),
				adVertical: createBannerImage("ad_vertical", {
					height: 900,
					width: 400,
				}),
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({ ok: true });
	});

	it("accepts ad banners whose aspect ratio is off spec", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 300×100(3:1)·1080×1920(9:16) 둘 다 권장 비율에서 벗어나지만, 슬롯이
				// 가운데를 기준으로 자를 뿐이라 등록은 막지 않는다(업로더가 경고만 띄운다).
				// 예전 ±2% 반려 규칙이 실제로 튕겨내던 바로 그 실사용 규격들이다.
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 100,
					width: 300,
				}),
				adVertical: createBannerImage("ad_vertical", {
					height: 1920,
					width: 1080,
				}),
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({ ok: true });
	});

	it("rejects a horizontal banner below the 150px width floor", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 세로 60은 하한 50을 넘지만 가로 140이 하한 150에 못 미쳐 걸린다 —
				// 실제로 구속하는 쪽은 가로다.
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 60,
					width: 140,
				}),
				adVertical: null,
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media:
					"가로형 광고 배너 이미지가 너무 작습니다. 150×50px 이상으로 등록해 주세요.",
			},
			ok: false,
		});
	});

	it("accepts a horizontal banner at the 150px width floor", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 가로가 정확히 하한일 때(세로는 권장 비율 7:3 기준 150/2.333≈64).
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 64,
					width: 150,
				}),
				adVertical: null,
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({ ok: true });
	});

	it("rejects an ad banner with unknown dimensions", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: null,
				adVertical: createBannerImage("ad_vertical"),
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media:
					"세로형 광고 배너 이미지의 크기를 확인하지 못했습니다. 다시 등록해 주세요.",
			},
			ok: false,
		});
	});

	it("rejects an image larger than 8MB before submission", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: null,
				adVertical: null,
				cover: createDetailImage(0, { byteSize: 9 * 1024 * 1024 }),
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media: "이미지는 한 장당 8MB 이하만 등록할 수 있습니다.",
			},
			ok: false,
		});
	});
});
