import fp from "fastify-plugin";
import { attachBambiRealtime } from "../bambi-realtime";

// socket.io를 기저 HTTP 서버에 부착하고 preClose 정리 훅을 건다(루트 스코프 유지).
export const realtimePlugin = fp(
	(app, _opts, done) => {
		attachBambiRealtime(app);
		done();
	},
	{ name: "bambi-realtime" }
);
