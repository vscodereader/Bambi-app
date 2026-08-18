"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@bambi-app/ui/components/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { communityWritePath, getBoardByKey } from "@/lib/bambi/community";
import { publicWritePath } from "@/lib/bambi/public-community";
import { orpc } from "@/utils/orpc";

const RESTRICTED_COMMUNITY_WRITE_PATHS = new Set(
	(["free", "work_talk", "market"] as const).flatMap((key) => {
		const { slug } = getBoardByKey(key);
		return [publicWritePath(slug), communityWritePath(slug)];
	})
);

const formatRemaining = (remainingMs: number): string => {
	const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return [hours, minutes, seconds]
		.map((value) => String(value).padStart(2, "0"))
		.join(":");
};

export const warningRestrictionDialogEvent = "bambi:warning-restriction-dialog";

export const showWarningRestrictionDialogForError = (error: Error): boolean => {
	if (!error.message.startsWith("경고 5회 누적으로")) {
		return false;
	}
	window.dispatchEvent(new Event(warningRestrictionDialogEvent));
	return true;
};

export function WarningRestrictionGuard({
	children,
	role,
	until,
}: {
	children: ReactNode;
	role: "admin" | "employer" | "job_seeker" | "legal_advisor" | null;
	until: string | null;
}) {
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [now, setNow] = useState(Date.now());
	const untilMs = until ? new Date(until).getTime() : 0;
	const active = Number.isFinite(untilMs) && untilMs > now;

	useEffect(() => {
		if (!active) {
			return;
		}
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [active]);

	useEffect(() => {
		if (!(until && untilMs <= now)) {
			return;
		}
		setOpen(false);
		queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});
	}, [now, queryClient, until, untilMs]);

	useEffect(() => {
		const show = () => {
			if (active) {
				setOpen(true);
			}
		};
		const interceptRestrictedNavigation = (event: MouseEvent) => {
			if (!active) {
				return;
			}
			const anchor = (event.target as HTMLElement).closest("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) {
				return;
			}
			const path = new URL(anchor.href, window.location.origin).pathname;
			const restricted =
				(role === "employer" && path === "/employer/new") ||
				(role === "job_seeker" && RESTRICTED_COMMUNITY_WRITE_PATHS.has(path));
			if (!restricted) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			setOpen(true);
		};

		window.addEventListener(warningRestrictionDialogEvent, show);
		document.addEventListener("click", interceptRestrictedNavigation, true);
		return () => {
			window.removeEventListener(warningRestrictionDialogEvent, show);
			document.removeEventListener(
				"click",
				interceptRestrictedNavigation,
				true
			);
		};
	}, [active, role]);

	const message =
		role === "employer"
			? "경고 5회 누적으로 공고를 작성하실 수 없습니다."
			: "경고 5회 누적으로 글과 댓글을 작성하실 수 없습니다.";

	return (
		<>
			{children}
			<AlertDialog onOpenChange={setOpen} open={open && active}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{message}</AlertDialogTitle>
						<AlertDialogDescription className="text-center font-bold text-foreground text-xl tabular-nums">
							{formatRemaining(untilMs - now)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction onClick={() => setOpen(false)}>
							확인
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
