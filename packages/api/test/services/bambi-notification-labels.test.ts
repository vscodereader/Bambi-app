import { describe, expect, it } from "vitest";

import {
	notificationBody,
	notificationTitle,
} from "@/services/bambi-notification-labels";

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

	it("업주가 받는 새 후기 등록은 공고명을 달고 후기 조치 문구와 갈린다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "created", jobPostTitle: "홀서빙 급구" },
					targetType: "review",
				})
			)
		).toBe("｢홀서빙 급구｣ 공고에 후기가 달렸어요");
		expect(
			notificationTitle(
				view({
					metadata: { action: "set_status:hidden" },
					targetType: "review",
				})
			)
		).toBe("내 후기가 숨김 처리됐어요");
	});

	it("후기 포인트 지급·숨김 회수·재게시 금액을 사용자 문구로 표시한다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "review_written", amount: 30 },
					targetType: "point_transaction",
				})
			)
		).toBe("포인트 30가 지급되었어요! - 후기 작성");
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "review_hidden",
						amount: -30,
						reason: "개인정보 노출",
					},
					targetType: "point_transaction",
				})
			)
		).toBe("포인트 30가 차감되었어요 ㅠㅠ - 후기 숨김 (개인정보 노출)");
		expect(
			notificationTitle(
				view({
					metadata: { action: "review_republished", amount: 50 },
					targetType: "point_transaction",
				})
			)
		).toBe("포인트 50가 지급되었어요! - 후기 재게시");
	});

	it("포인트 공고 적립 문구와 내부·수집 공고 딥링크를 만든다", () => {
		const internal = view({
			metadata: {
				action: "point_job_reward",
				amount: 10,
				category: "special",
				jobPostId: "11111111-1111-4111-8111-111111111111",
				targetSource: "job_post",
			},
			targetType: "point_transaction",
		});
		expect(notificationTitle(internal)).toBe(
			"스페셜 포인트 공고를 확인해 10포인트를 받았어요."
		);
	});

	it("공고 승인은 결제 대기·재공개·즉시 게시로 갈린다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "set_status:published", paymentPending: true },
				})
			)
		).toBe("공고가 승인됐어요. 입금 확인 후 게시됩니다");
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "set_status:published",
						paymentPending: false,
						previousStatus: "hidden",
					},
				})
			)
		).toBe("공고가 재공개됐어요");
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "set_status:published",
						paymentPending: false,
						previousStatus: "pending_review",
					},
				})
			)
		).toBe("공고가 승인돼 게시됐어요");
	});

	it("노출 조정은 공고명과 증감 일수를 문구에 담는다", () => {
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "adjust_job_post_exposure:+7",
						days: 7,
						jobPostTitle: "주말 홀 스태프",
					},
				})
			)
		).toBe("｢주말 홀 스태프｣ 공고의 노출 기간이 7일 연장되었습니다");
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "adjust_job_post_exposure:-3",
						days: -3,
						jobPostTitle: "주말 홀 스태프",
					},
				})
			)
		).toBe("｢주말 홀 스태프｣ 공고의 노출 기간이 3일 단축되었습니다");
	});

	it("공고 삭제는 어느 공고였는지 제목으로 남긴다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "hard_delete", jobPostTitle: "야간 마감 알바" },
				})
			)
		).toBe("｢야간 마감 알바｣ 공고가 삭제됐어요");
	});

	it("대기열 접수·노출 시작은 공고명·섹션·순번을 담고 재료가 없으면 정적 폴백한다", () => {
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "listing_queued",
						exposureType: "special",
						jobPostTitle: "주말 홀 스태프",
						position: 3,
					},
				})
			)
		).toBe("｢주말 홀 스태프｣이 스페셜 대기열 #3에 접수됐어요");
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "listing_activated",
						exposureType: "recommended",
						jobPostTitle: "주말 홀 스태프",
					},
				})
			)
		).toBe("｢주말 홀 스태프｣ 추천 노출이 시작됐어요");
		// SSE 이벤트는 metadata 없이 action만 오므로 정적 폴백으로 떨어진다.
		expect(
			notificationTitle(view({ metadata: { action: "listing_queued" } }))
		).toBe("결제가 확인돼 광고 대기열에 접수됐어요");
		expect(
			notificationTitle(view({ metadata: { action: "listing_activated" } }))
		).toBe("광고 노출이 시작됐어요");
	});

	it("권한 변경은 업소명과 한글 역할 라벨로 조합한다", () => {
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "role_changed",
						orgName: "밤비라운지",
						role: "manager",
					},
					targetType: "organization_member",
				})
			)
		).toBe("밤비라운지에서 권한이 매니저(으)로 변경되었습니다");
	});

	it("모르는 역할이어도 enum 원값을 노출하지 않는다", () => {
		expect(
			notificationTitle(
				view({
					metadata: {
						action: "role_changed",
						orgName: "밤비라운지",
						role: "brand_new_role",
					},
					targetType: "organization_member",
				})
			)
		).toBe("밤비라운지에서 권한이 구성원(으)로 변경되었습니다");
	});

	it("초대한 쪽은 합류자 닉네임이 담긴 합류 알림을 받는다", () => {
		expect(
			notificationTitle(
				view({
					metadata: { action: "joined", joinedDisplayName: "김밤비" },
					targetType: "team_invitation",
				})
			)
		).toBe("김밤비님이 팀에 합류했어요");
	});

	it("metadata가 없는 구버전 행은 정적 문구로 폴백한다", () => {
		// 서버가 공고명·업소명을 싣기 전에 쌓인 알림도 그대로 남아 있다.
		expect(
			notificationTitle(view({ metadata: { action: "set_status:published" } }))
		).toBe("공고가 승인돼 게시됐어요");
		expect(
			notificationTitle(view({ metadata: { action: "hard_delete" } }))
		).toBe("내 공고가 삭제됐어요");
		expect(
			notificationTitle(
				view({
					metadata: { action: "adjust_job_post_exposure:+7" },
				})
			)
		).toBe("공고 노출 기간이 조정됐어요");
		expect(
			notificationTitle(
				view({
					metadata: { action: "role_changed" },
					targetType: "organization_member",
				})
			)
		).toBe("조직 내 권한이 변경됐어요");
		expect(
			notificationTitle(
				view({ metadata: { action: "created" }, targetType: "review" })
			)
		).toBe("내 업소에 새 후기가 등록됐어요");
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

	it("대기열 제외는 운영자 제외 사유를 본문으로 보여준다", () => {
		expect(
			notificationBody(
				view({
					metadata: {
						action: "remove_from_listing_queue",
						reason: "중복 접수 정리",
					},
				})
			)
		).toBe("중복 접수 정리");
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

describe("direct_message", () => {
	const item = view({
		metadata: { title: "8월 정산 안내" },
		targetType: "direct_message",
	});

	it("제목은 쪽지 도착 문구다", () => {
		expect(notificationTitle(item)).toBe("운영자 쪽지가 도착했어요");
	});

	it("본문은 쪽지 제목이다", () => {
		expect(notificationBody(item)).toBe("8월 정산 안내");
	});

	it("본문 제목이 없으면 본문을 생략한다", () => {
		expect(
			notificationBody(view({ metadata: {}, targetType: "direct_message" }))
		).toBeNull();
	});
});
