import { ORPCError } from "@orpc/server";
import dotenv from "dotenv";
import { describe, expect, it } from "vitest";

// 게스트 분기는 DB를 타지 않지만(세션 없음 → 프로필 조회도 없음) 모듈 그래프가
// @bambi-app/db를 끌어오므로 env 검증만 통과시킨다. .env가 있으면 그 값이 이기고,
// 없는 환경(워크트리)에서는 연결하지 않는 플레이스홀더로 채운다.
dotenv.config({ path: "../../apps/server/.env" });
process.env.DATABASE_URL ||= "postgres://placeholder/community-authz";
process.env.BETTER_AUTH_SECRET ||= "community-authz-test-secret-32-chars-min";
process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
process.env.CORS_ORIGIN ||= "http://localhost:3001";

const {
	assertGuestOwnership,
	assertGuestPostAccess,
	assertAnonymousPostAllowed,
	assertLegalAdvisorBoardScope,
	assertLegalAdvisorRoleSwitch,
	canBypassLock,
	findCommunityActor,
	requireGuestPassword,
	resolveCommunityActor,
	resolveLockedForBoard,
} = await import("@/services/bambi-community-authz");
type AccessProfile = Parameters<typeof canBypassLock>[1];
const { hashCommunityPassword } = await import(
	"@/services/bambi-community-password"
);

// 던진 ORPCError의 코드만 뽑는다(통과하면 undefined) — 가드마다 try/catch를 쓰지 않으려고.
const codeOf = (run: () => void): string | undefined => {
	try {
		run();
	} catch (error) {
		return error instanceof ORPCError ? error.code : "not-orpc-error";
	}
	return;
};

describe("resolveCommunityActor — 비회원 분기", () => {
	it("세션도 게스트 토큰도 없으면 UNAUTHORIZED", async () => {
		await expect(resolveCommunityActor({})).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	it("남성 게스트는 FORBIDDEN, 성별 미상도 FORBIDDEN", async () => {
		await expect(
			resolveCommunityActor({ guest: { gender: "male", gid: "g-1" } })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		await expect(
			resolveCommunityActor({ guest: { gender: null, gid: "g-2" } })
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("여성 게스트는 gid를 가진 guest 액터가 된다", async () => {
		await expect(
			resolveCommunityActor({ guest: { gender: "female", gid: "g-3" } })
		).resolves.toEqual({ gender: "female", gid: "g-3", kind: "guest" });
	});

	it("findCommunityActor는 자격 실패를 null로 접는다", async () => {
		await expect(findCommunityActor({})).resolves.toBeNull();
		await expect(
			findCommunityActor({ guest: { gender: "male", gid: "g-4" } })
		).resolves.toBeNull();
	});
});

describe("비밀글 익명 작성 정책", () => {
	it("비회원도 secret 게시판에서는 강제 익명 작성을 통과한다", () => {
		expect(
			codeOf(() =>
				assertAnonymousPostAllowed({
					board: "secret",
					isAnonymous: true,
					role: "guest",
				})
			)
		).toBeUndefined();
	});

	it("일반 게시판의 비회원 익명 작성 제한은 유지한다", () => {
		expect(
			codeOf(() =>
				assertAnonymousPostAllowed({
					board: "free",
					isAnonymous: true,
					role: "guest",
				})
			)
		).toBe("FORBIDDEN");
	});
});

describe("비회원 쓰기 게이트", () => {
	it("잠금글에는 비회원이 댓글·추천을 남길 수 없다", () => {
		const post = (board: string, isLocked: boolean) => ({
			authorGuestId: "gid-1",
			board,
			isLocked,
		});
		expect(
			codeOf(() => assertGuestPostAccess(post("free", false), "gid-1"))
		).toBeUndefined();
		// 자기 글이어도 법률 자문 밖 보드의 잠금글은 그대로 막힌다.
		expect(
			codeOf(() => assertGuestPostAccess(post("free", true), "gid-1"))
		).toBe("BAD_REQUEST");
	});

	it("법률 자문 게시판은 강제 잠금이라 글쓴이 본인에게만 잠금 금지 가드가 풀린다", () => {
		const legalPost = {
			authorGuestId: "gid-1",
			board: "legal",
			isLocked: true,
		};
		expect(
			codeOf(() => assertGuestPostAccess(legalPost, "gid-1"))
		).toBeUndefined();
		// 남의 법률 상담글은 읽지도 못하므로 댓글·추천도 붙일 수 없다.
		expect(codeOf(() => assertGuestPostAccess(legalPost, "gid-2"))).toBe(
			"FORBIDDEN"
		);
	});

	it("비회원 글·댓글 비밀번호는 4자 이상 필수다", () => {
		expect(requireGuestPassword("1234")).toBe("1234");
		for (const password of [undefined, "", "123"]) {
			expect(codeOf(() => requireGuestPassword(password))).toBe("BAD_REQUEST");
		}
	});
});

describe("비회원 소유권 증명", () => {
	const guestRow = {
		authorGuestId: "g-1",
		passwordHash: hashCommunityPassword("secret-1"),
	};

	it("비밀번호가 맞으면 gid가 달라도 통과한다", () => {
		// 쿠키가 만료돼 gid가 새로 발급돼도 본인 글을 고치고 지울 수 있어야 한다.
		expect(
			codeOf(() => assertGuestOwnership(guestRow, "secret-1"))
		).toBeUndefined();
	});

	it("비밀번호가 틀리거나 없으면 FORBIDDEN", () => {
		for (const password of [undefined, "", "secret-2"]) {
			expect(codeOf(() => assertGuestOwnership(guestRow, password))).toBe(
				"FORBIDDEN"
			);
		}
	});

	it("회원 글은 비밀번호가 맞아도 비회원 소유권으로 열리지 않는다", () => {
		// 잠금글 회원 글은 passwordHash가 채워져 있다 — author_guest_id가 없으면
		// 그 비밀번호를 아는 사람도 비회원 경로로 수정·삭제할 수 없어야 한다.
		expect(
			codeOf(() =>
				assertGuestOwnership(
					{
						authorGuestId: null,
						passwordHash: hashCommunityPassword("locked-pw"),
					},
					"locked-pw"
				)
			)
		).toBe("FORBIDDEN");
	});

	it("비번 없는 행(빈 해시)은 어떤 비밀번호로도 열리지 않는다", () => {
		expect(
			codeOf(() =>
				assertGuestOwnership({ authorGuestId: "g-2", passwordHash: "" }, "")
			)
		).toBe("FORBIDDEN");
		expect(
			codeOf(() =>
				assertGuestOwnership({ authorGuestId: "g-2", passwordHash: "" }, "1234")
			)
		).toBe("FORBIDDEN");
	});
});

describe("무료 법률 자문 게시판", () => {
	it("legal 보드는 입력 토글과 무관하게 잠금이 강제된다", () => {
		expect(resolveLockedForBoard("legal", false)).toBe(true);
		expect(resolveLockedForBoard("legal", true)).toBe(true);
		// 다른 게시판은 입력한 토글 그대로다.
		expect(resolveLockedForBoard("work_talk", false)).toBe(false);
		expect(resolveLockedForBoard("work_talk", true)).toBe(true);
	});

	const profile = (
		role: string,
		userId = "u-advisor"
	): NonNullable<AccessProfile> =>
		({
			gender: "female",
			isPhoneVerified: true,
			role,
			status: "active",
			userId,
		}) as NonNullable<AccessProfile>;

	it("법률자문은 legal 잠금글만 비밀번호 없이 연다", () => {
		const legalPost = { authorUserId: "u-author", board: "legal" };
		const otherPost = { authorUserId: "u-author", board: "work_talk" };
		expect(canBypassLock(legalPost, profile("legal_advisor"))).toBe(true);
		// 다른 보드 잠금글은 일반 회원과 똑같이 비밀번호가 필요하다.
		expect(canBypassLock(otherPost, profile("legal_advisor"))).toBe(false);
	});

	it("작성자·운영자 우회와 비열람자 차단은 그대로다", () => {
		const legalPost = { authorUserId: "u-author", board: "legal" };
		expect(canBypassLock(legalPost, profile("job_seeker", "u-author"))).toBe(
			true
		);
		expect(canBypassLock(legalPost, profile("admin"))).toBe(true);
		expect(canBypassLock(legalPost, profile("job_seeker"))).toBe(false);
		// 비회원·비로그인(profile null)은 어떤 잠금글도 우회하지 못한다.
		expect(canBypassLock(legalPost, null)).toBe(false);
		// 비회원 글(author_user_id null)이 회원 null userId와 엮이지 않는지도 함께 본다.
		expect(canBypassLock({ authorUserId: null, board: "legal" }, null)).toBe(
			false
		);
	});
});

describe("법률자문 게시판 격리", () => {
	const profile = (role: string, gender = "female") =>
		({
			gender,
			isPhoneVerified: true,
			role,
			status: "active",
			userId: "u-1",
		}) as Parameters<typeof assertLegalAdvisorBoardScope>[0];

	it("legal_advisor는 legal 게시판만 통과한다", () => {
		expect(
			codeOf(() =>
				assertLegalAdvisorBoardScope(profile("legal_advisor"), "legal")
			)
		).toBeUndefined();
		for (const board of ["free", "work_talk", "market", "notice", "best"]) {
			expect(
				codeOf(() =>
					assertLegalAdvisorBoardScope(profile("legal_advisor"), board)
				)
			).toBe("FORBIDDEN");
		}
	});

	it("여성 legal_advisor도 예외 없다 — 역할이 성별 자격보다 우선", () => {
		expect(
			codeOf(() =>
				assertLegalAdvisorBoardScope(profile("legal_advisor", "female"), "free")
			)
		).toBe("FORBIDDEN");
	});

	it("남성 legal_advisor는 공지와 법률 게시판만 통과한다", () => {
		for (const board of ["notice", "legal"]) {
			expect(
				codeOf(() =>
					assertLegalAdvisorBoardScope(profile("legal_advisor", "male"), board)
				)
			).toBeUndefined();
		}
		expect(
			codeOf(() =>
				assertLegalAdvisorBoardScope(profile("legal_advisor", "male"), "free")
			)
		).toBe("FORBIDDEN");
	});

	it("남성 구직자는 공지사항만 통과한다", () => {
		expect(
			codeOf(() =>
				assertLegalAdvisorBoardScope(profile("job_seeker", "male"), "notice")
			)
		).toBeUndefined();
		expect(
			codeOf(() =>
				assertLegalAdvisorBoardScope(profile("job_seeker", "male"), "legal")
			)
		).toBe("FORBIDDEN");
	});

	it("다른 역할·게스트(null)에는 발동하지 않는다", () => {
		for (const role of ["job_seeker", "employer", "admin"]) {
			for (const board of [
				"free",
				"work_talk",
				"market",
				"notice",
				"best",
				"legal",
			]) {
				expect(
					codeOf(() => assertLegalAdvisorBoardScope(profile(role), board))
				).toBeUndefined();
			}
		}
		expect(
			codeOf(() => assertLegalAdvisorBoardScope(null, "free"))
		).toBeUndefined();
	});
});

describe("법률자문 역할 전환 축", () => {
	it("구직자 ↔ 법률자문만 오갈 수 있다", () => {
		expect(
			codeOf(() => assertLegalAdvisorRoleSwitch("job_seeker", "legal_advisor"))
		).toBeUndefined();
		expect(
			codeOf(() => assertLegalAdvisorRoleSwitch("legal_advisor", "job_seeker"))
		).toBeUndefined();
	});

	it("업소·운영자·비회원 계정은 전환할 수 없다", () => {
		for (const role of ["employer", "admin", "guest"]) {
			expect(
				codeOf(() => assertLegalAdvisorRoleSwitch(role, "legal_advisor"))
			).toBe("BAD_REQUEST");
			expect(
				codeOf(() => assertLegalAdvisorRoleSwitch("legal_advisor", role))
			).toBe("BAD_REQUEST");
		}
	});
});
