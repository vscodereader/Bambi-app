"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import {
	notFound,
	useParams,
	useRouter,
	useSearchParams,
} from "next/navigation";
import { useState } from "react";
import {
	type ChatPreflightStep,
	SeekerChatPreflight,
} from "@/components/bambi/screens/seeker-chat-preflight";
import { authClient } from "@/lib/auth-client";
import { isApiJobId, useMarketplaceJob } from "@/lib/bambi/api-jobs";
import { orpc } from "@/utils/orpc";

const getErrorCode = (error: Error): string | undefined =>
	"code" in error && typeof error.code === "string" ? error.code : undefined;

const getChatStartErrorMessage = (error: Error): string => {
	const errorCode = getErrorCode(error);

	if (errorCode === "UNAUTHORIZED") {
		return "로그인 후 채팅을 시작할 수 있어요.";
	}

	if (errorCode === "FORBIDDEN") {
		return "채팅을 시작할 수 없어요. 구직자 프로필, 휴대폰 인증, 계정 상태를 확인해 주세요.";
	}

	return "채팅방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
};

const toStepState = (confirmed: boolean, fallback: string): string =>
	confirmed ? "확인됨" : fallback;

export default function SeekerJobChatPreflightPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { id } = useParams<{ id: string }>();
	const { isLoading: isJobLoading, job } = useMarketplaceJob(id);
	const session = authClient.useSession();
	const [feedback, setFeedback] = useState<null | string>(null);
	const isLoggedIn = Boolean(session.data?.user);
	const profileQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: isLoggedIn,
	});
	const profile = profileQuery.data?.bambiProfile;
	const hasJobSeekerProfile = profile?.role === "job_seeker";
	const isPhoneVerified = Boolean(profile?.isPhoneVerified);
	const isRealJob = isApiJobId(id);
	const startChatMutation = useMutation(
		orpc.bambi.chats.startFromJobPost.mutationOptions({
			onError: (error) => {
				setFeedback(getChatStartErrorMessage(error));
			},
			onSuccess: (room) => {
				router.push(`/seeker/chats/${room.id}` as Route);
			},
		})
	);

	if (isJobLoading) {
		return (
			<div className="mx-auto w-full px-5 py-10 text-center font-bold text-muted-foreground md:max-w-[80%] md:px-6">
				보호 확인 정보를 준비하고 있어요.
			</div>
		);
	}
	if (!job) {
		notFound();
	}
	const entry = searchParams.get("entry") === "public" ? "public" : "seeker";
	const steps: ChatPreflightStep[] = [
		{
			description: isLoggedIn
				? "로그인 세션을 확인했어요."
				: "공고 지원과 채팅은 로그인 후 이어갈 수 있어요.",
			label: "로그인 상태",
			state: toStepState(isLoggedIn, "필요"),
		},
		{
			description: hasJobSeekerProfile
				? "구직자 프로필 기준으로 상대에게 노출되는 정보를 제한해요."
				: "구직자 프로필을 만든 뒤 업체와 대화할 수 있어요.",
			label: "구직자 프로필",
			state: toStepState(hasJobSeekerProfile, "필요"),
		},
		{
			description: isPhoneVerified
				? "휴대폰 인증 상태를 확인했어요."
				: "연락처 보호와 신고 대응을 위해 휴대폰 인증이 필요해요.",
			label: "휴대폰 인증",
			state: toStepState(isPhoneVerified, "확인 필요"),
		},
		{
			description: isRealJob
				? "공개 상태와 업체 제재 여부를 서버에서 확인해요."
				: "샘플 공고라 실제 서버 검증 없이 화면 흐름만 확인해요.",
			label: "공고 안전 상태",
			state: isRealJob ? "확인됨" : "샘플",
		},
	];
	const handleContinue = () => {
		setFeedback(null);

		if (!isRealJob) {
			router.push(`/seeker/chats/${job.id}` as Route);
			return;
		}

		if (!isLoggedIn) {
			router.push("/login" as Route);
			return;
		}

		if (!hasJobSeekerProfile) {
			router.push("/onboarding" as Route);
			return;
		}

		if (!isPhoneVerified) {
			setFeedback("휴대폰 인증을 완료한 뒤 채팅을 시작할 수 있어요.");
			return;
		}

		startChatMutation.mutate({ jobPostId: id });
	};

	return (
		<SeekerChatPreflight
			entry={entry}
			feedback={feedback}
			isContinuing={startChatMutation.isPending || profileQuery.isLoading}
			job={job}
			onBack={() => router.push(`/seeker/jobs/${job.id}` as Route)}
			onContinue={handleContinue}
			steps={steps}
		/>
	);
}
