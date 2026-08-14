"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useBambiAuth } from "@/components/bambi/auth-client-provider";
import { authClient } from "@/lib/auth-client";
import {
	EMPTY_TEXT_DOCUMENT,
	hiddenPopupStorageKey,
	type PopupImageAsset,
	popupAuthTransitionEvent,
	popupAuthTransitionStorageKey,
	popupLoginTargetStorageKey,
} from "@/lib/bambi/main-popup";
import { resolveMainPopupPageId } from "@/lib/bambi/main-popup-pages";
import { useCommunityBoards } from "@/lib/bambi/use-community-boards";
import { orpc } from "@/utils/orpc";
import { PopupTextViewer } from "./popup-text-editor";

interface PublicPopup {
	contentHeight: number;
	contentType: "image" | "text";
	contentWidth: number;
	editedImage: PopupImageAsset | null;
	id: string;
	linkPath: string | null;
	revision: number;
	slotIndex: number;
	targetPages: string[];
	textDocument: JSONContent | null;
}
interface HiddenState {
	hiddenUntil: number;
	revision: number;
}
const isHidden = (id: string, revision: number) => {
	try {
		const raw = localStorage.getItem(hiddenPopupStorageKey(id));
		if (!raw) {
			return false;
		}
		const state = JSON.parse(raw) as HiddenState;
		if (state.revision !== revision || state.hiddenUntil <= Date.now()) {
			localStorage.removeItem(hiddenPopupStorageKey(id));
			return false;
		}
		return true;
	} catch {
		return false;
	}
};

export function MainPopupLayer() {
	const pathname = usePathname();
	const { boards } = useCommunityBoards();
	const pageId = resolveMainPopupPageId(pathname, boards);
	const session = authClient.useSession();
	const { isAuthenticated, isPending } = useBambiAuth();
	const query = useQuery({
		...orpc.bambi.mainPopups.listPublic.queryOptions(),
		enabled: !isPending && isAuthenticated,
		refetchInterval: 15_000,
	});
	const [closed, setClosed] = useState<Set<string>>(new Set());
	const [ready, setReady] = useState(false);
	const [authTransition, setAuthTransition] = useState(false);
	const [pageReady, setPageReady] = useState(false);
	const [frontId, setFrontId] = useState<string | null>(null);
	useEffect(() => setReady(true), []);
	useEffect(() => {
		const syncAuthTransition = () => {
			setAuthTransition(
				sessionStorage.getItem(popupAuthTransitionStorageKey) !== null
			);
		};
		syncAuthTransition();
		window.addEventListener(popupAuthTransitionEvent, syncAuthTransition);
		return () =>
			window.removeEventListener(popupAuthTransitionEvent, syncAuthTransition);
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: pathname은 값을 읽는 대신 페이지 이동마다 준비 상태를 초기화하는 재실행 키다.
	useEffect(() => {
		let firstFrame = 0;
		let secondFrame = 0;
		const markPageReady = () => {
			firstFrame = window.requestAnimationFrame(() => {
				secondFrame = window.requestAnimationFrame(() => {
					const transitionSource = sessionStorage.getItem(
						popupAuthTransitionStorageKey
					);
					if (
						transitionSource &&
						transitionSource !== String(performance.timeOrigin)
					) {
						sessionStorage.removeItem(popupAuthTransitionStorageKey);
						setAuthTransition(false);
					}
					setPageReady(true);
				});
			});
		};

		setPageReady(false);
		if (document.readyState === "complete") {
			markPageReady();
		} else {
			window.addEventListener("load", markPageReady, { once: true });
		}

		return () => {
			window.removeEventListener("load", markPageReady);
			window.cancelAnimationFrame(firstFrame);
			window.cancelAnimationFrame(secondFrame);
		};
	}, [pathname]);
	useEffect(() => {
		const refresh = () => {
			query.refetch();
		};
		window.addEventListener("storage", refresh);
		return () => window.removeEventListener("storage", refresh);
	}, [query]);
	const items = useMemo(
		() =>
			ready && pageReady && !authTransition && !isPending && isAuthenticated
				? ((query.data?.items ?? []).filter(
						(item) =>
							pageId !== null &&
							item.targetPages.includes(pageId) &&
							!(closed.has(item.id) || isHidden(item.id, item.revision))
					) as PublicPopup[])
				: [],
		[
			authTransition,
			closed,
			isAuthenticated,
			isPending,
			pageId,
			pageReady,
			query.data?.items,
			ready,
		]
	);
	useEffect(() => {
		const media = window.matchMedia("(max-width: 767px)");
		const syncBodyScroll = () => {
			document.body.classList.toggle(
				"overflow-hidden",
				media.matches && items.length > 0
			);
		};
		syncBodyScroll();
		media.addEventListener("change", syncBodyScroll);
		return () => {
			media.removeEventListener("change", syncBodyScroll);
			document.body.classList.remove("overflow-hidden");
		};
	}, [items.length]);
	if (items.length === 0) {
		return null;
	}
	const close = (id: string) =>
		setClosed((current) => new Set(current).add(id));
	const hide = (item: PublicPopup) => {
		localStorage.setItem(
			hiddenPopupStorageKey(item.id),
			JSON.stringify({
				hiddenUntil: Date.now() + 86_400_000,
				revision: item.revision,
			} satisfies HiddenState)
		);
		close(item.id);
	};
	const openLink = (path: string | null) => {
		if (!path) {
			return;
		}
		if (session.data?.user) {
			window.location.assign(path);
		} else {
			sessionStorage.setItem(popupLoginTargetStorageKey, path);
			window.location.assign("/seeker?auth=login");
		}
	};
	return (
		<>
			<div className="pointer-events-none fixed inset-0 z-40 hidden overflow-auto p-4 md:block">
				<DesktopPopupStack
					frontId={frontId}
					items={items}
					onClose={close}
					onFocus={setFrontId}
					onHide={hide}
					onOpenLink={openLink}
				/>
			</div>
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4 md:hidden">
				<PopupWindow
					front
					item={items[0]}
					onClose={() => close(items[0].id)}
					onFocus={() => undefined}
					onHide={() => hide(items[0])}
					onOpenLink={() => openLink(items[0].linkPath)}
				/>
			</div>
		</>
	);
}

function DesktopPopupStack({
	frontId,
	items,
	onClose,
	onFocus,
	onHide,
	onOpenLink,
}: {
	frontId: string | null;
	items: PublicPopup[];
	onClose: (id: string) => void;
	onFocus: (id: string) => void;
	onHide: (item: PublicPopup) => void;
	onOpenLink: (path: string | null) => void;
}) {
	const item = items[0];
	if (!item) {
		return null;
	}
	return (
		<div className="grid w-fit max-w-full [grid-template-areas:'popup']">
			<div className="self-start justify-self-start [grid-area:popup]">
				<PopupWindow
					front={frontId === item.id}
					item={item}
					onClose={() => onClose(item.id)}
					onFocus={() => onFocus(item.id)}
					onHide={() => onHide(item)}
					onOpenLink={() => onOpenLink(item.linkPath)}
				/>
			</div>
			{items.length > 1 ? (
				<div className="pointer-events-none self-start justify-self-start pt-8 pl-8 [grid-area:popup]">
					<DesktopPopupStack
						frontId={frontId}
						items={items.slice(1)}
						onClose={onClose}
						onFocus={onFocus}
						onHide={onHide}
						onOpenLink={onOpenLink}
					/>
				</div>
			) : null}
		</div>
	);
}

function PopupWindow({
	front,
	item,
	onClose,
	onFocus,
	onHide,
	onOpenLink,
}: {
	front: boolean;
	item: PublicPopup;
	onClose: () => void;
	onFocus: () => void;
	onHide: () => void;
	onOpenLink: () => void;
}) {
	return (
		<section
			aria-label={`${item.slotIndex}번 안내 팝업`}
			className={`pointer-events-auto relative h-fit max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border bg-background shadow-2xl ${front ? "z-20" : "z-10"}`}
			onPointerDown={onFocus}
		>
			{item.contentType === "image" && item.editedImage ? (
				<button
					aria-label={
						item.linkPath ? "팝업 연결 페이지로 이동" : "안내 팝업 이미지"
					}
					className={`block max-w-full border-0 bg-transparent p-0 ${item.linkPath ? "cursor-pointer" : "cursor-default"}`}
					disabled={!item.linkPath}
					onClick={onOpenLink}
					type="button"
				>
					<Image
						alt="안내 팝업"
						className="h-auto max-h-[calc(100dvh-8rem)] max-w-full"
						height={item.contentHeight}
						src={item.editedImage.dataUrl}
						unoptimized
						width={item.contentWidth}
					/>
				</button>
			) : (
				<svg
					aria-label="글 안내 팝업"
					className="h-auto max-h-[80vh] max-w-full"
					height={item.contentHeight}
					role="img"
					viewBox={`0 0 ${item.contentWidth} ${item.contentHeight}`}
					width={item.contentWidth}
				>
					<foreignObject height="100%" width="100%">
						<PopupTextViewer
							document={item.textDocument ?? EMPTY_TEXT_DOCUMENT}
						/>
					</foreignObject>
				</svg>
			)}
			<footer className="grid grid-cols-2 border-t">
				<Button className="rounded-none" onClick={onHide} variant="ghost">
					오늘 하루 보지 않기
				</Button>
				<Button
					className="rounded-none border-l"
					onClick={onClose}
					variant="ghost"
				>
					창닫기
				</Button>
			</footer>
		</section>
	);
}
