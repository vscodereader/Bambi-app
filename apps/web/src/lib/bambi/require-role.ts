import { redirect } from "next/navigation";
import { client } from "@/utils/orpc";
import { type BambiRole, homePathForRole } from "./home-path";
import {
	defaultManualKeyForRole,
	type ManualKey,
	manualKeysForRole,
	manualPath,
} from "./manual";

type Routing = Awaited<ReturnType<typeof client.bambi.onboarding.getMyRouting>>;

// 세션에서 역할·승인상태를 읽는다. 세션이 없거나(getMyRouting 실패) 프로필이 없으면(role null)
// /seeker 위의 인증 오버레이(?auth=login)로 돌려보낸다. 성공 시 role은 반드시 non-null.
async function getRouting(): Promise<{
	role: BambiRole;
	employerApprovalStatus: Routing["employerApprovalStatus"];
}> {
	let routing: Routing;
	try {
		routing = await client.bambi.onboarding.getMyRouting();
	} catch {
		redirect("/seeker?auth=login");
	}
	// guest는 비회원 글·댓글의 작성자 표시용 role이라 회원 영역의 홈이 없다 — 프로필
	// 부재와 같이 취급해 인증 화면으로 돌려보낸다(BambiRole은 회원 역할로 유지).
	if (routing.role === null || routing.role === "guest") {
		redirect("/seeker?auth=login");
	}
	return {
		role: routing.role,
		employerApprovalStatus: routing.employerApprovalStatus,
	};
}

// 루트("/") 진입 시 역할과 무관하게 구직자 홈으로 보낸다. 구인자·운영자는
// 헤더/탭바의 역할 전환 버튼으로 각자 영역(/employer·/moderator)에 진입한다.
// getRouting()으로 세션·프로필은 여전히 검증한다(없으면 /seeker?auth=login).
export async function redirectToRoleHome(): Promise<void> {
	await getRouting();
	redirect("/seeker");
}

// 구직자 전용 영역: 구직자가 아니면 각자 홈으로. 구인자·운영자도 공고 상세까지는 보지만
// 그 뒤 채팅 흐름은 구직자 것이라 여기서 막는다.
// 인증 오버레이로 보내지 않는 게 핵심이다 — 세션·프로필이 없는 상태와 역할이 다른 상태는
// 다른 상황인데, /seeker?auth=login으로 보내면 로그인한 구인자에게 "가입하라"는 화면이 떠
// 로그아웃된 것처럼 보인다. 세션·프로필 부재는 getRouting이 이미 그쪽으로 처리한다.
export async function enforceJobSeekerAccess(): Promise<void> {
	const routing = await getRouting();
	if (routing.role !== "job_seeker") {
		redirect(homePathForRole(routing.role));
	}
}

// 운영자 영역: 관리자가 아니면 각자 홈으로. 관리자면 통과.
export async function enforceModeratorAccess(): Promise<void> {
	const routing = await getRouting();
	if (routing.role !== "admin") {
		redirect(homePathForRole(routing.role));
	}
}

// 구인자 영역: 구인자가 아니면 각자 홈으로. 구인자면 승인 상태를 돌려준다(리다이렉트 없음).
// 미승인이어도 화면은 렌더하고, 조작 요소만 approval 상태로 disabled 처리한다.
export async function resolveEmployerAccess(): Promise<{
	approvalStatus: Routing["employerApprovalStatus"];
}> {
	const routing = await getRouting();
	if (routing.role !== "employer") {
		redirect(homePathForRole(routing.role));
	}
	return { approvalStatus: routing.employerApprovalStatus };
}

// /manual 인덱스: 자기 역할의 기본 매뉴얼로 보낸다.
export async function redirectToDefaultManual(): Promise<void> {
	const routing = await getRouting();
	redirect(manualPath(defaultManualKeyForRole(routing.role)));
}

// 매뉴얼 열람 가드: 위계 밖 매뉴얼(예: 구직자가 /manual/moderator)이면 자기 기본
// 매뉴얼로 되돌린다. 인증 오버레이로 보내지 않는 이유는 위 enforceJobSeekerAccess
// 주석과 같다. 통과 시 role을 돌려준다 — 전환 탭 구성에 필요하다.
export async function enforceManualAccess(
	key: ManualKey
): Promise<{ role: BambiRole }> {
	const routing = await getRouting();
	if (!manualKeysForRole(routing.role).includes(key)) {
		redirect(manualPath(defaultManualKeyForRole(routing.role)));
	}
	return { role: routing.role };
}
