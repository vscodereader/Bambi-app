import { db } from "@bambi-app/db";
import { communityPost, communityPostLike } from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
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

const communityWritableBoardSchema = z.enum(["free", "work_talk", "market"]);
const communityBoardSchema = z.enum(["best", "free", "work_talk", "market"]);

type CommunityBoardInput = z.infer<typeof communityBoardSchema>;

const listPostsInput = z.object({
	board: communityBoardSchema,
	page: z.number().int().min(1).default(1),
});

const postIdInput = z.object({
	postId: z.string().uuid(),
});

const createPostInput = z.object({
	authorName: z.string().trim().min(1).max(30),
	board: communityWritableBoardSchema,
	body: z.string().min(2).max(BODY_MAX),
	isLocked: z.boolean().default(false),
	password: z.string().min(4).max(30),
	title: z.string().trim().min(2).max(100),
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
	authorUserId: communityPost.authorUserId,
	board: communityPost.board,
	commentCount: communityPost.commentCount,
	createdAt: communityPost.createdAt,
	id: communityPost.id,
	isLocked: communityPost.isLocked,
	likeCount: communityPost.likeCount,
	title: communityPost.title,
	viewCount: communityPost.viewCount,
};

const bestWindowStart = () => new Date(Date.now() - BEST_WINDOW_DAYS * DAY_MS);

// 베스트글은 저장 게시판이 아니라 최근 30일 추천 상위 큐레이션 가상 게시판이다.
const buildBoardFilters = (board: CommunityBoardInput) => {
	if (board === "best") {
		return [
			eq(communityPost.status, "published"),
			gte(communityPost.likeCount, BEST_MIN_LIKES),
			gte(communityPost.createdAt, bestWindowStart()),
		];
	}
	return [
		eq(communityPost.status, "published"),
		eq(communityPost.board, board),
	];
};

const buildBoardOrder = (board: CommunityBoardInput) =>
	board === "best"
		? [desc(communityPost.likeCount), desc(communityPost.createdAt)]
		: [desc(communityPost.createdAt)];

const selectBoardPosts = (
	board: CommunityBoardInput,
	{ limit, offset = 0 }: { limit: number; offset?: number }
) =>
	db
		.select(postSummarySelection)
		.from(communityPost)
		.where(and(...buildBoardFilters(board)))
		.orderBy(...buildBoardOrder(board))
		.limit(limit)
		.offset(offset);

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

			const filters = buildBoardFilters(input.board);
			const [items, [total]] = await Promise.all([
				selectBoardPosts(input.board, {
					limit: PAGE_SIZE,
					offset: (input.page - 1) * PAGE_SIZE,
				}),
				db
					.select({ value: count() })
					.from(communityPost)
					.where(and(...filters)),
			]);

			return {
				items: maskLockedSummaries(items, profile),
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: total?.value ?? 0,
			};
		}),

	overview: protectedProcedure.handler(async ({ context }) => {
		const profile = await requireCommunityMember(context.session);

		const [best, free, workTalk, market] = await Promise.all([
			selectBoardPosts("best", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("free", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("work_talk", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("market", { limit: OVERVIEW_LIMIT }),
		]);

		return {
			best: maskLockedSummaries(best, profile),
			free: maskLockedSummaries(free, profile),
			market: maskLockedSummaries(market, profile),
			workTalk: maskLockedSummaries(workTalk, profile),
		};
	}),

	getPost: protectedProcedure
		.input(
			postIdInput.extend({
				password: z.string().max(30).optional(),
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

			await db
				.update(communityPost)
				.set({ viewCount: sql`${communityPost.viewCount} + 1` })
				.where(eq(communityPost.id, input.postId));

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
				authorUserId: post.authorUserId,
				board: post.board,
				body: post.body,
				canDelete: isMine || profile.role === "admin",
				canEdit: isMine,
				commentCount: post.commentCount,
				createdAt: post.createdAt,
				id: post.id,
				isLiked: Boolean(like),
				isLocked: post.isLocked,
				likeCount: post.likeCount,
				locked: false as const,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: post.viewCount + 1,
			};
		}),

	createPost: protectedProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			assertTiptapDoc(input.body);

			const [created] = await db
				.insert(communityPost)
				.values({
					authorDisplayName: input.authorName,
					authorUserId: profile.userId,
					board: input.board,
					body: input.body,
					isLocked: input.isLocked,
					passwordHash: hashCommunityPassword(input.password),
					title: input.title,
				})
				.returning({ board: communityPost.board, id: communityPost.id });

			return created;
		}),
};
