import { describe, expect, it } from "vitest";

import { ONBOARDING_CONTENT } from "@/lib/bambi/onboarding-content";

const EXPECTED_AUDIENCES = ["common", "employer", "job_seeker"] as const;
const EXPECTED_SLIDE_COUNT = 4;
describe("onboarding content", () => {
	it("defines four complete slides for every audience", () => {
		for (const audience of EXPECTED_AUDIENCES) {
			const slides = ONBOARDING_CONTENT[audience];
			expect(slides).toHaveLength(EXPECTED_SLIDE_COUNT);
			for (const slide of slides) {
				expect(slide.id).not.toBe("");
				expect(slide.title).not.toBe("");
				expect(slide.description || slide.mobileTitle).not.toBe("");
				expect(slide.screenAlt).not.toBe("");
				expect(slide.screen).toBeDefined();
			}
		}
	});

	it("keeps slide ids unique across all audiences", () => {
		const ids = EXPECTED_AUDIENCES.flatMap((audience) =>
			ONBOARDING_CONTENT[audience].map((slide) => slide.id)
		);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("uses distinct seeker screens for interview management and reviews", () => {
		const interviewScreen = ONBOARDING_CONTENT.job_seeker[2]?.screen;
		const reviewScreen = ONBOARDING_CONTENT.job_seeker[3]?.screen;
		expect(interviewScreen).toBeDefined();
		expect(reviewScreen).toBeDefined();
		expect(interviewScreen).not.toEqual(reviewScreen);
	});

	it("uses different fictional chat screens for seekers and employers", () => {
		const seekerChat = ONBOARDING_CONTENT.job_seeker[1]?.screen;
		const employerChat = ONBOARDING_CONTENT.employer[2]?.screen;
		expect(seekerChat).toBeDefined();
		expect(employerChat).toBeDefined();
		expect(seekerChat).not.toEqual(employerChat);
	});

	it("reveals the seeker chat conversation in three ordered steps", () => {
		const seekerChat = ONBOARDING_CONTENT.job_seeker[1];
		expect(seekerChat?.codePreview).toBe("seeker-chat");
	});

	it("reveals two interview schedules and a contact from the right", () => {
		const interview = ONBOARDING_CONTENT.job_seeker[2];
		expect(interview?.codePreview).toBe("seeker-interview");
	});

	it("alternates the two specified review demos in a fixed order", () => {
		const review = ONBOARDING_CONTENT.job_seeker[3];
		expect(review?.reviewScenarios).toEqual([
			{ body: "여기 괜찮은거 같아요", rating: 5 },
			{ body: "여기 완전 최악이에요", rating: 1 },
		]);
	});

	it("renders every employer slide with a code preview", () => {
		expect(
			ONBOARDING_CONTENT.employer.map((slide) => slide.codePreview)
		).toEqual(["business-info", "job-create", "chat", "interview-contact"]);
	});

	it("renders the first three seeker slides with shared code previews", () => {
		expect(
			ONBOARDING_CONTENT.job_seeker
				.slice(0, 3)
				.map((slide) => slide.codePreview)
		).toEqual(["seeker-marketplace", "seeker-chat", "seeker-interview"]);
	});

	it("renders every common slide with shared code previews", () => {
		expect(ONBOARDING_CONTENT.common.map((slide) => slide.codePreview)).toEqual(
			[
				"seeker-chat",
				"seeker-interview",
				"common-notifications",
				"common-safety",
			]
		);
	});

	it("keeps the requested common mobile copy and line breaks", () => {
		expect(
			ONBOARDING_CONTENT.common.map((slide) => ({
				description: slide.mobileDescription ?? "",
				title: slide.mobileTitle,
			}))
		).toEqual([
			{ description: "", title: "채팅과 첨부로\n편하게 대화해요!" },
			{
				description:
					"면접 일정을 함께 확인하고 동의한\n경우에만 연락처 공개가 가능해요!",
				title: "면접과 연락처는\n필요한 순간에",
			},
			{
				description:
					"채팅, 면접, 서비스 소식은 알림과\n쪽지로 다시 확인할 수 있어요",
				title: "알람과 쪽지로\n중요한 소식을 빠르게!",
			},
			{
				description:
					"신고와 차단 기능을 이용하고,\n고객센터에 빠르게 문의하세요!",
				title: "불편한 상황은\n밤비가 도와드려요!",
			},
		]);
	});

	it("keeps seeker mobile copy separate from desktop copy", () => {
		expect(
			ONBOARDING_CONTENT.job_seeker.map((slide) => ({
				description: slide.mobileDescription,
				title: slide.mobileTitle,
			}))
		).toEqual([
			{
				description:
					"지역과 업종, 근무 조건을 살펴보고\n원하는 공고를 빠르게 찾을 수 있어요!",
				title: "내게 맞는 일자리,\n밤비에서 찾아보세요!",
			},
			{
				description:
					"마음에 드는 공고에서 구인자와 대화하고\n이미지나 PDF도 주고받을 수 있어요!",
				title: "궁금한 내용은 채팅으로\n바로 물어보세요!",
			},
			{
				description:
					"채팅에서 면접일정을 확인하고\n필요한 경우에만 연락처를 공유해요!",
				title: "면접과 연락처를\n안전하게 관리해요!",
			},
			{
				description:
					"별점과 후기를 남겨 다른 구직자가\n업체를 판단하는데 도움을 줄 수 있어요!",
				title: "면접 경험을\n후기로 남겨주세요!",
			},
		]);

		expect(ONBOARDING_CONTENT.job_seeker.map((slide) => slide.title)).toEqual([
			"내게 맞는 일자리, 밤비에서 찾아보세요",
			"궁금한 내용은 채팅으로 바로 확인하세요",
			"면접과 연락처를 안전하게 관리해요",
			"면접 경험을 후기로 남겨주세요",
		]);
	});

	it("keeps employer mobile copy separate from desktop copy", () => {
		expect(
			ONBOARDING_CONTENT.employer.map((slide) => ({
				description: slide.mobileDescription,
				title: slide.mobileTitle,
			}))
		).toEqual([
			{
				description:
					"업체와 사업자 정보를 제공하면 운영자가\n확인 후 밤비에서 구직자를 채용할 수 있어요!",
				title: "안전한 채용을 위해\n업체 정보를 등록하세요!",
			},
			{
				description:
					"급여와 지역, 업종, 상세 내용과 사진을\n입력하시면 공고의 질을 높일 수 있어요!",
				title: "내 업체의 공고를\n쉽고 자세하게!",
			},
			{
				description:
					"면접 일정을 제안하고 연락처 공개를\n요청해 채용 과정을 이어가세요!",
				title: undefined,
			},
			{ description: undefined, title: "면접 제안부터\n지원자 관리까지!" },
		]);

		expect(ONBOARDING_CONTENT.employer.map((slide) => slide.title)).toEqual([
			"안전한 채용을 위해 업체 정보를 등록해요",
			"우리 업체의 공고를 쉽고 자세하게",
			"지원자와 바로 대화하세요",
			"면접 제안부터 지원자 관리까지",
		]);
	});
});
