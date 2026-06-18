"use client";

import { useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export type LoginMode = "sign-in" | "sign-up";

interface LoginClientProps {
	initialMode: LoginMode;
}

export default function LoginClient({ initialMode }: LoginClientProps) {
	const [showSignIn, setShowSignIn] = useState(initialMode === "sign-in");

	useEffect(() => {
		setShowSignIn(initialMode === "sign-in");
	}, [initialMode]);

	return showSignIn ? (
		<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
	) : (
		<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
	);
}
