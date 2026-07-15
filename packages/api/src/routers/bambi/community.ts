import { db } from "@bambi-app/db";
import {
	bambiProfile,
	communityComment,
	communityPost,
	communityPostLike,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import type { BambiAccessProfile } from "../../services/bambi-authz";
import { requireCommunityMember } from "../../services/bambi-community-authz";
import {
	hashCommunityPassword,
	verifyCommunityPassword,
} from "../../services/bambi-community-password";

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
	password: z.string().trim().min(4).max(30),
	title: z.string().trim().min(2).max(100),
});

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

const assertTiptapDoc = (body: string) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new ORPCError("BAD_REQUEST", {
			message: "본문 형식이 올바르지 않습니다.",
		});
	}
	if (
		typeof parsed !== "object" ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== "doc"
	) {
		throw new ORPCError("BAD_REQUEST", {
			message: "본문 형식이 올바르지 않습니다.",
		});
	}
};

const canBypassLock = (
	post: { authorUserId: string },
	profile: BambiAccessProfile
): boolean => post.authorUserId === profile.userId || profile.role === "admin";

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
	profile: BambiAccessProfile
): T[] =>
	items.map((item) =>
		item.isLocked && !canBypassLock(item, profile)
			? { ...item, title: LOCKED_TITLE }
			: item
	);

// 목록·상세 공용 요약 셀렉션. 작성자 표시명은 글별 author_display_name 컬럼 값.
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
};

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
	title: summary.title,
	viewCount: summary.viewCount,
});

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
			const [items, [total]] = await Promise.all([
				selectBoardPosts(input.board, {
					filters: listFilters,
					limit: PAGE_SIZE,
					offset: (input.page - 1) * PAGE_SIZE,
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

	overview: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireCommunityMember(context.session);

		const windowStart = bestWindowStart();
		const [best, free, workTalk, market, notice] = await Promise.all([
			selectBoardPosts("best", { limit: OVERVIEW_LIMIT, windowStart }),
			selectBoardPosts("free", { limit: OVERVIEW_LIMIT, windowStart }),
			selectBoardPosts("work_talk", { limit: OVERVIEW_LIMIT, windowStart }),
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

	createPost: protectedProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			assertTiptapDoc(input.body);

			// 공지사항은 운영자만, 광고글 표시는 업소회원만 허용한다.
			if (input.board === "notice" && profile.role !== "admin") {
				throw new ORPCError("FORBIDDEN", {
					message: "공지사항은 운영자만 작성할 수 있습니다.",
				});
			}
			if (input.isPromotion && profile.role !== "employer") {
				throw new ORPCError("BAD_REQUEST", { message: PROMOTION_ROLE_ERROR });
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
					passwordHash: hashCommunityPassword(input.password),
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
					authorName: bambiProfile.displayName,
					authorRole: communityComment.authorRole,
					authorUserId: communityComment.authorUserId,
					body: communityComment.body,
					createdAt: communityComment.createdAt,
					id: communityComment.id,
					parentCommentId: communityComment.parentCommentId,
					status: communityComment.status,
				})
				.from(communityComment)
				.leftJoin(
					bambiProfile,
					eq(bambiProfile.userId, communityComment.authorUserId)
				)
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
								canDelete:
									row.authorUserId === profile.userId ||
									profile.role === "admin",
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
};
