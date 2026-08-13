import { describe, expect, it } from "vitest";

import {
	popupPageOptionsForAudience,
	resolveMainPopupPageId,
} from "@/lib/bambi/main-popup-pages";

const customBoard = {
	key: "new_board",
	label: "새 게시판",
	slug: "new-board",
};

describe("main popup pages", () => {
	it("adds an admin-created board to popup page options", () => {
		expect(
			popupPageOptionsForAudience("job_seeker", [customBoard]).find(
				(page) => page.id === "community_board:new_board"
			)?.label
		).toBe("새 게시판");
	});

	it("resolves an admin-created board route to its stable popup page id", () => {
		expect(resolveMainPopupPageId("/board/new-board", [customBoard])).toBe(
			"community_board:new_board"
		);
		expect(
			resolveMainPopupPageId("/seeker/community/new-board", [customBoard])
		).toBe("community_board:new_board");
	});
});
