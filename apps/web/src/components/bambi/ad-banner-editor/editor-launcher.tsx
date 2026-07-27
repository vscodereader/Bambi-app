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
	createEmptyAdBannerLayout,
} from "@/lib/bambi/ad-banner-layout";
import type { JobAdBannerUsage } from "@/lib/bambi/job-ad-banner-spec";
import { revokeMediaItemPreview } from "@/lib/bambi/job-media-item";
import type { JobFormMediaItem } from "@/lib/bambi-job-form";
import { AdBannerEditor } from "./ad-banner-editor";

// 새창 라우트. 부모 폼과 에디터 창이 같은 오리진이어야 postMessage 핸드셰이크가 성립한다.
export const AD_BANNER_EDITOR_PATH = "/ad-banner-editor";

// 에디터가 다루는 배너 이미지 두 장. 폼 JobFormMedia에서 배너 슬롯만 떼어낸 모양이라 결과를
// 폼 상태에 그대로 되꽂을 수 있다 — 그래야 등록 버튼 잠금(useRequiredBannerGate), 필수 검증
// (validateJobForm), 제출 시 GCS 업로드(resolveJobPostMediaForSubmit)가 한 줄도 안 바뀌고 돈다.
export interface AdBannerEditorMedia {
	adHorizontal: JobFormMediaItem | null;
	adVertical: JobFormMediaItem | null;
}

export interface AdBannerEditorResult {
	layout: AdBannerLayout;
	media: AdBannerEditorMedia;
}

// 부모 폼 ↔ 에디터 창 메시지 계약.
//   에디터 → 부모: ready   (마운트 완료. 그전에는 메시지를 받을 수 없다)
//   부모 → 에디터: init    (레이아웃 + 배너 이미지 + 상품이 요구하는 슬롯)
//   에디터 → 부모: save    (편집 결과: 레이아웃 + 배너 이미지)
export const AD_BANNER_EDITOR_MESSAGE = {
	init: "ad-banner-editor:init",
	ready: "ad-banner-editor:ready",
	save: "ad-banner-editor:save",
} as const;

// requiredUsages는 부모가 이미 상품 previewTemplate으로 계산해 갖고 있다. 에디터 창에서 상품
// 카탈로그를 다시 조회하면 같은 값을 두 곳에서 유도하게 되고, 로딩 동안 슬롯이 비어 보인다.
export type AdBannerEditorInit = AdBannerEditorResult & {
	requiredUsages: JobAdBannerUsage[];
	type: typeof AD_BANNER_EDITOR_MESSAGE.init;
};

export type AdBannerEditorMessage =
	| AdBannerEditorInit
	| (AdBannerEditorResult & { type: typeof AD_BANNER_EDITOR_MESSAGE.save })
	| { type: typeof AD_BANNER_EDITOR_MESSAGE.ready };

// 대상을 현재 오리진으로 못박는다. "*"를 쓰면 레이아웃과 배너 파일이 아무 문서에나 실려 나간다.
export const postAdBannerEditorMessage = (
	target: Window,
	message: AdBannerEditorMessage
): void => {
	target.postMessage(message, window.location.origin);
};

// 판별자만 본다. 실제 신뢰 경계는 수신부의 origin·source 검사이고, 레이아웃·미디어 값 자체는
// 저장할 때 서버 zod가 다시 검증한다.
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

// blob URL은 만든 문서에 묶여 있어 다른 창에서는 열리지 않는다. File은 structured clone 되므로
// 파일만 보내고 previewUrl은 떼어 낸다. storageKey가 있는 항목의 previewUrl은 공개 GCS URL이라
// 그대로 넘어간다.
const withoutBlobPreview = (
	item: JobFormMediaItem | null
): JobFormMediaItem | null =>
	item?.previewUrl?.startsWith("blob:")
		? { ...item, previewUrl: undefined }
		: item;

// 받는 문서에서 previewUrl을 다시 만든다. 위 변환의 역방향이라 init·save 양쪽에 같이 건다.
const withRecreatedPreview = (
	item: JobFormMediaItem | null
): JobFormMediaItem | null =>
	item && !item.previewUrl && item.file
		? { ...item, previewUrl: URL.createObjectURL(item.file) }
		: item;

export const toTransferableAdBannerMedia = (
	media: AdBannerEditorMedia
): AdBannerEditorMedia => ({
	adHorizontal: withoutBlobPreview(media.adHorizontal),
	adVertical: withoutBlobPreview(media.adVertical),
});

export const fromTransferableAdBannerMedia = (
	media: AdBannerEditorMedia
): AdBannerEditorMedia => ({
	adHorizontal: withRecreatedPreview(media.adHorizontal),
	adVertical: withRecreatedPreview(media.adVertical),
});

// 창을 넘어온 미디어가 자리를 뜰 때 여기서 만든 objectURL을 놓아준다. 안 놓으면 원본 파일이
// 문서 수명 내내 메모리에 남는다.
export const revokeAdBannerEditorMedia = (
	media: AdBannerEditorMedia | null | undefined
): void => {
	revokeMediaItemPreview(media?.adHorizontal);
	revokeMediaItemPreview(media?.adVertical);
};

interface AdBannerEditorLauncherProps {
	layout: AdBannerLayout | null;
	media: AdBannerEditorMedia;
	onChange: (result: AdBannerEditorResult) => void;
	// 선택한 노출 상품이 쓰는 배너 슬롯. 에디터가 어떤 슬롯을 편집시킬지 정한다.
	requiredUsages: JobAdBannerUsage[];
}

const POPUP_NAME = "bambi-ad-banner-editor";
const POPUP_FEATURES = "width=1120,height=880";
const DESKTOP_QUERY = "(min-width: 1024px)";

export function AdBannerEditorLauncher({
	layout,
	media,
	onChange,
	requiredUsages,
}: AdBannerEditorLauncherProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	// 새창에 건 message 리스너를 걷어내는 함수. 창을 두 번 열거나 폼을 떠날 때 쌓이지 않게 한다.
	const stopListeningRef = useRef<(() => void) | null>(null);
	// 새창이 열려 있는 동안 부모 폼이 다시 렌더될 수 있다. 클릭 시점의 onChange를 붙들고 있으면
	// 그 사이의 다른 필드 편집이 저장과 함께 되돌아간다.
	const onChangeRef = useRef(onChange);
	const editorLayout = layout ?? createEmptyAdBannerLayout();

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	useEffect(() => () => stopListeningRef.current?.(), []);

	const handleSave = (result: AdBannerEditorResult) => {
		onChange(result);
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
					layout: editorLayout,
					media: toTransferableAdBannerMedia(media),
					requiredUsages,
					type: AD_BANNER_EDITOR_MESSAGE.init,
				});
				return;
			}

			if (message?.type === AD_BANNER_EDITOR_MESSAGE.save) {
				// 돌아온 항목의 previewUrl은 새창에서 떼여 있으므로 이 문서에서 다시 만든다. 자리를
				// 내주는 이전 blob은 놓아준다 — 배너 이미지는 이제 이 경로로만 바뀌므로 다른 곳이
				// 그 URL을 들고 있지 않다.
				revokeAdBannerEditorMedia(media);
				onChangeRef.current({
					layout: message.layout,
					media: fromTransferableAdBannerMedia(message.media),
				});
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
				배너 이미지·문구 편집
			</Button>
			<Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
				{/* inset으로 폭을 정하므로 base의 w-[420px]를 w-auto로 풀어야 한다. max-w-none만
				    걸면 max-w-[92vw] 안전망만 사라지고 420px 고정폭이 남아, 375~412px 휴대폰에서
				    다이얼로그 오른쪽이 화면 밖으로 나간다(fixed라 스크롤로 닿지도 않는다).
				    모바일에선 이 다이얼로그가 유일한 편집 경로다. */}
				<DialogContent className="inset-2 w-auto max-w-none translate-x-0 translate-y-0 gap-4 p-4 md:inset-6 md:p-6">
					<DialogTitle className="sr-only">광고 배너 편집</DialogTitle>
					{/* 같은 문서라 blob previewUrl이 그대로 통한다 — 변환은 창을 넘는 경로에만 건다. */}
					<AdBannerEditor
						initialLayout={editorLayout}
						initialMedia={media}
						onCancel={() => setIsDialogOpen(false)}
						onSave={handleSave}
						requiredUsages={requiredUsages}
					/>
				</DialogContent>
			</Dialog>
		</>
	);
}
