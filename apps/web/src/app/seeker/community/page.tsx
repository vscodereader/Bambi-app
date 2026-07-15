import { RequireCommunityAccess } from "@/components/bambi/require-community-access";
import { CommunityHomeScreen } from "@/components/bambi/screens/community-home";
import { SEEKER_CONTENT_WIDTH } from "@/lib/bambi/layout";

// 수다방 홈 — 여성회원·광고 중 업소만 입장(게이트는 RequireCommunityAccess + 서버 가드).
export default function SeekerCommunityPage() {
	return (
		<RequireCommunityAccess>
			<div
				className={`mx-auto flex w-full max-w-full flex-1 flex-col px-5 py-6 md:px-6 ${SEEKER_CONTENT_WIDTH}`}
			>
				<CommunityHomeScreen />
			</div>
		</RequireCommunityAccess>
	);
}
