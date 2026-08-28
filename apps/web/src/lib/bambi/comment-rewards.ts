import { toast } from "sonner";

// 댓글 작성 응답의 랜덤 보너스·마일스톤을 토스트로 알린다. 게스트·미당첨은 0/[]이라 조용하다.
// 두 상세 화면(공개·seeker)이 같은 문구를 쓰도록 한 곳에 모은다.
export function toastCommentRewards(reward: {
	bonusPoints: number;
	milestones: Array<{ bonusPoints: number; commentCount: number }>;
}): void {
	if (reward.bonusPoints > 0) {
		toast(`🎉 랜덤 보너스 +${reward.bonusPoints.toLocaleString("ko-KR")}P!`);
	}
	for (const milestone of reward.milestones) {
		// 상한에 완전히 막혀 실반영 0인 마일스톤은 표시하지 않는다(지급 목록엔 남는다).
		if (milestone.bonusPoints <= 0) {
			continue;
		}
		toast(
			`🏆 전체 ${milestone.commentCount.toLocaleString("ko-KR")}번째 댓글 달성! 보너스 +${milestone.bonusPoints.toLocaleString("ko-KR")}P`
		);
	}
}
