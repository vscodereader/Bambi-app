import { View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	StateCard,
} from "@/src/components/bambi-screen";
import { LogoutButton } from "@/src/components/logout-button";

// UI 단계 자리 표시 화면. 탐색 헤더에 있던 로그아웃의 새 자리이기도 하다.
// ponytail: 프로필·활동 내역이 붙으면 StateCard를 실제 섹션으로 교체한다.
export default function SeekerMeScreen() {
	return (
		<BambiScreen>
			<BambiHeader description="내 계정과 활동을 관리합니다." title="내 정보" />
			<StateCard
				description="프로필과 활동 내역 화면을 준비하고 있어요."
				title="준비 중이에요"
			/>
			<View className="items-start">
				<LogoutButton />
			</View>
		</BambiScreen>
	);
}
