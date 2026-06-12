"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import SignInForm from "@/components/sign-in-form";
import SignUpForm from "@/components/sign-up-form";

export default function LoginPage() {
	const searchParams = useSearchParams();
	const mode = searchParams.get("mode");
	const [showSignIn, setShowSignIn] = useState(mode !== "sign-up");

	useEffect(() => {
		setShowSignIn(mode !== "sign-up");
	}, [mode]);

	return showSignIn ? (
		<SignInForm onSwitchToSignUp={() => setShowSignIn(false)} />
	) : (
		<SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
	);
}
