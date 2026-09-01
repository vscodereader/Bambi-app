import type { Metadata } from "next";
import { Suspense } from "react";

import { AppVerifyRelay } from "./app-verify-relay";

export const metadata: Metadata = {
	// 앱이 시스템 브라우저로 여는 중계 화면이라 검색엔진에 노출될 이유가 없다.
	robots: { follow: false, index: false },
	title: "본인인증",
};

// "use client" 파일에서는 metadata를 내보낼 수 없어 서버 컴포넌트가 껍데기를 맡는다.
// 릴레이는 useSearchParams를 쓰므로 Suspense가 필요하다.
export default function AppVerifyPage() {
	return (
		<Suspense>
			<AppVerifyRelay />
		</Suspense>
	);
}
