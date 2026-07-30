import { db } from "@bambi-app/db";
import { user } from "@bambi-app/db/schema/auth";
import {
	adminModerationAction,
	bambiSiteSettings,
	communityComment,
	communityPost,
	communityPostLike,
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
	isNull,
	ne,
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
	findCommunityMember,
	requireCommunityMember,
} from "../../services/bambi-community-authz";
import {
	hashCommunityPassword,
	verifyCommunityPassword,
} from "../../services/bambi-community-password";
import {
	JOB_POST_IMAGE_MAX_BYTES,
	type JobPostImageUploadPolicyCode,
	validateJobPostImageUpload,
} from "../../services/bambi-job-media-policy";
import { createEditorMediaUploadIntent } from "../../services/bambi-storage";
import {
	assertTiptapDoc,
	extractTiptapText,
} from "../../services/bambi-tiptap-text";

const PAGE_SIZE = 20;
const OVERVIEW_LIMIT = 4;
const BEST_WINDOW_DAYS = 30;
const BEST_MIN_LIKES = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCKED_TITLE = "비밀글입니다";
const BODY_MAX = 30_000;
const COMMENTS_CAP = 200;

const communityWritableBoardSchema = z.enum([
	"free",
	"work_talk",
	"market",
	"notice",
]);
const communityBoardSchema = z.enum([
	"best",
	"free",
	"work_talk",
	"market",
	"notice",
]);

type CommunityBoardInput = z.infer<typeof communityBoardSchema>;

// 요약 행의 출처. 화면이 이 값으로 "외부 수집" 배지·상세 라우팅을 가른다(공고 목록의
// JobFeedSource와 같은 판별). 순수 글은 "native", 수집 글은 "crawled".
type CommunityFeedSource = "crawled" | "native";

// 설계 D4 — 수집 커뮤니티 글이 합류하는 게시판. 상수 하나만 바꾸면 다른 게시판으로 옮길 수 있게 둔다.
const CRAWLED_COMMUNITY_BOARD: CommunityBoardInput = "work_talk";

// 원본 게시판명이 비어 있을 때 작성자 자리에 세울 값(수집 대상 게시판 이름).
const CRAWLED_AUTHOR_NAME = "밤문화이야기";

// UNION 상대편 타입의 정본은 순수 글 컬럼이다. 수집 쪽 sql 리터럴이 이 타입을 참조하면
// enum 값이 늘거나 컬럼이 바뀌어도 두 투영이 함께 움직인다(한쪽만 어긋나 UNION이 깨지지 않는다).
type CommunityPostColumns = typeof communityPost.$inferSelect;

// 목록 필터 — 독립 On/Off 토글 2개(광고 글보기·업소 회원 글보기). 기본은 둘 다 false=전체.
// 켜진 토글이 있으면 그 조건들의 합집합(OR)으로 좁힌다(광고=is_promotion, 업소=author_role).
const listPostsInput = z.object({
	board: communityBoardSchema,
	page: z.number().int().min(1).default(1),
	showEmployer: z.boolean().default(false),
	showPromotion: z.boolean().default(false),
});

const postIdInput = z.object({
	postId: z.string().uuid(),
});

const createPostInput = z.object({
	authorName: z.string().trim().min(1).max(30),
	board: communityWritableBoardSchema,
	body: z.string().min(2).max(BODY_MAX),
	isLocked: z.boolean().default(false),
	isPromotion: z.boolean().default(false),
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

const updatePostInput = postIdInput.extend({
	authorName: z.string().trim().min(1).max(30),
	body: z.string().min(2).max(BODY_MAX),
	isLocked: z.boolean(),
	isPromotion: z.boolean(),
	password: z.string().trim().max(30).optional(),
	title: z.string().trim().min(2).max(100),
});

const PROMOTION_ROLE_ERROR = "광고글은 업소회원만 표시할 수 있습니다.";

const deletePostInput = postIdInput.extend({
	password: z.string().trim().max(30).optional(),
});

// 잠긴 글의 추천·댓글 열람도 상세 조회와 동일하게 비밀번호 게이트를 통과해야 한다.
const postReadInput = postIdInput.extend({
	password: z.string().trim().max(30).optional(),
});

const createCommentInput = postIdInput.extend({
	body: z.string().trim().min(1).max(1000),
	parentCommentId: z.string().uuid().optional(),
	password: z.string().trim().max(30).optional(),
});

const deleteCommentInput = z.object({
	commentId: z.string().uuid(),
});

const updateCommentInput = z.object({
	body: z.string().trim().min(1).max(1000),
	commentId: z.string().uuid(),
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

// profile null은 미자격·비로그인 열람(overview public 경로) — 잠금 우회 없음.
const canBypassLock = (
	post: { authorUserId: string },
	profile: BambiAccessProfile | null
): boolean =>
	profile !== null &&
	(post.authorUserId === profile.userId || profile.role === "admin");

export const requirePostReadAccess = (
	post: { authorUserId: string; isLocked: boolean; passwordHash: string },
	profile: BambiAccessProfile,
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
	T extends { authorUserId: string; isLocked: boolean; title: string },
>(
	items: T[],
	profile: BambiAccessProfile | null
): T[] =>
	items.map((item) =>
		item.isLocked && !canBypassLock(item, profile)
			? { ...item, title: LOCKED_TITLE }
			: item
	);

// 목록·상세 공용 요약 셀렉션. 작성자 표시명은 글별 author_display_name 컬럼 값.
// source·isCrawled는 순수 글 쪽 상수다 — 수집 글 union(crawledCommunityFeedSelection)이
// 같은 키·순서로 마주 서야 해서 여기에 둔다. isCrawled는 union 정렬 키로만 쓰이고
// 응답(toPublicSummary)에는 나가지 않는다.
const postSummarySelection = {
	authorName: communityPost.authorDisplayName,
	authorRole: communityPost.authorRole,
	authorUserId: communityPost.authorUserId,
	board: communityPost.board,
	commentCount: communityPost.commentCount,
	createdAt: communityPost.createdAt,
	id: communityPost.id,
	isLocked: communityPost.isLocked,
	isPromotion: communityPost.isPromotion,
	likeCount: communityPost.likeCount,
	title: communityPost.title,
	viewCount: communityPost.viewCount,
	source: sql<CommunityFeedSource>`'native'`.as("source"),
	isCrawled: sql<number>`0`.as("is_crawled"),
};

// 수집 커뮤니티 글을 순수 요약과 같은 모양으로 투영한다. UNION은 이름이 아니라 위치로
// 컬럼을 맞추므로 postSummarySelection과 **키 순서까지** 같아야 한다(bambi-job-feed.ts와 같은 원칙).
// 없는 값은 리터럴로 채운다 — 수집 글엔 작성자 계정·잠금·추천·광고가 없다.
const crawledCommunityFeedSelection = {
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
	commentCount: sql<number>`coalesce(${crawledCommunityTopic.commentCount}, 0)`,
	// 원 게시일을 작성일 자리에 쓴다. where의 30일 컷오프가 null을 걸러내므로 결과에선
	// non-null이고, UNION 상대(created_at NOT NULL)와 타입이 맞는다.
	createdAt: sql<Date>`${crawledCommunityTopic.sourcePostedAt}`,
	id: crawledCommunityTopic.id,
	isLocked: sql<boolean>`false`,
	isPromotion: sql<boolean>`false`,
	likeCount: sql<number>`0`,
	title: crawledCommunityTopic.title,
	viewCount: sql<number>`coalesce(${crawledCommunityTopic.viewCount}, 0)`,
	source: sql<CommunityFeedSource>`'crawled'`,
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

// 베스트글은 저장 게시판이 아니라 최근 30일 추천 상위 큐레이션 가상 게시판이다.
// 공지사항(notice)은 베스트 큐레이션에서 제외한다. windowStart(30일 컷오프)는
// 목록·count 쿼리 간 밀리초 오차로 1-off가 나지 않도록 핸들러에서 한 번 계산해
// 동일 값으로 전달한다.
const buildBoardFilters = (
	board: CommunityBoardInput,
	windowStart: Date
): SQL[] => {
	if (board === "best") {
		return [
			eq(communityPost.status, "published"),
			gte(communityPost.likeCount, BEST_MIN_LIKES),
			gte(communityPost.createdAt, windowStart),
			ne(communityPost.board, "notice"),
		];
	}
	return [
		eq(communityPost.status, "published"),
		eq(communityPost.board, board),
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

const buildBoardOrder = (board: CommunityBoardInput) =>
	board === "best"
		? [desc(communityPost.likeCount), desc(communityPost.createdAt)]
		: [desc(communityPost.createdAt)];

const selectBoardPosts = (
	board: CommunityBoardInput,
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

// authorUserId는 마스킹·bypass 계산엔 필요하지만 익명성 보호를 위해 클라이언트
// 응답에서는 제외한다(명시적 화이트리스트 매핑).
const toPublicSummary = (summary: PostSummaryRow) => ({
	authorName: summary.authorName,
	authorRole: summary.authorRole,
	board: summary.board,
	commentCount: summary.commentCount,
	createdAt: summary.createdAt,
	id: summary.id,
	isLocked: summary.isLocked,
	isPromotion: summary.isPromotion,
	likeCount: summary.likeCount,
	// 화면이 "외부 수집" 배지·상세 라우팅을 가르는 판별 필드.
	source: summary.source,
	title: summary.title,
	viewCount: summary.viewCount,
});

// 순수 work_talk + 수집 커뮤니티 글을 한 쿼리로 합쳐 페이지네이션한다. 애플리케이션에서
// 두 배열을 합치는 대신 UNION ALL을 쓰는 이유는 정렬·limit·offset을 DB에서 끝내야 수집
// 테이블이 커져도 무너지지 않기 때문이다(bambi-job-feed.listJobFeed와 같은 판단). ALL인
// 이유는 두 원천에 같은 행이 있을 수 없어 DISTINCT가 불필요해서다. 정렬은 공고와 같은
// 우선순위 규칙 — 1순위 순수(is_crawled 0), 2순위 수집(1), 각 구간 내 최신순.
const selectWorkTalkFeedUnion = ({
	limit,
	offset,
	windowStart,
}: {
	limit: number;
	offset: number;
	windowStart: Date;
}) =>
	unionAll(
		db
			.select(postSummarySelection)
			.from(communityPost)
			.where(and(...buildBoardFilters(CRAWLED_COMMUNITY_BOARD, windowStart))),
		db
			.select(crawledCommunityFeedSelection)
			.from(crawledCommunityTopic)
			// 수집 글은 원 게시일 30일 이내만 노출한다(순수 work_talk엔 컷오프가 없지만, 남의
			// 게시판에서 긁어 온 글은 신선한 것만 섞는다). null 게시일은 이 조건이 자연히 걸러낸다.
			.where(and(...crawledTopicFeedFilters(windowStart)))
	)
		.orderBy(sql`is_crawled asc, created_at desc`)
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

// 30일 컷오프 안의 수집 글 수. 스위치 ON일 때 totalCount에 합산한다.
const countCrawledCommunityTopics = async (
	windowStart: Date
): Promise<number> => {
	const [row] = await db
		.select({ value: count() })
		.from(crawledCommunityTopic)
		.where(and(...crawledTopicFeedFilters(windowStart)));
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

export const communityRouter = {
	listPosts: protectedProcedure
		.input(listPostsInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);

			const listFilters = buildListFilters(
				input.showPromotion,
				input.showEmployer
			);
			// 목록·count 쿼리가 같은 30일 컷오프를 쓰도록 한 번만 계산한다.
			const windowStart = bestWindowStart();
			const offset = (input.page - 1) * PAGE_SIZE;

			// 수집 글은 광고·업소 필터를 만족할 수 없다 — 그 토글이 켜지면(listFilters가 있으면)
			// 순수 글만 남기고 수집 union을 끈다. work_talk·스위치 ON·필터 없음일 때만 섞는다.
			const includeCrawled =
				input.board === CRAWLED_COMMUNITY_BOARD &&
				listFilters.length === 0 &&
				(await isCrawledCommunityFeedEnabled());

			if (includeCrawled) {
				const [items, [nativeTotal], crawledTotal] = await Promise.all([
					selectWorkTalkFeedUnion({ limit: PAGE_SIZE, offset, windowStart }),
					db
						.select({ value: count() })
						.from(communityPost)
						.where(
							and(...buildBoardFilters(CRAWLED_COMMUNITY_BOARD, windowStart))
						),
					countCrawledCommunityTopics(windowStart),
				]);

				return {
					items: maskLockedSummaries(items, profile).map(toPublicSummary),
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

			return {
				items: maskLockedSummaries(items, profile).map(toPublicSummary),
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: total?.value ?? 0,
			};
		}),

	// 홈 미리보기는 미자격자(비회원·남성·비광고 업소)에게도 게시판별 상위 4개까지 공개한다.
	// 상세·목록·쓰기는 여전히 requireCommunityMember 뒤에 있고, 여기서는 요약(제목·작성자
	// 표시명·카운트)만 나가며 비밀글 제목은 자격 무관하게 마스킹된다(잠금 우회는 자격자만).
	overview: publicProcedure.handler(async ({ context }) => {
		const profile = await findCommunityMember(context.session);

		const windowStart = bestWindowStart();
		// work_talk 미리보기도 스위치 ON이면 목록과 같은 union 규칙으로 수집 글을 섞는다.
		const communityFeedOn = await isCrawledCommunityFeedEnabled();
		const [best, free, workTalk, market, notice] = await Promise.all([
			selectBoardPosts("best", { limit: OVERVIEW_LIMIT, windowStart }),
			selectBoardPosts("free", { limit: OVERVIEW_LIMIT, windowStart }),
			communityFeedOn
				? selectWorkTalkFeedUnion({
						limit: OVERVIEW_LIMIT,
						offset: 0,
						windowStart,
					})
				: selectBoardPosts(CRAWLED_COMMUNITY_BOARD, {
						limit: OVERVIEW_LIMIT,
						windowStart,
					}),
			selectBoardPosts("market", { limit: OVERVIEW_LIMIT, windowStart }),
			selectBoardPosts("notice", { limit: OVERVIEW_LIMIT, windowStart }),
		]);

		return {
			best: maskLockedSummaries(best, profile).map(toPublicSummary),
			free: maskLockedSummaries(free, profile).map(toPublicSummary),
			market: maskLockedSummaries(market, profile).map(toPublicSummary),
			notice: maskLockedSummaries(notice, profile).map(toPublicSummary),
			workTalk: maskLockedSummaries(workTalk, profile).map(toPublicSummary),
		};
	}),

	getPost: protectedProcedure
		.input(
			postIdInput.extend({
				password: z.string().trim().max(30).optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			if (post.isLocked && !canBypassLock(post, profile)) {
				if (!input.password) {
					return {
						authorName: post.authorDisplayName,
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
			}

			// 원자 증가 후 값을 응답에 그대로 반영한다(증가 전 스냅샷+1이 아니라 실제 값).
			const [viewUpdated] = await db
				.update(communityPost)
				.set({ viewCount: sql`${communityPost.viewCount} + 1` })
				.where(eq(communityPost.id, input.postId))
				.returning({ viewCount: communityPost.viewCount });

			const [like] = await db
				.select({ id: communityPostLike.id })
				.from(communityPostLike)
				.where(
					and(
						eq(communityPostLike.postId, input.postId),
						eq(communityPostLike.userId, profile.userId)
					)
				)
				.limit(1);

			const isMine = post.authorUserId === profile.userId;

			return {
				authorName: post.authorDisplayName,
				authorRole: post.authorRole,
				board: post.board,
				body: post.body,
				canDelete: isMine || profile.role === "admin",
				canEdit: isMine,
				commentCount: post.commentCount,
				createdAt: post.createdAt,
				id: post.id,
				isLiked: Boolean(like),
				isLocked: post.isLocked,
				isPromotion: post.isPromotion,
				likeCount: post.likeCount,
				locked: false as const,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: viewUpdated?.viewCount ?? post.viewCount + 1,
			};
		}),

	// 수집 커뮤니티 글 상세. 순수 getPost와 테이블이 달라 프로시저를 나눈다(crawledJobsRouter와
	// 같은 판단 — 한 핸들러에서 두 테이블을 분기시키면 응답에 뭐가 섞일 수 있는지 매번 다시
	// 읽어 확인해야 한다). 멤버 게이트 + 스위치 게이트를 통과해야 하고, 좋아요·수정·삭제·댓글
	// 작성은 없다. sourceUrl은 절대 내려보내지 않는다 — 그 링크 한 줄이 원본 전체로 가는
	// 우회로다(crawled-jobs.ts PUBLIC_COLUMNS 주석의 원칙 그대로).
	getCrawledTopic: protectedProcedure
		.input(z.object({ topicId: z.uuid() }))
		.handler(async ({ context, input }) => {
			await requireCommunityMember(context.session);
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

			return {
				boardName: topic.boardName,
				// 본문·댓글은 수집 시점에 이미 마스킹·정규화된 값이라 그대로 내린다.
				body: topic.body ?? "",
				commentCount: topic.commentCount ?? 0,
				// null(아직 미수집)은 빈 목록으로 접어 화면이 분기 없이 렌더한다.
				comments: topic.comments ?? [],
				id: topic.id,
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

	createPost: protectedProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			assertTiptapDoc(input.body);
			await assertNoBannedWords([input.title, extractTiptapText(input.body)]);

			// 공지사항은 운영자만, 광고글 표시는 업소회원만 허용한다.
			if (input.board === "notice" && profile.role !== "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "공지사항은 운영자만 작성할 수 있습니다.",
				});
			}
			if (input.isPromotion && profile.role !== "employer") {
				throw new ORPCError("BAD_REQUEST", { message: PROMOTION_ROLE_ERROR });
			}
			// 비밀글(잠금)은 잠금 게이트에 쓸 4자 이상 비밀번호가 필요하다.
			if (input.isLocked && (input.password?.length ?? 0) < 4) {
				throw new ORPCError("BAD_REQUEST", { message: LOCKED_PASSWORD_ERROR });
			}

			const [created] = await db
				.insert(communityPost)
				.values({
					authorDisplayName: input.authorName,
					authorRole: profile.role,
					authorUserId: profile.userId,
					board: input.board,
					body: input.body,
					isLocked: input.isLocked,
					isPromotion: input.isPromotion,
					// 비번 미입력(잠그지 않은 글)은 빈 문자열로 저장한다 — verify가 항상 실패해
					// 잠금 게이트·비작성자 수정이 자연히 차단된다.
					passwordHash: input.password
						? hashCommunityPassword(input.password)
						: "",
					title: input.title,
				})
				.returning({ board: communityPost.board, id: communityPost.id });

			return created;
		}),

	updatePost: protectedProcedure
		.input(updatePostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);
			assertTiptapDoc(input.body);
			await assertNoBannedWords([input.title, extractTiptapText(input.body)]);

			// authorRole 스냅샷은 불변 — 업소로 기록된 글만 광고 표시를 유지·전환할 수 있다.
			if (post.authorRole !== "employer" && input.isPromotion) {
				throw new ORPCError("BAD_REQUEST", { message: PROMOTION_ROLE_ERROR });
			}

			// 수정은 작성자 본인 또는 비밀번호 일치만 허용한다(admin이라도 비번 없이는 불가).
			const isAuthor = post.authorUserId === profile.userId;
			const hasValidPassword =
				input.password != null &&
				verifyCommunityPassword(input.password, post.passwordHash);
			if (!(isAuthor || hasValidPassword)) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"본인이 작성한 글만 수정할 수 있습니다. 비밀번호를 확인해 주세요.",
				});
			}

			// 비밀번호 없이 작성한 글(passwordHash 빈 값)은 잠금 게이트에 쓸 비번이 없어
			// 비밀글로 전환할 수 없다 — 무결성을 위해 차단한다.
			if (input.isLocked && post.passwordHash === "") {
				throw new ORPCError("BAD_REQUEST", {
					message: "비밀번호 없이 작성한 글은 비밀글로 잠글 수 없어요.",
				});
			}

			const [updated] = await db
				.update(communityPost)
				.set({
					authorDisplayName: input.authorName,
					body: input.body,
					isLocked: input.isLocked,
					isPromotion: input.isPromotion,
					title: input.title,
					updatedAt: new Date(),
				})
				.where(eq(communityPost.id, input.postId))
				.returning({ board: communityPost.board, id: communityPost.id });

			return updated;
		}),

	deletePost: protectedProcedure
		.input(deletePostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			// 삭제는 작성자·관리자·비밀번호 일치 중 하나면 허용한다.
			const isAuthor = post.authorUserId === profile.userId;
			const hasValidPassword =
				input.password != null &&
				verifyCommunityPassword(input.password, post.passwordHash);
			if (!(isAuthor || profile.role === "admin" || hasValidPassword)) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"본인이 작성한 글만 삭제할 수 있습니다. 비밀번호를 확인해 주세요.",
				});
			}

			await db
				.update(communityPost)
				.set({ status: "deleted", updatedAt: new Date() })
				.where(eq(communityPost.id, input.postId));

			return { id: post.id };
		}),

	toggleLike: protectedProcedure
		.input(postReadInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);
			requirePostReadAccess(post, profile, input.password);

			// (post_id,user_id) unique 인덱스에 기대어 동시 호출에서도 캐시 증감이
			// 실제 행 변화와 1:1이 되게 한다. 삭제는 rowCount(returning 개수)로,
			// 삽입은 onConflictDoNothing 후 실제 삽입 여부로 판정한다.
			return await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({ id: communityPostLike.id })
					.from(communityPostLike)
					.where(
						and(
							eq(communityPostLike.postId, input.postId),
							eq(communityPostLike.userId, profile.userId)
						)
					)
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
					return { isLiked: false, likeCount: updated?.likeCount ?? 0 };
				}

				const inserted = await tx
					.insert(communityPostLike)
					.values({
						postId: input.postId,
						userId: profile.userId,
					})
					.onConflictDoNothing()
					.returning({ id: communityPostLike.id });
				if (inserted.length === 0) {
					const likeCount = await readLikeCount(tx, input.postId);
					return { isLiked: true, likeCount };
				}
				const [updated] = await tx
					.update(communityPost)
					.set({ likeCount: sql`${communityPost.likeCount} + 1` })
					.where(eq(communityPost.id, input.postId))
					.returning({ likeCount: communityPost.likeCount });
				return { isLiked: true, likeCount: updated?.likeCount ?? 0 };
			});
		}),

	listComments: protectedProcedure
		.input(postReadInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);
			requirePostReadAccess(post, profile, input.password);

			const rows = await db
				.select({
					authorName: user.name,
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
				.where(eq(communityComment.postId, input.postId))
				.orderBy(asc(communityComment.createdAt))
				.limit(COMMENTS_CAP);

			// published 대댓글을 가진 삭제 부모는 스레드 유지를 위해 플레이스홀더로 남긴다.
			const liveParentIds = new Set(
				rows
					.filter((row) => row.status === "published" && row.parentCommentId)
					.map((row) => row.parentCommentId)
			);

			// authorUserId는 canDelete 계산에만 쓰고 응답에서는 제외한다(익명성 보호).
			return rows
				.filter(
					(row) => row.status === "published" || liveParentIds.has(row.id)
				)
				.map((row) =>
					row.status === "published"
						? {
								authorName: row.authorName,
								authorRole: row.authorRole,
								body: row.body,
								// 삭제와 달리 수정은 작성자 본인만 가능하다(admin 제외 — getPost.canEdit와 동일 철학).
								canDelete:
									row.authorUserId === profile.userId ||
									profile.role === "admin",
								canEdit: row.authorUserId === profile.userId,
								createdAt: row.createdAt,
								id: row.id,
								isDeleted: false,
								parentCommentId: row.parentCommentId,
							}
						: {
								authorName: null,
								authorRole: null,
								body: "",
								canDelete: false,
								canEdit: false,
								createdAt: row.createdAt,
								id: row.id,
								isDeleted: true,
								parentCommentId: row.parentCommentId,
							}
				);
		}),

	createComment: protectedProcedure
		.input(createCommentInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);
			requirePostReadAccess(post, profile, input.password);
			await assertNoBannedWords([input.body]);

			if (input.parentCommentId) {
				const [parent] = await db
					.select({
						id: communityComment.id,
						parentCommentId: communityComment.parentCommentId,
						postId: communityComment.postId,
						status: communityComment.status,
					})
					.from(communityComment)
					.where(eq(communityComment.id, input.parentCommentId))
					.limit(1);

				if (parent?.status !== "published" || parent.postId !== input.postId) {
					throw new ORPCError("NOT_FOUND", {
						message: "답글을 달 댓글을 찾을 수 없습니다.",
					});
				}
				if (parent.parentCommentId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "답글에는 다시 답글을 달 수 없습니다.",
					});
				}
			}

			return await db.transaction(async (tx) => {
				const [created] = await tx
					.insert(communityComment)
					.values({
						authorRole: profile.role,
						authorUserId: profile.userId,
						body: input.body,
						parentCommentId: input.parentCommentId ?? null,
						postId: input.postId,
					})
					.returning();
				await tx
					.update(communityPost)
					.set({ commentCount: sql`${communityPost.commentCount} + 1` })
					.where(eq(communityPost.id, input.postId));
				return created;
			});
		}),

	deleteComment: protectedProcedure
		.input(deleteCommentInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
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
			if (comment.authorUserId !== profile.userId && profile.role !== "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "본인이 작성한 댓글만 삭제할 수 있습니다.",
				});
			}

			await db.transaction(async (tx) => {
				await tx
					.update(communityComment)
					.set({ status: "deleted", updatedAt: new Date() })
					.where(eq(communityComment.id, input.commentId));
				await tx
					.update(communityPost)
					.set({
						commentCount: sql`greatest(${communityPost.commentCount} - 1, 0)`,
					})
					.where(eq(communityPost.id, comment.postId));
			});

			return { id: comment.id };
		}),

	updateComment: protectedProcedure
		.input(updateCommentInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
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
			// 삭제와 달리 수정은 작성자 본인만 가능하다(admin도 타인 댓글은 수정 불가).
			if (comment.authorUserId !== profile.userId) {
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

			return await db.transaction(async (tx) => {
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

				await tx.insert(adminModerationAction).values({
					action: `set_community_post_status:${input.status}`,
					adminUserId: admin.userId,
					metadata: input.reportId ? { reportId: input.reportId } : {},
					reason: input.reason,
					targetId: input.postId,
					targetType: "community_post",
				});

				return { id: updated.id, status: updated.status };
			});
		}),

	// 운영자 댓글 숨김/삭제/복구. commentCount 캐시는 노출(published)만 세므로
	// deleteComment/createComment와 동일하게 노출성이 바뀌는 전이에서만 증감한다.
	setCommentStatusByAdmin: protectedProcedure
		.input(setCommentStatusByAdminInput)
		.handler(async ({ context, input }) => {
			const admin = await requireAdminProfile(context.session);

			return await db.transaction(async (tx) => {
				const [existing] = await tx
					.select({
						postId: communityComment.postId,
						status: communityComment.status,
					})
					.from(communityComment)
					.where(eq(communityComment.id, input.commentId))
					.limit(1);

				if (!existing) {
					throw new ORPCError("NOT_FOUND", {
						message: "댓글을 찾을 수 없습니다.",
					});
				}

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
				const wasVisible = existing.status === "published";
				const willVisible = input.status === "published";
				if (wasVisible && !willVisible) {
					await tx
						.update(communityPost)
						.set({
							commentCount: sql`greatest(${communityPost.commentCount} - 1, 0)`,
						})
						.where(eq(communityPost.id, existing.postId));
				} else if (!wasVisible && willVisible) {
					await tx
						.update(communityPost)
						.set({ commentCount: sql`${communityPost.commentCount} + 1` })
						.where(eq(communityPost.id, existing.postId));
				}

				await tx.insert(adminModerationAction).values({
					action: `set_community_comment_status:${input.status}`,
					adminUserId: admin.userId,
					metadata: input.reportId ? { reportId: input.reportId } : {},
					reason: input.reason,
					targetId: input.commentId,
					targetType: "community_comment",
				});

				return { id: updated.id, status: updated.status };
			});
		}),
};
