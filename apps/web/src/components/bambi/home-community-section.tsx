"use client";

// seeker 홈(급구·추천 채용 사이)에 얹는 수다방 섹션. 게시판별 상위 4개 미리보기는 자격과
// 무관하게 모두에게 노출한다(overview가 public). 그 다음 동선만 방문자별로 갈린다:
// 자격자(여성·광고 업소 회원, 여성 인증 게스트)는 그대로 수다방으로, 미인증 방문자는
// 본인인증 다이얼로그로, 로그인했지만 자격이 없는 회원은 토스트 안내로 막는다.
// 법률자문 계정은 legal 게시판·수다방 홈 링크만 통과하고 나머지는 토스트로 막는다.
// 홈을 방해하지 않도록 에러 시 조용히 숨긴다.

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import {
	CommunityOverviewGrid,
	useLegalAdvisorNavGuard,
} from "@/components/bambi/community-board-preview";
import { PhoneVerifyDialog } from "@/components/bambi/phone-verify-dialog";
import {
	COMMUNITY_LAYOUT_SURFACE,
	COMMUNITY_ROOT_PATH,
} from "@/lib/bambi/community";
import { trackNavigationClick } from "@/lib/bambi/ga-interaction";
import { orpc } from "@/utils/orpc";

const COMMUNITY_BLOCKED_MESSAGE =
	"일반 여성 회원과 광고 중인 업소회원만 가능합니다";
const SUSPENDED_COMMUNITY_BLOCKED_MESSAGE = "차단된 유저는 확인이 불가합니다";

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
				href={COMMUNITY_ROOT_PATH}
				onClick={() => {
					trackNavigationClick({
						contentId: "community",
						linkType: "section_more",
					});
				}}
			>
				더보기
				<ChevronRightIcon className="size-3" />
			</Link>
		</div>
	);
}

// 미인증 방문자가 수다방을 누르면 뜨는 본인인증 안내. 인증을 마치면 누른 목적지로
// 돌아온다(PhoneVerifyDialog의 redirectTo) — 게이트는 그때부터 열린다.
function CommunityVerifyDialog({
	onClose,
	target,
}: {
	onClose: () => void;
	target: string | null;
}) {
	return (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			open={target !== null}
		>
			<DialogContent>
				<div className="flex flex-col gap-2">
					<DialogTitle>본인인증이 필요해요</DialogTitle>
					<DialogDescription>
						성인 본인인증을 마치면 비회원도 수다방을 보고 자유수다·밤문화
						이야기·무료 법률 자문에 참여할 수 있어요.
					</DialogDescription>
				</div>
				<PhoneVerifyDialog
					redirectTo={target ?? COMMUNITY_ROOT_PATH}
					size="md"
					triggerLabel="본인인증하고 이용하기"
					variant="primary"
				/>
			</DialogContent>
		</Dialog>
	);
}

// 배치는 수다방 페이지(CommunityHomeScreen)와 같은 컴포넌트를 쓴다 — 같은 섹션이 홈과
// 수다방에서 다르게 보이지 않게.
function CommunityContent({
	onBlockedNavigate,
}: {
	onBlockedNavigate?: (href: string) => void;
}) {
	const overviewQuery = useQuery(
		orpc.bambi.community.overview.queryOptions({
			enabled: true,
			input: { surface: COMMUNITY_LAYOUT_SURFACE.main },
		})
	);

	// 에러는 홈을 방해하지 않도록 섹션 전체를 조용히 숨긴다.
	if (overviewQuery.isError) {
		return null;
	}

	return (
		<section className="grid gap-2">
			<SectionHeader />
			<CommunityOverviewGrid
				analyticsSurface="seeker_home_community"
				boards={overviewQuery.data?.boards ?? []}
				isPending={overviewQuery.isPending}
				onBlockedNavigate={onBlockedNavigate}
			/>
		</section>
	);
}

// 세션 판정 대기 중 스켈레톤 — 차단/허용 판정 전 잘못된 안내를 막는다.
function CommunitySkeleton() {
	return (
		<section className="grid gap-2">
			<SectionHeader />
			<CommunityOverviewGrid boards={[]} isPending />
		</section>
	);
}

export function HomeCommunitySection() {
	// 세션·자격 판정은 클라이언트 전용이라 SSR과 첫 클라이언트 렌더가 어긋나 hydration
	// 불일치가 난다. 마운트 전에는 자격과 무관한 스켈레톤(실제 레이아웃과 같은 높이)을
	// 렌더해 서버·첫 클라이언트 렌더를 일치시킨다 — null 반환 후 삽입 시 생기던 CLS를 막는다.
	const [mounted, setMounted] = useState(false);
	const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
	useEffect(() => {
		setMounted(true);
	}, []);

	const {
		accountStatus,
		canAccessCommunity,
		isAuthenticated,
		isGuest,
		isPending,
	} = useBambiAuth();
	// 법률자문 계정은 입장은 되지만 legal 게시판만 이용한다 — 다른 게시판 카드는 그대로
	// 보이고 누르면 안내한다.
	const legalAdvisorGuard = useLegalAdvisorNavGuard();

	if (!mounted) {
		return <CommunitySkeleton />;
	}

	// 세션 판정 대기 중(아직 자격 미확정)에는 스켈레톤으로 깜빡임을 막는다.
	if (isPending && !canAccessCommunity) {
		return <CommunitySkeleton />;
	}

	// 인증 자체가 없는 방문자는 게이트에 걸리기 전에 본인인증을 권한다(인증 후 원래
	// 목적지로 복귀). 로그인은 했지만 자격이 없는 회원은 기존대로 토스트로만 안내한다.
	const isAnon = !(isAuthenticated || isGuest);
	const handleBlocked = (href: string) => {
		if (accountStatus === "suspended") {
			toast(SUSPENDED_COMMUNITY_BLOCKED_MESSAGE);
			return;
		}
		if (isAnon) {
			setVerifyTarget(href);
			return;
		}
		toast(COMMUNITY_BLOCKED_MESSAGE);
	};

	return (
		<>
			<CommunityContent
				onBlockedNavigate={
					canAccessCommunity ? legalAdvisorGuard : handleBlocked
				}
			/>
			<CommunityVerifyDialog
				onClose={() => setVerifyTarget(null)}
				target={verifyTarget}
			/>
		</>
	);
}
