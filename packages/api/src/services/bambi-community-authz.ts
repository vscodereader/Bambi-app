import { ORPCError } from "@orpc/server";

import type { GuestIdentity } from "../context";
import { hasActiveAdExposure } from "./bambi-advertiser";
import {
	type BambiAccessProfile,
	requireActiveBambiProfile,
	type SessionLike,
} from "./bambi-authz";
import { resolveCommunityAccess } from "./bambi-community-access";
import { verifyCommunityPassword } from "./bambi-community-password";

// 수다방 라우터 공용 가드. 클라이언트 게이트(RequireCommunityAccess)와 별개로 서버에서도
// 자격(여성 | 광고 중 업소 | 관리자)을 강제한다. isAdvertiser는 캐시 컬럼이 아니라
// 라이브 파생값(hasActiveAdExposure)을 쓴다 — 캐시 불신 원칙(onboarding.getMine과 동일).
// 판정 축은 PR #29에서 광고 캠페인 → 광고 상품 적용 공고로 바뀌었다(2026-07-16 스펙).
export const requireCommunityMember = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile> => {
	const profile = await requireActiveBambiProfile(session);
	const isAdvertiser =
		profile.role === "employer"
			? await hasActiveAdExposure({
					now: new Date(),
					userId: profile.userId,
				})
			: false;
	const access = resolveCommunityAccess({
		gender: profile.gender,
		isAdvertiser,
		role: profile.role,
		status: profile.status,
	});

	if (!access.canAccess) {
		throw new ORPCError("FORBIDDEN", {
			message: "여성회원과 광고 중인 업소회원만 이용가능합니다",
		});
	}

	return profile;
};

// 자격이 없어도 실패하지 않는 판정 — 홈 미리보기(overview)처럼 미자격자·비로그인에게도
// 요약을 보여주는 public 경로에서 쓴다. 자격 실패(ORPCError)만 null로 접고, DB 오류
// 같은 예기치 못한 실패는 그대로 던진다.
export const findCommunityMember = async (
	session: SessionLike | null | undefined
): Promise<BambiAccessProfile | null> => {
	try {
		return await requireCommunityMember(session);
	} catch (error) {
		if (error instanceof ORPCError) {
			return null;
		}
		throw error;
	}
};

// 수다방 쓰기 주체. 회원은 세션 프로필이고, 비회원은 본인인증(성인·성별)을 통과한 게스트
// 토큰의 gid다 — 계정이 없어 소유권은 글·댓글의 비밀번호 해시로만 증명한다.
export type CommunityActor =
	| { gender: "female"; gid: string; kind: "guest" }
	| { kind: "member"; profile: BambiAccessProfile };

interface CommunityActorContext {
	guest?: GuestIdentity | null;
	session?: SessionLike | null;
}

export const resolveCommunityActor = async (
	context: CommunityActorContext
): Promise<CommunityActor> => {
	// 세션이 있으면 회원 경로가 정본이다 — 로그인한 사람이 게스트 쿠키를 함께 들고 있어도
	// 회원 자격 판정(정지·성별·광고)을 게스트 신분으로 우회할 수 없다.
	if (context.session?.user?.id) {
		return {
			kind: "member",
			profile: await requireCommunityMember(context.session),
		};
	}

	// context.guest는 서명·만료 검증을 통과하고 gid까지 있는 토큰에만 값이 있다
	// (구 토큰은 null) — 여기서 걸리면 클라이언트가 재인증을 유도한다.
	if (!context.guest) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "본인인증 후 이용할 수 있습니다.",
		});
	}
	if (context.guest.gender !== "female") {
		throw new ORPCError("FORBIDDEN", {
			message: "여성회원과 광고 중인 업소회원만 이용가능합니다",
		});
	}

	return { gender: "female", gid: context.guest.gid, kind: "guest" };
};

// findCommunityMember와 같은 용도의 접기 — 공개 읽기 경로(listComments)가 회원/그 외를
// 가르는 데 쓴다. 자격 실패는 null이고 예기치 못한 실패는 그대로 던진다.
export const findCommunityActor = async (
	context: CommunityActorContext
): Promise<CommunityActor | null> => {
	try {
		return await resolveCommunityActor(context);
	} catch (error) {
		if (error instanceof ORPCError) {
			return null;
		}
		throw error;
	}
};

// 비회원이 글·댓글·추천을 남길 수 있는 게시판. 공개 읽기 보드(PUBLIC_COMMUNITY_BOARDS)보다
// 좁다 — 공지(notice)는 운영자 게시판이라 읽기만 열어 두고, 중고거래·베스트는 애초에
// 비로그인에게 닫혀 있다.
const GUEST_WRITABLE_BOARDS = new Set<string>(["free", "work_talk"]);
// 게시판 이름은 화면 라벨(COMMUNITY_BOARDS)과 같은 말을 쓴다 — work_talk의 라벨은
// "밤문화 이야기"다.
const GUEST_BOARD_ERROR =
	"비회원은 자유수다·밤문화 이야기에만 참여할 수 있어요.";
const GUEST_PASSWORD_ERROR =
	"비회원 글·댓글은 4자 이상의 비밀번호가 필요합니다.";
export const GUEST_LOCKED_ERROR = "비회원은 비밀글을 작성할 수 없어요.";
const PASSWORD_MISMATCH_ERROR = "비밀번호가 일치하지 않습니다.";

// 비회원이 참여할 수 있는 글인지. 게시판·잠금 두 축을 한 곳에서 본다 — 목록·상세에서
// 비로그인에게 보이지 않는 글에는 댓글·추천도 남길 수 없어야 한다.
export const assertGuestWritableBoard = (board: string): void => {
	if (!GUEST_WRITABLE_BOARDS.has(board)) {
		throw new ORPCError("BAD_REQUEST", { message: GUEST_BOARD_ERROR });
	}
};

export const assertGuestPostAccess = (post: {
	board: string;
	isLocked: boolean;
}): void => {
	assertGuestWritableBoard(post.board);
	if (post.isLocked) {
		throw new ORPCError("BAD_REQUEST", { message: GUEST_LOCKED_ERROR });
	}
};

// 비회원 글·댓글의 필수 비밀번호(잠금글과 같은 4자 이상). 회원과 달리 세션이 없어
// 이 값이 유일한 소유권 증명 수단이다.
export const requireGuestPassword = (password: string | undefined): string => {
	if (!password || password.length < 4) {
		throw new ORPCError("BAD_REQUEST", { message: GUEST_PASSWORD_ERROR });
	}
	return password;
};

// 비회원 소유권 증명 — gid가 아니라 비밀번호로만 판정한다(쿠키가 만료돼 gid가 바뀌어도
// 본인 글을 고치고 지울 수 있어야 한다). 회원 글은 author_guest_id가 null이라 대상이 아니다.
export const assertGuestOwnership = (
	row: { authorGuestId: string | null; passwordHash: string },
	password: string | undefined
): void => {
	if (
		!(
			row.authorGuestId &&
			password &&
			verifyCommunityPassword(password, row.passwordHash)
		)
	) {
		throw new ORPCError("FORBIDDEN", { message: PASSWORD_MISMATCH_ERROR });
	}
};
