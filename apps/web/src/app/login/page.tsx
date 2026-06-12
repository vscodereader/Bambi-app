import LoginClient, { type LoginMode } from "./login-client";

interface LoginPageProps {
	searchParams: Promise<{
		mode?: string | string[];
	}>;
}

const getLoginMode = (mode: string | string[] | undefined): LoginMode => {
	const selectedMode = Array.isArray(mode) ? mode[0] : mode;

	return selectedMode === "sign-up" ? "sign-up" : "sign-in";
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const params = await searchParams;

	return <LoginClient initialMode={getLoginMode(params.mode)} />;
}
