import { EmptyState } from "@/components/bambi/empty-state";

// 수다방 — 커뮤니티 자리(네비게이션 배선용 placeholder). 게시판 UI·백엔드는 후속 작업.
export default function SeekerCommunityPage() {
	return (
		<div className="mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:max-w-[min(80%,72rem)] md:px-6">
			<EmptyState
				className="flex-1"
				description="구직자와 구인자가 함께 이야기하는 커뮤니티를 준비하고 있어요."
				title="수다방 준비 중"
			/>
		</div>
	);
}
