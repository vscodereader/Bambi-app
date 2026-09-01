import { describe, expect, it } from "vitest";

import {
	previewText,
	reportReasonLabel,
	statusLabel,
	statusTone,
	summarizeReportTarget,
	targetTypeLabel,
} from "./me-reports";

describe("라벨 폴백", () => {
	it("알려진 값은 한국어 라벨로 바꾼다", () => {
		expect(reportReasonLabel("scam_or_fraud")).toBe("사기·기만");
		expect(targetTypeLabel("community_comment")).toBe("커뮤니티 댓글");
		expect(statusLabel("dismissed")).toBe("반려됨");
	});

	it("미지값은 enum 원값 대신 중립 라벨로 떨어진다", () => {
		expect(reportReasonLabel("brand_new_reason")).toBe("기타");
		expect(targetTypeLabel("brand_new_target")).toBe("기타");
		expect(statusLabel("escalated")).toBe("처리 중");
	});
});

describe("statusTone", () => {
	it("상태별 Pill 톤을 돌려주고 미지값은 neutral이다", () => {
		expect(statusTone("open")).toBe("warning");
		expect(statusTone("reviewing")).toBe("accent");
		expect(statusTone("resolved")).toBe("success");
		expect(statusTone("dismissed")).toBe("danger");
		expect(statusTone("escalated")).toBe("neutral");
	});
});

describe("previewText", () => {
	it("12자를 넘으면 말줄임을 붙인다", () => {
		expect(previewText("123456789012")).toBe("123456789012");
		expect(previewText("1234567890123")).toBe("123456789012...");
	});
});

describe("summarizeReportTarget", () => {
	const jobPostContext = {
		jobPost: {
			id: "job-1",
			organizationDisplayName: "밤비 라운지",
			payAmount: 30_000,
			payUnit: "시급",
			title: "홀 서빙 구합니다",
		},
	};

	it("대상이 사라졌거나 컨텍스트가 없으면 unavailable이다", () => {
		expect(
			summarizeReportTarget({
				targetContext: jobPostContext,
				targetUnavailable: true,
			})
		).toEqual({ kind: "unavailable" });
		expect(
			summarizeReportTarget({ targetContext: null, targetUnavailable: false })
		).toEqual({ kind: "unavailable" });
	});

	it("공고 대상은 딥링크에 필요한 필드까지 펼친다", () => {
		expect(
			summarizeReportTarget({
				targetContext: jobPostContext,
				targetUnavailable: false,
			})
		).toEqual({
			id: "job-1",
			kind: "jobPost",
			organizationDisplayName: "밤비 라운지",
			payAmount: 30_000,
			payUnit: "시급",
			title: "홀 서빙 구합니다",
		});
	});

	it("채팅방 대상은 링크 없는 2줄 박스다", () => {
		expect(
			summarizeReportTarget({
				targetContext: {
					chatRoom: {
						jobPostTitle: "홀 서빙 구합니다",
						organizationDisplayName: "밤비 라운지",
					},
				},
				targetUnavailable: false,
			})
		).toEqual({
			kind: "box",
			subtitle: "밤비 라운지",
			title: "홀 서빙 구합니다",
		});
	});

	it("커뮤니티 글·댓글은 12자 프리뷰 한 줄이다", () => {
		expect(
			summarizeReportTarget({
				targetContext: {
					communityPost: { title: "여기 사장님 진짜 너무하네요" },
				},
				targetUnavailable: false,
			})
		).toEqual({ kind: "line", text: "원글 : 여기 사장님 진짜 너무..." });
		expect(
			summarizeReportTarget({
				targetContext: { communityComment: { bodyPreview: "댓글 본문" } },
				targetUnavailable: false,
			})
		).toEqual({ kind: "line", text: "원 댓글 : 댓글 본문" });
	});

	it("화면이 대응하지 않는 컨텍스트는 none이다", () => {
		for (const targetContext of [
			{ review: { id: "review-1" } },
			{ user: { userId: "user-1" } },
			{ chatMessage: { id: "message-1" } },
		]) {
			expect(
				summarizeReportTarget({ targetContext, targetUnavailable: false })
			).toEqual({ kind: "none" });
		}
	});
});
