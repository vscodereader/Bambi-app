"use client";

import { Button } from "@bambi-app/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import { SquarePen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type AdBannerLayout,
	type AdBannerSlot,
	createEmptyAdBannerLayout,
} from "@/lib/bambi/ad-banner-layout";
import { AdBannerEditor } from "./ad-banner-editor";

// 새창 라우트. 부모 폼과 에디터 창이 같은 오리진이어야 postMessage 핸드셰이크가 성립한다.
export const AD_BANNER_EDITOR_PATH = "/employer/ad-banner-editor";

// 부모 폼 ↔ 에디터 창 메시지 계약.
//   에디터 → 부모: ready   (마운트 완료. 그전에는 메시지를 받을 수 없다)
//   부모 → 에디터: init    (레이아웃 + 배경)
//   에디터 → 부모: save    (편집 결과)
export const AD_BANNER_EDITOR_MESSAGE = {
	init: "ad-banner-editor:init",
	ready: "ad-banner-editor:ready",
	save: "ad-banner-editor:save",
} as const;

export interface AdBannerEditorSources {
	// 이미 업로드된 이미지(수정 화면). 아직 업로드 전이면 files 쪽을 쓴다.
	backgroundUrls?: Partial<Record<AdBannerSlot, string>>;
	// 제출 전 폼이 들고 있는 파일. blob URL은 만든 문서에 묶여 있어 창을 넘기면 브라우저마다
	// 로드 여부가 갈리므로, structured clone 되는 File을 그대로 넘기고 받는 쪽에서 URL을 만든다.
	files?: Partial<Record<AdBannerSlot, File>>;
}

export type AdBannerEditorInit = AdBannerEditorSources & {
	layout: AdBannerLayout;
	type: typeof AD_BANNER_EDITOR_MESSAGE.init;
};

export type AdBannerEditorMessage =
	| AdBannerEditorInit
	| { layout: AdBannerLayout; type: typeof AD_BANNER_EDITOR_MESSAGE.save }
	| { type: typeof AD_BANNER_EDITOR_MESSAGE.ready };

// 대상을 현재 오리진으로 못박는다. "*"를 쓰면 레이아웃과 배경 파일이 아무 문서에나 실려 나간다.
export const postAdBannerEditorMessage = (
	target: Window,
	message: AdBannerEditorMessage
): void => {
	target.postMessage(message, window.location.origin);
};

// 판별자만 본다. 실제 신뢰 경계는 수신부의 origin·source 검사이고, 레이아웃 값 자체는 저장할 때
// 서버 zod가 다시 검증한다.
export const readAdBannerEditorMessage = (
	data: unknown
): AdBannerEditorMessage | null => {
	const type = (data as { type?: unknown } | null | undefined)?.type;
	const known =
		type === AD_BANNER_EDITOR_MESSAGE.init ||
		type === AD_BANNER_EDITOR_MESSAGE.ready ||
		type === AD_BANNER_EDITOR_MESSAGE.save;

	return known ? (data as AdBannerEditorMessage) : null;
};

const toObjectUrl = (file: File | undefined): string | undefined =>
	file ? URL.createObjectURL(file) : undefined;

// 배경 이미지 해석: 아직 업로드되지 않은 File은 이 문서에서 objectURL로 만들고(그래야 새창에서도
// 열린다), 이미 올라간 이미지는 URL을 그대로 쓴다. 새로 고른 파일이 기존 URL보다 우선한다.
export const useAdBannerBackgroundUrls = ({
	backgroundUrls,
	files,
}: AdBannerEditorSources): Partial<Record<AdBannerSlot, string>> => {
	const horizontalFile = files?.horizontal;
	const verticalFile = files?.vertical;
	const [fileUrls, setFileUrls] = useState<
		Partial<Record<AdBannerSlot, string>>
	>({});

	useEffect(() => {
		const created = {
			horizontal: toObjectUrl(horizontalFile),
			vertical: toObjectUrl(verticalFile),
		};
		setFileUrls(created);

		return () => {
			for (const url of Object.values(created)) {
				if (url) {
					URL.revokeObjectURL(url);
				}
			}
		};
	}, [horizontalFile, verticalFile]);

	return {
		horizontal: fileUrls.horizontal ?? backgroundUrls?.horizontal,
		vertical: fileUrls.vertical ?? backgroundUrls?.vertical,
	};
};

interface AdBannerEditorLauncherProps extends AdBannerEditorSources {
	layout: AdBannerLayout | null;
	onChange: (layout: AdBannerLayout) => void;
}

const POPUP_NAME = "bambi-ad-banner-editor";
const POPUP_FEATURES = "width=1120,height=880";
const DESKTOP_QUERY = "(min-width: 1024px)";

export function AdBannerEditorLauncher({
	backgroundUrls,
	files,
	layout,
	onChange,
}: AdBannerEditorLauncherProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	// 새창에 건 message 리스너를 걷어내는 함수. 창을 두 번 열거나 폼을 떠날 때 쌓이지 않게 한다.
	const stopListeningRef = useRef<(() => void) | null>(null);
	// 새창이 열려 있는 동안 부모 폼이 다시 렌더될 수 있다. 클릭 시점의 onChange를 붙들고 있으면
	// 그 사이의 다른 필드 편집이 저장과 함께 되돌아간다.
	const onChangeRef = useRef(onChange);
	const editorLayout = layout ?? createEmptyAdBannerLayout();
	const resolvedBackgroundUrls = useAdBannerBackgroundUrls({
		backgroundUrls,
		files,
	});

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => () => stopListeningRef.current?.(), []);

	const handleSave = (next: AdBannerLayout) => {
		onChange(next);
		setIsDialogOpen(false);
	};

	const openInPopup = (): boolean => {
		const popup = window.open(
			AD_BANNER_EDITOR_PATH,
			POPUP_NAME,
			POPUP_FEATURES
		);

		if (!popup) {
			return false;
		}

		stopListeningRef.current?.();

		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin || event.source !== popup) {
				return;
			}

			const message = readAdBannerEditorMessage(event.data);

			if (message?.type === AD_BANNER_EDITOR_MESSAGE.ready) {
				postAdBannerEditorMessage(popup, {
					backgroundUrls,
					files,
					layout: editorLayout,
					type: AD_BANNER_EDITOR_MESSAGE.init,
				});
				return;
			}

			if (message?.type === AD_BANNER_EDITOR_MESSAGE.save) {
				onChangeRef.current(message.layout);
				stopListening();
			}
		};

		const stopListening = () => {
			window.removeEventListener("message", handleMessage);
			stopListeningRef.current = null;
		};

		window.addEventListener("message", handleMessage);
		stopListeningRef.current = stopListening;

		return true;
	};

	const handleOpen = () => {
		// 데스크톱은 새창, 모바일은 전체화면 다이얼로그. 팝업이 차단되면(window.open이 null)
		// 다이얼로그로 폴백한다 — 폴백이 없으면 버튼이 아무 반응 없는 것처럼 보인다.
		if (window.matchMedia(DESKTOP_QUERY).matches && openInPopup()) {
			return;
		}

		setIsDialogOpen(true);
	};

	return (
		<>
			<Button onClick={handleOpen} type="button" variant="outline">
				<SquarePen data-icon="inline-start" />
				배너 문구 편집
			</Button>
			<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
				<DialogContent className="inset-2 max-w-none translate-x-0 translate-y-0 gap-4 p-4 md:inset-6 md:p-6">
					<DialogTitle className="sr-only">광고 배너 편집</DialogTitle>
					<AdBannerEditor
						backgroundUrls={resolvedBackgroundUrls}
						initialLayout={editorLayout}
						onCancel={() => setIsDialogOpen(false)}
						onSave={handleSave}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
