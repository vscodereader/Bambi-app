import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { authClient } from "@/lib/auth-client";
import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
	StateCard,
} from "@/src/components/bambi-screen";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { orpc } from "@/src/lib/orpc";

export default function OnboardingScreen() {
	const queryClient = useQueryClient();
	const session = authClient.useSession();
	const [displayName, setDisplayName] = useState("");
	const [phoneNumber, setPhoneNumber] = useState("");
	const [message, setMessage] = useState<null | string>(null);
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	const profile = mineQuery.data?.bambiProfile ?? null;
	const profileInput = {
		displayName: displayName.trim() || undefined,
		phoneNumber: phoneNumber.trim() || undefined,
	};
	const invalidateProfile = async () => {
		await queryClient.invalidateQueries({
			queryKey: orpc.bambi.onboarding.getMine.queryKey(),
		});
	};
	const createJobSeekerMutation = useMutation(
		orpc.bambi.onboarding.createJobSeekerProfile.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: async () => {
				await invalidateProfile();
				router.replace("/(seeker)" as Href);
			},
		})
	);
	const createEmployerMutation = useMutation(
		orpc.bambi.onboarding.createEmployerProfile.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: async () => {
				await invalidateProfile();
				router.replace("/(employer)" as Href);
			},
		})
	);
	const updateProfileMutation = useMutation(
		orpc.bambi.onboarding.updateMyProfile.mutationOptions({
			onError: (error) => setMessage(error.message),
			onSuccess: async () => {
				setMessage("프로필을 저장했습니다.");
				await invalidateProfile();
			},
		})
	);

	useEffect(() => {
		if (!session.data?.user) {
			return;
		}

		setDisplayName(session.data.user.name ?? "");
		setPhoneNumber(profile?.phoneNumber ?? "");
	}, [profile, session.data?.user]);

	if (session.isPending || mineQuery.isLoading) {
		return <LoadingState label="프로필 정보를 확인하고 있습니다." />;
	}

	if (!session.data?.user) {
		return (
			<BambiScreen>
				<StateCard
					action={
						<Button onPress={() => router.replace("/login" as Href)}>
							<Button.Label>로그인</Button.Label>
						</Button>
					}
					description="밤비알바 프로필을 만들려면 먼저 로그인해 주세요."
					title="로그인이 필요합니다"
				/>
			</BambiScreen>
		);
	}

	if (mineQuery.isError) {
		return <ErrorState onRetry={() => mineQuery.refetch()} />;
	}

	return (
		<BambiScreen>
			<BambiHeader
				description="표시명과 연락처는 플랫폼 정책에 따라 보호됩니다."
				title="프로필 설정"
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<TextField>
					<Input
						autoComplete="name"
						onChangeText={setDisplayName}
						placeholder="표시명"
						textContentType="name"
						value={displayName}
					/>
				</TextField>
				<TextField>
					<Input
						autoComplete="tel"
						keyboardType="phone-pad"
						onChangeText={setPhoneNumber}
						placeholder="010-0000-0000"
						textContentType="telephoneNumber"
						value={phoneNumber}
					/>
				</TextField>
				{message ? (
					<Text className="text-sm text-warning" selectable>
						{message}
					</Text>
				) : null}
				{profile ? (
					<View className="gap-3">
						<Button
							isDisabled={updateProfileMutation.isPending}
							onPress={() => updateProfileMutation.mutate(profileInput)}
						>
							<Button.Label>프로필 저장</Button.Label>
						</Button>
						<Button
							onPress={() =>
								router.replace(
									getNativeHomeRoute(profile.role as NativeProfileRole) as Href
								)
							}
							variant="secondary"
						>
							<Button.Label>내 화면으로 이동</Button.Label>
						</Button>
					</View>
				) : (
					<View className="gap-3">
						<Button
							isDisabled={createJobSeekerMutation.isPending}
							onPress={() => createJobSeekerMutation.mutate(profileInput)}
						>
							<Button.Label>구직자로 시작</Button.Label>
						</Button>
						<Button
							isDisabled={createEmployerMutation.isPending}
							onPress={() => createEmployerMutation.mutate(profileInput)}
							variant="secondary"
						>
							<Button.Label>구인자로 시작</Button.Label>
						</Button>
					</View>
				)}
			</Surface>
		</BambiScreen>
	);
}
