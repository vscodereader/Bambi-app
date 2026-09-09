import { db } from "@bambi-app/db";
import {
	adminModerationAction,
	crawledCommunityCommentEdit,
	crawledCommunityTopic,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import z from "zod";
import { adminProcedure } from "../../index";
import { assertNoBannedWords } from "../../services/bambi-banned-words";
import {
	COMMUNITY_BODY_JSON_MAX_LENGTH,
	COMMUNITY_TITLE_MAX_LENGTH,
	COMMUNITY_TITLE_MIN_LENGTH,
} from "../../services/bambi-community-post-policy";
import {
	crawledRevisionCondition,
	loadCrawledEditorGrade,
	loadCrawledSourceComments,
	requireCrawlBoard,
	requireCrawledEditorGrade,
} from "../../services/bambi-crawled-community";
import {
	CRAWLED_SOURCE_COMMENT_MAX_LENGTH,
	crawledTextToDocument,
	sourceCommentId,
} from "../../services/bambi-crawled-community-policy";
import {
	assertTiptapDoc,
	extractTiptapText,
} from "../../services/bambi-tiptap-text";

const editTarget = z.object({
	id: z.uuid(),
	expectedRevision: z.number().int().nonnegative(),
});
const requireTopic = async (id: string) => {
	const [topic] = await db
		.select()
		.from(crawledCommunityTopic)
		.where(eq(crawledCommunityTopic.id, id))
		.limit(1);
	if (!topic) {
		throw new ORPCError("NOT_FOUND", {
			message: "수집 글을 찾을 수 없습니다.",
		});
	}
	return topic;
};
function assertRevisionSaved<T>(saved: T | undefined): asserts saved is T {
	if (!saved) {
		throw new ORPCError("CONFLICT", {
			message: "다른 관리자가 수정했습니다. 최신 내용을 다시 불러와 주세요.",
		});
	}
}

export const crawledCommunityEditRouter = {
	getTopicForEdit: adminProcedure
		.input(z.object({ id: z.uuid() }))
		.handler(async ({ input }) => {
			const topic = await requireTopic(input.id);
			const board = await requireCrawlBoard(topic.boardKey);
			// 미설정이어도 조회·작성은 가능하고 저장 시에만 설정을 요구한다.
			return {
				id: topic.id,
				board,
				title: topic.editedTitle ?? topic.title,
				body: topic.editedBody ?? crawledTextToDocument(topic.body ?? ""),
				revision: topic.editRevision,
				sourceComments: await loadCrawledSourceComments(
					topic,
					await loadCrawledEditorGrade()
				),
			};
		}),
	updateTopic: adminProcedure
		.input(
			editTarget
				.extend({
					title: z
						.string()
						.trim()
						.min(COMMUNITY_TITLE_MIN_LENGTH)
						.max(COMMUNITY_TITLE_MAX_LENGTH),
					body: z.string().min(2).max(COMMUNITY_BODY_JSON_MAX_LENGTH),
				})
				.strict()
		)
		.handler(async ({ input, context }) => {
			await requireTopic(input.id);
			await requireCrawledEditorGrade();
			assertTiptapDoc(input.body);
			const text = extractTiptapText(input.body);
			await assertNoBannedWords([input.title, text]);
			const now = new Date();
			return await db.transaction(async (tx) => {
				const [saved] = await tx
					.update(crawledCommunityTopic)
					.set({
						editedTitle: input.title,
						editedBody: input.body,
						editedBodyText: text,
						editedAt: now,
						activityAt: now,
						editedByUserId: context.session.user.id,
						editRevision: sql`${crawledCommunityTopic.editRevision} + 1`,
					})
					.where(crawledRevisionCondition(input.id, input.expectedRevision))
					.returning({
						id: crawledCommunityTopic.id,
						revision: crawledCommunityTopic.editRevision,
					});
				assertRevisionSaved(saved);
				await tx.insert(adminModerationAction).values({
					adminUserId: context.session.user.id,
					targetType: "community_post",
					targetId: input.id,
					action: "edit_crawled_community_topic",
					reason: "수집 글 제목·본문 편집",
					metadata: {
						source: "crawled",
						revision: input.expectedRevision + 1,
					},
				});
				return saved;
			});
		}),
	updateSourceComment: adminProcedure
		.input(
			editTarget
				.extend({
					sourceCommentId: z.string().min(1).max(160),
					body: z.string().trim().min(1).max(CRAWLED_SOURCE_COMMENT_MAX_LENGTH),
				})
				.strict()
		)
		.handler(async ({ input, context }) => {
			const topic = await requireTopic(input.id);
			if (
				!(topic.comments ?? []).some(
					(comment, index) =>
						sourceCommentId(topic.id, comment, index) === input.sourceCommentId
				)
			) {
				throw new ORPCError("NOT_FOUND", {
					message: "이 글에서 수집한 댓글을 찾을 수 없습니다.",
				});
			}
			await requireCrawledEditorGrade();
			await assertNoBannedWords([input.body]);
			const now = new Date();
			return await db.transaction(async (tx) => {
				const [saved] = await tx
					.update(crawledCommunityTopic)
					.set({
						activityAt: now,
						editRevision: sql`${crawledCommunityTopic.editRevision} + 1`,
					})
					.where(crawledRevisionCondition(input.id, input.expectedRevision))
					.returning({
						id: crawledCommunityTopic.id,
						revision: crawledCommunityTopic.editRevision,
					});
				assertRevisionSaved(saved);
				const edited = {
					editedBody: input.body,
					editedAt: now,
					editedByUserId: context.session.user.id,
				};
				await tx
					.insert(crawledCommunityCommentEdit)
					.values({
						topicId: input.id,
						sourceCommentId: input.sourceCommentId,
						...edited,
					})
					.onConflictDoUpdate({
						target: [
							crawledCommunityCommentEdit.topicId,
							crawledCommunityCommentEdit.sourceCommentId,
						],
						set: edited,
					});
				await tx.insert(adminModerationAction).values({
					adminUserId: context.session.user.id,
					targetType: "community_comment",
					targetId: input.id,
					action: "edit_crawled_community_comment",
					reason: "수집 댓글 편집",
					metadata: {
						sourceCommentId: input.sourceCommentId,
						revision: input.expectedRevision + 1,
					},
				});
				return saved;
			});
		}),
};
