"use client";

import { Button } from "@bambi-app/ui/components/button";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { AdBannerEditor } from "@/components/bambi/ad-banner-editor/ad-banner-editor";
import {
	AD_BANNER_EDITOR_MESSAGE,
	type AdBannerEditorInit,
	postAdBannerEditorMessage,
	readAdBannerEditorMessage,
	useAdBannerBackgroundUrls,
} from "@/components/bambi/ad-banner-editor/editor-launcher";
import { EmptyState } from "@/components/bambi/empty-state";
import type { AdBannerLayout } from "@/lib/bambi/ad-banner-layout";

// 이 화면은 opener와의 postMessage로만 데이터를 주고받는다 — 배너 이미지는 아직 업로드 전이라
// 서버에서 읽어올 수 없다. 앱 셸 대신 편집 창에 맞는 최소 헤더만 둔다(PageShell 금지).
export function AdBannerEditorWindow() {
	const [init, setInit] = useState<AdBannerEditorInit | null>(null);
	const [hasOpener, setHasOpener] = useState(true);
	const backgroundUrls = useAdBannerBackgroundUrls(init ?? {});

	useEffect(() => {
		const opener: Window | null = window.opener;

		if (!opener) {
			setHasOpener(false);
			return;
		}

		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin || event.source !== opener) {
				return;
			}

			const message = readAdBannerEditorMessage(event.data);

			if (message?.type === AD_BANNER_EDITOR_MESSAGE.init) {
				setInit(message);
			}
		};

		window.addEventListener("message", handleMessage);
		// 리스너를 먼저 걸고 ready를 보낸다. 순서가 뒤집히면 부모의 init을 놓쳐 영영 대기한다.
		postAdBannerEditorMessage(opener, { type: AD_BANNER_EDITOR_MESSAGE.ready });

		return () => window.removeEventListener("message", handleMessage);
	}, []);

	const handleSave = (layout: AdBannerLayout) => {
		const opener: Window | null = window.opener;

		if (opener) {
			postAdBannerEditorMessage(opener, {
				layout,
				type: AD_BANNER_EDITOR_MESSAGE.save,
			});
		}

		window.close();
	};

	const renderBody = () => {
		if (!hasOpener) {
			return (
				<EmptyState
					description="공고 등록 화면의 '배너 문구 편집' 버튼으로 열어 주세요. 편집할 배너 이미지는 그 화면에서 전달받습니다."
					title="이 화면은 직접 열 수 없어요"
				/>
			);
		}

		if (!init) {
			return (
				<EmptyState
					description="공고 등록 화면에서 배너 정보를 받아오는 중이에요…"
					title="에디터를 준비하고 있어요"
				/>
			);
		}

		return (
			<AdBannerEditor
				backgroundUrls={backgroundUrls}
				initialLayout={init.layout}
				onCancel={() => window.close()}
				onSave={handleSave}
			/>
		);
	};

	return (
		// 안전 영역 패딩은 노치·홈 인디케이터가 있는 기기에서 헤더와 하단 버튼이 가리지 않게 한다.
		<div className="flex min-h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
			<header className="flex items-center justify-between gap-3 border-border border-b px-4 py-3 md:px-6">
				<div className="flex min-w-0 flex-col gap-0.5">
					<h1 className="truncate font-semibold text-base md:text-lg">
						광고 배너 편집
					</h1>
					<p className="truncate text-muted-foreground text-xs md:text-sm">
						저장하면 공고 등록 화면으로 돌아갑니다.
					</p>
				</div>
				<Button
					aria-label="편집 창 닫기"
					onClick={() => window.close()}
					size="icon"
					variant="ghost"
				>
					<X aria-hidden="true" />
				</Button>
			</header>
			<main className="flex flex-1 flex-col px-4 py-4 md:px-6 md:py-6">
				{renderBody()}
			</main>
		</div>
	);
}
