import { ModeratorMessagesPanel } from "@/components/bambi/moderator-messages-panel";

// 어드민 가드는 moderator/layout.tsx의 enforceModeratorAccess()가 담당한다 —
// 이 페이지는 발송·발송 이력 패널만 렌더한다.
export default function ModeratorMessagesPage() {
	return <ModeratorMessagesPanel />;
}
