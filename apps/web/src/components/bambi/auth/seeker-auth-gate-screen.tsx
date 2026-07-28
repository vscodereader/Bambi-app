// 비로그인(anon) 방문자가 /seeker에서 만나는 화면. 오버레이는 Dialog가 아니라
// 배경 위 절대배치 카드다 — 닫을 수 없는 화면이라 포커스 트랩·backdrop이 필요 없고,
// 덕분에 푸터가 블러 밖에서 선명하고 클릭 가능한 상태로 남는다.

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
			<div className="relative flex-1">
				<AuthBackdrop jobs={backdropJobs} />
				{/* md 미만에서는 문서 흐름에 두어 페이지가 정상 스크롤되고, md 이상에서만
				    블러 배경 위에 겹쳐 띄운다. */}
				<div className="flex min-h-full items-center justify-center p-4 md:absolute md:inset-0">
					{/* AuthPanel이 useSearchParams를 쓰므로 Suspense가 필요하다. */}
					<Suspense>
						<AuthPanel />
					</Suspense>
				</div>
			</div>
			<SiteFooter contentWidthClassName="max-w-5xl" />
		</div>
	);
}
