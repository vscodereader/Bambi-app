import { describe, expect, it } from "vitest";

import {
	formatTeamRegion,
	getInviteReasonError,
	getMemberActionPermissions,
	getTeamDeleteBlockReason,
	type MemberRowLike,
	memberStatusLabel,
	organizationRoleLabel,
	validateInviteForm,
	validateTeamForm,
} from "./teams";

describe("validateTeamForm", () => {
	it.each([
		["", "11000000", "팀 이름을 입력해 주세요."],
		["   ", "11000000", "팀 이름을 입력해 주세요."],
		["a".repeat(121), "11000000", "팀 이름은 120자 이하로 입력해 주세요."],
		["강남점", "", "지역을 선택해 주세요."],
	])("팀명 %j · 지역 %j 이면 거부한다", (displayName, regionCode, message) => {
		const result = validateTeamForm({
			displayName,
			districtCode: "",
			regionCode,
		});

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.message).toBe(message);
	});

	it("팀명을 다듬고 세부지역이 없으면 undefined로 보낸다", () => {
		const result = validateTeamForm({
			displayName: "  강남점  ",
			districtCode: "",
			regionCode: "1100000000",
		});

		expect(result).toEqual({
			input: {
				displayName: "강남점",
				districtCode: undefined,
				regionCode: "1100000000",
			},
			ok: true,
		});
	});

	it("세부지역까지 고르면 그대로 싣는다", () => {
		const result = validateTeamForm({
			displayName: "강남점",
			districtCode: "1168000000",
			regionCode: "1100000000",
		});

		expect(result.ok === true && result.input.districtCode).toBe("1168000000");
	});
});

describe("getTeamDeleteBlockReason", () => {
	it.each([
		[false, 0, "운영자 승인 후 팀을 삭제할 수 있어요."],
		[false, 3, "운영자 승인 후 팀을 삭제할 수 있어요."],
		[true, 2, "멤버 2명이 남아 있어요. 멤버를 모두 정리하면 삭제할 수 있어요."],
		[true, 0, null],
	])("승인 %j · 멤버 %j 이면 사유는 %j", (isVerified, memberCount, expected) => {
		expect(getTeamDeleteBlockReason({ isVerified, memberCount })).toBe(
			expected
		);
	});
});

describe("getMemberActionPermissions", () => {
	const owner: MemberRowLike = {
		kind: "active",
		role: "owner",
		status: "active",
	};
	const staff: MemberRowLike = {
		kind: "active",
		role: "staff",
		status: "active",
	};
	const pendingStaff: MemberRowLike = {
		kind: "active",
		role: "staff",
		status: "pending",
	};
	const rejectedInvite: MemberRowLike = {
		kind: "invitation",
		role: "staff",
		status: "rejected",
	};
	const pendingInvite: MemberRowLike = {
		kind: "invitation",
		role: "staff",
		status: "pending",
	};

	it.each([
		// 소유자가 아니면(매니저) 멤버 액션이 하나도 없다 — 서버가 owner 권한을 요구한다.
		[staff, false, true, []],
		// 미승인 조직은 assertOrganizationVerified에 걸린다.
		[staff, true, false, []],
		// 소유자 행은 역할 변경·내보내기 모두 서버가 거부한다.
		[owner, true, true, []],
		[staff, true, true, ["canChangeRole", "canRemove", "canSetTeams"]],
		// 비활성 멤버의 팀 소속은 서버가 거부한다.
		[pendingStaff, true, true, ["canChangeRole", "canRemove"]],
		[rejectedInvite, true, true, ["canDeleteInvitation", "canResubmit"]],
		// 승인 대기 초대는 재제출·삭제 모두 CONFLICT다.
		[pendingInvite, true, true, []],
	])("%j · 소유자 %j · 승인 %j 이면 %j 만 연다", (row, canManageOrganization, isVerified, allowed) => {
		const permissions = getMemberActionPermissions({
			canManageOrganization,
			isVerified,
			row,
		});
		const granted = Object.entries(permissions)
			.filter(([, value]) => value)
			.map(([key]) => key)
			.sort();

		expect(granted).toEqual([...allowed].sort());
	});
});

describe("getInviteReasonError", () => {
	it.each([
		["", "초대 사유는 10자 이상 입력해 주세요."],
		["짧은사유", "초대 사유는 10자 이상 입력해 주세요."],
		["가".repeat(201), "초대 사유는 200자 이하로 입력해 주세요."],
		["2호점 매니저로 합류 예정입니다", ""],
	])("%j 이면 %j", (reason, expected) => {
		expect(getInviteReasonError(reason)).toBe(expected);
	});
});

describe("validateInviteForm", () => {
	it("이메일이 비면 거부한다", () => {
		const result = validateInviteForm({
			email: "",
			reason: "2호점 매니저로 합류 예정입니다",
			role: "staff",
			teamId: "",
		});

		expect(result.ok === false && result.message).toBe(
			"초대할 구인자 계정을 선택해 주세요."
		);
	});

	it("전체 조직(빈 teamId)은 teamId를 싣지 않는다", () => {
		const result = validateInviteForm({
			email: " owner@example.com ",
			reason: "  2호점 매니저로 합류 예정입니다  ",
			role: "manager",
			teamId: "",
		});

		expect(result).toEqual({
			input: {
				email: "owner@example.com",
				reason: "2호점 매니저로 합류 예정입니다",
				role: "manager",
				teamId: undefined,
			},
			ok: true,
		});
	});
});

describe("formatTeamRegion", () => {
	const regions = [
		{
			code: "1100000000",
			districts: [{ code: "1168000000", name: "강남구" }],
			label: "서울",
		},
	];

	it("시/도 표시 문자열과 세부지역명을 합친다", () => {
		expect(
			formatTeamRegion(regions, {
				districtCode: "1168000000",
				region: "서울",
				regionCode: "1100000000",
			})
		).toBe("서울 강남구");
	});

	it("마스터가 아직 없어도 저장된 region 문자열은 살린다", () => {
		expect(
			formatTeamRegion([], {
				districtCode: "1168000000",
				region: "서울",
				regionCode: "1100000000",
			})
		).toBe("서울");
	});

	it("지역이 아예 없으면 안내 문구로 떨어진다", () => {
		expect(
			formatTeamRegion(regions, {
				districtCode: null,
				region: null,
				regionCode: null,
			})
		).toBe("지역 미지정");
	});
});

describe("라벨 맵", () => {
	it("알 수 없는 enum 원값은 화면에 새지 않는다", () => {
		expect(organizationRoleLabel("unknown")).toBe("구성원");
		expect(memberStatusLabel("unknown")).toBe("상태 확인 필요");
	});
});
