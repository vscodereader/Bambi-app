"use client";

import { Button } from "@bambi-app/ui/components/button";
import { Skeleton } from "@bambi-app/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { SEEKER_LOGIN_PATH } from "@/lib/bambi/auth-paths";
import {
	COMMUNITY_ROOT_PATH,
	communityBoardPath,
	communityCrawledPath,
	communityPostPath,
} from "@/lib/bambi/community";
import { publicBoardPath, publicPostPath } from "@/lib/bambi/public-community";
import { orpc } from "@/utils/orpc";

interface CommunityPostNavigationProps {
	boardKey: string;
	boardSlug: string;
	currentId: string;
	publicView?: boolean;
	source: "crawled" | "native";
}

interface NavigationItem {
	boardKey: string;
	boardSlug: string;
	createdAt: Date | string;
	id: string;
	source: "crawled" | "native";
	title: string;
}

const itemHref = (item: NavigationItem, publicView: boolean): string => {
	if (publicView) {
		return publicPostPath(item.boardSlug, item.id);
	}
	return item.source === "crawled"
		? communityCrawledPath(item.id)
		: communityPostPath(item.boardSlug, item.id);
};

function NeighborRow({
	item,
	label,
	publicView,
}: {
	item: NavigationItem | null;
	label: "다음글" | "이전글";
	publicView: boolean;
}) {
	if (!item) {
		return null;
	}

	return (
		<div className="grid min-h-14 grid-cols-[4rem_minmax(0,1fr)] items-center gap-3 border-border border-b px-4 last:border-b-0">
			<span className="font-bold text-muted-foreground text-sm">{label}</span>
			<Link
				aria-label={publicView ? `로그인하고 ${label} 보기` : undefined}
				className="min-w-0 font-medium text-sm hover:text-primary hover:underline"
				href={(publicView ? SEEKER_LOGIN_PATH : itemHref(item, false)) as Route}
			>
				<span className={publicView ? "block truncate blur-sm" : "truncate"}>
					{item.title}
				</span>
			</Link>
		</div>
	);
}

export function CommunityPostNavigation({
	boardKey,
	boardSlug,
	currentId,
	publicView = false,
	source,
}: CommunityPostNavigationProps) {
	const navigationQuery = useQuery(
		orpc.bambi.community.getPostNavigation.queryOptions({
			input: { board: boardKey, currentId, publicView, source },
		})
	);
	const listHref = publicView
		? publicBoardPath(boardSlug)
		: communityBoardPath(boardSlug);
	const previous =
		navigationQuery.data?.previous?.id === currentId
			? null
			: (navigationQuery.data?.previous ?? null);
	const next =
		navigationQuery.data?.next?.id === currentId
			? null
			: (navigationQuery.data?.next ?? null);
	const hasNeighbor = previous !== null || next !== null;

	return (
		<nav aria-label="게시글 탐색" className="flex flex-col gap-3">
			<div
				className="overflow-hidden rounded-xl border border-border bg-card"
				hidden={!(navigationQuery.isPending || hasNeighbor)}
			>
				{navigationQuery.isPending ? (
					<div className="flex flex-col gap-2 p-4">
						<Skeleton className="h-5 w-3/4" />
						<Skeleton className="h-5 w-2/3" />
					</div>
				) : (
					<>
						<NeighborRow
							item={previous}
							label="이전글"
							publicView={publicView}
						/>
						<NeighborRow item={next} label="다음글" publicView={publicView} />
					</>
				)}
			</div>
			<div className="flex justify-end gap-2">
				<Button
					nativeButton={false}
					render={<Link href={listHref as Route}>목록</Link>}
					size="sm"
				/>
				<Button
					nativeButton={false}
					render={<Link href={COMMUNITY_ROOT_PATH}>수다방</Link>}
					size="sm"
				/>
			</div>
		</nav>
	);
}
