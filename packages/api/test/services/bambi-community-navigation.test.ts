import { describe, expect, it } from "vitest";
import {
	type CommunityNavigationCandidate,
	pickCommunityNavigationNeighbor,
} from "@/services/bambi-community-navigation";

const candidate = (
	id: string,
	createdAt: string,
	source: "crawled" | "native" = "native"
): CommunityNavigationCandidate => ({
	boardKey: "work_talk",
	createdAt: new Date(createdAt),
	id,
	source,
	title: id,
});

describe("게시글 등록시간 탐색", () => {
	it("이전글은 가장 늦은 후보, 다음글은 가장 이른 후보를 고른다", () => {
		const older = candidate(
			"00000000-0000-0000-0000-000000000001",
			"2026-08-25T11:59:00Z"
		);
		const newer = candidate(
			"00000000-0000-0000-0000-000000000002",
			"2026-08-25T12:01:00Z",
			"crawled"
		);
		expect(pickCommunityNavigationNeighbor([older, null], "previous")).toBe(
			older
		);
		expect(pickCommunityNavigationNeighbor([newer, null], "next")).toBe(newer);
	});

	it("등록시간이 같으면 글 ID를 보조 총순서로 사용한다", () => {
		const lowerId = candidate(
			"00000000-0000-0000-0000-000000000001",
			"2026-08-25T12:00:00Z"
		);
		const higherId = candidate(
			"00000000-0000-0000-0000-000000000002",
			"2026-08-25T12:00:00Z",
			"crawled"
		);
		expect(
			pickCommunityNavigationNeighbor([lowerId, higherId], "previous")
		).toBe(higherId);
		expect(pickCommunityNavigationNeighbor([higherId, lowerId], "next")).toBe(
			lowerId
		);
	});
});
