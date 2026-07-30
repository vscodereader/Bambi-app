"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { SeekerCrawledJobDetail } from "@/components/bambi/screens/seeker-crawled-job-detail";
import { isApiJobId, useCrawledJob } from "@/lib/bambi/api-jobs";

export default function SeekerCrawledJobPage() {
	const router = useRouter();
	const { id } = useParams<{ id: string }>();
	const { isError, isLoading, job } = useCrawledJob(id);
	// 목록에서 내려둔 스크롤 위치가 상세에 그대로 남는 문제를 막는다(우리 공고 상세와 같은
	// 이유 — 그쪽 주석 참고). 훅 순서 때문에 조기 반환보다 위에 있어야 한다.
	// biome-ignore lint/correctness/useExhaustiveDependencies: id는 값을 읽으려는 게 아니라 "다른 공고로 바뀌면 다시 올린다"는 재실행 키다.
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [id]);

	// uuid가 아니면 서버에 물어볼 것도 없다(수집 공고 id는 항상 uuid다).
	if (!isApiJobId(id)) {
		notFound();
	}

	if (isLoading) {
		return (
			<div className="mx-auto w-full px-5 py-10 text-center font-bold text-muted-foreground md:max-w-[80%] md:px-6">
				공고 정보를 불러오고 있어요.
			</div>
		);
	}

	// 서버가 NOT_FOUND(비활성·삭제)를 주면 존재하지 않는 공고와 같게 취급한다.
	if (isError || !job) {
		notFound();
	}

	return (
		<SeekerCrawledJobDetail job={job} onBack={() => router.push("/seeker")} />
	);
}
