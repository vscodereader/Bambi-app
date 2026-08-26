import type { ReactNode } from "react";
import { SeekerShell } from "@/components/bambi/seeker-shell";
import { readVisitorState } from "@/lib/bambi/visitor";
import { CommunityRails } from "./community-rails";

// 수다방 영역 레이아웃. 본문(게이트·사이드 배너)은 CommunityRails가 그리고, 여기서는
// 게스트에게 앱 셸을 씌우는 일만 한다: /seeker/layout.tsx는 게스트에게 셸을 생략하고
// (게스트가 셸 없는 인증 게이트 화면으로 갈 수도 있어 layout에서 일괄 처리할 수 없다)
// page에 넘기는데, 수다방은 여성 인증 게스트도 들어오는 유일한 하위 영역이라 회원과
// 같은 헤더·하단 탭이 필요하다. 회원은 상위 layout이 이미 씌웠으므로 그대로 둔다.
export default async function SeekerCommunityLayout({
	children,
}: {
	children: ReactNode;
}) {
	const visitor = await readVisitorState();
	const body = <CommunityRails>{children}</CommunityRails>;

	return visitor === "member" ? body : <SeekerShell>{body}</SeekerShell>;
}
