import { describe, expect, it } from "vitest";

import {
	adPeriodTier,
	buildJobCardBadges,
	buildSeekerJobSections,
	describeJobForScreenReader,
	emptyNativeJobForm,
	formatAdPeriod,
	getConfirmedScheduleId,
	getNativeHomeRoute,
	groupDetailImageSlices,
	isEmailLoginId,
	NATIVE_AD_PERIOD_TIERS,
	type NativeAdPeriodTier,
	type NativeSeekerJob,
	type NativeSeekerJobPage,
	pointsToNextLabel,
	profileRoleLabel,
	resolveJobCoverUri,
	type SignupFormValues,
	validateNativeJobForm,
	validateNativeLoginInput,
	validateNewPassword,
	validateSignupInput,
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

	it("resolves cover URIs from the right source per job kind", () => {
		// 순수 공고: 공개 버킷 base + storageKey 조립(끝 슬래시는 중복되지 않게 정리).
		expect(
			resolveJobCoverUri(
				{ coverImage: { storageKey: "org/1/cover.jpg" }, coverImageUrl: null },
				"https://cdn.example.com/"
			)
		).toBe("https://cdn.example.com/org/1/cover.jpg");
		// 수집 공고: base64 data URI를 그대로 쓴다(base와 무관).
		expect(
			resolveJobCoverUri(
				{ coverImage: null, coverImageUrl: "data:image/gif;base64,AAAA" },
				undefined
			)
		).toBe("data:image/gif;base64,AAAA");
		// base가 없으면 순수 공고 커버는 만들 수 없다 → 폴백(null).
		expect(
			resolveJobCoverUri(
				{ coverImage: { storageKey: "org/1/cover.jpg" }, coverImageUrl: null },
				undefined
			)
		).toBeNull();
		// 커버가 아예 없는 공고 → 폴백(null).
		expect(
			resolveJobCoverUri(
				{ coverImage: null, coverImageUrl: null },
				"https://cdn.example.com"
			)
		).toBeNull();
	});

	it("maps cumulative ad days to the matching tier", () => {
		// 상수 폴백의 경계값 — ≤90 브론즈, 91 실버, 다이아는 상한 없음.
		expect(adPeriodTier(0).label).toBe("브론즈");
		expect(adPeriodTier(90).label).toBe("브론즈");
		expect(adPeriodTier(91).label).toBe("실버");
		expect(adPeriodTier(360).label).toBe("골드");
		expect(adPeriodTier(721).label).toBe("다이아");
		expect(adPeriodTier(9999).icon).toBe("crown");
	});

	it("falls back to the top tier when no range has an open ceiling", () => {
		// 운영자가 상한 없는 최상위 없이 구성하면, 모두 넘긴 일수는 최하위가 아니라 최상위로.
		const capped: NativeAdPeriodTier[] = [
			{ icon: "medal", label: "하", maxDays: 100, minDays: 0 },
			{ icon: "crown", label: "상", maxDays: 200, minDays: 101 },
		];
		expect(adPeriodTier(500, capped).label).toBe("상");
		// 빈 목록은 상수로 폴백한다.
		expect(adPeriodTier(50, []).label).toBe("브론즈");
	});

	it("formats the ad period as 'N회 N일'", () => {
		expect(formatAdPeriod({ count: 22, totalDays: 900 })).toBe("22회 900일");
		expect(formatAdPeriod({ count: 1, totalDays: 0 })).toBe("1회 0일");
		expect(formatAdPeriod({ count: 1000, totalDays: 12_345 })).toBe(
			"1,000회 12,345일"
		);
	});

	it("keeps the constant tiers ordered by ascending days", () => {
		const days = NATIVE_AD_PERIOD_TIERS.map((tier) => tier.minDays);
		expect(days).toEqual([...days].sort((a, b) => a - b));
	});

	it("keeps non-slice images as single-piece groups (crawled 동작 불변)", () => {
		const groups = groupDetailImageSlices([
			{ assetId: "a", id: "a" },
			{ assetId: "b", id: "b", sliceGroupId: null },
		]);

		expect(groups).toEqual([
			{
				key: "a",
				pieces: [
					{ assetId: "a", id: "a", isGroupEnd: true, isGroupStart: true },
				],
			},
			{
				key: "b",
				pieces: [
					{ assetId: "b", id: "b", isGroupEnd: true, isGroupStart: true },
				],
			},
		]);
	});

	it("merges consecutive slices sharing a group and flags the ends", () => {
		const groups = groupDetailImageSlices([
			{ assetId: "s0", id: "s0", sliceGroupId: "g1" },
			{ assetId: "s1", id: "s1", sliceGroupId: "g1" },
			{ assetId: "s2", id: "s2", sliceGroupId: "g1" },
			{ assetId: "plain", id: "plain", sliceGroupId: null },
		]);

		expect(groups).toEqual([
			{
				key: "s0",
				pieces: [
					{ assetId: "s0", id: "s0", isGroupEnd: false, isGroupStart: true },
					{ assetId: "s1", id: "s1", isGroupEnd: false, isGroupStart: false },
					{ assetId: "s2", id: "s2", isGroupEnd: true, isGroupStart: false },
				],
			},
			{
				key: "plain",
				pieces: [
					{
						assetId: "plain",
						id: "plain",
						isGroupEnd: true,
						isGroupStart: true,
					},
				],
			},
		]);
	});

	it("splits neighbouring different groups instead of merging them", () => {
		const groups = groupDetailImageSlices([
			{ assetId: "a0", id: "a0", sliceGroupId: "gA" },
			{ assetId: "a1", id: "a1", sliceGroupId: "gA" },
			{ assetId: "b0", id: "b0", sliceGroupId: "gB" },
		]);

		expect(
			groups.map((group) => group.pieces.map((piece) => piece.id))
		).toEqual([["a0", "a1"], ["b0"]]);
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

describe("profileRoleLabel", () => {
	it("등록된 역할은 한글 라벨로 바꾼다", () => {
		expect(profileRoleLabel("job_seeker")).toBe("구직자");
		expect(profileRoleLabel("employer")).toBe("구인자");
		expect(profileRoleLabel("admin")).toBe("관리자");
		expect(profileRoleLabel("legal_advisor")).toBe("법률자문가");
	});

	it("미등록·빈 역할은 구직자로 폴백한다", () => {
		expect(profileRoleLabel(null)).toBe("구직자");
		expect(profileRoleLabel(undefined)).toBe("구직자");
		expect(profileRoleLabel("unknown_role")).toBe("구직자");
	});
});

describe("pointsToNextLabel", () => {
	it("다음 등급이 있으면 남은 포인트를 천 단위 구분으로 보여준다", () => {
		expect(pointsToNextLabel({ minPoints: 5000, name: "골드" }, 1200)).toBe(
			"1,200P 남음"
		);
	});

	it("다음 등급이 없으면 최고 등급 문구를 보여준다", () => {
		expect(pointsToNextLabel(null, null)).toBe("최고 등급입니다");
	});
});

describe("validateNewPassword", () => {
	it("길이·일치 규칙을 순서대로 검사한다", () => {
		expect(validateNewPassword("short", "short")).toBe(
			"비밀번호를 8자 이상 입력해 주세요."
		);
		expect(validateNewPassword("a".repeat(129), "a".repeat(129))).toBe(
			"비밀번호는 128자까지 입력할 수 있어요."
		);
		expect(validateNewPassword("password1", "password2")).toBe(
			"비밀번호가 일치하지 않아요."
		);
	});

	it("규칙을 모두 만족하면 null을 준다", () => {
		expect(validateNewPassword("password1", "password1")).toBeNull();
	});
});

describe("validateSignupInput", () => {
	const validSignup = (
		overrides: Partial<SignupFormValues> = {}
	): SignupFormValues => ({
		agreedToTerms: true,
		email: "seeker@bambi.dev",
		nickname: "밤비구직",
		password: "password1",
		passwordConfirm: "password1",
		username: "bambi-alba",
		...overrides,
	});

	it("웹 규칙을 모두 만족하면 null을 준다", () => {
		expect(validateSignupInput(validSignup())).toBeNull();
	});

	it("닉네임이 2자 미만이면 안내한다", () => {
		expect(validateSignupInput(validSignup({ nickname: "김" }))).toBe(
			"닉네임을 2자 이상 입력해 주세요."
		);
	});

	it("아이디가 규칙에 어긋나면 login-id 문구를 그대로 준다", () => {
		expect(validateSignupInput(validSignup({ username: "ab" }))).toBe(
			"아이디는 3자 이상 입력해 주세요."
		);
	});

	it("이메일에 @가 없으면 이메일·비밀번호 안내를 준다", () => {
		expect(validateSignupInput(validSignup({ email: "noatsign" }))).toBe(
			"이메일과 8자 이상 비밀번호를 확인해 주세요."
		);
	});

	it("비밀번호와 확인이 다르면 안내한다", () => {
		expect(
			validateSignupInput(validSignup({ passwordConfirm: "password2" }))
		).toBe("비밀번호가 일치하지 않아요.");
	});

	it("약관에 동의하지 않으면 안내한다", () => {
		expect(validateSignupInput(validSignup({ agreedToTerms: false }))).toBe(
			"이용약관과 개인정보 처리방침에 동의해주세요"
		);
	});
});
