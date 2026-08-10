import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: { "@": path.resolve(import.meta.dirname, "src") },
	},
	// 리포 루트에서 --config로 돌려도 packages/api 기준이 되게 root를 고정한다.
	root: import.meta.dirname,
	test: {
		// 테스트는 apps/server/.env를 그대로 읽는다. 버킷이 설정돼 있으면 업로드 인텐트가
		// 실제 GCS 서명을 시도해 네트워크를 타므로, 테스트에서만 비워 로컬 플레이스홀더로 폴백시킨다.
		env: {
			GCS_PUBLIC_BUCKET: "",
		},
		include: ["test/**/*.test.ts"],
	},
});
