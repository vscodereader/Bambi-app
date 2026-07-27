"use client";

import { Button } from "@bambi-app/ui/components/button";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AdBannerEditor } from "@/components/bambi/ad-banner-editor/ad-banner-editor";
import {
	AD_BANNER_EDITOR_MESSAGE,
	type AdBannerEditorInit,
	type AdBannerEditorResult,
	fromTransferableAdBannerMedia,
	postAdBannerEditorMessage,
	readAdBannerEditorMessage,
	revokeAdBannerEditorMedia,
	toTransferableAdBannerMedia,
} from "@/components/bambi/ad-banner-editor/editor-launcher";
import { EmptyState } from "@/components/bambi/empty-state";

// 이 화면은 opener와의 postMessage로만 데이터를 주고받는다 — 배너 이미지는 아직 업로드 전이라
// 서버에서 읽어올 수 없다. 앱 셸 대신 편집 창에 맞는 최소 헤더만 둔다(PageShell 금지).
export function AdBannerEditorWindow() {
	const [init, setInit] = useState<AdBannerEditorInit | null>(null);
	const [hasOpener, setHasOpener] = useState(true);
	// 여기서 만든 objectURL을 창이 닫힐 때 놓아주기 위한 참조. 정리 함수가 최신 init을 봐야 한다.
	const initRef = useRef<AdBannerEditorInit | null>(null);
	// 헤더 X는 이 창의 유일한 닫기 버튼이다. 편집 상태를 아는 곳은 에디터뿐이라 닫기 의도를
	// 거기로 흘려보내고, 에디터가 아직 없으면(대기·직접 열기 화면) 그냥 닫는다.
	const closeRequestRef = useRef<(() => void) | null>(null);
	const requestClose = () => {
		if (closeRequestRef.current) {
			closeRequestRef.current();
			return;
		}

		window.close();
	};

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
				// 넘어온 항목은 previewUrl이 떼여 있다(blob은 창을 못 넘는다). 렌더 전에 여기서
				// 다시 만든다 — 에디터는 initialMedia로 자기 상태를 한 번만 잡으므로, 렌더 뒤에
				// 붙이면 배너 이미지가 영영 비어 보인다.
				const resolved: AdBannerEditorInit = {
					...message,
					media: fromTransferableAdBannerMedia(message.media),
				};

				initRef.current = resolved;
				setInit(resolved);
			}
		};

		window.addEventListener("message", handleMessage);
		// 리스너를 먼저 걸고 ready를 보낸다. 순서가 뒤집히면 부모의 init을 놓쳐 영영 대기한다.
		postAdBannerEditorMessage(opener, { type: AD_BANNER_EDITOR_MESSAGE.ready });

		return () => {
			window.removeEventListener("message", handleMessage);
			revokeAdBannerEditorMedia(initRef.current?.media);
		};
	}, []);

	const handleSave = (result: AdBannerEditorResult) => {
		const opener: Window | null = window.opener;

		if (opener) {
			postAdBannerEditorMessage(opener, {
				layout: result.layout,
				// 이 창에서 만든 blob previewUrl은 창이 닫히면 죽는다. 파일만 돌려보내고 부모가
				// 자기 문서에서 다시 만든다.
				media: toTransferableAdBannerMedia(result.media),
				type: AD_BANNER_EDITOR_MESSAGE.save,
			});
		}

		window.close();
	};

	const renderBody = () => {
		if (!hasOpener) {
			return (
				<EmptyState
					description="공고 등록 화면의 '배너 이미지·문구 편집' 버튼으로 열어 주십시오. 편집할 배너는 그 화면에서 전달받습니다."
					title="이 화면은 직접 열 수 없습니다"
				/>
			);
		}

		if (!init) {
			return (
				<EmptyState
					description="공고 등록 화면에서 배너 정보를 받아오는 중입니다…"
					title="에디터를 준비하고 있습니다"
				/>
			);
		}

		return (
			<AdBannerEditor
				closeRequestRef={closeRequestRef}
				initialLayout={init.layout}
				initialMedia={init.media}
				onCancel={() => window.close()}
				onSave={handleSave}
				requiredUsages={init.requiredUsages}
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
					{/* truncate를 두면 좁은 창에서 안내가 통째로 잘린다. 줄바꿈을 허용하되
					    text-pretty로 마지막 줄에 한 단어만 남는 모양을 막는다. */}
					<p className="text-pretty text-muted-foreground text-xs md:text-sm">
						저장하면 공고 등록 화면으로 돌아갑니다.
					</p>
				</div>
				<Button
					aria-label="편집 창 닫기"
					onClick={requestClose}
					size="icon"
					title="편집 창 닫기"
					type="button"
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
