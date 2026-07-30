import type { ReactNode } from "react";
import { AccountStatusBanner } from "@/components/bambi/account-status-banner";
import { SeekerNav } from "@/components/bambi/persona-nav";
import { SeekerAppShell } from "@/components/bambi/seeker-app-shell";

// 구직자 영역의 앱 셸(헤더+하단 탭+계정 상태 배너) 조합. 회원은 layout이, 게스트는
// /seeker page가 각각 이 셸을 씌우기 때문에(게스트는 셸 없는 게이트 화면으로 갈 수도
// 있어 layout에서 일괄 처리할 수 없다) 두 곳이 같은 조합을 쓰도록 여기로 뺐다.
export function SeekerShell({ children }: { children: ReactNode }) {
	return (
		<SeekerAppShell>
			<SeekerNav>
				<AccountStatusBanner />
				{children}
			</SeekerNav>
		</SeekerAppShell>
	);
}
