import type { FastifyPluginCallback } from "fastify";

export const healthPlugin: FastifyPluginCallback = (app, _opts, done) => {
	app.get("/", async () => "OK");
	done();
};
