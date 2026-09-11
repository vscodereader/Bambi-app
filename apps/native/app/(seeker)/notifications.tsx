import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";

// ponytail: 알림 목록·읽음 처리가 붙으면 StateCard를 실제 섹션으로 교체한다.
export default function SeekerNotificationsScreen() {
	return (
		<MemberOnly>
			<BambiScreen>
				<BambiHeader
					description="새 소식을 놓치지 않도록 알림 기능을 준비하고 있어요."
					title="알림"
				/>
				<StateCard
					description="알림 기능이 준비되면 이곳에서 소식을 확인하실 수 있어요."
					title="준비 중이에요"
				/>
			</BambiScreen>
		</MemberOnly>
	);
}
