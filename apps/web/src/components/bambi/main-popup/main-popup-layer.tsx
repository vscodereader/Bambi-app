"use client";

import { Button } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
	EMPTY_TEXT_DOCUMENT,
	hiddenPopupStorageKey,
	type PopupImageAsset,
	popupLoginTargetStorageKey,
} from "@/lib/bambi/main-popup";
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
	const session = authClient.useSession();
	const query = useQuery({
		...orpc.bambi.mainPopups.listPublic.queryOptions(),
		refetchInterval: 15_000,
	});
	const [closed, setClosed] = useState<Set<string>>(new Set());
	const [ready, setReady] = useState(false);
	const [frontId, setFrontId] = useState<string | null>(null);
	useEffect(() => setReady(true), []);
	useEffect(() => {
		const refresh = () => {
			query.refetch();
		};
		window.addEventListener("storage", refresh);
		return () => window.removeEventListener("storage", refresh);
	}, [query]);
	const items = useMemo(
		() =>
			ready
				? ((query.data?.items ?? []).filter(
						(item) => !(closed.has(item.id) || isHidden(item.id, item.revision))
					) as PublicPopup[])
				: [],
		[closed, query.data?.items, ready]
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
			<div className="pointer-events-none fixed inset-0 z-40 hidden flex-wrap content-start gap-3 overflow-auto p-4 md:flex">
				{items.map((item) => (
					<PopupWindow
						front={frontId === item.id}
						item={item}
						key={item.id}
						onClose={() => close(item.id)}
						onFocus={() => setFrontId(item.id)}
						onHide={() => hide(item)}
						onOpenLink={() => openLink(item.linkPath)}
					/>
				))}
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
			className={`pointer-events-auto h-fit max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border bg-background shadow-2xl ${front ? "z-20" : "z-10"}`}
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
