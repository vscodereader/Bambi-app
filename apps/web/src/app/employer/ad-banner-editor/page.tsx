"use client";

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
import { PageShell } from "@/components/bambi/page-shell";
import type { AdBannerLayout } from "@/lib/bambi/ad-banner-layout";

// 공고 등록 폼이 window.open으로 여는 배너 에디터 창. 이 화면은 opener와의 postMessage로만
// 데이터를 주고받는다 — 배너 이미지는 아직 업로드 전이라 서버에서 읽어올 수 없다.
export default function AdBannerEditorPopupPage() {
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

	if (!hasOpener) {
		return (
			<PageShell title="광고 배너 편집">
				<EmptyState
					description="공고 등록 화면의 '배너 문구 편집' 버튼으로 열어 주세요. 편집할 배너 이미지는 그 화면에서 전달받습니다."
					title="이 화면은 직접 열 수 없어요"
				/>
			</PageShell>
		);
	}

	if (!init) {
		return (
			<PageShell title="광고 배너 편집">
				<EmptyState
					description="공고 등록 화면에서 배너 정보를 받아오고 있어요."
					title="에디터를 준비하는 중이에요"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="편집한 내용은 저장을 누르면 공고 등록 화면으로 돌아갑니다."
			title="광고 배너 편집"
		>
			<AdBannerEditor
				backgroundUrls={backgroundUrls}
				initialLayout={init.layout}
				onCancel={() => window.close()}
				onSave={handleSave}
			/>
		</PageShell>
	);
}
