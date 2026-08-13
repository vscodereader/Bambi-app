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
			message: "일반 여성회원과 광고 중인 업소회원만 이용가능합니다",
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
			message: "일반 여성회원과 광고 중인 업소회원만 이용가능합니다",
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

// 무료 법률 자문 게시판. 전 글이 강제 잠금이라 잠금 관련 가드가 여기서만 갈린다.
export const LEGAL_BOARD = "legal";
// 그 게시판의 잠금글을 열람·답변하는 계정 역할(운영자가 지정·해제).
export const LEGAL_ADVISOR_ROLE = "legal_advisor";

const LEGAL_ADVISOR_BOARD_ERROR =
	"법률자문 계정은 무료 법률 자문 게시판만 이용할 수 있어요.";

// 법률자문 계정은 legal 게시판에 격리한다 — 역할이 성별 자격보다 우선이라 여성
// 법률자문이라도 예외 없이 다른 게시판(가상 best 포함)은 읽기·쓰기 모두 FORBIDDEN이다.
// 다른 역할·게스트(profile null)에는 발동하지 않는다. 라우터의 읽기·쓰기 경로가
// 이 함수 하나를 지나므로 격리 범위가 바뀌면 여기만 고친다.
export const assertLegalAdvisorBoardScope = (
	profile: Pick<BambiAccessProfile, "role"> | null,
	board: string
): void => {
	if (profile?.role === LEGAL_ADVISOR_ROLE && board !== LEGAL_BOARD) {
		throw new ORPCError("FORBIDDEN", { message: LEGAL_ADVISOR_BOARD_ERROR });
	}
};

// 비회원이 글·댓글·추천을 남길 수 있는 게시판. 공개 읽기 보드(PUBLIC_COMMUNITY_BOARDS)보다
// 좁다 — 공지(notice)는 운영자 게시판이라 읽기만 열어 두고, 중고거래·베스트는 애초에
// 비로그인에게 닫혀 있다.
// 게시판 이름은 화면 라벨(COMMUNITY_BOARDS)과 같은 말을 쓴다 — work_talk의 라벨은
// "밤문화 이야기"다.
const GUEST_PASSWORD_ERROR =
	"비회원 글·댓글은 4자 이상의 비밀번호가 필요합니다.";
export const GUEST_LOCKED_ERROR = "비회원은 비밀글을 작성할 수 없어요.";
const GUEST_LOCKED_FOREIGN_ERROR =
	"비밀글에는 글쓴이 본인만 댓글·추천을 남길 수 있어요.";
const PASSWORD_MISMATCH_ERROR = "비밀번호가 일치하지 않습니다.";

// 비회원이 참여할 수 있는 글인지. 게시판·잠금 두 축을 한 곳에서 본다 — 목록·상세에서
// 비로그인에게 보이지 않는 글에는 댓글·추천도 남길 수 없어야 한다.
// 법률 자문 글은 회원·비회원 가릴 것 없이 잠금이 강제다(작성도 수정도) — 입력 토글이
// 무엇이든 서버가 true로 굳힌다. 잠금이 강제되면 기존 잠금 규칙(4자 이상 비밀번호)이
// 그대로 따라와 비밀번호도 필수가 되고, 수정에서도 잠금을 풀 수 없다.
export const resolveLockedForBoard = (
	board: string,
	isLocked: boolean
): boolean => board === LEGAL_BOARD || isLocked;

// 잠금 금지 가드는 법률 자문 게시판에서만 예외다 — 그 보드는 전 글이 강제 잠금이라
// "비회원은 비밀글에 닿을 수 없다"는 전제 자체가 성립하지 않는다(비회원도 자기 비밀번호로
// 자기 글을 열람·수정한다).
// 다만 그 예외는 **자기 글**에만 준다. 회원은 잠금글에 손대려면 비밀번호를 통과해야
// 하는데(requirePostReadAccess), 비회원 경로의 password는 자기 댓글의 소유권 증명이라
// 잠금 열쇠 노릇을 못 한다 — gid로 작성자 본인인지를 대신 본다. 이게 없으면 아무 인증
// 게스트나 읽지도 못하는 남의 법률 상담글에 댓글·추천을 붙일 수 있다.
export const assertGuestPostAccess = (
	post: { authorGuestId: string | null; board: string; isLocked: boolean },
	gid: string
): void => {
	if (!post.isLocked) {
		return;
	}
	if (post.board !== LEGAL_BOARD) {
		throw new ORPCError("BAD_REQUEST", { message: GUEST_LOCKED_ERROR });
	}
	if (post.authorGuestId !== gid) {
		throw new ORPCError("FORBIDDEN", { message: GUEST_LOCKED_FOREIGN_ERROR });
	}
};

// 잠금글을 비밀번호 없이 열 수 있는 사람. profile null은 미자격·비로그인 열람(overview
// public 경로·게스트) — 잠금 우회 없음. authorUserId null은 비회원 글이라 어떤 회원도
// 작성자로 잡히지 않는다. 법률자문은 자기 담당 보드(legal)의 잠금글만 연다 — 다른 보드의
// 비밀글은 일반 회원과 똑같이 비밀번호가 필요하다.
// 상세(getPost)·댓글(listComments)·목록 마스킹(maskLockedSummaries)이 모두 이 함수 하나를
// 지나므로, 열람 축이 늘어나도 여기만 고치면 세 경로가 함께 움직인다.
export const canBypassLock = (
	post: { authorUserId: string | null; board: string },
	profile: BambiAccessProfile | null
): boolean =>
	profile !== null &&
	(post.authorUserId === profile.userId ||
		profile.role === "admin" ||
		(profile.role === "legal_advisor" && post.board === LEGAL_BOARD));

// 법률 자문 계정 지정·해제의 허용 축. 구직자 ↔ 법률자문만 오간다 — 업소회원은 조직·팀·
// 공고가 계정에 묶여 있어 역할만 바꾸면 그 데이터가 주인 없이 남고, 운영자 계정은
// 이 경로로 권한이 내려가면 안 된다.
const ROLE_SWITCHABLE = new Set<string>(["job_seeker", LEGAL_ADVISOR_ROLE]);
const ROLE_SWITCH_ERROR =
	"법률자문 지정·해제는 구직자 계정에만 할 수 있어요(업소·운영자 계정은 전환할 수 없습니다).";

export const assertLegalAdvisorRoleSwitch = (
	currentRole: string,
	nextRole: string
): void => {
	if (!(ROLE_SWITCHABLE.has(currentRole) && ROLE_SWITCHABLE.has(nextRole))) {
		throw new ORPCError("BAD_REQUEST", { message: ROLE_SWITCH_ERROR });
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
