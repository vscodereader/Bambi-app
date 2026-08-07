import { describe, expect, it } from "vitest";

import {
	MODERATOR_MORE_GROUPS,
	MODERATOR_NAV_ITEMS,
} from "./moderator-navigation";

const flattenDesktopHrefs = () =>
	MODERATOR_NAV_ITEMS.flatMap((entry) =>
		"items" in entry ? entry.items.map((item) => item.href) : [entry.href]
	);

describe("운영자 모바일 더보기 메뉴", () => {
	it("데스크톱의 모든 목적지를 빠짐없이 제공한다", () => {
		const mobileHrefs = MODERATOR_MORE_GROUPS.flatMap((group) =>
			group.items.map((item) => item.href)
		);

		expect(mobileHrefs).toEqual(
			flattenDesktopHrefs().filter((href) => href !== "/moderator")
		);
		expect(mobileHrefs).toContain("/moderator/chats");
		expect(mobileHrefs).toContain("/moderator/interviews");
		expect(mobileHrefs).toContain("/moderator/reviews");
	});
});
