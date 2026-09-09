import { db } from "@bambi-app/db";
import {
	bambiMemberGrade,
	bambiSiteSettings,
	communityBoard,
	crawledCommunityCommentEdit,
	crawledCommunityTopic,
} from "@bambi-app/db/schema/bambi";
import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import type { Context } from "../context";
import {
	assertLegalAdvisorBoardScope,
	canBypassLock,
	isSecretBoard,
	LEGAL_BOARD,
	resolveCommunityActorForBoard,
	resolveCommunityReaderForBoard,
	SECRET_AUTHOR_NAME,
} from "./bambi-community-authz";
import {
	CRAWLED_EDITED_AUTHOR_NAME,
	sourceCommentId,
} from "./bambi-crawled-community-policy";
import type { GradeBadge } from "./bambi-member-points";
import { SITE_SETTINGS_ROW_ID } from "./bambi-point-settings";
import { resolveGradeIconUrl } from "./bambi-storage";

export const crawledDisplayTitle = sql<string>`coalesce(${crawledCommunityTopic.editedTitle}, ${crawledCommunityTopic.title})`;
export const crawledDisplayDate =
	sql<Date>`coalesce(${crawledCommunityTopic.activityAt}, ${crawledCommunityTopic.sourcePostedAt})`.mapWith(
		crawledCommunityTopic.sourcePostedAt
	);
export const crawledDisplayBodyText = sql<string>`coalesce(${crawledCommunityTopic.editedBodyText}, ${crawledCommunityTopic.body})`;

/** 수집 목적지는 활성/쓰기 여부와 무관하게 실제 존재하는 모든 게시판이다. */
export const requireCrawlBoard = async (key: string | null | undefined) => {
	if (!key) {
		throw new ORPCError("BAD_REQUEST", {
			message: "수집할 게시판을 선택해 주세요.",
		});
	}
	const [board] = await db
		.select()
		.from(communityBoard)
		.where(eq(communityBoard.key, key))
		.limit(1);
	if (!board) {
		throw new ORPCError("NOT_FOUND", {
			message: "수집할 게시판을 찾을 수 없습니다.",
		});
	}
	return board;
};

export const loadCrawledEditorGrade = async (): Promise<GradeBadge | null> => {
	const [grade] = await db
		.select({
			name: bambiMemberGrade.name,
			color: bambiMemberGrade.color,
			iconStorageKey: bambiMemberGrade.iconStorageKey,
		})
		.from(bambiSiteSettings)
		.innerJoin(
			bambiMemberGrade,
			eq(bambiMemberGrade.id, bambiSiteSettings.crawledCommunityEditorGradeId)
		)
		.where(eq(bambiSiteSettings.id, SITE_SETTINGS_ROW_ID))
		.limit(1);
	return grade
		? {
				name: grade.name,
				color: grade.color,
				iconUrl: resolveGradeIconUrl(grade.iconStorageKey),
			}
		: null;
};

export const requireCrawledEditorGrade = async () => {
	const grade = await loadCrawledEditorGrade();
	if (!grade) {
		throw new ORPCError("BAD_REQUEST", {
			message: "크롤러 설정에서 편집 글에 표시할 등급을 먼저 선택해 주세요.",
		});
	}
	return grade;
};

export const loadCrawledTopicForReader = async (
	context: Context,
	topicId: string
) => {
	const [topic] = await db
		.select()
		.from(crawledCommunityTopic)
		.where(eq(crawledCommunityTopic.id, topicId))
		.limit(1);
	if (!topic || topic.removedAt) {
		throw new ORPCError("NOT_FOUND", { message: "게시글을 찾을 수 없습니다." });
	}
	const board = await requireCrawlBoard(topic.boardKey);
	if (!board.isActive) {
		throw new ORPCError("NOT_FOUND", { message: "게시글을 찾을 수 없습니다." });
	}
	const actor = await resolveCommunityReaderForBoard(context, topic.boardKey);
	const profile = actor.kind === "member" ? actor.profile : null;
	assertLegalAdvisorBoardScope(profile, topic.boardKey);
	const locked =
		topic.boardKey === LEGAL_BOARD &&
		!canBypassLock({ board: topic.boardKey, authorUserId: null }, profile);
	return { topic, board, actor, locked };
};

export const loadCrawledSourceComments = async (
	topic: typeof crawledCommunityTopic.$inferSelect,
	grade: GradeBadge | null
) => {
	const edits = await db
		.select()
		.from(crawledCommunityCommentEdit)
		.where(eq(crawledCommunityCommentEdit.topicId, topic.id));
	const byId = new Map(edits.map((edit) => [edit.sourceCommentId, edit]));
	return (topic.comments ?? []).map((comment, index) => {
		const id = sourceCommentId(topic.id, comment, index);
		const edit = byId.get(id);
		const authorName = edit ? CRAWLED_EDITED_AUTHOR_NAME : comment.authorName;
		return {
			id,
			authorName: isSecretBoard(topic.boardKey)
				? SECRET_AUTHOR_NAME
				: authorName,
			authorGender: isSecretBoard(topic.boardKey) ? ("female" as const) : null,
			authorGrade: edit ? grade : null,
			body: edit?.editedBody ?? comment.body,
			sourcePostedAt: edit?.editedAt.toISOString() ?? comment.sourcePostedAt,
		};
	});
};

/** 기존 본인 댓글 수정·삭제도 대상 게시판의 쓰기 주체와 열람 권한을 확인한다. */
export const resolveCrawledCommentActor = async (
	context: Context,
	topicId: string
) => {
	const { topic, locked } = await loadCrawledTopicForReader(context, topicId);
	if (locked) {
		throw new ORPCError("FORBIDDEN", { message: "비밀글입니다." });
	}
	return await resolveCommunityActorForBoard(context, topic.boardKey);
};

export const crawledRevisionCondition = (id: string, revision: number) =>
	and(
		eq(crawledCommunityTopic.id, id),
		eq(crawledCommunityTopic.editRevision, revision)
	);
