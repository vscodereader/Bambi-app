import { db } from "@bambi-app/db";
import {
	communityBoard,
	communityComment,
	communityPost,
	communityPostLikeHistory,
} from "@bambi-app/db/schema/bambi";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../../index";
import { requireActiveBambiProfile } from "../../services/bambi-authz";
import { extractTiptapText } from "../../services/bambi-tiptap-text";

const pageInput = z.object({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(50).default(10),
});
const adminInput = pageInput.extend({
	filter: z.enum(["all", "comment", "post"]).default("all"),
	userId: z.string().min(1),
});

export const contentHistoryRouter = {
	listMineAuthored: protectedProcedure
		.input(pageInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const where = eq(communityPost.authorUserId, profile.userId);
			const [[total], items] = await Promise.all([
				db.select({ value: count() }).from(communityPost).where(where),
				db
					.select({
						boardKey: communityPost.board,
						boardLabel: communityBoard.label,
						boardSlug: communityBoard.slug,
						createdAt: communityPost.createdAt,
						id: communityPost.id,
						status: communityPost.status,
						title: communityPost.title,
					})
					.from(communityPost)
					.innerJoin(
						communityBoard,
						eq(communityBoard.key, communityPost.board)
					)
					.where(where)
					.orderBy(desc(communityPost.createdAt))
					.limit(input.pageSize)
					.offset((input.page - 1) * input.pageSize),
			]);
			return {
				items,
				page: input.page,
				pageSize: input.pageSize,
				totalCount: total?.value ?? 0,
			};
		}),
	listMineLiked: protectedProcedure
		.input(pageInput)
		.handler(async ({ context, input }) => {
			const profile = await requireActiveBambiProfile(context.session);
			const where = and(
				eq(communityPostLikeHistory.userId, profile.userId),
				eq(communityPostLikeHistory.isActive, true)
			);
			const [[total], rows] = await Promise.all([
				db
					.select({ value: count() })
					.from(communityPostLikeHistory)
					.where(where),
				db
					.select({
						boardKey: communityPostLikeHistory.boardKey,
						boardLabel: communityBoard.label,
						boardSlug: communityPostLikeHistory.boardSlug,
						createdAt: communityPostLikeHistory.postCreatedAt,
						id: communityPostLikeHistory.postId,
						title: communityPostLikeHistory.title,
					})
					.from(communityPostLikeHistory)
					.leftJoin(
						communityBoard,
						eq(communityBoard.key, communityPostLikeHistory.boardKey)
					)
					.where(where)
					.orderBy(desc(communityPostLikeHistory.likedAt))
					.limit(input.pageSize)
					.offset((input.page - 1) * input.pageSize),
			]);
			const live = rows.length
				? await db
						.select({ id: communityPost.id, status: communityPost.status })
						.from(communityPost)
						.where(
							inArray(
								communityPost.id,
								rows.map((row) => row.id)
							)
						)
				: [];
			const statusById = new Map(live.map((row) => [row.id, row.status]));
			return {
				items: rows.map((row) => ({
					...row,
					status: statusById.get(row.id) ?? "missing",
				})),
				page: input.page,
				pageSize: input.pageSize,
				totalCount: total?.value ?? 0,
			};
		}),
	listAdminMemberContent: adminProcedure
		.input(adminInput)
		.handler(async ({ input }) => {
			const postRows =
				input.filter === "comment"
					? []
					: await db
							.select({
								body: communityPost.body,
								createdAt: communityPost.createdAt,
								id: communityPost.id,
								status: communityPost.status,
								title: communityPost.title,
							})
							.from(communityPost)
							.where(eq(communityPost.authorUserId, input.userId));
			const posts = postRows.map((row) => ({
				...row,
				body: extractTiptapText(row.body),
				kind: "post" as const,
			}));
			const comments =
				input.filter === "post"
					? []
					: await db
							.select({
								body: communityComment.body,
								createdAt: communityComment.createdAt,
								id: communityComment.id,
								status: communityComment.status,
							})
							.from(communityComment)
							.where(eq(communityComment.authorUserId, input.userId));
			const merged = [
				...posts,
				...comments.map((row) => ({
					...row,
					kind: "comment" as const,
					title: "댓글",
				})),
			].sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
			);
			const start = (input.page - 1) * input.pageSize;
			return {
				items: merged.slice(start, start + input.pageSize),
				page: input.page,
				pageSize: input.pageSize,
				totalCount: merged.length,
			};
		}),
};
