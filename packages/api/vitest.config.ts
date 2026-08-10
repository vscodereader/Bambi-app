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
		// 여러 파일이 공유 dev DB의 bambi_site_settings 단일 행을 서로 다른 값으로 변형해
		// 병렬 실행 시 서로의 설정을 덮어써 간헐 실패한다. 파일 단위 직렬로 막는다.
		fileParallelism: false,
		include: ["test/**/*.test.ts"],
	},
});
