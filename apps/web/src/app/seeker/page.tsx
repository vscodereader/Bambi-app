import type { Metadata } from "next";
import { Suspense } from "react";
import { SeekerAuthGateScreen } from "@/components/bambi/auth/seeker-auth-gate-screen";
import { GuestBlockedToast } from "@/components/bambi/guest-blocked-toast";
import { SeekerMarketplaceScreen } from "@/components/bambi/screens/seeker-marketplace";
import { SeekerShell } from "@/components/bambi/seeker-shell";
import {
	mergeSeoKeywords,
	SITE_KEYWORDS,
	siteOpenGraph,
} from "@/lib/bambi/seo";
import { readVisitorState } from "@/lib/bambi/visitor";

// /seeker는 사이트맵 1순위 정적 경로다. title은 루트 SITE_TITLE과 구분자만 다른 사실상
// 중복이지만 사용자 확정 문구라 그대로 두고, description으로 차별화한다 — 실중복 노출은
// 없다: 루트 `/`는 redirect()로 /seeker에 보내져 색인·SERP에 뜨는 건 이 경로뿐이다.
// anon 방문자에겐 layout이 children을 버리고 게이트를 그리지만, 이 export는 렌더 분기와
// 무관하게 라우트에 그대로 적용된다.
const SEEKER_TITLE = "밤비알바 - 퀸알바·여우알바·밤알바·유흥알바 구인구직";
const SEEKER_DESCRIPTION =
	"밤비알바 채용정보에서 퀸알바·여우알바·밤알바 관련 유흥알바·룸알바 공고를 지역·업종별로 살펴보세요. 회원가입 후 전체 공고 열람과 구인자와 1:1 채팅 문의가 가능합니다.";

export const metadata: Metadata = {
	title: SEEKER_TITLE,
	description: SEEKER_DESCRIPTION,
	keywords: mergeSeoKeywords(SITE_KEYWORDS, ["밤비알바 채용정보"]),
	alternates: { canonical: "/seeker" },
	openGraph: siteOpenGraph({
		title: SEEKER_TITLE,
		description: SEEKER_DESCRIPTION,
		url: "/seeker",
	}),
};

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
