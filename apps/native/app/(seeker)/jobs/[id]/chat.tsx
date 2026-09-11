import { useMutation, useQuery } from "@tanstack/react-query";
import { type Href, router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
} from "@/src/components/bambi-screen";
import { startChatErrorMessage } from "@/src/lib/chat/chat-errors";
import { useVisitor } from "@/src/lib/guest-store";
import { orpc } from "@/src/lib/orpc";
import { resolveChatPreflight } from "@/src/lib/seeker/chat-preflight";
import { useIdentityVerification } from "@/src/lib/use-identity-verification";

function Step({
	description,
	label,
	state,
}: {
	description: string;
	label: string;
	state: string;
}) {
	return (
		<Surface className="gap-2 rounded-lg p-4" variant="secondary">
			<View className="flex-row items-center justify-between gap-3">
				<Text className="font-semibold text-foreground">{label}</Text>
				<Pill tone={state === "확인됨" ? "success" : "neutral"}>{state}</Pill>
			</View>
			<Text className="text-muted text-sm">{description}</Text>
		</Surface>
	);
}

export default function ChatPreflightScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const visitor = useVisitor();
	const job = useQuery(orpc.bambi.jobs.getById.queryOptions({ input: { id } }));
	const mine = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: visitor.state === "member",
	});
	const blocks = useQuery({
		...orpc.bambi.blocks.listMine.queryOptions(),
		enabled: visitor.state === "member",
	});
	const identity = useIdentityVerification();
	const start = useMutation(
		orpc.bambi.chats.startFromJobPost.mutationOptions({
			onSuccess: (room) =>
				router.replace({
					pathname: "/(seeker)/chats/[id]",
					params: { id: room.id },
				} as unknown as Href),
		})
	);
	if (job.isPending || visitor.state === "pending") {
		return <LoadingState label="보호 확인 정보를 준비하고 있어요." />;
	}
	if (job.isError || !job.data) {
		return <ErrorState onRetry={() => job.refetch()} />;
	}
	const profile = mine.data?.bambiProfile;
	const blocked = blocks.data?.some(
		(item) => item.blockedUserId === job.data.createdByUserId
	);
	const { canContinue, hasProfile, signedIn, verified } = resolveChatPreflight({
		blocked: Boolean(blocked),
		profileRole: profile?.role ?? null,
		verified: Boolean(profile?.isPhoneVerified),
		visitorState: visitor.state,
	});
	let action = (
		<Button onPress={() => router.push("/login" as Href)}>
			<Button.Label>로그인</Button.Label>
		</Button>
	);
	if (signedIn && !verified && identity.isAvailable) {
		action = (
			<Button
				isDisabled={identity.isPending}
				onPress={identity.startIdentityVerification}
			>
				<Button.Label>휴대폰 본인인증</Button.Label>
			</Button>
		);
	} else if (signedIn) {
		action = (
			<Button
				isDisabled={!canContinue || start.isPending}
				onPress={() => start.mutate({ jobPostId: id })}
			>
				<Button.Label>
					{start.isPending ? "채팅방 만드는 중" : "밤비알바 채팅으로 이동"}
				</Button.Label>
			</Button>
		);
	}
	return (
		<BambiScreen>
			<Stack.Screen options={{ title: "채팅 안전 확인" }} />
			<View className="gap-1">
				<Text className="font-bold text-3xl text-foreground">
					연락처 보호 확인
				</Text>
				<Text className="text-muted text-sm">
					채팅 전에 안전 상태를 확인해요.
				</Text>
			</View>
			<Step
				description={
					signedIn
						? "로그인 세션을 확인했어요."
						: "로그인 후 채팅을 시작할 수 있어요."
				}
				label="로그인 상태"
				state={signedIn ? "확인됨" : "필요"}
			/>
			<Step
				description={
					hasProfile
						? "구직자 프로필을 확인했어요."
						: "구직자 프로필이 필요해요."
				}
				label="구직자 프로필"
				state={hasProfile ? "확인됨" : "필요"}
			/>
			<Step
				description={
					verified
						? "휴대폰 인증 상태를 확인했어요."
						: "연락처 보호를 위해 휴대폰 인증이 필요해요."
				}
				label="휴대폰 인증"
				state={verified ? "확인됨" : "확인 필요"}
			/>
			<Step
				description={
					blocked
						? "차단을 해제해야 대화할 수 있어요."
						: "공개 상태와 업체 제재 여부는 서버가 다시 확인해요."
				}
				label="공고 안전 상태"
				state={blocked ? "차단됨" : "확인됨"}
			/>
			<Text className="text-muted text-sm leading-5">
				면접 일정이 확정되기 전까지 전화번호와 외부 연락처는 공개되지 않아요.
			</Text>
			{start.isError ? (
				<Text className="text-danger text-sm">
					{startChatErrorMessage(start.error)}
				</Text>
			) : null}
			{action}
		</BambiScreen>
	);
}
