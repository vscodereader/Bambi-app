import type { CrawledCommunityCommentRecord } from "@bambi-app/db/schema/bambi";
import { COMMUNITY_COMMENT_BODY_MAX_LENGTH } from "./bambi-community-post-policy";

// 운영자 편집 수집 글의 표시 정책. 실제 관리자 계정의 이름/등급을 변경하지 않는다.
export const CRAWLED_EDITED_AUTHOR_NAME = "ㅇㅇ";
export const CRAWLED_SOURCE_COMMENT_MAX_LENGTH =
	COMMUNITY_COMMENT_BODY_MAX_LENGTH;

export const sourceCommentId = (
	topicId: string,
	comment: CrawledCommunityCommentRecord,
	index: number
): string => comment.id ?? `legacy:${topicId}:${index}`;

/** 원본은 HTML이 아닌 평문이다. 기존 에디터가 빈 문서로 처리하지 않도록 변환한다. */
const LINE_BREAK = /\r?\n/;
export const crawledTextToDocument = (text: string): string =>
	JSON.stringify({
		type: "doc",
		content: text.split(LINE_BREAK).map((line) => ({
			type: "paragraph",
			...(line ? { content: [{ type: "text", text: line }] } : {}),
		})),
	});
