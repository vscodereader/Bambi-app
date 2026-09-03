import { describe, expect, it } from "vitest";

import {
	getContactRequestNotice,
	getInterviewProposalNotice,
	readContactRequestMetadata,
	readInterviewProposalMetadata,
} from "@/services/bambi-chat-system-messages";

describe("readContactRequestMetadata", () => {
	it("정상 metadata를 좁혀 읽는다", () => {
		expect(
			readContactRequestMetadata({
				requesterUserId: "e",
				status: "pending",
				targetUserId: "s",
			})
		).toEqual({ requesterUserId: "e", status: "pending", targetUserId: "s" });
	});

	it("status가 알 수 없는 값이면 null", () => {
		expect(
			readContactRequestMetadata({
				requesterUserId: "e",
				status: "weird",
				targetUserId: "s",
			})
		).toBeNull();
	});

	it("객체가 아니면 null", () => {
		expect(readContactRequestMetadata(null)).toBeNull();
		expect(readContactRequestMetadata("x")).toBeNull();
	});
});

describe("getContactRequestNotice", () => {
	it("구직자 pending은 상대 이름을 넣어 묻는다", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "밤비업소",
				revealedPhoneLabel: null,
				status: "pending",
				viewerIsEmployer: false,
			})
		).toBe("밤비업소님께서 연락처 공개 요청이 왔습니다. 공개하시겠습니까?");
	});

	it("구인자 revealed는 포맷된 번호를 그대로 붙인다", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "구직자",
				revealedPhoneLabel: "010-1234-5678",
				status: "revealed",
				viewerIsEmployer: true,
			})
		).toBe("구직자님께서 연락처를 공개했습니다: 010-1234-5678");
	});

	it("구인자 revealed에 번호가 없으면 확인 필요", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "구직자",
				revealedPhoneLabel: null,
				status: "revealed",
				viewerIsEmployer: true,
			})
		).toBe("구직자님께서 연락처를 공개했습니다: 확인 필요");
	});

	it("declined 문구", () => {
		expect(
			getContactRequestNotice({
				counterpartName: "x",
				revealedPhoneLabel: null,
				status: "declined",
				viewerIsEmployer: false,
			})
		).toBe("연락처 공개를 거절했습니다.");
	});
});

describe("readInterviewProposalMetadata / getInterviewProposalNotice", () => {
	it("interviewScheduleId만 읽는다", () => {
		expect(
			readInterviewProposalMetadata({ interviewScheduleId: "i1" })
		).toEqual({
			interviewScheduleId: "i1",
		});
		expect(readInterviewProposalMetadata({})).toBeNull();
	});

	it("상태·제안자 여부로 문구가 갈린다", () => {
		expect(getInterviewProposalNotice("proposed", true)).toBe(
			"면접 일정을 제안했어요."
		);
		expect(getInterviewProposalNotice("proposed", false)).toBe(
			"면접 일정 제안이 도착했어요."
		);
		expect(getInterviewProposalNotice("confirmed", false)).toBe(
			"면접 일정이 확정됐어요."
		);
		expect(getInterviewProposalNotice("unknown", false)).toBe(
			"면접 일정을 제안했습니다."
		);
	});
});
