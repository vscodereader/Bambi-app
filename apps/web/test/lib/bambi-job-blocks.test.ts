import { describe, expect, it } from "vitest";

import {
	type JobDescriptionBlockFormValue,
	type JobForm,
	type JobFormMediaItem,
	validateJobForm,
} from "@/lib/bambi-job-form";

const baseForm: JobForm = {
	adBannerLayout: null,
	adProductId: null,
	beginnerFriendly: false,
	description: "기본 상세 설명입니다.",
	detailDesignAmount: null,
	detailDesignRequested: false,
	districtCode: "1168000000",
	exposureAmount: null,
	exposureDurationDays: null,
	exposureType: "standard",
	industryCategory: "룸싸롱",
	instantInterview: false,
	interviewNotes: "",
	organizationId: "org-1",
	payAmount: "180000",
	paymentMethod: null,
	payUnit: "일급",
	regionCode: "1100000000",
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

	it("normalizes block text in the submitted blocks", () => {
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
				description: "기본 상세 설명입니다.",
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

	it("rejects an ad banner whose aspect ratio is far off spec", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 1400×1400(1:1)은 크기 하한(700×300)은 넘지만 7:3에서 크게 벗어나 슬롯에서
				// 위아래가 잘린다. 오차 15%를 넘으므로 반려한다.
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 1400,
					width: 1400,
				}),
				adVertical: null,
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media:
					"가로형 광고 배너 이미지가 요구 비율 7:3과 크게 달라 등록할 수 없습니다. 7:3 비율에 맞춰 최소 700×300px 이상으로 다시 등록해 주세요.",
			},
			ok: false,
		});
	});

	it("rejects a horizontal banner below the 700px width floor", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 300×130(7:3 근처)은 비율은 맞지만 가로 300이 하한 700에 못 미쳐 걸린다.
				// 크기 검사가 비율 검사보다 먼저 잡는다.
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 130,
					width: 300,
				}),
				adVertical: null,
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media:
					"가로형 광고 배너 이미지가 너무 작습니다. 700×300px 이상으로 등록해 주세요.",
			},
			ok: false,
		});
	});

	it("rejects a vertical banner below the newly enforced 400×900 floor", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 세로형은 예전엔 크기 하한이 없었지만 이제 400×900을 강제한다. 200×450은
				// 4:9 비율이지만 하한에 못 미쳐 걸린다.
				adHorizontal: null,
				adVertical: createBannerImage("ad_vertical", {
					height: 450,
					width: 200,
				}),
				cover: null,
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media:
					"세로형 광고 배너 이미지가 너무 작습니다. 400×900px 이상으로 등록해 주세요.",
			},
			ok: false,
		});
	});

	it("accepts a horizontal banner exactly at the 700×300 floor", () => {
		const result = validateJobForm(baseForm, {
			media: {
				// 700×300은 하한이자 정확히 7:3이라 크기·비율 모두 통과한다.
				adHorizontal: createBannerImage("ad_horizontal", {
					height: 300,
					width: 700,
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

	it("rejects an image larger than 10MB before submission", () => {
		const result = validateJobForm(baseForm, {
			media: {
				adHorizontal: null,
				adVertical: null,
				// 상한은 서버 정책(JOB_POST_IMAGE_MAX_BYTES)과 같은 10MB다. 경계 바로 위를
				// 써서 상한이 다시 움직이면 여기서 먼저 걸리게 한다.
				cover: createDetailImage(0, { byteSize: 10 * 1024 * 1024 + 1 }),
				detail: [],
			},
		});

		expect(result).toMatchObject({
			errors: {
				media: "이미지는 한 장당 10MB 이하만 등록할 수 있습니다.",
			},
			ok: false,
		});
	});
});
