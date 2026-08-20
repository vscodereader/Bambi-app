// 비로그인(anon) 방문자가 /seeker에서 만나는 화면. 오버레이는 Dialog가 아니라
// 배경 위 절대배치 카드다 — 닫을 수 없는 화면이라 포커스 트랩·backdrop이 필요 없고,
// 덕분에 푸터가 블러 밖에서 선명하고 클릭 가능한 상태로 남는다.

import Link from "next/link";
import { Suspense } from "react";
import { toMarketplaceJob } from "@/lib/bambi/api-job-mapper";
import { maskJobsForBackdrop } from "@/lib/bambi/auth-backdrop";
import { client } from "@/utils/orpc";
import { SiteFooter } from "../site-footer";
import { AuthBackdrop } from "./auth-backdrop";
import { AuthPanel } from "./auth-panel";

const BACKDROP_JOB_LIMIT = 12;

// 실제 공고를 받아 개수·레이아웃은 진짜처럼 두되, 문자열은 직렬화 전에 전부
// 마스킹한다. 클라이언트로 넘어가는 값은 이 함수의 반환값(BackdropJob[])뿐이라
// 원본 업소명·공고 제목은 RSC 페이로드에 실리지 않는다. 조회에 실패해도 화면은
// 떠야 하므로 빈 배열로 폴백한다.
const loadBackdropJobs = async () => {
	try {
		const result = await client.bambi.jobs.list({ limit: BACKDROP_JOB_LIMIT });
		const jobs = [
			...result.sections.special,
			...result.sections.urgent,
			...result.sections.recommended,
			...result.sections.organic,
		]
			.slice(0, BACKDROP_JOB_LIMIT)
			.map(toMarketplaceJob);
		return maskJobsForBackdrop(jobs);
	} catch {
		return [];
	}
};

export async function SeekerAuthGateScreen() {
	const backdropJobs = await loadBackdropJobs();

	return (
		<div className="flex min-h-dvh flex-col bg-secondary">
			{/* 회원용 마켓 화면(seeker-marketplace)에는 sr-only h1이 있으나 anon 게이트
			    경로에는 없어, 크롤러가 이 화면에서 페이지 제목을 못 읽는다. 문구는 마켓
			    화면과 동일하게 맞춰 두 경로가 같은 페이지임을 드러낸다. */}
			<h1 className="sr-only">밤비알바 채용정보</h1>
			{/* 헤더가 없는 전체 화면이라 본문에 뷰포트 최소 높이를 줘, 형제 푸터가 첫
			    화면 아래로 밀린다. */}
			<div className="relative flex min-h-dvh flex-1 flex-col">
				<AuthBackdrop jobs={backdropJobs} />
				{/* md 미만에서는 문서 흐름에 두어 페이지가 정상 스크롤되고, md 이상에서만
				    블러 배경 위에 겹쳐 띄운다. 스크림은 배경을 한 겹 눌러 카드 대비를
				    확보하되, 뒤의 화면이 무엇인지는 알아볼 수 있는 정도로만 덮는다.
				    흐름에 있는 동안에는 flex-1로 부모(min-h-dvh)를 채워 카드가 첫 화면
				    한가운데에 온다 — min-h-full은 부모 높이가 min-height뿐이라 0으로
				    풀려 카드가 상단에 붙었다. 카드가 화면보다 길면 이 층이 내용만큼
				    늘어나 페이지가 그대로 스크롤된다.
				    겹쳐 띄운 층은 화면에서 잘라낸 고정 높이라, 카드가 그보다 길면(가입 폼
				    1열) 넘친 부분이 아래 푸터를 덮는다 — overflow-y-auto로 그 층 안에서
				    스크롤되게 해 푸터를 침범하지 않게 한다(카드의 my-auto가 짝이다). */}
				<div className="flex flex-1 items-center justify-center p-4 md:absolute md:inset-0 md:overflow-y-auto md:bg-background/60 md:p-6">
					{/* AuthPanel이 useSearchParams를 쓰므로 Suspense가 필요하다. */}
					<Suspense>
						<AuthPanel />
					</Suspense>
				</div>
			</div>
			{/* 게이트는 공고 텍스트가 전부 마스킹돼 실질 본문이 푸터뿐이다. 크롤러와
			    사용자 모두에게 보이는 최소 소개 + 공개 랜딩(/jobs)으로 빠지는 본문 링크를
			    푸터 위에 둔다 — md 이상에선 위 카드층이 absolute라 이 띠가 첫 화면 아래
			    정상 흐름에 오고, md 미만에선 카드 다음으로 스크롤되며 자연히 이어진다.
			    숨김 텍스트가 아니라 작은 muted 텍스트로 노출한다. */}
			<section className="flex flex-col items-center gap-3 bg-secondary px-4 py-8 text-center">
				<p className="max-w-2xl text-muted-foreground text-sm">
					밤비알바는 퀸알바·여우알바·밤알바 관련 유흥알바·룸알바 채용정보를
					지역·업종별로 모아 보여주고, 마음에 드는 공고와 1:1 채팅으로 연결해
					주는 여성 구인구직 플랫폼입니다.
				</p>
				<Link
					className="font-bold text-primary text-sm underline underline-offset-4 hover:no-underline"
					href="/jobs"
				>
					로그인 없이 지역·업종별 채용정보 둘러보기
				</Link>
			</section>
			<SiteFooter contentWidthClassName="max-w-5xl" />
		</div>
	);
}
