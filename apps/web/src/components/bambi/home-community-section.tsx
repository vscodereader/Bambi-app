"use client";

// seeker 홈(급구·추천 채용 사이)에 얹는 수다방 섹션. 자격자에게는 게시판 미리보기를,
// 미자격자에게는 로그인/자격 안내 티저를 노출한다. 홈을 방해하지 않도록 에러 시 조용히 숨긴다.

import { Button } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
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

const COMMUNITY_BLOCKED_MESSAGE =
	"여성회원과 광고 중인 업소회원만 이용가능합니다";

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

// 자격자 콘텐츠 — overview 쿼리를 자격 확인 후에만 조회하고, 게시판 4개를 2×2로 렌더한다.
function CommunityContent() {
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
								boardKey={key}
								key={key}
								posts={postsByBoard[key]}
							/>
						))}
			</div>
		</section>
	);
}

// 로그인/자격 안내 티저. 섹션 헤더는 유지하고 카드 하나로 안내한다.
function CommunityTeaser({ isAuthenticated }: { isAuthenticated: boolean }) {
	return (
		<section className="grid gap-2">
			<SectionHeader />
			<Card>
				<CardContent className="flex flex-col items-start gap-3 py-6">
					{isAuthenticated ? (
						// 로그인했지만 미자격 — 안내만, CTA 없음.
						<p className="m-0 text-muted-foreground text-sm">
							{COMMUNITY_BLOCKED_MESSAGE}
						</p>
					) : (
						// 비로그인 — 로그인 유도 CTA(내비게이션이므로 outline).
						<>
							<p className="m-0 text-muted-foreground text-sm">
								밤비 회원들의 수다방이에요. 로그인하고 함께 이야기해 보세요.
							</p>
							<Button
								nativeButton={false}
								render={
									<Link href="/welcome?signup">로그인하고 수다방 참여하기</Link>
								}
								variant="outline"
							/>
						</>
					)}
				</CardContent>
			</Card>
		</section>
	);
}

// 세션 판정 대기 중 스켈레톤 — 티저/콘텐츠 깜빡임을 막는다.
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

	const { canAccessCommunity, isAuthenticated, isPending } = useBambiAuth();

	if (!mounted) {
		return null;
	}

	// 세션 판정 대기 중(아직 자격 미확정)에는 스켈레톤으로 깜빡임을 막는다.
	if (isPending && !canAccessCommunity) {
		return <CommunitySkeleton />;
	}

	if (canAccessCommunity) {
		return <CommunityContent />;
	}

	// 세션 판정이 끝났고 자격이 없는 경우에만 티저를 노출한다.
	return <CommunityTeaser isAuthenticated={isAuthenticated} />;
}
