import { describe, expect, it } from "vitest";

import {
	emptyNativeJobForm,
	getConfirmedScheduleId,
	getNativeHomeRoute,
	isEmailLoginId,
	validateNativeJobForm,
	validateNativeLoginInput,
} from "./bambi-native";

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
});
