import { EmptyState } from "@/components/bambi/empty-state";
import { RequireCommunityAccess } from "@/components/bambi/require-community-access";

// 수다방 — 여성회원·광고 중 업소만 입장. 게시판 UI·백엔드는 후속 작업.
// 비로그인은 RequireAuth가, 미자격자는 안내 화면이 막는다.
export default function SeekerCommunityPage() {
	return (
		<RequireCommunityAccess>
			<div className="mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:max-w-[min(80%,72rem)] md:px-6">
				<EmptyState
					className="flex-1"
					description="구직자와 구인자가 함께 이야기하는 커뮤니티를 준비하고 있어요."
					title="수다방 준비 중"
				/>
			</div>
		</RequireCommunityAccess>
	);
}
