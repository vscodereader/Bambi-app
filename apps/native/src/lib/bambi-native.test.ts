import { describe, expect, it } from "vitest";

import {
	emptyNativeJobForm,
	getConfirmedScheduleId,
	getNativeHomeRoute,
	validateNativeJobForm,
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
			industryCategory: "라운지",
			organizationId: "org-1",
			payAmount: "180000",
			payUnit: "일급",
			region: "서울",
			title: "강남 라운지 스태프",
			workSchedule: "20:00-02:00",
		});

		expect(result).toEqual({
			input: {
				description: "상세 설명은 10자 이상 입력해야 합니다.",
				industryCategory: "라운지",
				organizationId: "org-1",
				payAmount: 180_000,
				payUnit: "일급",
				region: "서울",
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
});
