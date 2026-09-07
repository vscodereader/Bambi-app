import type { BambiNotificationView } from "@bambi-app/api/services/bambi-notification-labels";
import { describe, expect, it } from "vitest";

import { notificationRoute } from "./notification-route";

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

describe("notificationRoute", () => {
	it("채팅 축은 역할별 채팅방, 방이 없으면 채팅 탭", () => {
		const withRoom = view({ chatRoomId: "room-1", targetType: "chat_message" });
		expect(notificationRoute(withRoom, "seeker")).toBe(
			"/(seeker)/chats/room-1"
		);
		expect(notificationRoute(withRoom, "employer")).toBe(
			"/(employer)/chats/room-1"
		);
		expect(
			notificationRoute(view({ targetType: "contact_reveal" }), "seeker")
		).toBe("/(seeker)/(tabs)/chats");
	});

	it("구직자 전용 타입은 seeker 셸에서만 이동한다", () => {
		expect(
			notificationRoute(view({ targetType: "interview_schedule" }), "seeker")
		).toBe("/(seeker)/me/interviews");
		expect(
			notificationRoute(view({ targetType: "interview_schedule" }), "employer")
		).toBeNull();
		expect(
			notificationRoute(view({ targetType: "direct_message" }), "seeker")
		).toBe("/(seeker)/me/messages");
		expect(notificationRoute(view({ targetType: "report" }), "seeker")).toBe(
			"/(seeker)/me/reports"
		);
		expect(
			notificationRoute(view({ targetType: "point_transaction" }), "seeker")
		).toBe("/(seeker)/me/attendance");
		expect(
			notificationRoute(view({ targetType: "point_shop_order" }), "seeker")
		).toBe("/(seeker)/me/attendance");
	});

	it("후기는 공고 id가 있을 때만 상세로 간다", () => {
		expect(
			notificationRoute(
				view({ metadata: { jobPostId: "job-9" }, targetType: "review" }),
				"seeker"
			)
		).toBe("/(seeker)/jobs/job-9");
		expect(
			notificationRoute(view({ targetType: "review" }), "seeker")
		).toBeNull();
	});

	it("구인자 공고 알림은 대기열·결제류면 광고 관리, 그 외는 편집", () => {
		for (const action of [
			"listing_queued",
			"listing_activated",
			"remove_from_listing_queue",
			"set_payment:paid",
		]) {
			expect(
				notificationRoute(view({ metadata: { action } }), "employer")
			).toBe("/(employer)/promotions");
		}
		expect(
			notificationRoute(
				view({
					metadata: { action: "set_status:rejected" },
					targetId: "job-3",
				}),
				"employer"
			)
		).toBe("/(employer)/jobs/job-3/edit");
		expect(
			notificationRoute(
				view({ metadata: { action: "hard_delete" } }),
				"employer"
			)
		).toBe("/(employer)/(tabs)");
		expect(notificationRoute(view({}), "seeker")).toBeNull();
	});

	it("구인자 설정류는 employer 셸에서만 이동한다", () => {
		expect(
			notificationRoute(
				view({ targetType: "employer_verification" }),
				"employer"
			)
		).toBe("/(employer)/me/business");
		expect(
			notificationRoute(view({ targetType: "team_invitation" }), "employer")
		).toBe("/(employer)/me/teams");
		expect(
			notificationRoute(view({ targetType: "organization_member" }), "employer")
		).toBe("/(employer)/me/teams");
		expect(
			notificationRoute(view({ targetType: "team_invitation" }), "seeker")
		).toBeNull();
	});

	it("native 화면이 없는 타입·공유 알림은 null", () => {
		for (const targetType of [
			"community_post",
			"community_comment",
			"support_inquiry",
			"support_chat",
			"unknown_future_type",
		]) {
			expect(notificationRoute(view({ targetType }), "seeker")).toBeNull();
		}
		expect(
			notificationRoute(
				view({ recipientRole: "admin", targetType: "report" }),
				"seeker"
			)
		).toBeNull();
	});
});
