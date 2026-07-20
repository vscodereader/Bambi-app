import type { ReactNode } from "react";
import { enforceJobSeekerAccess } from "@/lib/bambi/require-role";

// 채팅 프리플라이트(/seeker/jobs/[id]/chat)는 구직자 전용이다. 구인자·운영자는 공고 상세
// (/seeker/jobs/[id])까지만 열람하고 그 뒤로는 들어올 수 없다.
//
// 페이지가 클라이언트 컴포넌트라 페이지 안에서는 세션·역할을 렌더 후에야 알 수 있어,
// 화면이 한 번 그려진 뒤 튕기게 된다. 서버 레이아웃에서 막으면 렌더 전에 리다이렉트된다 —
// employer·moderator 영역도 같은 방식(레이아웃 async 가드)이라 형태를 맞췄다.
export default async function SeekerJobChatLayout({
	children,
}: {
	children: ReactNode;
}) {
	await enforceJobSeekerAccess();

	return <>{children}</>;
}
