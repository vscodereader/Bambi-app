import { describe, expect, it } from "vitest";

import { getChatCounterpartUserId, getChatListCopy } from "./chat-audience";

describe("getChatListCopy", () => {
	it("구직자는 공고 탐색으로 보낸다", () => {
		const copy = getChatListCopy("seeker");
		expect(copy.description).toBe("지원한 공고의 대화를 확인합니다.");
		expect(copy.emptyCtaHref).toBe("/(seeker)");
		expect(copy.roomPathname).toBe("/(seeker)/chats/[id]");
	});

	it("구인자는 공고 관리로 보낸다", () => {
		const copy = getChatListCopy("employer");
		expect(copy.description).toBe("지원자와 나눈 대화를 확인합니다.");
		expect(copy.emptyCtaHref).toBe("/(employer)");
		expect(copy.roomPathname).toBe("/(employer)/chats/[id]");
	});
});

describe("getChatCounterpartUserId", () => {
	const room = { employerUserId: "employer1", jobSeekerUserId: "seeker1" };

	it("구직자가 보면 고용주가 상대다", () => {
		expect(
			getChatCounterpartUserId({ ...room, currentUserId: "seeker1" })
		).toBe("employer1");
	});

	// 구인자 화면이 붙기 전에는 고용주 id가 하드코딩돼 있어 자기 자신을 차단하려 들었다.
	it("구인자가 보면 구직자가 상대다", () => {
		expect(
			getChatCounterpartUserId({ ...room, currentUserId: "employer1" })
		).toBe("seeker1");
	});
});
