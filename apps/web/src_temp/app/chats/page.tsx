"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/bambi/empty-state";
import { PageShell } from "@/components/bambi/page-shell";
import { StatusBadge } from "@/components/bambi/status-badge";
import Loader from "@/components/loader";
import { formatDateTime } from "@/lib/bambi-format";
import { orpc } from "@/utils/orpc";

const getBlockedTone = (
	isBlocked: boolean
): React.ComponentProps<typeof StatusBadge>["tone"] =>
	isBlocked ? "danger" : "good";

export default function ChatsPage() {
	const chatsQuery = useQuery(orpc.bambi.chats.listMine.queryOptions());
	const rooms = chatsQuery.data ?? [];

	let chatsContent: React.ReactNode;

	if (chatsQuery.isLoading) {
		chatsContent = <Loader />;
	} else if (chatsQuery.isError) {
		chatsContent = (
			<EmptyState
				action={
					<Button onClick={() => chatsQuery.refetch()} type="button">
						다시 시도
					</Button>
				}
				description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
				title="채팅방을 불러올 수 없습니다"
			/>
		);
	} else if (rooms.length === 0) {
		chatsContent = (
			<EmptyState
				action={
					<Link className={buttonVariants({ variant: "outline" })} href="/jobs">
						공고 탐색
					</Link>
				}
				description="관심 있는 공고에서 채팅을 시작하면 이곳에 대화가 표시됩니다."
				title="진행 중인 채팅이 없습니다"
			/>
		);
	} else {
		chatsContent = (
			<section className="overflow-hidden border">
				<div className="divide-y">
					{rooms.map((room) => (
						<Link
							className="grid gap-3 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
							href={`/chats/${room.id}` as Route}
							key={room.id}
						>
							<div className="min-w-0 space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<h2 className="min-w-0 flex-1 break-words font-medium text-base">
										공고 {room.jobPostId}
									</h2>
									<StatusBadge tone={getBlockedTone(room.isBlocked)}>
										{room.isBlocked ? "차단됨" : "대화 가능"}
									</StatusBadge>
								</div>
								<p className="break-all text-muted-foreground text-sm">
									채팅방 {room.id}
								</p>
							</div>
							<div className="space-y-1 text-left sm:text-right">
								<p className="text-muted-foreground text-xs">최근 업데이트</p>
								<p className="font-medium text-sm">
									{formatDateTime(room.updatedAt)}
								</p>
							</div>
						</Link>
					))}
				</div>
			</section>
		);
	}

	return (
		<PageShell
			description="지원자와 구인자 사이의 채팅방과 최신 상태를 확인합니다."
			title="내 채팅"
		>
			{chatsContent}
		</PageShell>
	);
}
