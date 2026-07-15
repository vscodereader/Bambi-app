import { db } from "@bambi-app/db";
import {
	bambiProfile,
	communityPost,
	communityPostLike,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../../index";
import { requireCommunityMember } from "../../services/bambi-community-authz";

const PAGE_SIZE = 20;
const OVERVIEW_LIMIT = 4;
const BEST_WINDOW_DAYS = 30;
const BEST_MIN_LIKES = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

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
	board: communityWritableBoardSchema,
	body: z.string().trim().min(2).max(5000),
	title: z.string().trim().min(2).max(100),
});

// 목록·상세 공용 요약 셀렉션. 작성자 표시명은 bambiProfile.displayName(없으면 웹이 "회원" 폴백).
const postSummarySelection = {
	authorName: bambiProfile.displayName,
	authorUserId: communityPost.authorUserId,
	board: communityPost.board,
	commentCount: communityPost.commentCount,
	createdAt: communityPost.createdAt,
	id: communityPost.id,
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
		.leftJoin(bambiProfile, eq(bambiProfile.userId, communityPost.authorUserId))
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
			await requireCommunityMember(context.session);

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
				items,
				page: input.page,
				pageSize: PAGE_SIZE,
				totalCount: total?.value ?? 0,
			};
		}),

	overview: protectedProcedure.handler(async ({ context }) => {
		await requireCommunityMember(context.session);

		const [best, free, workTalk, market] = await Promise.all([
			selectBoardPosts("best", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("free", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("work_talk", { limit: OVERVIEW_LIMIT }),
			selectBoardPosts("market", { limit: OVERVIEW_LIMIT }),
		]);

		return { best, free, market, workTalk };
	}),

	getPost: protectedProcedure
		.input(postIdInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);
			const post = await findPublishedPost(input.postId);

			// 조회수는 원자 증가. updatedAt은 건드리지 않는다(수정 시각과 분리).
			await db
				.update(communityPost)
				.set({ viewCount: sql`${communityPost.viewCount} + 1` })
				.where(eq(communityPost.id, input.postId));

			const [author] = await db
				.select({ displayName: bambiProfile.displayName })
				.from(bambiProfile)
				.where(eq(bambiProfile.userId, post.authorUserId))
				.limit(1);
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
				authorName: author?.displayName ?? null,
				authorUserId: post.authorUserId,
				board: post.board,
				body: post.body,
				canDelete: isMine || profile.role === "admin",
				canEdit: isMine,
				commentCount: post.commentCount,
				createdAt: post.createdAt,
				id: post.id,
				isLiked: Boolean(like),
				likeCount: post.likeCount,
				title: post.title,
				updatedAt: post.updatedAt,
				viewCount: post.viewCount + 1,
			};
		}),

	createPost: protectedProcedure
		.input(createPostInput)
		.handler(async ({ context, input }) => {
			const profile = await requireCommunityMember(context.session);

			const [created] = await db
				.insert(communityPost)
				.values({
					authorUserId: profile.userId,
					board: input.board,
					body: input.body,
					title: input.title,
				})
				.returning();

			return created;
		}),
};
