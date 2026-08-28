import { describe, expect, it } from "vitest";

import {
	buildJobCardBadges,
	buildSeekerJobSections,
	describeJobForScreenReader,
	emptyNativeJobForm,
	getConfirmedScheduleId,
	getNativeHomeRoute,
	isEmailLoginId,
	type NativeSeekerJob,
	type NativeSeekerJobPage,
	validateNativeJobForm,
	validateNativeLoginInput,
} from "./bambi-native";

const seekerJob = (
	overrides: Partial<NativeSeekerJob> & { id: string }
): NativeSeekerJob => ({
	employerDisplayName: "밤비 라운지",
	employerVerificationStatus: "verified",
	industryCategory: "룸싸롱",
	instantInterview: false,
	payAmount: 15_000,
	payUnit: "시급",
	promotionLabel: null,
	region: "강남",
	source: "original",
	title: "강남 라운지 스태프",
	workSchedule: "20:00-02:00",
	...overrides,
});

// 수집 행은 서버가 인증·당일면접을 끄고 단위·일정을 비운 채 내려보낸다.
const crawledJob = (id: string): NativeSeekerJob =>
	seekerJob({
		employerVerificationStatus: "none",
		id,
		payUnit: null,
		source: "crawled",
		workSchedule: null,
	});

const jobPage = (
	sections: Partial<NativeSeekerJobPage["sections"]>
): NativeSeekerJobPage => ({
	sections: {
		organic: [],
		recommended: [],
		special: [],
		urgent: [],
		...sections,
	},
});

describe("bambi native helpers", () => {
	it("routes users by Bambi profile role", () => {
		expect(getNativeHomeRoute("job_seeker")).toBe("/(seeker)");
		expect(getNativeHomeRoute("employer")).toBe("/(employer)");
		expect(getNativeHomeRoute("admin")).toBe("/(moderator)");
		expect(getNativeHomeRoute(null)).toBe("/onboarding");
	});

	it("validates job forms using web-compatible requirements", () => {
		const result = validateNativeJobForm({
			...emptyNativeJobForm,
			description: "상세 설명은 10자 이상 입력해야 합니다.",
			industryCategory: "룸싸롱",
			organizationId: "org-1",
			payAmount: "180000",
			payUnit: "일급",
			regionCode: "1168000000",
			title: "강남 라운지 스태프",
			workSchedule: "20:00-02:00",
		});

		expect(result).toEqual({
			input: {
				description: "상세 설명은 10자 이상 입력해야 합니다.",
				industryCategory: "룸싸롱",
				organizationId: "org-1",
				payAmount: 180_000,
				payUnit: "일급",
				regionCode: "1168000000",
				title: "강남 라운지 스태프",
				workSchedule: "20:00-02:00",
			},
			ok: true,
		});
	});

	it("rejects contact reveal when no confirmed schedule exists", () => {
		expect(
			getConfirmedScheduleId([
				{ id: "schedule-1", status: "proposed" },
				{ id: "schedule-2", status: "declined" },
			])
		).toBeNull();
		expect(
			getConfirmedScheduleId([
				{ id: "schedule-1", status: "proposed" },
				{ id: "schedule-2", status: "confirmed" },
			])
		).toBe("schedule-2");
	});

	it("splits login ids by @ like the web form", () => {
		expect(isEmailLoginId("seeker@bambi.dev")).toBe(true);
		expect(isEmailLoginId("seeker_01")).toBe(false);
	});

	it("validates login input per field", () => {
		expect(validateNativeLoginInput("  ", "a".repeat(12))).toEqual({
			loginId: "아이디 또는 이메일을 입력해 주세요.",
		});
		expect(validateNativeLoginInput("seeker_01", "short")).toEqual({
			password: "비밀번호는 8자 이상이어야 해요.",
		});
		expect(validateNativeLoginInput("seeker_01", "a".repeat(129))).toEqual({
			password: "비밀번호는 128자까지 입력할 수 있어요.",
		});
		expect(
			validateNativeLoginInput("seeker@bambi.dev", "a".repeat(12))
		).toEqual({});
	});

	it("drops empty sections and takes paid slots from the first page only", () => {
		const sections = buildSeekerJobSections(
			[
				jobPage({
					organic: [seekerJob({ id: "organic-1" })],
					special: [seekerJob({ id: "special-1" })],
				}),
				jobPage({
					organic: [seekerJob({ id: "organic-2" })],
					// 2페이지의 유료 자리는 무시한다 — 서버가 첫 페이지에만 싣는다.
					special: [seekerJob({ id: "special-2" })],
				}),
			],
			{ urgentHidden: true }
		);

		expect(
			sections.map((section) => [
				section.key,
				section.data.map((job) => job.id),
			])
		).toEqual([
			["special", ["special-1"]],
			["organic", ["organic-1", "organic-2"]],
		]);
		expect(sections[0]?.title).toBe("스페셜 광고");
		expect(sections[0]?.accentClassName).toBe("bg-accent");
	});

	it("removes ids already shown in paid sections from the organic list", () => {
		const sections = buildSeekerJobSections(
			[
				jobPage({
					// 수집 행은 섹션과 전체 공고에 동시에 담겨 내려온다.
					organic: [crawledJob("crawled-1"), seekerJob({ id: "organic-1" })],
					recommended: [crawledJob("crawled-1")],
				}),
			],
			{ urgentHidden: true }
		);

		expect(
			sections.map((section) => [
				section.key,
				section.data.map((job) => job.id),
			])
		).toEqual([
			["recommended", ["crawled-1"]],
			["organic", ["organic-1"]],
		]);
	});

	it("drops organic rows that a later page repeats", () => {
		// offset 커서라 1페이지 뒤 새 공고가 앞에 끼면 밀린 행이 2페이지에 재등장한다.
		const sections = buildSeekerJobSections(
			[
				jobPage({
					organic: [seekerJob({ id: "o-1" }), seekerJob({ id: "o-2" })],
				}),
				jobPage({
					organic: [seekerJob({ id: "o-2" }), seekerJob({ id: "o-3" })],
				}),
			],
			{ urgentHidden: true }
		);

		expect(
			sections.map((section) => section.data.map((job) => job.id))
		).toEqual([["o-1", "o-2", "o-3"]]);
	});

	it("gates the urgent section on the site setting", () => {
		const pages = [
			jobPage({
				organic: [seekerJob({ id: "organic-1" })],
				urgent: [seekerJob({ id: "urgent-1" })],
			}),
		];

		expect(
			buildSeekerJobSections(pages, { urgentHidden: true }).map(
				(section) => section.key
			)
		).toEqual(["organic"]);
		expect(
			buildSeekerJobSections(pages, { urgentHidden: false }).map(
				(section) => section.key
			)
		).toEqual(["urgent", "organic"]);
	});

	it("derives card badges only from truthy employer promises", () => {
		expect(buildJobCardBadges(crawledJob("crawled-1"))).toEqual([]);
		expect(buildJobCardBadges(seekerJob({ id: "job-1" }))).toEqual([
			{ label: "인증 완료", tone: "success" },
		]);
		expect(
			buildJobCardBadges(seekerJob({ id: "job-2", instantInterview: true }))
		).toEqual([
			{ label: "당일면접", tone: "warning" },
			{ label: "인증 완료", tone: "success" },
		]);
	});

	it("reads a job row as one screen reader sentence", () => {
		expect(describeJobForScreenReader(seekerJob({ id: "job-1" }))).toBe(
			"강남 라운지 스태프, 밤비 라운지, 강남, 20:00-02:00, 15,000원 / 시급, 인증 완료"
		);
		expect(
			describeJobForScreenReader(
				seekerJob({
					employerDisplayName: null,
					id: "job-2",
					payAmount: null,
					payUnit: null,
					workSchedule: null,
				})
			)
		).toBe(
			"강남 라운지 스태프, 밤비알바 구인자, 강남, 일정 협의, 급여 협의, 인증 완료"
		);
	});
});
