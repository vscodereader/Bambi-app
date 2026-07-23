"use client";

// seeker 홈(급구·추천 채용 사이)에 얹는 수다방 섹션. 게시판별 상위 4개 미리보기는 자격과
// 무관하게 모두에게 노출하고(overview가 public), 미자격자(비회원·남성·비광고 업소)는 글
// 클릭 시 토스트로 안내하며 이동을 막는다. 홈을 방해하지 않도록 에러 시 조용히 숨긴다.

import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import {
	BoardPreviewCard,
	BoardPreviewSkeleton,
	type OverviewPost,
} from "@/components/bambi/community-board-preview";
import { orpc } from "@/utils/orpc";

// 홈 섹션에 노출할 게시판 순서. 중고거래(market)는 응답에 있어도 홈에서는 제외한다.
const HOME_BOARD_KEYS = ["best", "free", "work_talk", "notice"] as const;

const COMMUNITY_BLOCKED_MESSAGE = "여성 회원과 광고 중인 업소회원만 가능합니다";

// 섹션 헤더 — visual-job-exposure-sections의 ExposureSection 헤더 문법을 따른다.
function SectionHeader() {
	return (
		<div className="flex items-center justify-between">
			<h2 className="m-0 flex items-center gap-2 font-extrabold text-base">
				<span className="h-4 w-1 rounded-full bg-coral-500" />
				수다방
			</h2>
			<Link
				className="flex items-center gap-1 font-semibold text-muted-foreground text-xs hover:text-foreground"
				href="/seeker/community"
			>
				더보기
				<ChevronRightIcon className="size-3" />
			</Link>
		</div>
	);
}

// 게시판 4개를 2×2로 렌더한다. blocked면 글 클릭을 막고 자격 안내를 토스트로 띄운다
// (수다방 페이지로 가는 "더보기"는 그대로 두고, 그쪽 자격 게이트가 이어받는다).
function CommunityContent({ blocked }: { blocked: boolean }) {
	const overviewQuery = useQuery(
		orpc.bambi.community.overview.queryOptions({ enabled: true })
	);

	// 에러는 홈을 방해하지 않도록 섹션 전체를 조용히 숨긴다.
	if (overviewQuery.isError) {
		return null;
	}

	const data = overviewQuery.data;
	// 응답 키(workTalk)를 게시판 키(work_talk)로 매핑해 게시판별 글 목록을 뽑는다.
	const postsByBoard: Record<(typeof HOME_BOARD_KEYS)[number], OverviewPost[]> =
		{
			best: data?.best ?? [],
			free: data?.free ?? [],
			notice: data?.notice ?? [],
			work_talk: data?.workTalk ?? [],
		};

	return (
		<section className="grid gap-2">
			<SectionHeader />
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{overviewQuery.isPending
					? HOME_BOARD_KEYS.map((key) => <BoardPreviewSkeleton key={key} />)
					: HOME_BOARD_KEYS.map((key) => (
							<BoardPreviewCard
								blockedNotice={blocked ? COMMUNITY_BLOCKED_MESSAGE : undefined}
								boardKey={key}
								key={key}
								posts={postsByBoard[key]}
							/>
						))}
			</div>
		</section>
	);
}

// 세션 판정 대기 중 스켈레톤 — 차단/허용 판정 전 잘못된 토스트 동작을 막는다.
function CommunitySkeleton() {
	return (
		<section className="grid gap-2">
			<SectionHeader />
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{HOME_BOARD_KEYS.map((key) => (
					<BoardPreviewSkeleton key={key} />
				))}
			</div>
		</section>
	);
}

export function HomeCommunitySection() {
	// 세션·자격 판정은 클라이언트 전용이라 SSR과 첫 클라이언트 렌더가 어긋나 hydration
	// 불일치가 난다. 마운트 후에만 렌더해 서버·첫 클라이언트 렌더를 null로 일치시킨다.
	const [mounted, setMounted] = useState(false);
	useEffect(() => {
		setMounted(true);
	}, []);

	const { canAccessCommunity, isPending } = useBambiAuth();

	if (!mounted) {
		return null;
	}

	// 세션 판정 대기 중(아직 자격 미확정)에는 스켈레톤으로 깜빡임을 막는다.
	if (isPending && !canAccessCommunity) {
		return <CommunitySkeleton />;
	}

	return <CommunityContent blocked={!canAccessCommunity} />;
}
