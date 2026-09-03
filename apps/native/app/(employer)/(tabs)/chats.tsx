import { BambiScreen, StateCard } from "@/src/components/bambi-screen";

// 업체 채팅은 후속 범위다(spec 7절). 탭 자리는 유지하되 준비 중 안내만 둔다.
export default function EmployerChatsScreen() {
	return (
		<BambiScreen>
			<StateCard
				description="지원자와의 1:1 채팅은 곧 앱에서도 지원할 예정이에요. 지금은 웹에서 이용해 주세요."
				title="채팅 기능을 준비하고 있어요"
			/>
		</BambiScreen>
	);
}
