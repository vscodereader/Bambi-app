import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// 테스트는 apps/server/.env를 그대로 읽는다. 버킷이 설정돼 있으면 업로드 인텐트가
		// 실제 GCS 서명을 시도해 네트워크를 타므로, 테스트에서만 비워 로컬 플레이스홀더로 폴백시킨다.
		env: {
			GCS_PUBLIC_BUCKET: "",
		},
	},
});
