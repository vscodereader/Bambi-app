import { Suspense } from "react";
import { SeekerAuthGateScreen } from "@/components/bambi/auth/seeker-auth-gate-screen";
import { GuestBlockedToast } from "@/components/bambi/guest-blocked-toast";
import { SeekerMarketplaceScreen } from "@/components/bambi/screens/seeker-marketplace";
import { SeekerShell } from "@/components/bambi/seeker-shell";
import { readVisitorState } from "@/lib/bambi/visitor";

export default async function SeekerHomePage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [{ auth }, visitor] = await Promise.all([
		searchParams,
		readVisitorState(),
	]);
	const isGuest = visitor === "guest";
	// 본인인증만 마친 게스트가 로그인·가입이 필요한 곳(내 정보·수다방·공고 상세)을 누르면
	// 게이트가 ?auth=…를 달아 여기로 돌려보낸다. 그때는 목록 위에 작은 다이얼로그를
	// 띄우지 않고 anon이 처음 보던 것과 같은 블러 게이트 화면을 보여준다 — 로그인 요구
	// 상황의 화면이 방문자 종류에 따라 갈리지 않도록.
	const showGate = isGuest && (auth === "login" || auth === "signup");
	const body = showGate ? (
		<SeekerAuthGateScreen />
	) : (
		<SeekerMarketplaceScreen />
	);

	return (
		<>
			{/* useSearchParams를 쓰므로 Suspense 경계가 필요하다. 게이트 화면으로 갈아탈 때도
			    "회원가입 후에 볼 수 있어요" 안내는 그대로 떠야 해서 분기 밖에 둔다. */}
			<Suspense>
				<GuestBlockedToast />
			</Suspense>
			{/* 게이트 화면은 푸터까지 포함한 전체 화면이라 셸을 씌우지 않는다(anon과 동일).
			    목록을 보여줄 때만, 게스트에게는 layout이 생략한 셸을 여기서 씌운다.
			    회원은 layout이 이미 씌웠으므로 그대로 둔다. */}
			{isGuest && !showGate ? <SeekerShell>{body}</SeekerShell> : body}
		</>
	);
}
