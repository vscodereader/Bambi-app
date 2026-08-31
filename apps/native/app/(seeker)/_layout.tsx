import { Stack } from "expo-router";

import { SeekerStackHeader } from "@/src/components/seeker-header";

// 탭 4개는 (tabs) 그룹이 관리하고, 여기는 탭바 없이 풀스크린으로 떠야 하는 상세만 남긴다
// (웹 SeekerNav와 같은 규칙 — 채팅방은 카카오톡식 풀스크린이라 탭바를 숨긴다).
// 헤더는 네이티브 기본 대신 커스텀(SeekerStackHeader) — 기본 헤더가 edge-to-edge에서 상단
// 밴드를 과하게 잡아서다(컴포넌트 주석 참조). headerShown: false 화면에는 영향 없다.
export default function SeekerLayout() {
	return (
		<Stack
			screenOptions={{
				header: (props) => <SeekerStackHeader {...props} />,
			}}
		>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			{/* 검색은 자체 상단(뒤로가기+검색창)을 그리므로 기본 헤더를 끈다. 모달이 아닌 카드로
			    띄운다 — 모달 위에서 같은 Stack의 jobs/[id]를 push하면 상세가 모달 뒤에 깔려
			    이동이 보이지 않는다(웹 다이얼로그와 달리 native 모달은 push를 가리지 않는다).
			    카드면 결과 탭 시 상세가 정상적으로 위로 push되고, 상세에서 뒤로 가면 검색어가
			    남은 결과 화면으로 돌아온다. */}
			<Stack.Screen name="search" options={{ headerShown: false }} />
			<Stack.Screen name="point-shop" options={{ title: "포인트몰" }} />
			<Stack.Screen name="notifications" options={{ title: "알림" }} />
			<Stack.Screen name="jobs/[id]" options={{ title: "공고 상세" }} />
			{/* 수집 공고는 job_post에 없어 jobs/[id](jobs.getById)로는 NOT_FOUND다. 웹
			    /seeker/jobs/crawled/[id]와 같이 crawledJobs.getById를 쓰는 전용 상세로 보낸다. */}
			<Stack.Screen name="jobs/crawled/[id]" options={{ title: "공고 상세" }} />
			<Stack.Screen name="chats/[id]" options={{ title: "채팅방" }} />
			<Stack.Screen
				name="chats/[id]/reveal"
				options={{ title: "연락처 공개" }}
			/>
		</Stack>
	);
}
