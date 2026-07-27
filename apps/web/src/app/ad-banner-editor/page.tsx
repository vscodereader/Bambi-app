import type { Metadata } from "next";
import { resolveEmployerAccess } from "@/lib/bambi/require-role";
import { AdBannerEditorWindow } from "./ad-banner-editor-window";

export const metadata: Metadata = {
	// 팝업 전용 화면이라 검색엔진에 노출될 이유가 없다(게이트로 어차피 막히지만 명시한다).
	robots: { follow: false, index: false },
	title: "광고 배너 편집",
};

// 공고 등록 폼이 window.open으로 여는 배너 에디터 창. 앱 셸(헤더·내비·계정 배너)을 벗기려고
// app/employer/ 밖에 둔다 — route group으로는 부모 레이아웃을 벗을 수 없다.
// 그래서 employer 레이아웃이 하던 역할 게이트를 여기서 직접 건다. 이게 빠지면 누구나 이
// 화면을 열 수 있다(운영자가 열면 기존처럼 자기 홈으로 되돌아간다).
export default async function AdBannerEditorPage() {
	await resolveEmployerAccess();

	return <AdBannerEditorWindow />;
}
