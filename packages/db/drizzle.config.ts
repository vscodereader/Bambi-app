import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

export default defineConfig({
	schema: [
		"./src/schema/auth.ts",
		"./src/schema/bambi.ts",
		"./src/schema/todo.ts",
	],
	out: "./src/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
});
