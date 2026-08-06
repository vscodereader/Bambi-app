import { describe, expect, it } from "vitest";

import {
	notificationBody,
	notificationHref,
	notificationTitle,
} from "./notification-labels";

const view = (
	overrides: Partial<Parameters<typeof notificationTitle>[0]>
): Parameters<typeof notificationTitle>[0] => ({
	chatRoomId: null,
	metadata: null,
	recipientRole: null,
	targetId: "target-1",
	targetType: "job_post",
	...overrides,
});

describe("notificationTitle", () => {
	it("면접 상태별로 다른 문구를 낸다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "proposed" },
					targetType: "interview_schedule",
				})
			)
		).toBe("면접 제안이 도착했어요");
		expect(
			notificationTitle(
				view({
					metadata: { action: "confirmed" },
					targetType: "interview_schedule",
				})
			)
		).toBe("면접 일정이 확정됐어요");
	});

	it("같은 targetType이라도 운영자 공유 행은 큐 문구로 바뀐다", () => {
		expect(
			notificationTitle(
				view({ metadata: { action: "submitted" }, recipientRole: "admin" })
			)
		).toBe("새 공고 검수 요청이 들어왔어요");
		expect(
			notificationTitle(view({ metadata: { action: "set_status:rejected" } }))
		).toBe("공고가 반려됐어요");
	});

	it("업주가 받는 새 후기 등록은 후기 조치 문구와 갈린다", () => {
		expect(
			notificationTitle(
				view({ metadata: { action: "created" }, targetType: "review" })
			)
		).toBe("내 업소에 새 후기가 등록됐어요");
		expect(
			notificationTitle(
				view({
					metadata: { action: "set_status:hidden" },
					targetType: "review",
				})
			)
		).toBe("내 후기가 숨김 처리됐어요");
	});

	it("아는 targetType이면 모르는 action이어도 그 축의 폴백 문구를 쓴다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "brand_new_action" },
					targetType: "contact_reveal",
				})
			)
		).toBe("연락처가 공개됐어요");
	});

	it("모르는 targetType·action도 enum 원값을 노출하지 않는다", () => {
		expect(notificationTitle(view({ targetType: "brand_new_thing" }))).toBe(
			"새 알림이 도착했어요"
		);
	});
});

describe("notificationBody", () => {
	it("반려 사유를 본문으로 보여준다", () => {
		expect(
			notificationBody(
				view({
					metadata: { action: "set_status:rejected", reason: "사진 미비" },
				})
			)
		).toBe("사진 미비");
	});

	it("접미가 붙은 부정 전이 사유도 본문으로 보여준다", () => {
		expect(
			notificationBody(
				view({
					metadata: {
						action: "set_community_post_status:hidden",
						reason: "정책 위반",
					},
					targetType: "community_post",
				})
			)
		).toBe("정책 위반");
	});

	it("승인·게시·접수 알림은 사유가 있어도 본문을 내지 않는다", () => {
		expect(
			notificationBody(
				view({
					metadata: { action: "set_status:published", reason: "운영자 메모" },
				})
			)
		).toBeNull();
		// 신고 접수 공유 알림의 reason은 enum 원값이라 특히 새면 안 된다.
		expect(
			notificationBody(
				view({
					metadata: {
						action: "submitted",
						reason: "illegal_or_prohibited_content",
					},
					recipientRole: "admin",
					targetType: "report",
				})
			)
		).toBeNull();
	});

	it("신고 처리 결과는 부정 전이가 아니어도 처리 메모를 보여준다", () => {
		expect(
			notificationBody(
				view({
					metadata: {
						action: "set_report_status:resolved",
						reason: "조치 완료했습니다.",
					},
					targetType: "report",
				})
			)
		).toBe("조치 완료했습니다.");
	});

	it("사유가 없으면 본문도 없다", () => {
		expect(
			notificationBody(view({ metadata: { action: "submitted" } }))
		).toBeNull();
		expect(notificationBody(view({ metadata: null }))).toBeNull();
	});
});

describe("notificationHref", () => {
	it("채팅 축 알림은 그 방으로 보낸다", () => {
		expect(
			notificationHref(
				view({ chatRoomId: "room-1", targetType: "interview_schedule" })
			)
		).toBe("/seeker/chats/room-1");
	});

	it("방 정보가 없으면 채팅 목록으로 폴백한다", () => {
		expect(notificationHref(view({ targetType: "contact_reveal" }))).toBe(
			"/seeker/chats"
		);
	});

	it("커뮤니티 알림은 게시판 key를 URL slug로 바꿔 회원 영역으로 보낸다", () => {
		expect(
			notificationHref(
				view({
					metadata: { board: "work_talk", postId: "post-1" },
					targetType: "community_comment",
				})
			)
		).toBe("/seeker/community/work-talk/post-1");
	});

	it("운영자 공유 행은 같은 targetType이라도 운영자 큐로 보낸다", () => {
		expect(
			notificationHref(view({ recipientRole: "admin", targetType: "job_post" }))
		).toBe("/moderator/jobs");
		expect(
			notificationHref(
				view({ recipientRole: "admin", targetType: "support_inquiry" })
			)
		).toBe("/moderator/support");
	});

	it("공고 결제 승인은 광고 관리로, 그 외 공고 조치는 수정 화면으로 보낸다", () => {
		expect(
			notificationHref(view({ metadata: { action: "set_payment:paid" } }))
		).toBe("/employer/promotions");
		expect(
			notificationHref(view({ metadata: { action: "set_status:rejected" } }))
		).toBe("/employer/jobs/target-1/edit");
	});

	it("사업자 인증은 공유 행이면 운영자 큐로, 개인 행이면 내 설정으로 갈린다", () => {
		expect(
			notificationHref(
				view({
					metadata: { action: "submitted" },
					recipientRole: "admin",
					targetType: "employer_verification",
				})
			)
		).toBe("/moderator/employers");
		expect(
			notificationHref(
				view({
					metadata: { action: "verified" },
					targetType: "employer_verification",
				})
			)
		).toBe("/employer/settings");
	});

	it("법률자문 공유 행은 운영자 콘솔이 아니라 그 글로 보낸다", () => {
		expect(
			notificationHref(
				view({
					metadata: { board: "legal", postId: "post-9" },
					recipientRole: "legal_advisor",
					targetType: "community_post",
				})
			)
		).toBe("/seeker/community/legal/post-9");
	});

	it("삭제된 공고는 404가 될 수정 화면 대신 목록으로 보낸다", () => {
		expect(
			notificationHref(view({ metadata: { action: "hard_delete" } }))
		).toBe("/employer");
	});

	it("문의 알림은 개인이면 문의 상세로, 운영자 공유면 문의 큐로 보낸다", () => {
		expect(
			notificationHref(
				view({
					metadata: { action: "answered" },
					targetId: "inquiry-1",
					targetType: "support_inquiry",
				})
			)
		).toBe("/support/inquiries/inquiry-1");
		expect(
			notificationHref(
				view({
					metadata: { action: "replied" },
					recipientRole: "admin",
					targetId: "inquiry-1",
					targetType: "support_inquiry",
				})
			)
		).toBe("/moderator/support");
	});

	it("모르는 targetType은 알림함에 머문다", () => {
		expect(notificationHref(view({ targetType: "brand_new_thing" }))).toBe(
			"/seeker/notifications"
		);
	});
});
