// 알림 한 건을 화면 문구·딥링크로 바꾸는 순수 맵. DB enum(target_type)과 metadata.action이
// 그대로 렌더되지 않도록 표시는 전부 여기를 거친다 — 모르는 값에도 중립 폴백이 있어
// 서버가 먼저 새 값을 내려도 원값이 화면에 새지 않는다(report-labels.ts와 같은 관례).
// web·native·(후속)푸시 본문이 같은 함수를 쓴다 — 문구는 여기 한 곳에서만 고친다.

import {
	EXPOSURE_TYPE_LABELS,
	LISTING_QUEUE_SHORT_LABELS,
} from "./bambi-ad-exposure";
import { organizationRoleLabel } from "./bambi-team-labels";

export interface BambiNotificationView {
	chatRoomId: null | string;
	metadata: Record<string, unknown> | null;
	/** 채워져 있으면 운영자·법률자문이 공유로 받은 큐 알림이다(문구·딥링크가 갈린다). */
	recipientRole: null | string;
	targetId: string;
	targetType: string;
}

const readString = (
	metadata: Record<string, unknown> | null,
	key: string
): null | string => {
	const value = metadata?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
};

const readNumber = (
	metadata: Record<string, unknown> | null,
	key: string
): null | number => {
	const value = metadata?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const action = (item: BambiNotificationView): string =>
	readString(item.metadata, "action") ?? "";

// 대기열 알림의 exposureType(원값)을 짧은 섹션 라벨로. 맵 밖 값이면 null이라 호출부에서
// 문구를 완성하지 못하고 정적 폴백으로 떨어진다.
const queueSectionLabel = (item: BambiNotificationView): null | string =>
	LISTING_QUEUE_SHORT_LABELS[
		readString(
			item.metadata,
			"exposureType"
		) as keyof typeof LISTING_QUEUE_SHORT_LABELS
	] ?? null;

const isShared = (item: BambiNotificationView): boolean =>
	item.recipientRole !== null;

const pointTransactionTitle = (item: BambiNotificationView): null | string => {
	if (item.targetType !== "point_transaction") {
		return null;
	}
	const amount = readNumber(item.metadata, "amount");
	if (amount === null) {
		return null;
	}
	if (action(item) === "review_written") {
		return `포인트 ${amount.toLocaleString("ko-KR")}가 지급되었어요! - 후기 작성`;
	}
	if (action(item) === "review_hidden") {
		const reason = readString(item.metadata, "reason");
		return `포인트 ${Math.abs(amount).toLocaleString("ko-KR")}가 차감되었어요 ㅠㅠ - 후기 숨김${reason ? ` (${reason})` : ""}`;
	}
	if (action(item) === "review_republished") {
		return `포인트 ${amount.toLocaleString("ko-KR")}가 지급되었어요! - 후기 재게시`;
	}
	if (action(item) === "comment_milestone") {
		const commentCount = readNumber(item.metadata, "commentCount");
		return commentCount === null
			? `댓글 마일스톤 보너스 ${amount.toLocaleString("ko-KR")}P가 지급됐어요!`
			: `🏆 전체 ${commentCount.toLocaleString("ko-KR")}번째 댓글 달성! 보너스 ${amount.toLocaleString("ko-KR")}P가 지급됐어요`;
	}
	if (action(item) === "point_job_reward") {
		const category = readString(item.metadata, "category");
		const label =
			category === "premium"
				? EXPOSURE_TYPE_LABELS["premium-banner"].replace(" 배너", "")
				: LISTING_QUEUE_SHORT_LABELS[
						category as keyof typeof LISTING_QUEUE_SHORT_LABELS
					];
		return `${label ?? "포인트"} 포인트 공고를 확인해 ${amount.toLocaleString("ko-KR")}포인트를 받았어요.`;
	}
	return action(item) === "admin_awarded"
		? `운영자로부터 ${amount.toLocaleString("ko-KR")} 포인트가 지급되었습니다!`
		: null;
};

// (targetType, action) 조합 문구. 조합이 없으면 targetType 기본 문구로 떨어진다.
const TITLE_BY_TARGET_AND_ACTION: Record<string, string> = {
	"community_comment:reply": "내 댓글에 답글이 달렸어요",
	"community_comment:set_community_comment_status:deleted":
		"내 댓글이 삭제됐어요",
	"community_comment:set_community_comment_status:hidden":
		"내 댓글이 숨김 처리됐어요",
	"community_post:comment": "내 글에 새 댓글이 달렸어요",
	"community_post:set_community_post_status:deleted": "내 글이 삭제됐어요",
	"community_post:set_community_post_status:hidden": "내 글이 숨김 처리됐어요",
	"employer_verification:rejected": "사업자 인증이 반려됐어요",
	"employer_verification:verified": "사업자 인증이 승인됐어요",
	"interview_schedule:canceled": "면접이 취소됐어요",
	"interview_schedule:completed": "면접이 완료 처리됐어요",
	"interview_schedule:confirmed": "면접 일정이 확정됐어요",
	"interview_schedule:declined": "면접 제안이 거절됐어요",
	"interview_schedule:proposed": "면접 제안이 도착했어요",
	"job_post:adjust_job_post_exposure": "공고 노출 기간이 조정됐어요",
	"job_post:edit_job_post": "운영자가 내 공고를 수정했어요",
	"job_post:hard_delete": "내 공고가 삭제됐어요",
	// FIFO 유료 대기열 3종. SSE 이벤트는 metadata 없이 action만 오므로 정적 폴백이 필수다
	// (dynamicTitle이 재료 부족으로 null을 돌려도 여기로 떨어진다).
	"job_post:listing_activated": "광고 노출이 시작됐어요",
	"job_post:listing_queued": "결제가 확인돼 광고 대기열에 접수됐어요",
	"job_post:remove_from_listing_queue": "광고 대기열에서 제외됐어요",
	// 상세이미지 디자인 제작 애드온 진행 상태(운영자 토글). 완료 알림이 구인자가 받는
	// 유일한 "상세이미지가 올라갔다" 신호라 폴백("공고 상태가 변경됐어요")으로 두면 안 된다.
	"job_post:set_detail_design_status:completed":
		"상세이미지 디자인 제작이 완료됐어요",
	"job_post:set_detail_design_status:requested":
		"상세이미지 디자인 제작이 대기 상태로 바뀌었어요",
	// 끌어올리기 옵션 결제 확인·미결제 전환(운영자 토글). 결제 여부가 옵션 발효 신호라
	// 폴백("공고 상태가 변경됐어요")으로 두면 구인자가 확인할 수 없다.
	"job_post:set_boost_purchase_payment:paid":
		"끌어올리기 옵션 결제가 확인되었습니다.",
	"job_post:set_boost_purchase_payment:unpaid":
		"끌어올리기 옵션 결제가 미결제로 변경되었습니다.",
	"job_post:set_payment:paid": "입금이 확인돼 공고가 게시됐어요",
	"job_post:set_status:hidden": "공고가 숨김 처리됐어요",
	"job_post:set_status:on_hold": "공고 검수가 보류됐어요",
	"job_post:set_status:published": "공고가 승인돼 게시됐어요",
	"job_post:set_status:rejected": "공고가 반려됐어요",
	"organization_member:ownership_transferred": "조직 소유권을 넘겨받았어요",
	"organization_member:removed": "조직에서 제외됐어요",
	"organization_member:role_changed": "조직 내 권한이 변경됐어요",
	// 포인트몰 보유 아이템(끌올·연장) 사용 기한 임박. 본문에 아이템명이 붙는다.
	"point_shop_order:expiry_soon": "보유 아이템이 곧 만료돼요",
	"point_transaction:admin_awarded": "운영자로부터 포인트가 지급됐어요",
	// 업주가 받는 "새 후기 등록"(reviews.ts action: "created"). 폴백 문구로 떨어지면
	// "후기 상태가 변경됐어요"가 되어 내 후기가 조치된 것처럼 정반대로 읽힌다.
	"review:created": "내 업소에 새 후기가 등록됐어요",
	"review:set_status:hidden": "내 후기가 숨김 처리됐어요",
	"review:set_status:published": "내 후기가 게시됐어요",
	"support_chat:message": "새 문의 채팅이 도착했어요",
	"support_chat:replied": "문의 채팅에 답변이 도착했어요",
	"support_inquiry:answered": "문의에 답변이 도착했어요",
	"team_invitation:accepted": "팀 합류가 승인됐어요",
	// 초대를 낸 조직 쪽이 받는 합류 완료 알림(합류자 본인의 accepted와 짝이다).
	"team_invitation:joined": "초대한 구성원이 팀에 합류했어요",
	"team_invitation:rejected": "팀 초대가 반려됐어요",
};

// 운영자·법률자문이 공유로 받는 큐 문구. 같은 targetType이라도 "내 것이 처리됐다"가
// 아니라 "새 처리거리가 왔다"로 읽혀야 한다.
const SHARED_TITLE_BY_TARGET: Record<string, string> = {
	community_post: "법률 자문 새 글이 등록됐어요",
	employer_verification: "사업자 인증 심사 요청이 들어왔어요",
	job_post: "새 공고 검수 요청이 들어왔어요",
	report: "새 신고가 접수됐어요",
	review: "후기 심사 요청이 들어왔어요",
	support_chat: "새 문의 채팅이 도착했어요",
	support_inquiry: "새 1:1 문의가 접수됐어요",
	team_invitation: "팀 초대 심사 요청이 들어왔어요",
};

const TITLE_BY_TARGET: Record<string, string> = {
	chat_message: "새 메시지가 도착했어요",
	chat_room: "새 채팅이 시작됐어요",
	community_comment: "댓글에 변동이 있어요",
	community_post: "내 글에 변동이 있어요",
	contact_reveal: "연락처가 공개됐어요",
	direct_message: "운영자 쪽지가 도착했어요",
	employer_verification: "사업자 인증 상태가 변경됐어요",
	interview_schedule: "면접 일정에 변동이 있어요",
	job_post: "공고 상태가 변경됐어요",
	organization_member: "조직 구성원 정보가 변경됐어요",
	point_shop_order: "보유 아이템에 변동이 있어요",
	point_transaction: "포인트에 변동이 있어요",
	report: "신고 처리 결과가 나왔어요",
	review: "후기 상태가 변경됐어요",
	support_chat: "문의 채팅에 변동이 있어요",
	support_inquiry: "문의에 변동이 있어요",
	team_invitation: "팀 초대에 변동이 있어요",
};

// 대기열 접수·노출 시작 동적 문구. 재료(제목·섹션 라벨·순번) 하나라도 없으면 null로
// 정적 폴백 — SSE 이벤트는 metadata 없이 action만 오므로 실시간 배너는 항상 폴백을 탄다.
const listingQueueTitle = (
	item: BambiNotificationView,
	key: string,
	jobPostTitle: null | string
): null | string => {
	const sectionLabel = queueSectionLabel(item);
	if (!(jobPostTitle && sectionLabel)) {
		return null;
	}
	if (key === "job_post:listing_activated") {
		return `｢${jobPostTitle}｣ ${sectionLabel} 노출이 시작됐어요`;
	}
	const position = readNumber(item.metadata, "position");
	return position === null
		? null
		: `｢${jobPostTitle}｣이 ${sectionLabel} 대기열 #${position}에 접수됐어요`;
};

/**
 * 공고명·업소명처럼 metadata가 있어야 완성되는 문구. 서버가 그 값을 싣기 전에 쌓인
 * 구버전 행도 그대로 남아 있으므로, 재료가 하나라도 없으면 null을 돌려 아래 정적 맵
 * 문구로 폴백한다(「」만 남은 빈 제목이 나오지 않게).
 */
const dynamicTitle = (
	item: BambiNotificationView,
	key: string
): null | string => {
	const jobPostTitle = readString(item.metadata, "jobPostTitle");

	switch (key) {
		// 승인은 셋으로 갈린다: 숨김 해제(재공개) / 유료 공고의 입금 대기 / 무료 즉시 게시.
		// 유료 공고는 승인만으로 노출되지 않아 "게시됐어요"가 사실과 다르다.
		case "job_post:set_status:published": {
			if (readString(item.metadata, "previousStatus") === "hidden") {
				return "공고가 재공개됐어요";
			}
			return item.metadata?.paymentPending === true
				? "공고가 승인됐어요. 입금 확인 후 게시됩니다"
				: null;
		}
		case "job_post:adjust_job_post_exposure": {
			const days = readNumber(item.metadata, "days");
			if (!(jobPostTitle && days)) {
				return null;
			}
			const direction = days > 0 ? "연장" : "단축";
			return `｢${jobPostTitle}｣ 공고의 노출 기간이 ${Math.abs(days)}일 ${direction}되었습니다`;
		}
		case "job_post:hard_delete":
			return jobPostTitle ? `｢${jobPostTitle}｣ 공고가 삭제됐어요` : null;
		case "job_post:listing_activated":
		case "job_post:listing_queued":
			return listingQueueTitle(item, key, jobPostTitle);
		case "review:created":
			return jobPostTitle ? `｢${jobPostTitle}｣ 공고에 후기가 달렸어요` : null;
		case "organization_member:role_changed": {
			const orgName = readString(item.metadata, "orgName");
			const role = readString(item.metadata, "role");
			return orgName && role
				? `${orgName}에서 권한이 ${organizationRoleLabel(role)}(으)로 변경되었습니다`
				: null;
		}
		case "team_invitation:joined": {
			const joinedDisplayName = readString(item.metadata, "joinedDisplayName");
			return joinedDisplayName
				? `${joinedDisplayName}님이 팀에 합류했어요`
				: null;
		}
		default:
			return null;
	}
};

export function notificationTitle(item: BambiNotificationView): string {
	if (isShared(item)) {
		// 문의 재질문(replied)만 공유 큐에서 문구가 갈린다.
		if (item.targetType === "support_inquiry" && action(item) === "replied") {
			return "문의자가 다시 질문했어요";
		}
		return (
			SHARED_TITLE_BY_TARGET[item.targetType] ?? "새 처리 요청이 들어왔어요"
		);
	}

	// 노출 조정은 action에 일수가 붙는다(adjust_job_post_exposure:+7) — prefix로 맞춘다.
	const rawAction = action(item);
	const normalizedAction = rawAction.startsWith("adjust_job_post_exposure")
		? "adjust_job_post_exposure"
		: rawAction;

	const key = `${item.targetType}:${normalizedAction}`;

	return (
		pointTransactionTitle(item) ??
		dynamicTitle(item, key) ??
		TITLE_BY_TARGET_AND_ACTION[key] ??
		TITLE_BY_TARGET[item.targetType] ??
		"새 알림이 도착했어요"
	);
}

// 사유를 본문으로 낼 수 있는 부정 전이 결과. metadata.reason은 부정 전이에서만 당사자에게
// 남기는 설명이고, 그 밖(승인·게시·접수)에서는 운영자 내부 메모이거나 신고 사유 enum
// 원값이라 그대로 렌더하면 안 새야 할 값이 샌다(스펙 §4).
const REASON_VISIBLE_OUTCOMES = new Set([
	"deleted",
	"hard_delete",
	"hidden",
	"on_hold",
	"rejected",
	// 운영자가 유료 대기열에서 제외할 때 남기는 사유를 본문으로 노출한다.
	"remove_from_listing_queue",
]);

/**
 * 반려·숨김류의 사유. 사유가 없거나 부정 전이가 아니면 본문 없이 제목만 보여준다.
 * action은 `set_status:rejected`·`set_community_post_status:hidden`처럼 접미가 붙거나
 * `hard_delete`·`rejected`처럼 단독으로 오므로 마지막 세그먼트로 판정한다.
 */
export function notificationBody(item: BambiNotificationView): null | string {
	// 쪽지는 metadata.title(쪽지 제목)을 본문으로 낸다 — 본문 원문은 정본(쪽지함)에서 읽는다.
	if (item.targetType === "direct_message") {
		return readString(item.metadata, "title");
	}
	// 만료 임박은 어떤 아이템인지 본문에 실어 준다(제목은 유형 불문 공통 문구).
	if (
		item.targetType === "point_shop_order" &&
		action(item) === "expiry_soon"
	) {
		const itemName = readString(item.metadata, "itemName");
		return itemName
			? `｢${itemName}｣의 사용 기한이 곧 끝나요. 만료 전에 사용해 주세요.`
			: null;
	}
	const rawAction = action(item);
	// 신고 처리 결과의 reason만 예외로 전이 방향과 무관하게 남긴다 — 운영자가 신고자에게
	// 남기는 처리 메모라(setReportStatus의 자유 입력) 결과가 resolved여도 본문이 정보다.
	const visible =
		rawAction.startsWith("set_report_status:") ||
		REASON_VISIBLE_OUTCOMES.has(rawAction.split(":").at(-1) ?? "");

	return visible ? readString(item.metadata, "reason") : null;
}
