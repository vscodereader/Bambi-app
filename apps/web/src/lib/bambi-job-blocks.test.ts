import { describe, expect, it } from "vitest";

import {
	type JobDescriptionBlockFormValue,
	type JobForm,
	type JobFormMediaItem,
	validateJobForm,
} from "./bambi-job-form";

const baseForm: JobForm = {
	description: "기본 상세 설명입니다.",
	exposureDurationDays: null,
	exposureType: "standard",
	industryCategory: "라운지",
	interviewNotes: "",
	organizationId: "org-1",
	payAmount: "180000",
	paymentMethod: null,
	payUnit: "일급",
	region: "서울 강남구",
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
				cover: null,
				detail: [createDetailImage(0)],
			},
		});

		expect(result).toMatchObject({
			input: {
				media: {
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
});
