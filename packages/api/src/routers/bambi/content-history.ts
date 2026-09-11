import { db } from "@bambi-app/db";
import {
	communityBoard,
	communityComment,
	communityPost,
	communityPostLikeHistory,
	jobViewLog,
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
const adminJobViewInput = pageInput.extend({ userId: z.string().min(1) });

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
	listAdminMemberJobViews: adminProcedure
		.input(adminJobViewInput)
		.handler(async ({ input }) => {
			// 한 사용자의 로그는 많아야 수백 행이라 전부 읽어 업소별로 묶고 업소 단위로 페이지를 낸다.
			// ponytail: 사용자당 행이 수천을 넘기면 business_key 기준 SQL 집계로 바꾼다.
			const rows = await db
				.select({
					businessKey: jobViewLog.businessKey,
					businessPhone: jobViewLog.businessPhone,
					id: jobViewLog.id,
					jobPostId: jobViewLog.jobPostId,
					jobTitle: jobViewLog.jobTitle,
					lastViewedAt: jobViewLog.lastViewedAt,
					organizationId: jobViewLog.organizationId,
					organizationName: jobViewLog.organizationName,
					source: jobViewLog.source,
					viewCount: jobViewLog.viewCount,
				})
				.from(jobViewLog)
				.where(eq(jobViewLog.userId, input.userId))
				.orderBy(desc(jobViewLog.lastViewedAt));
			const groups = new Map<
				string,
				{
					businessKey: string;
					businessName: string;
					businessPhone: null | string;
					jobs: {
						id: string;
						jobPostId: string;
						jobTitle: string;
						lastViewedAt: Date;
						source: "crawled" | "member";
						viewCount: number;
					}[];
					lastViewedAt: Date;
					organizationId: null | string;
					source: "crawled" | "member";
					totalViews: number;
				}
			>();
			for (const row of rows) {
				const source = row.source === "crawled" ? "crawled" : "member";
				const group = groups.get(row.businessKey) ?? {
					businessKey: row.businessKey,
					businessName: row.organizationName,
					businessPhone: row.businessPhone,
					jobs: [],
					lastViewedAt: row.lastViewedAt,
					organizationId: row.organizationId,
					source,
					totalViews: 0,
				};
				group.jobs.push({
					id: row.id,
					jobPostId: row.jobPostId,
					jobTitle: row.jobTitle,
					lastViewedAt: row.lastViewedAt,
					source,
					viewCount: row.viewCount,
				});
				group.totalViews += row.viewCount;
				groups.set(row.businessKey, group);
			}
			// rows가 lastViewedAt 내림차순이라 Map 삽입 순서가 곧 업소의 최근순이다.
			const ordered = [...groups.values()];
			const start = (input.page - 1) * input.pageSize;
			return {
				items: ordered.slice(start, start + input.pageSize),
				page: input.page,
				pageSize: input.pageSize,
				totalCount: ordered.length,
			};
		}),
};
