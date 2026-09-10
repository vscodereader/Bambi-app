import { describe, expect, it } from "vitest";

import {
	canSubmitCommunityPost,
	communityAccessDestination,
	communityBodyText,
	communityDocumentWithImages,
	communityPageCount,
	communityPostHref,
	normalizeCommunityPage,
	plainTextDocument,
} from "./community";

describe("community navigation", () => {
	it("일반 글과 수집 글을 서로 다른 상세로 보낸다", () => {
		expect(communityPostHref({ board: "free", id: "a" })).toBe(
			"/(seeker)/community/free/a"
		);
		expect(
			communityPostHref({ board: "work_talk", id: "b", source: "crawled" })
		).toBe("/(seeker)/community/crawled/b");
	});

	it("법률자문가와 남성 사용자 접근을 서버 정책과 같은 게시판으로 보낸다", () => {
		expect(
			communityAccessDestination({
				boardKey: "free",
				gender: "female",
				isGuest: false,
				role: "legal_advisor",
			})
		).toBe("legal");
		expect(
			communityAccessDestination({
				boardKey: "free",
				gender: "male",
				isGuest: false,
				role: "job_seeker",
			})
		).toBe("secret");
		expect(
			communityAccessDestination({
				boardKey: "notice",
				gender: "male",
				isGuest: false,
				role: "job_seeker",
			})
		).toBeNull();
	});

	it("잘못된 페이지는 1로 접고 전체 페이지는 최소 1이다", () => {
		expect(normalizeCommunityPage("0")).toBe(1);
		expect(normalizeCommunityPage("3")).toBe(3);
		expect(communityPageCount(0)).toBe(1);
		expect(communityPageCount(21, 20)).toBe(2);
	});
});

describe("community editor", () => {
	it("평문을 서버 Tiptap 문서로 만들고 다시 읽는다", () => {
		const document = plainTextDocument("첫 줄\n둘째 줄");
		expect(communityBodyText(document)).toBe("첫 줄\n둘째 줄");
	});

	it("업로드 이미지 URL을 image 노드로 보존한다", () => {
		const parsed = JSON.parse(
			communityDocumentWithImages("본문", ["https://cdn.example/a.jpg"])
		) as { content: Array<{ attrs?: { src?: string }; type: string }> };
		expect(parsed.content.at(-1)).toEqual({
			attrs: { src: "https://cdn.example/a.jpg" },
			type: "image",
		});
	});

	it("게스트와 비밀글은 4자 비밀번호가 필요하다", () => {
		expect(
			canSubmitCommunityPost({
				body: "본문",
				isGuest: true,
				isLocked: false,
				password: "123",
				title: "제목",
			})
		).toBe(false);
		expect(
			canSubmitCommunityPost({
				body: "본문",
				isGuest: false,
				isLocked: true,
				password: "1234",
				title: "제목",
			})
		).toBe(true);
	});
});
