import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: { "@": path.resolve(import.meta.dirname, "src") },
	},
	// 리포 루트에서 --config로 돌려도 packages/auth 기준이 되게 root를 고정한다.
	root: import.meta.dirname,
	test: {
		include: ["test/**/*.test.ts"],
	},
});
