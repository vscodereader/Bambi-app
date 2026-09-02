import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";

// UI 단계 자리 표시 화면. ponytail: 수다방 기능이 붙으면 이 화면을 통째로 교체한다.
// 수다방은 여성 인증 게스트도 입장 가능하므로 allowCommunityGuest로 연다.
export default function SeekerCommunityScreen() {
	return (
		<MemberOnly allowCommunityGuest>
			<BambiScreen>
				<BambiHeader
					description="구직자들과 이야기를 나누는 공간입니다."
					title="수다방"
				/>
				<StateCard
					description="수다방을 준비하고 있어요. 조금만 기다려 주세요."
					title="준비 중이에요"
				/>
			</BambiScreen>
		</MemberOnly>
	);
}
