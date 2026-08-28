import { describe, expect, it } from "vitest";

import {
	expandTargetRoles,
	mergeRecipientUserIds,
} from "@/services/bambi-direct-messages";

describe("expandTargetRoles", () => {
	it("구직자 선택 시 법률자문가를 포함한다", () => {
		expect(expandTargetRoles(["job_seeker"])).toEqual([
			"job_seeker",
			"legal_advisor",
		]);
	});

	it("구인자만 선택하면 구인자만 나온다", () => {
		expect(expandTargetRoles(["employer"])).toEqual(["employer"]);
	});

	it("둘 다 선택하면 세 역할이 모두 나온다", () => {
		expect(expandTargetRoles(["job_seeker", "employer"]).sort()).toEqual([
			"employer",
			"job_seeker",
			"legal_advisor",
		]);
	});

	it("빈 선택은 빈 배열이다(admin·guest는 어떤 조합에도 없다)", () => {
		expect(expandTargetRoles([])).toEqual([]);
	});
});

describe("mergeRecipientUserIds", () => {
	it("역할 조회 결과와 개별 지정을 합치고 중복을 제거한다", () => {
		expect(mergeRecipientUserIds(["a", "b"], ["b", "c"])).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("양쪽이 비면 빈 배열이다", () => {
		expect(mergeRecipientUserIds([], [])).toEqual([]);
	});
});
