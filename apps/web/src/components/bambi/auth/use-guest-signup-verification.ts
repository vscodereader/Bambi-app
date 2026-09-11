"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	resolveGuestSignupRestoration,
	type SignupStep,
} from "@/lib/bambi/guest-signup";
import { orpc } from "@/utils/orpc";

export function useGuestSignupVerification(isSignUp: boolean) {
	const [step, setStep] = useState<SignupStep>("verify");
	const [verifiedId, setVerifiedId] = useState<string | null>(null);
	const [reuseGuestVerification, setReuseGuestVerification] = useState(false);
	const query = useQuery({
		...orpc.bambi.onboarding.getGuestSignupStatus.queryOptions(),
		enabled: isSignUp && !verifiedId && !reuseGuestVerification,
	});
	const status = query.data?.status;

	useEffect(() => {
		if (!(isSignUp && status)) {
			return;
		}
		const restoration = resolveGuestSignupRestoration(status);
		if (restoration) {
			setReuseGuestVerification(restoration.reuseGuestVerification);
			setStep(restoration.step);
		}
	}, [isSignUp, status]);

	const acceptRealVerification = (identityVerificationId: string) => {
		setVerifiedId(identityVerificationId);
		setReuseGuestVerification(false);
		setStep("form");
	};

	const acceptGuestVerification = () => {
		setVerifiedId(null);
		setReuseGuestVerification(true);
		setStep("form");
	};

	const reset = () => {
		setVerifiedId(null);
		setReuseGuestVerification(false);
		setStep("verify");
	};

	return {
		acceptGuestVerification,
		acceptRealVerification,
		isChecking:
			isSignUp && !verifiedId && !reuseGuestVerification && query.isPending,
		reset,
		reuseGuestVerification,
		status,
		step,
		verifiedId,
	};
}
