import { redirect } from "next/navigation";
import { client } from "@/utils/orpc";
import { type BambiRole, homePathForRole } from "./home-path";

type Routing = Awaited<ReturnType<typeof client.bambi.onboarding.getMyRouting>>;

// 세션에서 역할·승인상태를 읽는다. 세션이 없거나(getMyRouting 실패) 프로필이 없으면(role null)
// 게이트(/welcome)로 돌려보낸다. 성공 시 role은 반드시 non-null.
async function getRouting(): Promise<{
	role: BambiRole;
	employerApprovalStatus: Routing["employerApprovalStatus"];
}> {
	let routing: Routing;
	try {
		routing = await client.bambi.onboarding.getMyRouting();
	} catch {
		redirect("/welcome");
	}
	if (routing.role === null) {
		redirect("/welcome");
	}
	return {
		role: routing.role,
		employerApprovalStatus: routing.employerApprovalStatus,
	};
}

// 루트("/") 진입 시 역할별 홈으로 보낸다.
export async function redirectToRoleHome(): Promise<void> {
	const routing = await getRouting();
	redirect(homePathForRole(routing.role));
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
