import { describe, expect, it } from "vitest";

import {
	type BusinessDraftValues,
	canAutosaveBusinessDraft,
	hasBusinessDraftChanges,
} from "./business";

describe("canAutosaveBusinessDraft", () => {
	it("인증 완료 조직은 임시 저장한다", () => {
		expect(
			canAutosaveBusinessDraft({ organizationId: "org1", status: "verified" })
		).toBe(true);
	});

	it("변경 미제출 상태도 임시 저장한다", () => {
		expect(
			canAutosaveBusinessDraft({
				organizationId: "org1",
				status: "changes_unsubmitted",
			})
		).toBe(true);
	});

	// 심사 중에는 서버가 draft 저장을 거부한다.
	it("심사 대기 중에는 저장하지 않는다", () => {
		expect(
			canAutosaveBusinessDraft({ organizationId: "org1", status: "pending" })
		).toBe(false);
	});

	// 조직이 만들어지기 전에는 저장할 대상 자체가 없다.
	it("조직이 없으면 저장하지 않는다", () => {
		expect(
			canAutosaveBusinessDraft({ organizationId: undefined, status: "none" })
		).toBe(false);
	});
});

describe("hasBusinessDraftChanges", () => {
	const saved: BusinessDraftValues = {
		brn: "1234567890",
		displayName: "밤비주점",
		representativeName: "홍길동",
		startDate: "2020-01-02",
	};

	// 서버가 값이 같아도 verified를 changes_unsubmitted로 강등하므로, 무변경 저장은 곧
	// 인증 해제다. 화면 진입만으로 그 일이 벌어지면 안 된다.
	it("값이 그대로면 저장하지 않는다", () => {
		expect(hasBusinessDraftChanges({ ...saved }, saved)).toBe(false);
	});

	it("앞뒤 공백만 다른 것은 변경이 아니다", () => {
		expect(
			hasBusinessDraftChanges({ ...saved, displayName: " 밤비주점 " }, saved)
		).toBe(false);
	});

	it("업체명이 바뀌면 저장한다", () => {
		expect(
			hasBusinessDraftChanges({ ...saved, displayName: "밤비바" }, saved)
		).toBe(true);
	});

	it("개업일자가 바뀌면 저장한다", () => {
		expect(
			hasBusinessDraftChanges({ ...saved, startDate: "2021-03-04" }, saved)
		).toBe(true);
	});
});
