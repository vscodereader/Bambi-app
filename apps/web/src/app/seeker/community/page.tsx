import { EmptyState } from "@/components/bambi/empty-state";
import { RequireAuth } from "@/components/bambi/require-auth";

// 수다방 — 커뮤니티 자리(네비게이션 배선용 placeholder). 게시판 UI·백엔드는 후속 작업.
// 로그인 사용자 전용: 비로그인 진입 시 RequireAuth가 /login으로 리다이렉트한다.
export default function SeekerCommunityPage() {
	return (
		<RequireAuth>
			<div className="mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:max-w-[min(80%,72rem)] md:px-6">
				<EmptyState
					className="flex-1"
					description="구직자와 구인자가 함께 이야기하는 커뮤니티를 준비하고 있어요."
					title="수다방 준비 중"
				/>
			</div>
		</RequireAuth>
	);
}
