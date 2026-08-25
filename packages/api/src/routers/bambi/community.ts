import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiSiteSettings,
	communityBoard,
	communityBoardHomeLayout,
	communityComment,
	communityNoticeBoardPlacement,
	communityPost,
	communityPostLike,
	communityPostLikeHistory,
	crawledCommunityTopic,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import z from "zod";

import { protectedProcedure, publicProcedure } from "../../index";
import {
	type BambiAccessProfile,
	requireAdminProfile,
} from "../../services/bambi-authz";
import { assertNoBannedWords } from "../../services/bambi-banned-words";
import {
	assertAnonymousPostAllowed,
	assertGuestOwnership,
	assertGuestPostAccess,
	assertLegalAdvisorBoardScope,
	assertSecretActorIdentity,
	type CommunityActor,
	canBypassLock,
	findCommunityMember,
	findCommunityReaderForBoard,
	GUEST_LOCKED_ERROR,
	isSecretBoard,
	LEGAL_BOARD,
	requireCommunityMember,
	requireGuestPassword,
	resolveCommunityActor,
	resolveCommunityActorForBoard,
	resolveCommunityReaderForBoard,
	resolveLockedForBoard,
	SECRET_AUTHOR_NAME,
} from "../../services/bambi-community-authz";
import {
	hashCommunityPassword,
	verifyCommunityPassword,
} from "../../services/bambi-community-password";
import { assertNotAlreadyDeleted } from "../../services/bambi-content-status";
import { assertDisplayNameAllowed } from "../../services/bambi-display-name-policy";
import { pingCommunityPost } from "../../services/bambi-indexnow";
import { escapeLikePattern } from "../../services/bambi-job-feed";
import {
	JOB_POST_IMAGE_MAX_BYTES,
	type JobPostImageUploadPolicyCode,
	validateJobPostImageUpload,
} from "../../services/bambi-job-media-policy";
import {
	type GradeBadge,
	getBoardContentPoints,
	loadGradeBadges,
	POINT_REASONS,
	reconcileContentPoints,
	resolveCommentAward,
} from "../../services/bambi-member-points";
import { resolveNotificationRecipients } from "../../services/bambi-notification-recipients";
import {
	notifyBambiNotification,
	notifyModerationAction,
} from "../../services/bambi-notifications";
import { createEditorMediaUploadIntent } from "../../services/bambi-storage";
import {
	assertTiptapDoc,
	extractTiptapText,
} from "../../services/bambi-tiptap-text";
import { assertCommunityWarningRestriction } from "../../services/bambi-warning-restriction";
import { resolveVisibleDisplayName } from "../../services/bambi-withdrawn-display";
import { releaseRateLimit, takeRateLimit } from "../../services/rate-limit";

const PAGE_SIZE = 20;
const OVERVIEW_LIMIT = 4;
const BEST_WINDOW_DAYS = 30;
const BEST_MIN_LIKES = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCKED_TITLE = "비밀글입니다";
const BODY_MAX = 30_000;
const COMMENTS_CAP = 200;

// 게시판 목록은 community_board 테이블이 정본이라 입력에서는 좁히지 않는다 —
// 존재·활성·쓰기 가능 여부는 핸들러의 assertBoard가 DB를 보고 판정한다(운영자가
// 게시판을 추가할 때마다 zod enum을 고치고 배포해야 하던 구조를 걷어냈다).
const boardKeySchema = z.string().trim().min(1).max(40);

// 저장 게시판이 아닌 가상 큐레이션. 읽기 경로에서만 허용한다(글은 여기에 못 쓴다).
const BEST_BOARD = "best";
const BEST_BOARD_LABEL = "베스트글";
const BEST_BOARD_DESCRIPTION = "최근 30일 동안 추천을 많이 받은 글";

// 비로그인(크롤러 포함)에게 읽기만 여는 게시판. 서버가 이 목록으로 강제하고, 화면은
// 이 값을 따라간다 — 목록·상세 어느 쪽으로 들어와도 같은 집합만 열린다.
// 중고거래(market)는 회원 간 거래 맥락이라 제외하고, 베스트(best)는 게시판이 아니라
// 전 게시판 큐레이션이라 비공개 보드 글이 섞이므로 제외한다.
const PUBLIC_COMMUNITY_BOARDS = ["notice", "free", "work_talk"] as const;
const publicBoardSchema = z.enum(PUBLIC_COMMUNITY_BOARDS);

const isPublicBoard = (board: string): boolean =>
	publicBoardSchema.safeParse(board).success;

// 요약 행의 출처. 화면이 이 값으로 상세 라우팅을 가른다(공고 목록의 JobFeedSource와 같은
// 판별). 순수 글은 "native", 수집 글은 "crawled" — 목록에 출처 배지는 달지 않는다.
type CommunityFeedSource = "crawled" | "native";

// 설계 D4 — 수집 커뮤니티 글이 합류하는 게시판. 상수 하나만 바꾸면 다른 게시판으로 옮길 수 있게 둔다.
const CRAWLED_COMMUNITY_BOARD = "work_talk";

// 원본 게시판명이 비어 있을 때 작성자 자리에 세울 값(수집 대상 게시판 이름).
const CRAWLED_AUTHOR_NAME = "밤문화이야기";

// UNION 상대편 타입의 정본은 순수 글 컬럼이다. 수집 쪽 sql 리터럴이 이 타입을 참조하면
// enum 값이 늘거나 컬럼이 바뀌어도 두 투영이 함께 움직인다(한쪽만 어긋나 UNION이 깨지지 않는다).
type CommunityPostColumns = typeof communityPost.$inferSelect;

// 목록 필터 — 독립 On/Off 토글 2개(광고 글보기·업소 회원 글보기). 기본은 둘 다 false=전체.
// 켜진 토글이 있으면 그 조건들의 합집합(OR)으로 좁힌다(광고=is_promotion, 업소=author_role).
// mine·q는 위 두 토글과 달리 AND로 좁힌다(서로 배타가 아니다).
const listPostsInput = z.object({
	board: boardKeySchema,
	// 내가 쓴 글만 보기. 대상 userId는 입력으로 받지 않고 세션에서 꺼낸다.
	mine: z.boolean().default(false),
	page: z.number().int().min(1).default(1),
	// 제목·본문 검색어.
	q: z.string().trim().max(50).optional(),
	showEmployer: z.boolean().default(false),
	showPromotion: z.boolean().default(false),
});

const postIdInput = z.object({
	postId: z.string().uuid(),
});

const createPostInput = z.object({
	authorName: z.string().trim().min(1).max(30),
	board: boardKeySchema,
	body: z.string().min(2).max(BODY_MAX),
	// 법률 자문 글의 선택 입력 연락처. 다른 게시판에서는 받지 않는다(아래 assertContactPhoneBoard).
	contactPhone: z.string().trim().max(20).optional(),
	commentsDisabled: z.boolean().default(false),
	isLocked: z.boolean().default(false),
	isEvent: z.boolean().default(false),
	isAnonymous: z.boolean().default(false),
	isPromotion: z.boolean().default(false),
	noticeBoardKeys: z.array(boardKeySchema).default([]),
	// 비밀번호는 비밀글(잠금)에만 필요하다 — 잠그지 않으면 생략하고 등록할 수 있다.
	password: z.string().trim().max(30).optional(),
	title: z.string().trim().min(2).max(100),
});

// 본문 이미지 업로드 인텐트 입력. userId는 입력으로 받지 않는다 — 세션에서 꺼내야
// 클라이언트가 남의 userId를 적어 그 사람 네임스페이스에 객체를 심는 경로가 아예 없다.
// (공고 쪽은 organizationId를 입력으로 받는 탓에 소유권 가드를 한 겹 더 둬야 했다.)
const createMediaUploadInput = z.object({
	byteSize: z.number().int().min(1),
	fileName: z.string().max(180),
	mimeType: z.string().min(1).max(120),
});

// 공고 이미지 정책(validateJobPostImageUpload)을 usage 없이 그대로 쓴다 = 가장 좁은 허용
// 집합(JPG·PNG·WebP, 8MB). 코드는 그쪽 정책이 정본이고 여기서는 한국어 문구만 입힌다.
const MEDIA_UPLOAD_ERROR_MESSAGES: Record<
	JobPostImageUploadPolicyCode,
	string
> = {
	empty_file_name: "파일 이름을 확인할 수 없습니다. 다시 선택해 주세요.",
	file_too_large: `이미지는 ${JOB_POST_IMAGE_MAX_BYTES / 1024 / 1024}MB 이하만 올릴 수 있습니다.`,
	unsupported_type: "JPG·PNG·WebP 이미지만 올릴 수 있습니다.",
};

const LOCKED_PASSWORD_ERROR = "비밀글은 4자 이상의 비밀번호가 필요합니다.";
const CONTACT_PHONE_BOARD_ERROR =
	"연락처는 무료 법률 자문 게시판에만 남길 수 있습니다.";

// 연락처는 법률 자문 글 전용 필드다. 다른 게시판에 실려 오면 조용히 버리지 않고 거부한다 —
// 사용자가 남긴 연락처가 저장되지 않은 채 성공 응답이 나가면 안 된다(광고글 role 규칙과 같은 축).
const assertContactPhoneBoard = (
	board: string,
	contactPhone: string | undefined
): void => {
	if (contactPhone && board !== LEGAL_BOARD) {
		throw new ORPCError("BAD_REQUEST", { message: CONTACT_PHONE_BOARD_ERROR });
	}
};

const assertEventNoticePolicy = ({
	board,
	isEvent,
	isLocked,
	role,
}: {
	board: string;
	isEvent: boolean;
	isLocked: boolean;
	role: string;
}): void => {
	if (!isEvent) {
		return;
	}
	if (board !== "notice" || role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "이벤트 공지는 운영자만 작성·수정할 수 있습니다.",
		});
	}
	if (isLocked) {
		throw new ORPCError("BAD_REQUEST", {
			message: "이벤트 공지는 비밀글과 함께 사용할 수 없습니다.",
		});
	}
};

// 도배 방지 — 회원은 계정당, 비회원은 gid·IP당 1분 창. 판정 축이 IP만이 아니라 계정·
// 신원이라 미들웨어(rateLimitedPublicProcedure)가 아니라 핸들러에서 버킷을 잡는다.
const WRITE_WINDOW_MS = 60 * 1000;
const CREATE_POST_RATE_LIMIT_ERROR =
	"글은 1분에 한 번만 등록할 수 있어요. 잠시 후 다시 시도해 주세요.";
const COMMENT_LIMIT = 5;
const COMMENT_RATE_LIMIT_ERROR =
	"댓글을 너무 빠르게 남기고 있어요. 잠시 후 다시 시도해 주세요.";

// 댓글에는 글과 달리 표시명 컬럼이 없다(회원은 계정 이름을 join한다) — 비회원 댓글은
// 이 고정 표시명으로 나간다.
const GUEST_DISPLAY_NAME = "비회원";

const updatePostInput = postIdInput.extend({
	authorName: z.string().trim().min(1).max(30),
	body: z.string().min(2).max(BODY_MAX),
	contactPhone: z.string().trim().max(20).optional(),
	commentsDisabled: z.boolean().optional(),
	isLocked: z.boolean(),
	isEvent: z.boolean().optional(),
	isAnonymous: z.boolean().optional(),
	isPromotion: z.boolean(),
	noticeBoardKeys: z.array(boardKeySchema).optional(),
	password: z.string().trim().max(30).optional(),
	title: z.string().trim().min(2).max(100),
});

const PROMOTION_ROLE_ERROR = "광고글은 업소회원만 표시할 수 있습니다.";

const assertCommentsDisabledAllowed = (
	commentsDisabled: boolean | undefined,
	role: string
): void => {
	if (commentsDisabled !== undefined && role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "댓글 작성 제한은 운영자만 설정할 수 있습니다.",
		});
	}
};

const assertCreateCommentsDisabledAllowed = (
	commentsDisabled: boolean,
	role: string
): void => {
	if (commentsDisabled) {
		assertCommentsDisabledAllowed(true, role);
	}
};

const validateNoticeBoardKeys = async (
	board: string,
	role: string,
	keys: string[]
): Promise<string[]> => {
	if (board !== "notice" || role !== "admin") {
		if (keys.length > 0) {
			throw new ORPCError("FORBIDDEN", {
				message: "공지사항 노출 게시판은 운영자만 선택할 수 있습니다.",
			});
		}
		return [];
	}
	const unique = [...new Set(keys)];
	if (unique.length !== keys.length || unique.includes("notice")) {
		throw new ORPCError("BAD_REQUEST", {
			message: "공지사항 노출 게시판 선택을 확인해 주세요.",
		});
	}
	if (unique.length === 0) {
		return [];
	}
	const rows = await db
		.select({ key: communityBoard.key })
		.from(communityBoard)
		.where(
			and(
				eq(communityBoard.isActive, true),
				inArray(communityBoard.key, unique)
			)
		);
	if (rows.length !== unique.length) {
		throw new ORPCError("BAD_REQUEST", {
			message: "선택할 수 없는 게시판이 포함되어 있습니다.",
		});
	}
	return unique;
};

const resolveMemberPostAuthorName = async (
	actor: CommunityActor,
	requestedName: string,
	isAnonymous: boolean
): Promise<string> => {
	if (actor.kind === "guest") {
		return GUEST_DISPLAY_NAME;
	}
	if (isAnonymous) {
		return requestedName;
	}
	const [account] = await db
		.select({ name: user.name })
		.from(user)
		.where(eq(user.id, actor.profile.userId))
		.limit(1);
	return account?.name?.trim() || requestedName;
};

const deletePostInput = postIdInput.extend({
	password: z.string().trim().max(30).optional(),
});

// 잠긴 글의 추천·댓글 열람도 상세 조회와 동일하게 비밀번호 게이트를 통과해야 한다.
const postReadInput = postIdInput.extend({
	password: z.string().trim().max(30).optional(),
});

// password는 액터에 따라 뜻이 갈린다: 회원은 잠긴 글을 여는 열쇠, 비회원은 자기 댓글의
// 소유권 증명용 비밀번호다. 비회원은 잠긴 글에 댓글을 달 수 없어(공개 보드 한정) 두 뜻이
// 한 요청에서 겹치지 않는다.
const createCommentInput = postIdInput.extend({
	body: z.string().trim().min(1).max(1000),
	parentCommentId: z.string().uuid().optional(),
	password: z.string().trim().max(30).optional(),
});

// 수집 글 댓글 입력. 우리 글 댓글과 같은 필드에 대상만 topicId로 갈린다(잠금이 없어
// password는 언제나 비회원 소유권 비밀번호 한 가지 뜻이다).
const createCrawledCommentInput = z.object({
	body: z.string().trim().min(1).max(1000),
	parentCommentId: z.string().uuid().optional(),
	password: z.string().trim().max(30).optional(),
	topicId: z.string().uuid(),
});

const deleteCommentInput = z.object({
	commentId: z.string().uuid(),
	// 비회원 댓글 소유권 증명. 회원은 세션으로 증명하므로 보내지 않는다.
	password: z.string().trim().max(30).optional(),
});

const updateCommentInput = z.object({
	body: z.string().trim().min(1).max(1000),
	commentId: z.string().uuid(),
	password: z.string().trim().max(30).optional(),
});

// 운영자 조치 — 작성자·비밀번호와 무관하게 admin만 글·댓글 상태를 전환한다(published/hidden/deleted).
const communityAdminStatusSchema = z.enum(["published", "hidden", "deleted"]);

const setPostStatusByAdminInput = z.object({
	postId: z.string().uuid(),
	reason: z.string().trim().min(1).max(500),
	reportId: z.string().uuid().optional(),
	status: communityAdminStatusSchema,
});

const setCommentStatusByAdminInput = z.object({
	commentId: z.string().uuid(),
	reason: z.string().trim().min(1).max(500),
	reportId: z.string().uuid().optional(),
	status: communityAdminStatusSchema,
});

// profile null은 잠금 우회가 없는 열람자(비회원 게스트) — 비밀글은 비밀번호로만 열린다.
export const requirePostReadAccess = (
	post: {
		authorUserId: string | null;
		board: string;
		isLocked: boolean;
		passwordHash: string;
	},
	profile: BambiAccessProfile | null,
	password?: string
): void => {
	if (!post.isLocked || canBypassLock(post, profile)) {
		return;
	}
	if (password && verifyCommunityPassword(password, post.passwordHash)) {
		return;
	}
	throw new ORPCError("FORBIDDEN", {
		message: "비밀글입니다. 비밀번호를 확인해 주세요.",
	});
};

const maskLockedSummaries = <
	T extends {
		authorUserId: string | null;
		board: string;
		isLocked: boolean;
		title: string;
	},
>(
	items: T[],
	profile: BambiAccessProfile | null
): T[] =>
	items.map((item) =>
		item.isLocked && !canBypassLock(item, profile)
			? { ...item, title: LOCKED_TITLE }
			: item
	);

const visiblePostAuthorName = (post: {
	authorDisplayName: string;
	authorGender: "female" | "male" | null;
}): string => (post.authorGender ? SECRET_AUTHOR_NAME : post.authorDisplayName);

const visiblePostAuthorImage = (
	post: { authorGender: "female" | "male" | null; isAnonymous: boolean },
	image: null | string | undefined
): null | string =>
	post.authorGender || post.isAnonymous ? null : (image ?? null);

// 목록·상세 공용 요약 셀렉션. 작성자 표시명은 글별 author_display_name 컬럼 값.
// source·isCrawled는 순수 글 쪽 상수다 — 수집 글 union(crawledCommunityFeedSelection)이
// 같은 키·순서로 마주 서야 해서 여기에 둔다. isCrawled는 union 정렬 키로만 쓰이고
// 응답(toPublicSummary)에는 나가지 않는다.
const postSummarySelection = {
	authorGender: communityPost.authorGender,
	authorName: communityPost.authorDisplayName,
	authorRole: communityPost.authorRole,
	authorUserId: communityPost.authorUserId,
	board: communityPost.board,
	commentCount: communityPost.commentCount,
	createdAt: communityPost.createdAt,
	id: communityPost.id,
	isLocked: communityPost.isLocked,
	isEvent: communityPost.isEvent,
	isPromotion: communityPost.isPromotion,
	likeCount: communityPost.likeCount,
	title: communityPost.title,
	// 공개 사이트맵의 lastmod가 쓴다(수정된 글이 다시 크롤링되게).
	updatedAt: communityPost.updatedAt,
	// 목록 썸네일 — 본문(Tiptap doc JSON)에서 첫 이미지 src만 뽑는다. 본문 전체를 목록
	// 응답에 실으면 한 페이지에 30KB짜리 글 20건이 그대로 따라 나온다.
	thumbnailUrl: sql<
		string | null
	>`substring(${communityPost.body} from '"src":"([^"]*)"')`.as(
		"thumbnail_url"
	),
	viewCount: communityPost.viewCount,
	source: sql<CommunityFeedSource>`'native'`.as("source"),
	isNotice:
		sql<number>`case when ${communityPost.board} = 'notice' then 0 else 1 end`.as(
			"is_notice"
		),
	isCrawled: sql<number>`0`.as("is_crawled"),
};

// 수집 커뮤니티 글을 순수 요약과 같은 모양으로 투영한다. UNION은 이름이 아니라 위치로
// 컬럼을 맞추므로 postSummarySelection과 **키 순서까지** 같아야 한다(bambi-job-feed.ts와 같은 원칙).
// 없는 값은 리터럴로 채운다 — 수집 글엔 작성자 계정·잠금·추천·광고가 없다.
const crawledCommunityFeedSelection = {
	authorGender: sql<CommunityPostColumns["authorGender"]>`null`,
	// 작성자 자리에 원본 게시판명을 노출한다(설계 D4 — "밤문화이야기"). 개인 필명이 아니다.
	// board_name은 nullable이라 coalesce로 채운다 — UNION 상대(순수 author_display_name)가
	// NOT NULL이고, 값이 비어도 화면에 빈 작성자가 서면 안 된다.
	authorName: sql<string>`coalesce(${crawledCommunityTopic.boardName}, ${CRAWLED_AUTHOR_NAME})`,
	// 수집 글엔 우리 계정 유형 스냅샷이 없어 런타임 값은 null이다. UNION 상대가 NOT NULL enum
	// 이라 타입만 맞춰 두고 값은 null 그대로 둔다 — 화면은 authorRole이 아니라 source로
	// 수집 여부를 갈라야 한다(업소 배지가 수집 글에 붙으면 안 된다).
	authorRole: sql<CommunityPostColumns["authorRole"]>`null`,
	// 마스킹·잠금 계산용 내부 필드. 수집 글은 잠금이 아니라 실제로 쓰이지 않지만 union 위치를
	// 맞추려 빈 문자열로 채운다(응답에선 toPublicSummary가 떨군다).
	authorUserId: sql<string>`''`,
	// 게시판 enum은 순수 쪽 컬럼 타입을 그대로 쓴다(z 스키마의 "best"는 저장 게시판이 아니라
	// 가상 큐레이션이라 UNION 타입에 섞이면 안 된다).
	board: sql<CommunityPostColumns["board"]>`'work_talk'`,
	// 원본 수집 댓글 수 + 우리 회원·비회원이 남긴 published 댓글 수. 상세 getCrawledTopic과
	// 같은 합산이라 목록 행과 상세가 어긋나지 않는다. 상관 스칼라 서브쿼리는 0084 인덱스
	// (crawled_topic_id, status, created_at)를 타는 카운트라 union 투영에 조인 없이 붙는다.
	// 외부 참조는 raw로 수식한다 — drizzle이 프로젝션 안 보간 컬럼의 테이블 수식을 벗겨
	// ${crawledCommunityTopic.id}가 "id"로 렌더되고, 서브쿼리 스코프에선 comment 자신의
	// id로 해석돼 상관이 끊긴다(카운트가 조용히 0이 되는 버그를 실제로 냈다).
	commentCount: sql<number>`coalesce(${crawledCommunityTopic.commentCount}, 0) + (select count(*) from ${communityComment} where ${communityComment.crawledTopicId} = "crawled_community_topic"."id" and ${communityComment.status} = ${"published"})::int`,
	// 원 게시일을 작성일 자리에 쓴다. where의 30일 컷오프가 null을 걸러내므로 결과에선
	// non-null이고, UNION 상대(created_at NOT NULL)와 타입이 맞는다.
	createdAt: sql<Date>`${crawledCommunityTopic.sourcePostedAt}`,
	id: crawledCommunityTopic.id,
	isLocked: sql<boolean>`false`,
	isEvent: sql<boolean>`false`,
	isPromotion: sql<boolean>`false`,
	likeCount: sql<number>`0`,
	title: crawledCommunityTopic.title,
	// 수집 글엔 갱신 시각이 없어 원 게시일을 그대로 쓴다(UNION 위치 맞춤).
	updatedAt: sql<Date>`${crawledCommunityTopic.sourcePostedAt}`,
	// 수집 글은 본문 이미지를 우리가 호스팅하지 않아 썸네일이 없다(UNION 위치만 맞춘다).
	thumbnailUrl: sql<string | null>`null`,
	viewCount: sql<number>`coalesce(${crawledCommunityTopic.viewCount}, 0)`,
	source: sql<CommunityFeedSource>`'crawled'`,
	isNotice: sql<number>`1`,
	isCrawled: sql<number>`1`,
};

// 수집 글 노출 자격. 목록 union·총 건수·상세가 같은 기준을 써야 한 곳만 좁혀지는 상태가
// 생기지 않는다(운영자가 내린 글이 총 건수에만 남아 마지막 페이지가 비는 식).
// removed_at은 운영자가 글을 내린 시각이며, 재수집이 이 칸을 건드리지 않으므로 톰스톤으로
// 버틴다(bambi-crawl-ingest.ts runCommunityPass).
const crawledTopicFeedFilters = (windowStart: Date): SQL[] => [
	gte(crawledCommunityTopic.sourcePostedAt, windowStart),
	isNull(crawledCommunityTopic.removedAt),
];

const bestWindowStart = () => new Date(Date.now() - BEST_WINDOW_DAYS * DAY_MS);

// 게시판 존재·활성 판정의 단일 지점. 입력 zod가 더 이상 목록을 들고 있지 않으므로
// (게시판은 운영자가 늘린다) 읽기·쓰기 경로가 모두 이 함수를 지나야 한다.
// allowBest는 가상 큐레이션 게시판을 여는 읽기 경로 전용이고, forWrite는 읽기 전용
// 게시판(is_writable=false)까지 함께 본다. 비활성 게시판은 존재를 숨긴다(NOT_FOUND) —
// 운영자가 내린 게시판이 링크로는 계속 열리면 "숨김"이 아니라 "목록에서만 뺀 것"이 된다.
const assertBoard = async (
	board: string,
	options: { allowBest?: boolean; forWrite?: boolean } = {}
): Promise<void> => {
	if (options.allowBest && board === BEST_BOARD) {
		return;
	}

	const [row] = await db
		.select({ isWritable: communityBoard.isWritable })
		.from(communityBoard)
		.where(
			and(eq(communityBoard.key, board), eq(communityBoard.isActive, true))
		)
		.limit(1);

	if (!row) {
		throw new ORPCError("NOT_FOUND", {
			message: "게시판을 찾을 수 없습니다.",
		});
	}
	if (options.forWrite && !row.isWritable) {
		throw new ORPCError("BAD_REQUEST", {
			message: "이 게시판에는 글을 쓸 수 없습니다.",
		});
	}
};

// 베스트글은 저장 게시판이 아니라 최근 30일 추천 상위 큐레이션 가상 게시판이다.
// 공지사항(notice)과 법률 자문(legal)은 베스트 큐레이션에서 제외한다 — 법률 자문 글은
// 전부 잠금이라 베스트에 올라와도 마스킹 제목만 자리를 차지한다. windowStart(30일 컷오프)는
// 목록·count 쿼리 간 밀리초 오차로 1-off가 나지 않도록 핸들러에서 한 번 계산해
// 동일 값으로 전달한다.
const buildBoardFilters = (board: string, windowStart: Date): SQL[] => {
	if (board === BEST_BOARD) {
		return [
			eq(communityPost.status, "published"),
			gte(communityPost.likeCount, BEST_MIN_LIKES),
			gte(communityPost.createdAt, windowStart),
			notInArray(communityPost.board, ["notice", LEGAL_BOARD]),
		];
	}
	return [
		eq(communityPost.status, "published"),
		or(
			eq(communityPost.board, board),
			and(
				eq(communityPost.board, "notice"),
				sql`exists (
					select 1 from ${communityNoticeBoardPlacement}
					where ${communityNoticeBoardPlacement.postId} = ${communityPost.id}
					and ${communityNoticeBoardPlacement.boardKey} = ${board}
				)`
			)
		) as SQL,
	];
};

// 목록·count 쿼리에 동일하게 적용되는 필터 조건. 켜진 토글들의 합집합(OR)으로 좁히고,
// 아무 토글도 없으면 조건 없음(전체)을 돌려준다.
const buildListFilters = (
	showPromotion: boolean,
	showEmployer: boolean
): SQL[] => {
	const conditions: SQL[] = [];
	if (showPromotion) {
		conditions.push(eq(communityPost.isPromotion, true));
	}
	if (showEmployer) {
		conditions.push(eq(communityPost.authorRole, "employer"));
	}
	if (conditions.length === 0) {
		return [];
	}
	const combined = or(...conditions);
	return combined ? [combined] : [];
};

// ilike 검색 패턴. 순수·수집 두 헬퍼가 같은 관용(escape + 양끝 %)을 써야 해서 한 곳에 둔다.
const likePattern = (q: string) => `%${escapeLikePattern(q)}%`;

// 검색어·내 글 토글은 AND로 좁힌다. 순수 글 body는 Tiptap doc JSON 문자열이라 본문 텍스트가
// 그대로 들어 있어 ilike로 걸린다(태그명까지 매칭되지만 별도 색인 없이 쓰는 대가다). 수집 글은
// body가 평문 텍스트라 관용이 달라 buildCrawledSearchFilters로 따로 건다.
// ponytail: ilike 순차 스캔 — 글 수가 커지면 pg_trgm 인덱스나 tsvector로.
const buildNarrowFilters = ({
	mine,
	owner,
	q,
}: {
	mine: boolean;
	// "내 글만 보기"의 판정 축. 액터마다 다른 컬럼이라 조건을 통째로 받는다.
	owner: SQL;
	q?: string;
}): SQL[] => {
	const filters: SQL[] = [];
	if (mine) {
		filters.push(owner);
	}
	if (q) {
		const pattern = likePattern(q);
		const combined = or(
			ilike(communityPost.title, pattern),
			ilike(communityPost.body, pattern)
		);
		if (combined) {
			filters.push(combined);
		}
	}
	return filters;
};

// 수집 글 검색 — 제목·본문 평문에 ilike. 수집 body는 Tiptap JSON이 아니라 평문 텍스트고
// nullable이라 ilike(null)은 false로 떨어져 무해하다(제목 매칭이 남으므로 coalesce 불필요).
const buildCrawledSearchFilters = (q?: string): SQL[] => {
	if (!q) {
		return [];
	}
	const pattern = likePattern(q);
	const combined = or(
		ilike(crawledCommunityTopic.title, pattern),
		ilike(crawledCommunityTopic.body, pattern)
	);
	return combined ? [combined] : [];
};

// 마지막 정렬 키는 항상 id다. created_at만으로 정렬하면 같은 시각 글의 순서를 Postgres가
// 매번 다시 정해, 페이지를 오갈 때마다 목록이 한 칸씩 밀리거나 같은 글이 두 페이지에 뜬다
// (bambi-job-feed의 desc(publishedAt), desc(id)와 같은 처방).
const buildBoardOrder = (board: string) => {
	if (board === BEST_BOARD) {
		return [
			desc(communityPost.likeCount),
			desc(communityPost.createdAt),
			desc(communityPost.id),
		];
	}
	if (board === "notice") {
		return [
			desc(communityPost.isEvent),
			desc(communityPost.createdAt),
			desc(communityPost.id),
		];
	}
	return [
		asc(sql`case when ${communityPost.board} = 'notice' then 0 else 1 end`),
		desc(communityPost.createdAt),
		desc(communityPost.id),
	];
};

const selectBoardPosts = (
	board: string,
	{
		limit,
		offset = 0,
		filters = [],
		windowStart,
	}: {
		limit: number;
		offset?: number;
		filters?: SQL[];
		windowStart: Date;
	}
) =>
	db
		.select(postSummarySelection)
		.from(communityPost)
		.where(and(...buildBoardFilters(board, windowStart), ...filters))
		.orderBy(...buildBoardOrder(board))
		.limit(limit)
		.offset(offset);

type PostSummaryRow = Awaited<ReturnType<typeof selectBoardPosts>>[number];

// 응답에 실을 작성자 등급 뱃지를 회원 authorUserId만 모아 한 번에 배치 조회한다
// (게스트·수집 글은 null). 글 요약·댓글 행 모두 authorUserId를 가져 같은 헬퍼를 쓴다.
const loadAuthorBadges = (rows: { authorUserId: null | string }[]) =>
	loadGradeBadges(
		rows.map((row) => row.authorUserId).filter((id): id is string => id != null)
	);

// authorUserId는 마스킹·bypass 계산엔 필요하지만 익명성 보호를 위해 클라이언트
// 응답에서는 제외한다(명시적 화이트리스트 매핑). 등급(이름·색)은 신원이 아니라 노출 OK.
const toPublicSummary = (
	summary: PostSummaryRow,
	gradeBadges?: Map<string, GradeBadge>
) => ({
	// 게스트·수집 글(authorUserId null)은 등급 없음(null).
	authorGrade: summary.authorUserId
		? (gradeBadges?.get(summary.authorUserId) ?? null)
		: null,
	authorGender: summary.authorGender,
	authorName: summary.authorName,
	authorRole: summary.authorRole,
	board: summary.board,
	commentCount: summary.commentCount,
	createdAt: summary.createdAt,
	id: summary.id,
	isLocked: summary.isLocked,
	isEvent: summary.isEvent,
	isPromotion: summary.isPromotion,
	likeCount: summary.likeCount,
	// 화면이 상세 라우팅(수집 전용 상세)을 가르는 판별 필드.
	source: summary.source,
	// 목록 카드 썸네일(본문 첫 이미지). 목록에서는 블러로 가리고 상세에서 원본을 본다.
	thumbnailUrl: summary.thumbnailUrl,
	title: summary.title,
	updatedAt: summary.updatedAt,
	viewCount: summary.viewCount,
});

// 순수 work_talk + 수집 커뮤니티 글을 한 쿼리로 합쳐 페이지네이션한다. 애플리케이션에서
// 두 배열을 합치는 대신 UNION ALL을 쓰는 이유는 정렬·limit·offset을 DB에서 끝내야 수집
// 테이블이 커져도 무너지지 않기 때문이다(bambi-job-feed.listJobFeed와 같은 판단). ALL인
// 이유는 두 원천에 같은 행이 있을 수 없어 DISTINCT가 불필요해서다. 정렬은 공고와 같은
// 우선순위 규칙 — 1순위 순수(is_crawled 0), 2순위 수집(1), 각 구간 내 최신순.
// nativeFilters·crawledFilters는 각 원천 where에 그대로 얹는다(검색어를 순수·수집 양쪽에
// 함께 걸 때 쓴다). overview는 인자 없이 전체를 섞는다.
const selectWorkTalkFeedUnion = ({
	limit,
	offset,
	windowStart,
	nativeFilters = [],
	crawledFilters = [],
}: {
	limit: number;
	offset: number;
	windowStart: Date;
	nativeFilters?: SQL[];
	crawledFilters?: SQL[];
}) =>
	unionAll(
		db
			.select(postSummarySelection)
			.from(communityPost)
			.where(
				and(
					...buildBoardFilters(CRAWLED_COMMUNITY_BOARD, windowStart),
					...nativeFilters
				)
			),
		db
			.select(crawledCommunityFeedSelection)
			.from(crawledCommunityTopic)
			// 수집 글은 원 게시일 30일 이내만 노출한다(순수 work_talk엔 컷오프가 없지만, 남의
			// 게시판에서 긁어 온 글은 신선한 것만 섞는다). null 게시일은 이 조건이 자연히 걸러낸다.
			.where(and(...crawledTopicFeedFilters(windowStart), ...crawledFilters))
	)
		.orderBy(sql`is_notice asc, is_crawled asc, created_at desc, id desc`)
		.limit(limit)
		.offset(offset);

// 수집 커뮤니티 노출 스위치. listPosts·overview 두 곳이 같은 값을 읽어야 해서 한 곳에
// 모은다 — 한쪽만 켜지는 상태를 막는다(isCrawledJobFeedEnabled와 같은 이유).
const isCrawledCommunityFeedEnabled = async (): Promise<boolean> => {
	const [row] = await db
		.select({ enabled: bambiSiteSettings.crawledCommunityFeedEnabled })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"))
		.limit(1);
	return row?.enabled ?? false;
};

// 베스트글은 community_board 행이 없어 아이콘을 site_settings에서 읽는다. 운영자가
// 지정하지 않았으면 null(웹이 기존 코럴 액센트 바로 폴백).
const getBestBoardIcon = async (): Promise<string | null> => {
	const [row] = await db
		.select({ icon: bambiSiteSettings.bestBoardIcon })
		.from(bambiSiteSettings)
		.where(eq(bambiSiteSettings.id, "default"))
		.limit(1);
	return row?.icon ?? null;
};

// 30일 컷오프 안의 수집 글 수. 스위치 ON일 때 totalCount에 합산한다. extraFilters로 검색어
// 필터를 더해 목록 union과 같은 집합만 센다(검색 시 합산이 부풀지 않게).
const countCrawledCommunityTopics = async (
	windowStart: Date,
	extraFilters: SQL[] = []
): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(crawledCommunityTopic)
		.where(and(...crawledTopicFeedFilters(windowStart), ...extraFilters));
	return row?.value ?? 0;
};

// 동시 토글로 행 변화가 없던 경우 캐시를 건드리지 않고 현재 값만 반환하기 위한 조회.
type CommunityTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const readLikeCount = async (
	tx: CommunityTx,
	postId: string
): Promise<number> => {
	const [row] = await tx
		.select({ likeCount: communityPost.likeCount })
		.from(communityPost)
		.where(eq(communityPost.id, postId))
		.limit(1);
	return row?.likeCount ?? 0;
};

// 노출 대상 댓글 행. published 댓글 + published 대댓글을 가진 삭제 부모(스레드 유지용
// 플레이스홀더)만 남긴다. 회원 목록(listComments)과 공개 상세(getPublicPost)가 같은
// 기준을 공유해야 한쪽에서만 보이는 댓글이 생기지 않는다.
// 대상 조건을 인자로 받는 이유는 수집 글 상세(getCrawledTopic)도 같은 규칙을 써야 해서다
// (우리 글은 post_id, 수집 글은 crawled_topic_id로 좁힌다).
const selectVisibleCommentRows = async (target: SQL) => {
	const rows = await db
		.select({
			authorGender: communityComment.authorGender,
			authorGuestId: communityComment.authorGuestId,
			// 표시명은 작성 시점 스냅샷이 아니라 계정의 정본이라 탈퇴 여부를 함께 읽는다 —
			// 탈퇴자는 표시 계층에서 "탈퇴한 회원"으로 바꿔 내보낸다(listComments).
			authorDeletedAt: user.deletedAt,
			authorName: user.name,
			authorImage: user.image,
			authorRole: communityComment.authorRole,
			authorUserId: communityComment.authorUserId,
			body: communityComment.body,
			createdAt: communityComment.createdAt,
			id: communityComment.id,
			parentCommentId: communityComment.parentCommentId,
			status: communityComment.status,
		})
		.from(communityComment)
		.leftJoin(user, eq(user.id, communityComment.authorUserId))
		.where(target)
		.orderBy(asc(communityComment.createdAt))
		.limit(COMMENTS_CAP);

	const liveParentIds = new Set(
		rows
			.filter((row) => row.status === "published" && row.parentCommentId)
			.map((row) => row.parentCommentId)
	);

	return rows.filter(
		(row) => row.status === "published" || liveParentIds.has(row.id)
	);
};

const findPublishedPost = async (postId: string) => {
	const [post] = await db
		.select()
		.from(communityPost)
		.where(eq(communityPost.id, postId))
		.limit(1);

	if (post?.status !== "published") {
		throw new ORPCError("NOT_FOUND", {
			message: "게시글을 찾을 수 없습니다.",
		});
	}

	return post;
};

// 작성 시점 계정 유형 스냅샷. 비회원은 계정이 없으므로 "guest"로 기록한다 — 공지·광고글
// 같은 역할 규칙이 회원·비회원 한 축에서 판정된다.
const actorRole = (
	actor: CommunityActor
): CommunityPostColumns["authorRole"] =>
	actor.kind === "member" ? actor.profile.role : "guest";

const actorUserId = (actor: CommunityActor): string | null =>
	actor.kind === "member" ? actor.profile.userId : null;

const actorGuestId = (actor: CommunityActor): string | null =>
	actor.kind === "guest" ? actor.gid : null;

const secretActorGender = (
	actor: CommunityActor,
	board: string
): "female" | "male" | null => {
	if (!isSecretBoard(board)) {
		return null;
	}
	return actor.kind === "guest" ? actor.gender : actor.profile.gender;
};

const resolvePostAuthorName = async (
	actor: CommunityActor,
	input: { authorName: string; board: string; isAnonymous: boolean }
): Promise<string> => {
	if (
		input.board === "notice" &&
		actor.kind === "member" &&
		actor.profile.role === "admin"
	) {
		return "운영자";
	}
	if (isSecretBoard(input.board)) {
		return SECRET_AUTHOR_NAME;
	}
	return await resolveMemberPostAuthorName(
		actor,
		input.authorName,
		input.isAnonymous
	);
};

const validateGuestPostPassword = (
	actor: CommunityActor,
	board: string,
	isLocked: boolean,
	password?: string
): void => {
	if (actor.kind !== "guest") {
		return;
	}
	if (isLocked && board !== LEGAL_BOARD) {
		throw new ORPCError("BAD_REQUEST", { message: GUEST_LOCKED_ERROR });
	}
	requireGuestPassword(password);
};

// 버킷이 여러 개면 전부 통과해야 한다 — 비회원은 gid·IP 이중이다. 쿠키를 지우면 gid가
// 새로 발급되므로 IP 축이 없으면 사실상 무제한이고, IP만 세면 공용망 사용자가 서로를 막는다.
const assertWriteRateLimit = ({
	keys,
	limit,
	message,
}: {
	keys: string[];
	limit: number;
	message: string;
}): { keys: string[]; now: number } => {
	const now = Date.now();
	const reservedKeys: string[] = [];
	for (const key of keys) {
		if (!takeRateLimit({ key, limit, now, windowMs: WRITE_WINDOW_MS })) {
			for (const reservedKey of reservedKeys) {
				releaseRateLimit({ key: reservedKey, now });
			}
			throw new ORPCError("TOO_MANY_REQUESTS", { message });
		}
		reservedKeys.push(key);
	}
	return { keys: reservedKeys, now };
};

const releaseWriteRateLimit = ({
	keys,
	now,
}: {
	keys: string[];
	now: number;
}): void => {
	for (const key of keys) {
		releaseRateLimit({ key, now });
	}
};

// 비회원 쓰기 버킷 키. 액션마다 따로 세고(글 1분 1회, 댓글 1분 5회) gid·IP 두 축을 모두 건다.
const guestWriteKeys = (
	action: string,
	gid: string,
	clientIp: string | undefined
): string[] => [
	`community.${action}:guest:${gid}`,
	`community.${action}:ip:${clientIp ?? "unknown"}`,
];

// 댓글 도배 방지 버킷 키. 회원은 계정 하나가 축이고, 비회원은 쿠키를 지우면 gid가 새로
// 발급되므로 gid·IP 두 축을 모두 건다. 게시판 글 댓글과 수집 글 댓글이 같은 키를 써서
// 대상을 갈아 가며 한도를 두 배로 쓰는 우회로를 막는다.
const commentWriteKeys = (
	actor: CommunityActor,
	clientIp: string | undefined
): string[] =>
	actor.kind === "member"
		? [`community.createComment:${actor.profile.userId}`]
		: guestWriteKeys("createComment", actor.gid, clientIp);

type CommentRow = Awaited<ReturnType<typeof selectVisibleCommentRows>>[number];

// 댓글 응답 모양은 회원·공개 경로가 공유하고, 작성자 표시·권한만 경로별 정책으로 갈린다
// (공개 경로는 색인되는 페이지라 회원 계정명을 싣지 않는다).
const toCommentItems = (
	rows: CommentRow[],
	resolve: (row: CommentRow) => {
		authorImage: string | null;
		authorName: string | null;
		canDelete: boolean;
		canEdit: boolean;
	},
	gradeBadges: Map<string, GradeBadge>
) =>
	rows.map((row) => {
		if (row.status !== "published") {
			return {
				authorGrade: null,
				authorImage: null,
				authorName: null,
				authorRole: null,
				body: "",
				canDelete: false,
				canEdit: false,
				createdAt: row.createdAt,
				id: row.id,
				isDeleted: true,
				parentCommentId: row.parentCommentId,
			};
		}
		const policy = resolve(row);
		return {
			// authorUserId는 응답에서 계속 제외(익명성) — 등급만 노출한다. 게스트는 null.
			authorGrade: row.authorUserId
				? (gradeBadges.get(row.authorUserId) ?? null)
				: null,
			authorImage: policy.authorImage,
			authorGender: row.authorGender,
			authorName: row.authorGender ? SECRET_AUTHOR_NAME : policy.authorName,
			authorRole: row.authorRole,
			body: row.body,
			canDelete: policy.canDelete,
			canEdit: policy.canEdit,
			createdAt: row.createdAt,
			id: row.id,
			isDeleted: false,
			parentCommentId: row.parentCommentId,
		};
	});

// 회원 열람 정책 — 계정 표시명(탈퇴자는 문구 치환)과 본인/운영자 권한. 우리 글 댓글
// (listComments)과 수집 글 댓글(getCrawledTopic)이 같은 규칙을 써야 해서 한 곳에 둔다.
const memberCommentPolicy =
	(profile: BambiAccessProfile) => (row: CommentRow) => ({
		authorImage:
			row.authorGender || row.authorDeletedAt ? null : row.authorImage,
		// 비회원 댓글엔 계정이 없어 leftJoin 이름이 null이다 — 고정 표시명을 세운다.
		// 탈퇴한 회원 댓글은 원본 닉네임 대신 탈퇴 문구로 바뀐다.
		authorName: resolveVisibleDisplayName(
			{ deletedAt: row.authorDeletedAt, name: row.authorName },
			GUEST_DISPLAY_NAME
		),
		canDelete: row.authorUserId === profile.userId || profile.role === "admin",
		// 삭제와 달리 수정은 작성자 본인만 가능하다(admin 제외 — getPost.canEdit와 동일 철학).
		canEdit: row.authorUserId === profile.userId,
	});

// 비회원·비로그인 열람 정책 — 색인되는 공개 페이지라 회원 계정명은 싣지 않는다.
// 수정·삭제 버튼은 gid 일치일 때만 여는 힌트이고, 실제 게이트는 서버의 비밀번호 검증이다.
const guestCommentPolicy = (guestId: null | string) => (row: CommentRow) => ({
	authorImage:
		row.authorGender || row.authorGuestId || row.authorDeletedAt
			? null
			: row.authorImage,
	authorName: row.authorGuestId ? GUEST_DISPLAY_NAME : null,
	canDelete: Boolean(guestId) && row.authorGuestId === guestId,
	canEdit: Boolean(guestId) && row.authorGuestId === guestId,
});

// 액터에 맞는 댓글 표시·권한 정책. 회원이면 계정 표시명, 그 외에는 익명 정책이다.
const commentPolicyForActor = (actor: CommunityActor | null) =>
	actor?.kind === "member"
		? memberCommentPolicy(actor.profile)
		: guestCommentPolicy(actor?.kind === "guest" ? actor.gid : null);

// 대댓글 부모 검증. 같은 글(우리 글이든 수집 글이든)의 살아 있는 최상위 댓글만 부모가 될
// 수 있다 — belongsTo가 그 "같은 글" 판정을 대상별로 받아, 두 작성 경로가 1단계 제한과
// 오류 문구를 공유한다. 반환값은 대댓글 알림 수신자(게스트 댓글은 null이라 알림이 생략된다).
const loadCommentParentAuthor = async (
	parentCommentId: string | undefined,
	belongsTo: (parent: {
		crawledTopicId: null | string;
		postId: null | string;
	}) => boolean
): Promise<null | string> => {
	if (!parentCommentId) {
		return null;
	}

	const [parent] = await db
		.select({
			authorUserId: communityComment.authorUserId,
			crawledTopicId: communityComment.crawledTopicId,
			id: communityComment.id,
			parentCommentId: communityComment.parentCommentId,
			postId: communityComment.postId,
			status: communityComment.status,
		})
		.from(communityComment)
		.where(eq(communityComment.id, parentCommentId))
		.limit(1);

	if (parent?.status !== "published" || !belongsTo(parent)) {
		throw new ORPCError("NOT_FOUND", {
			message: "답글을 달 댓글을 찾을 수 없습니다.",
		});
	}
	if (parent.parentCommentId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "답글에는 다시 답글을 달 수 없습니다.",
		});
	}

	return parent.authorUserId;
};

/**
 * 새 댓글·대댓글 알림. 글 작성자와 부모 댓글 작성자에게 한 통씩(같은 사람이면 한 통),
 * 본인 행위는 resolveNotificationRecipients가 걸러낸다. 비회원 댓글은 행위자 계정이
 * 없어(actor_user_id NOT NULL) 알림을 만들 수 없다.
 *
 * 법률 자문 글의 추가 질문(자문가가 아닌 사람의 댓글)은 개인 알림과 별개로
 * legal_advisor 공유 1행을 더 보낸다 — 새 잠금글과 같은 "큐 도착" 성격이라 수신자가
 * 개인이 아니다. 자문가 본인의 댓글은 답변이므로 큐에 넣지 않는다(글 작성자 개인 알림 담당).
 */
const notifyNewComment = async ({
	actorRole: commentActorRole,
	actorUserId: commentActorUserId,
	parentAuthorUserId,
	parentCommentId,
	post,
}: {
	actorRole: CommunityPostColumns["authorRole"];
	actorUserId: null | string;
	parentAuthorUserId: null | string;
	parentCommentId: null | string;
	post: { authorUserId: null | string; board: string; id: string };
}): Promise<void> => {
	if (!commentActorUserId) {
		return;
	}

	if (post.board === LEGAL_BOARD && commentActorRole !== "legal_advisor") {
		await notifyBambiNotification({
			actorUserId: commentActorUserId,
			metadata: {
				action: "replied",
				board: post.board,
				postId: post.id,
			},
			recipientRole: "legal_advisor",
			targetId: post.id,
			targetType: "community_post",
		});
	}

	const recipients = resolveNotificationRecipients(
		[post.authorUserId, parentAuthorUserId],
		commentActorUserId
	);

	for (const recipientUserId of recipients) {
		const isParentAuthor = recipientUserId === parentAuthorUserId;

		await notifyBambiNotification({
			actorUserId: commentActorUserId,
			metadata: {
				action: isParentAuthor ? "reply" : "comment",
				board: post.board,
				postId: post.id,
			},
			recipientUserId,
			targetId: isParentAuthor ? (parentCommentId ?? post.id) : post.id,
			targetType: isParentAuthor ? "community_comment" : "community_post",
		});
	}
};

// 운영자 댓글 상태 전이 시 포인트 회수·재적립(published 이탈=회수, 진입=재적립).
// setCommentStatusByAdmin 핸들러 복잡도를 낮추려 분리했다. 수집 글 댓글(board null)은
// 회원 글이 아니라 target 0으로 계산돼 안전하다.
const reconcileCommentPointsOnStatusChange = async (
	tx: CommunityTx,
	args: {
		authorUserId: string | null;
		postAuthorUserId: string | null;
		board: string | null;
		commentId: string;
		currentAwarded: number;
		willVisible: boolean;
	}
) => {
	const { commentPoints } = args.willVisible
		? await getBoardContentPoints(args.board ?? "")
		: { commentPoints: 0 };
	const nextAwarded = await reconcileContentPoints(tx, {
		userId: args.authorUserId,
		currentAwarded: args.currentAwarded,
		targetAmount: resolveCommentAward(
			args.authorUserId,
			args.postAuthorUserId,
			commentPoints
		),
		reasons: POINT_REASONS.comment,
	});
	await tx
		.update(communityComment)
		.set({ pointsAwarded: nextAwarded })
		.where(eq(communityComment.id, args.commentId));
};

export const communityRouter = {
	// 회원과 비회원(여성 성인인증 게스트)이 같은 목록을 본다 — 게시판·필터·정렬이 모두 같고,
	// 갈리는 건 개인화 축(내 글)과 잠금 우회뿐이다. 게스트는 profile이 null이라 비밀글 제목이
	// 항상 마스킹된다(회원 비소유자와 동일).
	listPosts: publicProcedure
		.input(listPostsInput)
		.handler(async ({ context, input }) => {
			const actor = await resolveCommunityReaderForBoard(context, input.board);
			const profile = actor.kind === "member" ? actor.profile : null;
			// 법률자문 계정은 legal 게시판만 — 가상 큐레이션 best도 비-legal 글이 섞이므로 막는다.
			assertLegalAdvisorBoardScope(profile, input.board);
			await assertBoard(input.board, { allowBest: true });

			const listFilters = [
				...buildListFilters(input.showPromotion, input.showEmployer),
				...buildNarrowFilters({
					mine: input.mine,
					// 비회원은 계정이 없어 게스트 신원(gid)으로 좁힌다. 재인증으로 gid가 바뀌면
					// 목록에서 빠지지만, 소유권 정본은 어차피 비밀번호다(assertGuestOwnership).
					owner:
						actor.kind === "member"
							? eq(communityPost.authorUserId, actor.profile.userId)
							: eq(communityPost.authorGuestId, actor.gid),
					q: input.q,
				}),
			];
			// 목록·count 쿼리가 같은 30일 컷오프를 쓰도록 한 번만 계산한다.
			const windowStart = bestWindowStart();
			const offset = (input.page - 1) * PAGE_SIZE;

			// 수집 글은 광고·업소·내 글(양성) 필터를 본질적으로 만족할 수 없어 그중 하나라도
			// 켜지면 순수 글만 남기고 수집 union을 끈다. 검색어(q)는 예외 — 수집 글도 검색
			// 대상이라 q만 있을 때는 수집을 섞고, 검색을 순수·수집 양쪽 where에 함께 건다.
			// work_talk·스위치 ON일 때만 섞는다.
			const includeCrawled =
				input.board === CRAWLED_COMMUNITY_BOARD &&
				!input.mine &&
				!input.showPromotion &&
				!input.showEmployer &&
				(await isCrawledCommunityFeedEnabled());

			if (includeCrawled) {
				// includeCrawled면 mine·양성 필터가 모두 꺼져 listFilters엔 검색어 필터만 남는다.
				const crawledSearchFilters = buildCrawledSearchFilters(input.q);
				const [items, [nativeTotal], crawledTotal] = await Promise.all([
					selectWorkTalkFeedUnion({
						limit: PAGE_SIZE,
						offset,
						windowStart,
						nativeFilters: listFilters,
						crawledFilters: crawledSearchFilters,
					}),
					db
						.select({ value: count() })
						.from(communityPost)
						.where(
							and(
								...buildBoardFilters(CRAWLED_COMMUNITY_BOARD, windowStart),
								...listFilters
							)
						),
					countCrawledCommunityTopics(windowStart, crawledSearchFilters),
				]);

				const crawledMasked = maskLockedSummaries(items, profile);
				const crawledBadges = await loadAuthorBadges(crawledMasked);
				return {
					items: crawledMasked.map((item) =>
						toPublicSummary(item, crawledBadges)
					),
					page: input.page,
					pageSize: PAGE_SIZE,
					totalCount: (nativeTotal?.value ?? 0) + crawledTotal,
				};
			}

			const [items, [total]] = await Promise.all([
				selectBoardPosts(input.board, {
					filters: listFilters,
					limit: PAGE_SIZE,
					offset,
					windowStart,
				}),
				db
					.select({ value: count() })
					.from(communityPost)
					.where(
						and(...buildBoardFilters(input.board, windowStart), ...listFilters)
					),
			]);

			const masked = maskLockedSummaries(items, profile);
			const badges = await loadAuthorBadges(masked);
			return {
				items: masked.map((item) => toPublicSummary(item, badges)),
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: total?.value ?? 0,
			};
		}),

	// 홈 미리보기는 미자격자(비회원·남성·비광고 업소)에게도 게시판별 상위 4개까지 공개한다.
	// 상세·목록·쓰기는 여전히 requireCommunityMember 뒤에 있고, 여기서는 요약(제목·작성자
	// 표시명·카운트)만 나가며 비밀글 제목은 자격 무관하게 마스킹된다(잠금 우회는 자격자만).
	// 게시판이 고정 6종이 아니게 되면서 응답도 고정 키 객체가 아니라 배열이다 — 운영자가
	// 게시판을 늘리면 홈 미리보기에 자동으로 따라 붙는다. 순서는 best(가상, 선두) →
	// 활성 게시판 sort_order asc.
	overview: publicProcedure.handler(async ({ context }) => {
		const profile = await findCommunityMember(context.session);

		const windowStart = bestWindowStart();
		// work_talk 미리보기도 스위치 ON이면 목록과 같은 union 규칙으로 수집 글을 섞는다.
		const [communityFeedOn, bestIcon, boards, homeLayout] = await Promise.all([
			isCrawledCommunityFeedEnabled(),
			getBestBoardIcon(),
			db
				.select({
					description: communityBoard.description,
					icon: communityBoard.icon,
					key: communityBoard.key,
					label: communityBoard.label,
					slug: communityBoard.slug,
				})
				.from(communityBoard)
				.where(eq(communityBoard.isActive, true))
				.orderBy(asc(communityBoard.sortOrder)),
			db
				.select({
					boardKey: communityBoardHomeLayout.boardKey,
					position: communityBoardHomeLayout.position,
					rowIndex: communityBoardHomeLayout.rowIndex,
				})
				.from(communityBoardHomeLayout)
				.orderBy(
					asc(communityBoardHomeLayout.rowIndex),
					asc(communityBoardHomeLayout.position)
				),
		]);
		const layoutByKey = new Map(
			homeLayout.map((item) => [item.boardKey, item] as const)
		);

		// 법률 자문처럼 전 글이 잠긴 게시판도 같은 마스킹 규칙을 그대로 탄다
		// (작성자·운영자·법률자문만 실제 제목을 본다).
		const previews = [
			{
				description: BEST_BOARD_DESCRIPTION,
				// 가상 게시판이라 DB 행이 없다 — 운영자 지정 아이콘은 site_settings에서 읽는다.
				// 미지정(null)이면 기존 코럴 액센트 바 모양을 유지한다.
				icon: bestIcon,
				key: BEST_BOARD,
				label: BEST_BOARD_LABEL,
				position: layoutByKey.get(BEST_BOARD)?.position,
				rowIndex: layoutByKey.get(BEST_BOARD)?.rowIndex,
				slug: BEST_BOARD,
			},
			...boards.map((board) => ({
				...board,
				position: layoutByKey.get(board.key)?.position,
				rowIndex: layoutByKey.get(board.key)?.rowIndex,
			})),
		]
			.filter((board) => {
				if (board.rowIndex === undefined || board.position === undefined) {
					return false;
				}
				if (profile?.role === "job_seeker" && profile.gender === "male") {
					return board.key === "notice" || board.key === "secret";
				}
				if (profile?.role === "legal_advisor") {
					return (
						board.key === "legal" ||
						board.key === "secret" ||
						(profile.gender === "male" && board.key === "notice")
					);
				}
				return true;
			})
			.sort(
				(left, right) =>
					(left.rowIndex ?? 0) - (right.rowIndex ?? 0) ||
					(left.position ?? 0) - (right.position ?? 0)
			);

		const postsPerBoard = await Promise.all(
			previews.map((board) =>
				board.key === CRAWLED_COMMUNITY_BOARD && communityFeedOn
					? selectWorkTalkFeedUnion({
							limit: OVERVIEW_LIMIT,
							nativeFilters: [eq(communityPost.board, CRAWLED_COMMUNITY_BOARD)],
							offset: 0,
							windowStart,
						})
					: selectBoardPosts(board.key, {
							filters:
								board.key === BEST_BOARD
									? []
									: [eq(communityPost.board, board.key)],
							limit: OVERVIEW_LIMIT,
							windowStart,
						})
			)
		);

		return {
			boards: previews.map((board, index) => ({
				...board,
				position: board.position ?? 0,
				rowIndex: board.rowIndex ?? 0,
				// 홈 미리보기(요약)는 등급 뱃지를 싣지 않는다 — 게시판마다 배치 조회를 더하지
				// 않는다. 등급은 목록·상세에서만 노출한다.
				posts: maskLockedSummaries(postsPerBoard[index] ?? [], profile).map(
					(post) => toPublicSummary(post)
				),
			})),
		};
	}),

	// 비로그인 공개 목록(SEO). 공개 보드(PUBLIC_COMMUNITY_BOARDS)의 published 글만,
	// 필터·검색·내 글 없이 최신순으로 내려준다. 비밀글은 마스킹이 아니라 아예 뺀다 —
	// 열 수 없는 글의 링크를 크롤러에게 심어 봐야 404 뿐이다. 수집(crawled) 글도 섞지
	// 않는다: 남의 사이트에서 긁어 온 본문을 우리 도메인에 색인시키면 중복 콘텐츠다.
	listPublicPosts: publicProcedure
		.input(
			z.object({
				board: publicBoardSchema,
				page: z.number().int().min(1).default(1),
			})
		)
		.handler(async ({ input }) => {
			const windowStart = bestWindowStart();
			const offset = (input.page - 1) * PAGE_SIZE;
			const filters = [eq(communityPost.isLocked, false)];

			const [items, [total]] = await Promise.all([
				selectBoardPosts(input.board, {
					filters,
					limit: PAGE_SIZE,
					offset,
					windowStart,
				}),
				db
					.select({ value: count() })
					.from(communityPost)
					.where(
						and(...buildBoardFilters(input.board, windowStart), ...filters)
					),
			]);

			const badges = await loadAuthorBadges(items);
			return {
				items: items.map((item) => toPublicSummary(item, badges)),
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: total?.value ?? 0,
			};
		}),

	// 비로그인 공개 상세(SEO). 공개 보드의 published·비잠금 글만 열리고, 그 외에는
	// 존재를 숨긴다(NOT_FOUND). 댓글은 읽기만 나가며 작성자 계정명은 싣지 않는다 —
	// 회원 화면과 달리 색인되는 페이지라 표시명 이상은 내보내지 않는다. 조회수도
	// 올리지 않는다(크롤러 방문이 인기 지표를 부풀리면 안 된다).
	getPublicPost: publicProcedure
		.input(postIdInput)
		.handler(async ({ input }) => {
			const post = await findPublishedPost(input.postId);
			const [postAuthor] = post.authorUserId
				? await db
						.select({ image: user.image })
						.from(user)
						.where(eq(user.id, post.authorUserId))
						.limit(1)
				: [];

			if (!isPublicBoard(post.board) || post.isLocked) {
				throw new ORPCError("NOT_FOUND", {
					message: "게시글을 찾을 수 없습니다.",
				});
			}

			const rows = await selectVisibleCommentRows(
				eq(communityComment.postId, input.postId)
			);
			const authorGrade = post.authorUserId
				? ((await loadAuthorBadges([post])).get(post.authorUserId) ?? null)
				: null;
			return {
				// author_user_id는 익명성 때문에 계속 제외하고 등급(이름·색)만 노출한다.
				authorGrade,
				authorGender: post.authorGender,
				authorImage: visiblePostAuthorImage(post, postAuthor?.image),
				authorName: visiblePostAuthorName(post),
				authorRole: post.authorRole,
				board: post.board,
				body: post.body,
				commentCount: post.commentCount,
				commentsDisabled: post.commentsDisabled,
				comments: rows.map((row) => ({
					authorImage:
						row.status === "published" &&
						!row.authorGuestId &&
						!row.authorDeletedAt
							? row.authorImage
							: null,
					authorRole: row.status === "published" ? row.authorRole : null,
					body: row.status === "published" ? row.body : "",
					createdAt: row.createdAt,
					id: row.id,
					isDeleted: row.status !== "published",
					parentCommentId: row.parentCommentId,
				})),
				createdAt: post.createdAt,
				id: post.id,
				isPromotion: post.isPromotion,
				likeCount: post.likeCount,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: post.viewCount,
			};
		}),

	getPost: publicProcedure
		.input(
			postIdInput.extend({
				password: z.string().trim().max(30).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const post = await findPublishedPost(input.postId);
			const actor = await resolveCommunityReaderForBoard(context, post.board);
			const profile = actor.kind === "member" ? actor.profile : null;
			assertLegalAdvisorBoardScope(profile, post.board);
			const [postAuthor] = post.authorUserId
				? await db
						.select({ image: user.image })
						.from(user)
						.where(eq(user.id, post.authorUserId))
						.limit(1)
				: [];

			if (post.isLocked && !canBypassLock(post, profile)) {
				if (!input.password) {
					return {
						authorGender: post.authorGender,
						authorName: visiblePostAuthorName(post),
						board: post.board,
						createdAt: post.createdAt,
						id: post.id,
						locked: true as const,
					};
				}
				if (!verifyCommunityPassword(input.password, post.passwordHash)) {
					throw new ORPCError("FORBIDDEN", {
						message: "비밀번호가 일치하지 않습니다.",
					});
				}
			} else if (
				input.password &&
				!verifyCommunityPassword(input.password, post.passwordHash)
			) {
				// 비잠금 글이라도 password가 오면(수정 진입 게이트) 소유권 비밀번호로 검증한다 —
				// 틀린 비번으로 폼이 열려 저장 단계에서야 403이 나는 흐름을 게이트에서 끊는다.
				throw new ORPCError("FORBIDDEN", {
					message: "비밀번호가 일치하지 않습니다.",
				});
			}

			// 원자 증가 후 값을 응답에 그대로 반영한다(증가 전 스냅샷+1이 아니라 실제 값).
			const [viewUpdated] = await db
				.update(communityPost)
				.set({ viewCount: sql`${communityPost.viewCount} + 1` })
				.where(eq(communityPost.id, input.postId))
				.returning({ viewCount: communityPost.viewCount });

			// 추천 여부도 toggleLike와 같은 축으로 읽는다 — 회원은 user_id, 비회원은 guest_id.
			const [like] = await db
				.select({ id: communityPostLike.id })
				.from(communityPostLike)
				.where(
					and(
						eq(communityPostLike.postId, input.postId),
						actor.kind === "member"
							? eq(communityPostLike.userId, actor.profile.userId)
							: eq(communityPostLike.guestId, actor.gid)
					)
				)
				.limit(1);

			// 비회원의 canEdit/canDelete는 gid 일치로 버튼만 열어 주는 힌트다 — 실제 수정·삭제의
			// 최종 게이트는 서버의 비밀번호 검증이다(updatePost·deletePost의 assertGuestOwnership).
			const isMine =
				actor.kind === "member"
					? post.authorUserId === actor.profile.userId
					: post.authorGuestId === actor.gid;

			const authorGrade = post.authorUserId
				? ((await loadAuthorBadges([post])).get(post.authorUserId) ?? null)
				: null;
			const noticeBoardKeys =
				post.board === "notice"
					? (
							await db
								.select({ key: communityNoticeBoardPlacement.boardKey })
								.from(communityNoticeBoardPlacement)
								.where(eq(communityNoticeBoardPlacement.postId, post.id))
						).map((row) => row.key)
					: [];

			return {
				// author_user_id는 익명성 때문에 계속 제외하고 등급(이름·색)만 노출한다.
				authorGrade,
				authorGender: post.authorGender,
				authorImage: visiblePostAuthorImage(post, postAuthor?.image),
				authorName: visiblePostAuthorName(post),
				authorRole: post.authorRole,
				board: post.board,
				body: post.body,
				canDelete: isMine || profile?.role === "admin",
				canEdit: isMine,
				commentCount: post.commentCount,
				commentsDisabled: post.commentsDisabled,
				// 잠금을 실제로 연 열람자(작성자·운영자·법률자문·비밀번호 통과)만 여기까지 온다 —
				// 위쪽 잠금 축소 응답에는 연락처가 실리지 않는다. 법률 자문 외 게시판은 애초에
				// 저장하지 않으므로 항상 null이다.
				contactPhone: post.contactPhone,
				createdAt: post.createdAt,
				id: post.id,
				isLiked: Boolean(like),
				isLocked: post.isLocked,
				isEvent: post.isEvent,
				isAnonymous: post.isAnonymous,
				isPromotion: post.isPromotion,
				likeCount: post.likeCount,
				locked: false as const,
				noticeBoardKeys,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: viewUpdated?.viewCount ?? post.viewCount + 1,
			};
		}),

	// 수집 커뮤니티 글 상세. 순수 getPost와 테이블이 달라 프로시저를 나눈다(crawledJobsRouter와
	// 같은 판단 — 한 핸들러에서 두 테이블을 분기시키면 응답에 뭐가 섞일 수 있는지 매번 다시
	// 읽어 확인해야 한다). 멤버 게이트 + 스위치 게이트를 통과해야 하고, 글 자체의 좋아요·
	// 수정·삭제는 없다(우리 글이 아니다). 댓글은 우리 회원·비회원이 남긴 것만 우리 규칙대로
	// 열려 있고(createCrawledComment) 원본 수집 댓글은 읽기 전용이다.
	// sourceUrl은 절대 내려보내지 않는다 — 그 링크 한 줄이 원본 전체로 가는
	// 우회로다(crawled-jobs.ts PUBLIC_COLUMNS 주석의 원칙 그대로).
	getCrawledTopic: publicProcedure
		.input(z.object({ topicId: z.uuid() }))
		.handler(async ({ context, input }) => {
			// 목록(listPosts)에서 이미 보이는 글이라 상세 게이트도 같은 액터 축으로 연다.
			// 액터는 아래 댓글 권한(canEdit/canDelete) 판정에도 그대로 쓴다.
			const actor = await resolveCommunityActor(context);
			// 스위치 OFF면 존재를 숨긴다 — 노출을 내린 글은 상세도 열리지 않아야 한다.
			if (!(await isCrawledCommunityFeedEnabled())) {
				throw new ORPCError("NOT_FOUND", {
					message: "게시글을 찾을 수 없습니다.",
				});
			}

			const [topic] = await db
				.select({
					boardName: crawledCommunityTopic.boardName,
					body: crawledCommunityTopic.body,
					commentCount: crawledCommunityTopic.commentCount,
					comments: crawledCommunityTopic.comments,
					id: crawledCommunityTopic.id,
					sourcePostedAt: crawledCommunityTopic.sourcePostedAt,
					title: crawledCommunityTopic.title,
					viewCount: crawledCommunityTopic.viewCount,
				})
				.from(crawledCommunityTopic)
				.where(
					and(
						eq(crawledCommunityTopic.id, input.topicId),
						// 운영자가 내린 글은 상세도 열리지 않는다. 목록에서만 빼면 링크를 아는
						// 사람에게는 계속 열려 있어 "삭제"가 아니라 "숨김"이 된다.
						isNull(crawledCommunityTopic.removedAt)
					)
				)
				.limit(1);

			if (!topic) {
				throw new ORPCError("NOT_FOUND", {
					message: "게시글을 찾을 수 없습니다.",
				});
			}

			// 우리 회원·비회원이 이 글에 남긴 댓글. 우리 글 댓글과 같은 노출 규칙
			// (published + 살아 있는 대댓글의 삭제 부모)과 같은 권한 정책을 쓴다.
			const rows = await selectVisibleCommentRows(
				eq(communityComment.crawledTopicId, topic.id)
			);
			const commentBadges = await loadAuthorBadges(rows);

			return {
				boardName: topic.boardName,
				// 본문·수집 댓글은 수집 시점에 이미 마스킹·정규화된 값이라 그대로 내린다.
				body: topic.body ?? "",
				// 원본에 달려 있던 댓글 수 + 우리 쪽 노출 댓글 수. 목록 행도 같은 합산을 쓰므로
				// (crawledCommunityFeedSelection의 상관 서브쿼리) 목록과 상세가 일치한다.
				commentCount:
					(topic.commentCount ?? 0) +
					rows.filter((row) => row.status === "published").length,
				// 우리 댓글(작성·수정·삭제 가능). 화면은 원본 댓글 뒤에 이어 붙인다.
				comments: toCommentItems(
					rows,
					commentPolicyForActor(actor),
					commentBadges
				),
				id: topic.id,
				// 원본에 달려 있던 댓글(익명·읽기 전용). null(아직 미수집)은 빈 목록으로 접어
				// 화면이 분기 없이 렌더한다.
				sourceComments: topic.comments ?? [],
				sourcePostedAt: topic.sourcePostedAt,
				title: topic.title,
				viewCount: topic.viewCount ?? 0,
			};
		}),

	createMediaUpload: protectedProcedure
		.input(createMediaUploadInput)
		.handler(async ({ context, input }) => {
			// 수다방 자격 가드를 먼저 통과해야 한다 — 글을 못 쓰는 계정이 업로드 URL만
			// 발급받아 공개 버킷을 이미지 호스팅으로 쓰는 걸 막는다.
			// 운영자 FAQ 답변 에디터도 같은 절차를 쓴다: resolveCommunityAccess가 admin을
			// 무조건 통과시키므로(정지 계정 제외) admin 전용 화면에서도 이 게이트로 충분하다.
			const profile = await requireCommunityMember(context.session);
			const policy = validateJobPostImageUpload(input);

			if (!policy.ok) {
				throw new ORPCError("BAD_REQUEST", {
					message: MEDIA_UPLOAD_ERROR_MESSAGES[policy.code],
				});
			}

			return await createEditorMediaUploadIntent({
				...input,
				userId: profile.userId,
			});
		}),

	createPost: publicProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const actor = await resolveCommunityActorForBoard(context, input.board);
			await assertSecretActorIdentity(actor, input.board);
			const role = actorRole(actor);
			if (actor.kind === "member") {
				await assertCommunityWarningRestriction({
					board: input.board,
					role: actor.profile.role,
					userId: actor.profile.userId,
				});
			}
			assertAnonymousPostAllowed({
				board: input.board,
				isAnonymous: isSecretBoard(input.board) || input.isAnonymous,
				role,
			});
			const authorName = await resolvePostAuthorName(actor, input);
			assertLegalAdvisorBoardScope(
				actor.kind === "member" ? actor.profile : null,
				input.board
			);
			// 가상 게시판(best)·비활성·읽기 전용 게시판은 여기서 걸린다 — FK 위반이
			// 500으로 새어 나가기 전에 사용자 문구로 막는다.
			await assertBoard(input.board, { forWrite: true });
			assertTiptapDoc(input.body);
			await assertNoBannedWords([input.title, extractTiptapText(input.body)]);
			await assertDisplayNameAllowed(authorName, {
				isAdmin: role === "admin",
			});

			// 공지사항은 운영자만, 광고글 표시는 업소회원만 허용한다(비회원은 둘 다 아니다).
			if (input.board === "notice" && role !== "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "공지사항은 운영자만 작성할 수 있습니다.",
				});
			}
			assertCreateCommentsDisabledAllowed(input.commentsDisabled, role);
			if (input.isPromotion && role !== "employer") {
				throw new ORPCError("BAD_REQUEST", { message: PROMOTION_ROLE_ERROR });
			}
			if (input.board === "free" && input.isLocked) {
				throw new ORPCError("BAD_REQUEST", {
					message: "자유수다에서는 비밀글을 작성할 수 없습니다.",
				});
			}
			assertContactPhoneBoard(input.board, input.contactPhone);
			const isLocked = resolveLockedForBoard(input.board, input.isLocked);
			assertEventNoticePolicy({
				board: input.board,
				isEvent: input.isEvent,
				isLocked,
				role,
			});
			const noticeBoardKeys = await validateNoticeBoardKeys(
				input.board,
				role,
				input.noticeBoardKeys
			);
			// 비밀글(잠금)은 잠금 게이트에 쓸 4자 이상 비밀번호가 필요하다.
			if (isLocked && (input.password?.length ?? 0) < 4) {
				throw new ORPCError("BAD_REQUEST", { message: LOCKED_PASSWORD_ERROR });
			}
			// 비회원은 게시판이 좁고 비밀번호가 필수다. 법률 자문을 뺀 보드에서는 is_locked가
			// false로 남는다 — 비밀글은 공개 경로에서 숨겨져 작성자 본인도 다시 읽지 못한다.
			validateGuestPostPassword(actor, input.board, isLocked, input.password);
			// 검증을 모두 통과한 뒤에 센다 — 금칙어·비번 오류로 튕긴 시도가 1분 락을
			// 먹으면 고쳐서 다시 낼 수도 없다.
			const writeRateLimit = assertWriteRateLimit({
				keys:
					actor.kind === "member"
						? [`community.createPost:${actor.profile.userId}`]
						: guestWriteKeys("createPost", actor.gid, context.clientIp),
				limit: 1,
				message: CREATE_POST_RATE_LIMIT_ERROR,
			});

			const authorUserId = actorUserId(actor);
			const { postPoints } = await getBoardContentPoints(input.board);
			// 회원이고 게시판 적립 금액이 있으면 그만큼, 아니면 0(게스트·0포인트 게시판).
			const target = authorUserId ? postPoints : 0;

			let created: { board: string; id: string; isLocked: boolean } | undefined;
			try {
				created = await db.transaction(async (tx) => {
					const [row] = await tx
						.insert(communityPost)
						.values({
							authorDisplayName: authorName,
							authorGender: secretActorGender(actor, input.board),
							authorGuestId: actorGuestId(actor),
							authorRole: role,
							authorUserId,
							board: input.board,
							body: input.body,
							contactPhone: input.contactPhone || null,
							commentsDisabled: input.commentsDisabled,
							isLocked,
							isEvent: input.isEvent,
							isAnonymous: isSecretBoard(input.board) || input.isAnonymous,
							isPromotion: input.isPromotion,
							// 비번 미입력(잠그지 않은 회원 글)은 빈 문자열로 저장한다 — verify가 항상
							// 실패해 잠금 게이트·비작성자 수정이 자연히 차단된다.
							passwordHash: input.password
								? hashCommunityPassword(input.password)
								: "",
							pointsAwarded: target,
							title: input.title,
						})
						.returning({
							board: communityPost.board,
							id: communityPost.id,
							isLocked: communityPost.isLocked,
						});
					if (row && noticeBoardKeys.length > 0) {
						await tx.insert(communityNoticeBoardPlacement).values(
							noticeBoardKeys.map((boardKey) => ({
								boardKey,
								postId: row.id,
							}))
						);
					}
					await reconcileContentPoints(tx, {
						userId: authorUserId,
						currentAwarded: 0,
						targetAmount: target,
						reasons: POINT_REASONS.post,
					});
					return row;
				});
			} catch (error) {
				releaseWriteRateLimit(writeRateLimit);
				throw error;
			}

			// 법률 자문 글은 전부 잠금글이고 답변 주체가 법률자문 계정이라, 개인 수신자가
			// 아니라 role 공유 1행으로 보낸다(누가 맡아도 되는 큐). 비회원 글은 행위자
			// 계정이 없어 알림을 만들 수 없다 — 정책상 포기(스펙 §3 제외 목록).
			const postActorUserId = actorUserId(actor);

			if (created && input.board === LEGAL_BOARD && postActorUserId) {
				await notifyBambiNotification({
					actorUserId: postActorUserId,
					metadata: {
						action: "submitted",
						board: created.board,
						postId: created.id,
					},
					recipientRole: "legal_advisor",
					targetId: created.id,
					targetType: "community_post",
				});
			}

			// 새 글은 즉시 published라 공개 URL이 생긴다 — 공개 게시판이면 글 상세·목록 재색인
			// 요청(비공개 게시판·행 없음이면 pingCommunityPost가 no-op).
			pingCommunityPost(created);

			return created;
		}),

	updatePost: publicProcedure
		.input(updatePostInput)
		.handler(async ({ context, input }) => {
			const post = await findPublishedPost(input.postId);
			const actor = await resolveCommunityActorForBoard(context, post.board);
			assertLegalAdvisorBoardScope(
				actor.kind === "member" ? actor.profile : null,
				post.board
			);
			const nextIsEvent = input.isEvent ?? post.isEvent;
			const nextCommentsDisabled =
				input.commentsDisabled ?? post.commentsDisabled;
			const nextIsAnonymous = input.isAnonymous ?? post.isAnonymous;
			assertAnonymousPostAllowed({
				board: post.board,
				isAnonymous: nextIsAnonymous,
				role: actorRole(actor),
			});
			assertCommentsDisabledAllowed(input.commentsDisabled, actorRole(actor));
			const authorName = await resolvePostAuthorName(actor, {
				authorName: input.authorName,
				board: post.board,
				isAnonymous: nextIsAnonymous,
			});
			assertTiptapDoc(input.body);
			await assertNoBannedWords([input.title, extractTiptapText(input.body)]);
			await assertDisplayNameAllowed(authorName, {
				isAdmin: actorRole(actor) === "admin",
			});

			// authorRole 스냅샷은 불변 — 업소로 기록된 글만 광고 표시를 유지·전환할 수 있다.
			if (post.authorRole !== "employer" && input.isPromotion) {
				throw new ORPCError("BAD_REQUEST", { message: PROMOTION_ROLE_ERROR });
			}
			if (post.board === "free" && input.isLocked) {
				throw new ORPCError("BAD_REQUEST", {
					message: "자유수다에서는 비밀글을 사용할 수 없습니다.",
				});
			}
			assertContactPhoneBoard(post.board, input.contactPhone);
			// 게시판은 수정으로 바뀌지 않으므로 잠금 강제도 저장된 board로 판정한다 — 법률 자문
			// 글은 작성자가 잠금을 풀어 달라고 보내도 계속 잠긴 채 남는다.
			const isLocked = resolveLockedForBoard(post.board, input.isLocked);
			assertEventNoticePolicy({
				board: post.board,
				isEvent: nextIsEvent,
				isLocked,
				role: actorRole(actor),
			});
			const noticeBoardKeys =
				input.noticeBoardKeys === undefined
					? undefined
					: await validateNoticeBoardKeys(
							post.board,
							actorRole(actor),
							input.noticeBoardKeys
						);

			// 비회원은 자기 신분(gid)이 찍힌 글만, 그것도 비밀번호로만 수정한다.
			if (actor.kind === "guest") {
				await assertBoard(post.board, { forWrite: true });
				assertGuestPostAccess(post, actor.gid);
				if (isLocked && post.board !== LEGAL_BOARD) {
					throw new ORPCError("BAD_REQUEST", { message: GUEST_LOCKED_ERROR });
				}
				assertGuestOwnership(post, input.password);
			} else {
				// 수정은 작성자 본인 또는 비밀번호 일치만 허용한다(admin이라도 비번 없이는 불가).
				const isAuthor = post.authorUserId === actor.profile.userId;
				const hasValidPassword =
					input.password != null &&
					verifyCommunityPassword(input.password, post.passwordHash);
				if (!(isAuthor || hasValidPassword)) {
					throw new ORPCError("FORBIDDEN", {
						message:
							"본인이 작성한 글만 수정할 수 있습니다. 비밀번호를 확인해 주세요.",
					});
				}
			}

			// 비밀번호 없이 작성한 글(passwordHash 빈 값)은 잠금 게이트에 쓸 비번이 없어
			// 비밀글로 전환할 수 없다 — 무결성을 위해 차단한다.
			if (isLocked && post.passwordHash === "") {
				throw new ORPCError("BAD_REQUEST", {
					message: "비밀번호 없이 작성한 글은 비밀글로 잠글 수 없어요.",
				});
			}

			const updated = await db.transaction(async (tx) => {
				const [row] = await tx
					.update(communityPost)
					.set({
						authorDisplayName: authorName,
						body: input.body,
						contactPhone: input.contactPhone || null,
						commentsDisabled: nextCommentsDisabled,
						isLocked,
						isEvent: nextIsEvent,
						isAnonymous: nextIsAnonymous,
						isPromotion: input.isPromotion,
						title: input.title,
						updatedAt: new Date(),
					})
					.where(eq(communityPost.id, input.postId))
					.returning({
						board: communityPost.board,
						id: communityPost.id,
						isLocked: communityPost.isLocked,
					});
				if (noticeBoardKeys !== undefined) {
					await tx
						.delete(communityNoticeBoardPlacement)
						.where(eq(communityNoticeBoardPlacement.postId, input.postId));
					if (noticeBoardKeys.length > 0) {
						await tx.insert(communityNoticeBoardPlacement).values(
							noticeBoardKeys.map((boardKey) => ({
								boardKey,
								postId: input.postId,
							}))
						);
					}
				}
				return row;
			});

			// 본문 수정은 상세 페이지 콘텐츠를 바꾼다 — 공개 게시판 글이면 재색인 요청.
			pingCommunityPost(updated);

			return updated;
		}),

	deletePost: publicProcedure
		.input(deletePostInput)
		.handler(async ({ context, input }) => {
			const post = await findPublishedPost(input.postId);
			const actor = await resolveCommunityActorForBoard(context, post.board);
			if (actor.kind === "guest") {
				assertGuestOwnership(post, input.password);
			} else {
				// 삭제는 작성자·관리자·비밀번호 일치 중 하나면 허용한다.
				const isAuthor = post.authorUserId === actor.profile.userId;
				const hasValidPassword =
					input.password != null &&
					verifyCommunityPassword(input.password, post.passwordHash);
				if (!(isAuthor || actor.profile.role === "admin" || hasValidPassword)) {
					throw new ORPCError("FORBIDDEN", {
						message:
							"본인이 작성한 글만 삭제할 수 있습니다. 비밀번호를 확인해 주세요.",
					});
				}
			}

			await db.transaction(async (tx) => {
				await tx
					.update(communityPost)
					.set({ status: "deleted", pointsAwarded: 0, updatedAt: new Date() })
					.where(eq(communityPost.id, input.postId));
				await reconcileContentPoints(tx, {
					userId: post.authorUserId,
					currentAwarded: post.pointsAwarded,
					targetAmount: 0,
					reasons: POINT_REASONS.post,
				});
			});

			// 글이 목록·상세에서 사라졌으니(soft delete) 재색인을 요청한다 — 공개 게시판만.
			// 잠금 글이면 공개 경로에 애초에 없던 글이라 pingCommunityPost가 no-op.
			pingCommunityPost({
				board: post.board,
				id: post.id,
				isLocked: post.isLocked,
			});

			return { id: post.id };
		}),

	toggleLike: publicProcedure
		.input(postReadInput)
		.handler(async ({ context, input }) => {
			const post = await findPublishedPost(input.postId);
			const actor = await resolveCommunityActorForBoard(context, post.board);
			if (actor.kind === "guest") {
				await assertBoard(post.board, { forWrite: true });
				assertGuestPostAccess(post, actor.gid);
			} else {
				assertLegalAdvisorBoardScope(actor.profile, post.board);
				requirePostReadAccess(post, actor.profile, input.password);
			}

			// 추천 주체 컬럼만 액터에 따라 갈린다 — 회원은 user_id, 비회원은 guest_id이고
			// 각각의 (post_id, *) unique 인덱스가 중복 추천을 막는다.
			const actorMatches =
				actor.kind === "member"
					? eq(communityPostLike.userId, actor.profile.userId)
					: eq(communityPostLike.guestId, actor.gid);
			const actorColumns =
				actor.kind === "member"
					? { userId: actor.profile.userId }
					: { guestId: actor.gid };

			// (post_id,user_id) unique 인덱스에 기대어 동시 호출에서도 캐시 증감이
			// 실제 행 변화와 1:1이 되게 한다. 삭제는 rowCount(returning 개수)로,
			// 삽입은 onConflictDoNothing 후 실제 삽입 여부로 판정한다.
			return await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ id: communityPostLike.id })
					.from(communityPostLike)
					.where(and(eq(communityPostLike.postId, input.postId), actorMatches))
					.limit(1);

				if (existing) {
					const removed = await tx
						.delete(communityPostLike)
						.where(eq(communityPostLike.id, existing.id))
						.returning({ id: communityPostLike.id });
					if (removed.length === 0) {
						const likeCount = await readLikeCount(tx, input.postId);
						return { isLiked: false, likeCount };
					}
					const [updated] = await tx
						.update(communityPost)
						.set({
							likeCount: sql`greatest(${communityPost.likeCount} - 1, 0)`,
						})
						.where(eq(communityPost.id, input.postId))
						.returning({ likeCount: communityPost.likeCount });
					if (actor.kind === "member") {
						await tx
							.update(communityPostLikeHistory)
							.set({ isActive: false })
							.where(
								and(
									eq(communityPostLikeHistory.userId, actor.profile.userId),
									eq(communityPostLikeHistory.postId, input.postId)
								)
							);
					}
					return { isLiked: false, likeCount: updated?.likeCount ?? 0 };
				}

				const inserted = await tx
					.insert(communityPostLike)
					.values({
						...actorColumns,
						postId: input.postId,
					})
					.onConflictDoNothing()
					.returning({ id: communityPostLike.id });
				if (inserted.length === 0) {
					const likeCount = await readLikeCount(tx, input.postId);
					return { isLiked: true, likeCount };
				}
				if (actor.kind === "member") {
					const [board] = await tx
						.select({ slug: communityBoard.slug })
						.from(communityBoard)
						.where(eq(communityBoard.key, post.board))
						.limit(1);
					await tx
						.insert(communityPostLikeHistory)
						.values({
							boardKey: post.board,
							boardSlug: board?.slug ?? post.board,
							postCreatedAt: post.createdAt,
							postId: post.id,
							title: post.title,
							userId: actor.profile.userId,
						})
						.onConflictDoUpdate({
							set: {
								boardKey: post.board,
								boardSlug: board?.slug ?? post.board,
								isActive: true,
								likedAt: new Date(),
								postCreatedAt: post.createdAt,
								title: post.title,
							},
							target: [
								communityPostLikeHistory.userId,
								communityPostLikeHistory.postId,
							],
						});
				}
				const [updated] = await tx
					.update(communityPost)
					.set({ likeCount: sql`${communityPost.likeCount} + 1` })
					.where(eq(communityPost.id, input.postId))
					.returning({ likeCount: communityPost.likeCount });
				return { isLiked: true, likeCount: updated?.likeCount ?? 0 };
			});
		}),

	// 회원 경로는 기존 그대로(잠금 게이트 통과 후 전체 댓글). 인증 게스트는 읽기 범위가
	// 회원과 같아(전체 보드 + 비밀번호로 여는 비밀글) 같은 게이트를 profile 없이 통과한다.
	// 토큰이 없는 방문자(공개 /board·크롤러)만 공개 상세(getPublicPost)와 같은 기준 —
	// 공개 보드의 잠기지 않은 published 글만 열린다.
	listComments: publicProcedure
		.input(postReadInput)
		.handler(async ({ context, input }) => {
			const post = await findPublishedPost(input.postId);
			const actor = await findCommunityReaderForBoard(context, post.board);

			if (actor?.kind === "member") {
				const { profile } = actor;
				// 글 로드 후 post.board로 판정한다 — 목록에서 못 보는 글은 댓글도 못 본다.
				assertLegalAdvisorBoardScope(profile, post.board);
				requirePostReadAccess(post, profile, input.password);
				const rows = await selectVisibleCommentRows(
					eq(communityComment.postId, input.postId)
				);

				// authorUserId는 canDelete·등급 조회에만 쓰고 응답에서는 제외한다(익명성 보호).
				return toCommentItems(
					rows,
					memberCommentPolicy(profile),
					await loadAuthorBadges(rows)
				);
			}

			const guestId = actor?.kind === "guest" ? actor.gid : null;

			if (guestId) {
				requirePostReadAccess(post, null, input.password);
			} else if (!isPublicBoard(post.board) || post.isLocked) {
				throw new ORPCError("NOT_FOUND", {
					message: "게시글을 찾을 수 없습니다.",
				});
			}

			const rows = await selectVisibleCommentRows(
				eq(communityComment.postId, input.postId)
			);

			// 색인되는 공개 페이지라 회원 계정명은 싣지 않는다(getPublicPost와 같은 원칙).
			// 화면은 authorRole 라벨로 작성인 유형만 표시한다.
			return toCommentItems(
				rows,
				guestCommentPolicy(guestId),
				await loadAuthorBadges(rows)
			);
		}),

	createComment: publicProcedure
		.input(createCommentInput)
		.handler(async ({ context, input }) => {
			const post = await findPublishedPost(input.postId);
			const actor = await resolveCommunityActorForBoard(context, post.board);
			await assertSecretActorIdentity(actor, post.board);
			if (actor.kind === "member") {
				await assertCommunityWarningRestriction({
					board: post.board,
					role: actor.profile.role,
					userId: actor.profile.userId,
				});
			}
			if (post.commentsDisabled) {
				throw new ORPCError("FORBIDDEN", {
					message: "이 글은 댓글을 작성할 수 없습니다.",
				});
			}
			// 비회원이 닿을 수 있는 잠긴 글은 자기가 쓴 법률 자문 글뿐이고(assertGuestPostAccess가
			// gid로 확인한다) 그 경우에도 잠금은 이미 통과한 상태라, password는 잠금 열쇠가
			// 아니라 그대로 자기 댓글의 소유권 비밀번호가 된다.
			let guestPassword: string | null = null;
			if (actor.kind === "guest") {
				await assertBoard(post.board, { forWrite: true });
				assertGuestPostAccess(post, actor.gid);
				guestPassword = requireGuestPassword(input.password);
			} else {
				assertLegalAdvisorBoardScope(actor.profile, post.board);
				requirePostReadAccess(post, actor.profile, input.password);
			}
			await assertNoBannedWords([input.body]);

			// 대댓글 알림에서 부모 댓글 작성자에게도 알려야 해 블록 밖으로 끌어올린다.
			const parentAuthorUserId = await loadCommentParentAuthor(
				input.parentCommentId,
				(parent) => parent.postId === input.postId
			);

			// 검증을 모두 통과한 뒤에 센다(createPost와 같은 이유). 회원도 계정당 같은
			// 한도를 받는다 — 적립 포인트를 노린 연타가 계정 하나로도 가능했다.
			assertWriteRateLimit({
				keys: commentWriteKeys(actor, context.clientIp),
				limit: COMMENT_LIMIT,
				message: COMMENT_RATE_LIMIT_ERROR,
			});

			const commentAuthorUserId = actorUserId(actor);
			const { commentPoints } = await getBoardContentPoints(post.board);
			const commentTarget = resolveCommentAward(
				commentAuthorUserId,
				post.authorUserId,
				commentPoints
			);

			const created = await db.transaction(async (tx) => {
				await tx.execute(
					sql`select ${communityPost.id} from ${communityPost} where ${communityPost.id} = ${input.postId} for share`
				);
				const [currentPost] = await tx
					.select({ commentsDisabled: communityPost.commentsDisabled })
					.from(communityPost)
					.where(eq(communityPost.id, input.postId))
					.limit(1);
				if (currentPost?.commentsDisabled) {
					throw new ORPCError("FORBIDDEN", {
						message: "이 글은 댓글을 작성할 수 없습니다.",
					});
				}
				const [row] = await tx
					.insert(communityComment)
					.values({
						authorGuestId: actorGuestId(actor),
						authorGender: secretActorGender(actor, post.board),
						authorRole: actorRole(actor),
						authorUserId: commentAuthorUserId,
						body: input.body,
						parentCommentId: input.parentCommentId ?? null,
						// 회원 댓글은 세션으로 소유권이 증명되므로 글과 같은 관례로 빈 문자열.
						passwordHash: guestPassword
							? hashCommunityPassword(guestPassword)
							: "",
						pointsAwarded: commentTarget,
						postId: input.postId,
					})
					.returning({ id: communityComment.id });
				await tx
					.update(communityPost)
					.set({ commentCount: sql`${communityPost.commentCount} + 1` })
					.where(eq(communityPost.id, input.postId));
				await reconcileContentPoints(tx, {
					userId: commentAuthorUserId,
					currentAwarded: 0,
					targetAmount: commentTarget,
					reasons: POINT_REASONS.comment,
				});
				return row;
			});

			// 알림은 커밋 뒤에 보낸다 — 알림 실패로 댓글이 롤백되면 안 된다.
			await notifyNewComment({
				actorRole: actorRole(actor),
				actorUserId: actorUserId(actor),
				parentAuthorUserId,
				parentCommentId: input.parentCommentId ?? null,
				post,
			});

			return created;
		}),

	// 수집 커뮤니티 글에 다는 댓글. 우리 글 댓글과 같은 규칙(회원·인증 비회원, 비회원은
	// 비밀번호, 1분 5회 도배 방지, 금칙어 검사, 대댓글 1단계)을 쓰고 대상 컬럼만 다르다.
	// 프로시저를 나눈 이유는 getCrawledTopic과 같다 — 잠금·게시판·법률자문 게이트가 통째로
	// 없는 경로라 한 핸들러에 섞으면 어떤 가드가 어느 쪽에 걸리는지 매번 다시 읽어야 한다.
	// 수정·삭제는 대상과 무관한 commentId 경로(updateComment·deleteComment)를 그대로 쓴다.
	createCrawledComment: publicProcedure
		.input(createCrawledCommentInput)
		.handler(async ({ context, input }) => {
			const actor = await resolveCommunityActor(context);

			// 스위치 OFF·운영자가 내린 글에는 쓸 수 없다 — 상세와 같은 노출 게이트다.
			if (!(await isCrawledCommunityFeedEnabled())) {
				throw new ORPCError("NOT_FOUND", {
					message: "게시글을 찾을 수 없습니다.",
				});
			}
			const [topic] = await db
				.select({ id: crawledCommunityTopic.id })
				.from(crawledCommunityTopic)
				.where(
					and(
						eq(crawledCommunityTopic.id, input.topicId),
						isNull(crawledCommunityTopic.removedAt)
					)
				)
				.limit(1);

			if (!topic) {
				throw new ORPCError("NOT_FOUND", {
					message: "게시글을 찾을 수 없습니다.",
				});
			}

			// 수집 글은 밤문화 이야기 게시판에 합류하므로 비회원 참여 여부·법률자문 격리도
			// 그 게시판 기준으로 판정한다(잠금은 없다 — 수집 글에 비밀글 개념이 없다).
			let guestPassword: null | string = null;
			if (actor.kind === "guest") {
				await assertBoard(CRAWLED_COMMUNITY_BOARD, { forWrite: true });
				guestPassword = requireGuestPassword(input.password);
			} else {
				assertLegalAdvisorBoardScope(actor.profile, CRAWLED_COMMUNITY_BOARD);
			}
			await assertNoBannedWords([input.body]);

			const parentAuthorUserId = await loadCommentParentAuthor(
				input.parentCommentId,
				(parent) => parent.crawledTopicId === input.topicId
			);

			// 도배 방지 버킷은 우리 글 댓글과 같은 키를 쓴다 — 대상을 갈아 가며 한도를
			// 두 배로 쓰는 우회로를 만들지 않는다.
			assertWriteRateLimit({
				keys: commentWriteKeys(actor, context.clientIp),
				limit: COMMENT_LIMIT,
				message: COMMENT_RATE_LIMIT_ERROR,
			});

			// 우리 글과 달리 카운트 캐시 갱신이 없다 — crawled_community_topic.comment_count는
			// 원본 값이고 재수집이 덮어쓴다. 상세가 두 원천을 합산해 보여준다.
			const [created] = await db
				.insert(communityComment)
				.values({
					authorGuestId: actorGuestId(actor),
					authorRole: actorRole(actor),
					authorUserId: actorUserId(actor),
					body: input.body,
					crawledTopicId: input.topicId,
					parentCommentId: input.parentCommentId ?? null,
					passwordHash: guestPassword
						? hashCommunityPassword(guestPassword)
						: "",
				})
				.returning({ id: communityComment.id });

			// 알림은 대댓글 한 갈래뿐이다 — 수집 글에는 알릴 우리 작성자가 없다.
			const commentActorUserId = actorUserId(actor);
			if (
				commentActorUserId &&
				parentAuthorUserId &&
				parentAuthorUserId !== commentActorUserId
			) {
				await notifyBambiNotification({
					actorUserId: commentActorUserId,
					// 딥링크는 게시판 글이 아니라 수집 글 상세다(웹 notificationHref가 분기한다).
					metadata: { action: "reply", crawledTopicId: input.topicId },
					recipientUserId: parentAuthorUserId,
					targetId: input.parentCommentId ?? topic.id,
					targetType: "community_comment",
				});
			}

			return created;
		}),

	deleteComment: publicProcedure
		.input(deleteCommentInput)
		.handler(async ({ context, input }) => {
			const actor = await resolveCommunityActor(context);
			const [comment] = await db
				.select()
				.from(communityComment)
				.where(eq(communityComment.id, input.commentId))
				.limit(1);

			if (comment?.status !== "published") {
				throw new ORPCError("NOT_FOUND", {
					message: "댓글을 찾을 수 없습니다.",
				});
			}
			if (actor.kind === "guest") {
				assertGuestOwnership(comment, input.password);
			} else if (
				comment.authorUserId !== actor.profile.userId &&
				actor.profile.role !== "admin"
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "본인이 작성한 댓글만 삭제할 수 있습니다.",
				});
			}

			const { postId } = comment;

			await db.transaction(async (tx) => {
				await tx
					.update(communityComment)
					.set({ status: "deleted", pointsAwarded: 0, updatedAt: new Date() })
					.where(eq(communityComment.id, input.commentId));
				// 수집 글 댓글(post_id null)은 줄일 캐시가 없다 — 수집 글의 댓글 수는 원본
				// 값이고 상세가 두 원천을 합산한다.
				if (postId) {
					await tx
						.update(communityPost)
						.set({
							commentCount: sql`greatest(${communityPost.commentCount} - 1, 0)`,
						})
						.where(eq(communityPost.id, postId));
				}
				await reconcileContentPoints(tx, {
					userId: comment.authorUserId,
					currentAwarded: comment.pointsAwarded,
					targetAmount: 0,
					reasons: POINT_REASONS.comment,
				});
			});

			return { id: comment.id };
		}),

	updateComment: publicProcedure
		.input(updateCommentInput)
		.handler(async ({ context, input }) => {
			const actor = await resolveCommunityActor(context);
			const [comment] = await db
				.select()
				.from(communityComment)
				.where(eq(communityComment.id, input.commentId))
				.limit(1);

			if (comment?.status !== "published") {
				throw new ORPCError("NOT_FOUND", {
					message: "댓글을 찾을 수 없습니다.",
				});
			}
			if (actor.kind === "guest") {
				assertGuestOwnership(comment, input.password);
			} else if (comment.authorUserId !== actor.profile.userId) {
				// 삭제와 달리 수정은 작성자 본인만 가능하다(admin도 타인 댓글은 수정 불가).
				throw new ORPCError("FORBIDDEN", {
					message: "본인이 작성한 댓글만 수정할 수 있습니다.",
				});
			}
			await assertNoBannedWords([input.body]);

			await db
				.update(communityComment)
				.set({ body: input.body, updatedAt: new Date() })
				.where(eq(communityComment.id, input.commentId));

			return { id: comment.id };
		}),

	// 운영자 글 숨김/삭제/복구. deletePost는 글 단위 카운트 부수효과가 없으므로
	// 상태 전환도 status·updatedAt만 갱신하고, 감사 로그를 남긴다.
	setPostStatusByAdmin: protectedProcedure
		.input(setPostStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const result = await db.transaction(async (tx) => {
				// 이미 삭제된 글에 삭제 요청이 또 오는 경우를 먼저 거른다 — 화면이 버튼을
				// 감춰도 낡은 목록 캐시나 다른 탭에서 요청이 들어올 수 있다.
				const [existing] = await tx
					.select({
						// 회수·재적립 대상과 금액 스냅샷.
						authorUserId: communityPost.authorUserId,
						// 알림 딥링크(/seeker/community/{slug}/{postId})에 필요하다.
						board: communityPost.board,
						// 잠금 글은 공개 URL이 없어 재색인 핑 대상에서 뺀다.
						isLocked: communityPost.isLocked,
						pointsAwarded: communityPost.pointsAwarded,
						status: communityPost.status,
					})
					.from(communityPost)
					.where(eq(communityPost.id, input.postId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND", {
						message: "글을 찾을 수 없습니다.",
					});
				}

				assertNotAlreadyDeleted({
					current: existing.status,
					kind: "post",
					next: input.status,
				});

				const [updated] = await tx
					.update(communityPost)
					.set({ status: input.status, updatedAt: new Date() })
					.where(eq(communityPost.id, input.postId))
					.returning({
						id: communityPost.id,
						status: communityPost.status,
					});

				if (!updated) {
					throw new ORPCError("NOT_FOUND", {
						message: "글을 찾을 수 없습니다.",
					});
				}

				// 노출성 전이에서만 포인트를 움직인다 — 이탈이면 회수(target 0), 진입이면
				// 재적립(회원 && 게시판 포인트). 동일 노출성 전이는 스냅샷 변화가 없다.
				const wasVisible = existing.status === "published";
				const willVisible = input.status === "published";
				if (wasVisible !== willVisible) {
					const { postPoints } = willVisible
						? await getBoardContentPoints(existing.board)
						: { postPoints: 0 };
					const nextAwarded = await reconcileContentPoints(tx, {
						userId: existing.authorUserId,
						currentAwarded: existing.pointsAwarded,
						targetAmount: existing.authorUserId ? postPoints : 0,
						reasons: POINT_REASONS.post,
					});
					await tx
						.update(communityPost)
						.set({ pointsAwarded: nextAwarded })
						.where(eq(communityPost.id, input.postId));
				}

				await tx.insert(adminModerationAction).values({
					action: `set_community_post_status:${input.status}`,
					adminUserId: admin.userId,
					metadata: input.reportId ? { reportId: input.reportId } : {},
					reason: input.reason,
					targetId: input.postId,
					targetType: "community_post",
				});

				return {
					board: existing.board,
					id: updated.id,
					isLocked: existing.isLocked,
					status: updated.status,
				};
			});

			await notifyModerationAction({
				action: `set_community_post_status:${input.status}`,
				actorUserId: admin.userId,
				metadata: { board: result.board, postId: input.postId },
				reason: input.reason,
				targetId: input.postId,
				targetType: "community_post",
			});

			// 운영자 숨김/복구는 공개 목록·상세 노출을 바꾼다 — 공개 게시판이면 재색인 요청.
			// 잠금 글은 공개 경로에 노출되지 않으므로 pingCommunityPost가 no-op.
			pingCommunityPost({
				board: result.board,
				id: result.id,
				isLocked: result.isLocked,
			});

			return { id: result.id, status: result.status };
		}),

	// 운영자 댓글 숨김/삭제/복구. commentCount 캐시는 노출(published)만 세므로
	// deleteComment/createComment와 동일하게 노출성이 바뀌는 전이에서만 증감한다.
	setCommentStatusByAdmin: protectedProcedure
		.input(setCommentStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			const result = await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({
						// 딥링크는 글 단위다 — 댓글이 속한 글의 게시판·id가 필요하다.
						// 수집 글 댓글은 우리 글 행이 없어 leftJoin이다(innerJoin이면 조치
						// 자체가 NOT_FOUND로 막혀 신고를 접수하고도 내릴 수가 없다).
						// 회수·재적립 대상과 금액 스냅샷.
						authorUserId: communityComment.authorUserId,
						board: communityPost.board,
						crawledTopicId: communityComment.crawledTopicId,
						postAuthorUserId: communityPost.authorUserId,
						pointsAwarded: communityComment.pointsAwarded,
						postId: communityComment.postId,
						status: communityComment.status,
					})
					.from(communityComment)
					.leftJoin(
						communityPost,
						eq(communityPost.id, communityComment.postId)
					)
					.where(eq(communityComment.id, input.commentId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND", {
						message: "댓글을 찾을 수 없습니다.",
					});
				}

				assertNotAlreadyDeleted({
					current: existing.status,
					kind: "comment",
					next: input.status,
				});

				const [updated] = await tx
					.update(communityComment)
					.set({ status: input.status, updatedAt: new Date() })
					.where(eq(communityComment.id, input.commentId))
					.returning({
						id: communityComment.id,
						status: communityComment.status,
					});

				if (!updated) {
					throw new ORPCError("NOT_FOUND", {
						message: "댓글을 찾을 수 없습니다.",
					});
				}

				// 동일 노출성 전이(예: hidden→deleted, published→published)는 카운트를 건드리지 않는다.
				// 수집 글 댓글(post_id null)은 갱신할 캐시가 없어 통째로 건너뛴다.
				const postId = existing.postId;
				const wasVisible = existing.status === "published";
				const willVisible = input.status === "published";
				if (postId && wasVisible && !willVisible) {
					await tx
						.update(communityPost)
						.set({
							commentCount: sql`greatest(${communityPost.commentCount} - 1, 0)`,
						})
						.where(eq(communityPost.id, postId));
				} else if (postId && !wasVisible && willVisible) {
					await tx
						.update(communityPost)
						.set({ commentCount: sql`${communityPost.commentCount} + 1` })
						.where(eq(communityPost.id, postId));
				}

				// 노출성 전이에서만 포인트를 움직인다(회수·재적립은 헬퍼로 분리).
				if (wasVisible !== willVisible) {
					await reconcileCommentPointsOnStatusChange(tx, {
						authorUserId: existing.authorUserId,
						postAuthorUserId: existing.postAuthorUserId,
						board: existing.board,
						commentId: input.commentId,
						currentAwarded: existing.pointsAwarded,
						willVisible,
					});
				}

				await tx.insert(adminModerationAction).values({
					action: `set_community_comment_status:${input.status}`,
					adminUserId: admin.userId,
					metadata: input.reportId ? { reportId: input.reportId } : {},
					reason: input.reason,
					targetId: input.commentId,
					targetType: "community_comment",
				});

				return {
					board: existing.board,
					crawledTopicId: existing.crawledTopicId,
					id: updated.id,
					postId: existing.postId,
					status: updated.status,
				};
			});

			await notifyModerationAction({
				action: `set_community_comment_status:${input.status}`,
				actorUserId: admin.userId,
				// 수집 글 댓글은 board·postId가 없어 수집 상세 id를 대신 싣는다(웹 딥링크 분기).
				metadata: {
					board: result.board,
					crawledTopicId: result.crawledTopicId,
					postId: result.postId,
				},
				reason: input.reason,
				targetId: input.commentId,
				targetType: "community_comment",
			});

			return { id: result.id, status: result.status };
		}),
};
