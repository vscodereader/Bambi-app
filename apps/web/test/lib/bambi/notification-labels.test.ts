import { describe, expect, it } from "vitest";

import {
	type BambiNotificationView,
	notificationHref,
} from "@/lib/bambi/notification-labels";

const view = (
	overrides: Partial<BambiNotificationView>
): BambiNotificationView => ({
	chatRoomId: null,
	metadata: null,
	recipientRole: null,
	targetId: "target-1",
	targetType: "job_post",
	...overrides,
});

describe("notificationHref", () => {
	it("채팅 축 알림은 그 방으로 보낸다", () => {
		expect(
			notificationHref(view({ chatRoomId: "room-1", targetType: "chat_room" }))
		).toBe("/seeker/chats/room-1");
	});

	it("면접 알림은 방이 살아 있어도 예정된 면접 화면으로 보낸다", () => {
		// 채팅방이 삭제되면 착지할 곳이 없어진다 — 구인자·구직자 공용 화면으로 통일한다.
		expect(
			notificationHref(
				view({ chatRoomId: "room-1", targetType: "interview_schedule" })
			)
		).toBe("/seeker/me/interviews");
	});

	it("권한 변경 알림은 이동할 화면이 없다", () => {
		expect(
			notificationHref(
				view({
					metadata: { action: "role_changed" },
					targetType: "organization_member",
				})
			)
		).toBeNull();
		// 같은 targetType이라도 제외·소유권 이전은 팀 관리로 그대로 보낸다.
		expect(
			notificationHref(
				view({
					metadata: { action: "removed" },
					targetType: "organization_member",
				})
			)
		).toBe("/employer/settings/teams");
		expect(
			notificationHref(
				view({
					metadata: { action: "ownership_transferred" },
					targetType: "organization_member",
				})
			)
		).toBe("/employer/settings/teams");
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

	// 수집 글에 달린 댓글은 게시판 slug·postId가 없다 — 이 분기가 없으면 답글 알림이
	// 글이 아니라 알림함으로 되돌아간다.
	it("수집 글 댓글 알림은 수집 전용 상세로 보낸다", () => {
		expect(
			notificationHref(
				view({
					metadata: { action: "reply", crawledTopicId: "topic-1" },
					targetType: "community_comment",
				})
			)
		).toBe("/seeker/community/crawled/topic-1");
	});

	it("운영자 공유 행은 같은 targetType이라도 운영자 큐로 보낸다", () => {
		expect(
			// 공고 검수 요청은 공고 관리(/moderator/jobs)가 아니라 검수 대기 큐인 콘솔 루트로.
			notificationHref(view({ recipientRole: "admin", targetType: "job_post" }))
		).toBe("/moderator");
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

	it("대기열 3종(접수·자동 노출 시작·제외) 알림은 광고 관리로 보낸다", () => {
		expect(
			notificationHref(view({ metadata: { action: "listing_queued" } }))
		).toBe("/employer/promotions");
		expect(
			notificationHref(view({ metadata: { action: "listing_activated" } }))
		).toBe("/employer/promotions");
		expect(
			notificationHref(
				view({ metadata: { action: "remove_from_listing_queue" } })
			)
		).toBe("/employer/promotions");
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

describe("direct_message", () => {
	const item = view({
		metadata: { title: "8월 정산 안내" },
		targetType: "direct_message",
	});

	it("착지는 쪽지함이다", () => {
		expect(notificationHref(item)).toBe("/seeker/me/messages");
	});
});
