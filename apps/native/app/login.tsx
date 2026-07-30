import { useQuery } from "@tanstack/react-query";
import { type Href, router } from "expo-router";
import { Button, Input, Surface, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { authClient } from "@/lib/auth-client";
import { BambiHeader, BambiScreen } from "@/src/components/bambi-screen";
import {
	getNativeHomeRoute,
	type NativeProfileRole,
} from "@/src/lib/bambi-native";
import { orpc, queryClient } from "@/src/lib/orpc";

const devAccounts = [
	{ email: "seeker@bambi.dev", label: "구직자" },
	{ email: "owner@bambi.dev", label: "구인자" },
	{ email: "admin@bambi.dev", label: "관리자" },
] as const;

export default function LoginScreen() {
	const [email, setEmail] = useState("seeker@bambi.dev");
	const [password, setPassword] = useState("Bambi1234!");
	const [message, setMessage] = useState<null | string>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const session = authClient.useSession();
	const mineQuery = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});

	useEffect(() => {
		const role = mineQuery.data?.bambiProfile?.role;

		if (!session.data?.user || mineQuery.isLoading) {
			return;
		}

		router.replace(
			getNativeHomeRoute(role as NativeProfileRole | null) as Href
		);
	}, [
		mineQuery.data?.bambiProfile?.role,
		mineQuery.isLoading,
		session.data?.user,
	]);

	const handleSubmit = async () => {
		setMessage(null);

		if (!email.includes("@") || password.length < 8) {
			setMessage("이메일과 8자 이상 비밀번호를 확인해 주세요.");
			return;
		}

		setIsSubmitting(true);
		await authClient.signIn.email(
			{
				email: email.trim(),
				password,
			},
			{
				onError(error) {
					setMessage(
						error.error.message ??
							error.error.statusText ??
							"로그인을 처리하지 못했습니다."
					);
				},
				onSuccess() {
					queryClient.invalidateQueries();
				},
			}
		);
		setIsSubmitting(false);
	};

	return (
		<BambiScreen>
			<BambiHeader
				description="seed 계정으로 로그인하면 모바일 공고 탐색, 채팅, 구인자 관리, 관리자 흐름을 확인할 수 있습니다."
				title="밤비알바 로그인"
			/>
			<Surface className="gap-4 rounded-lg p-4" variant="secondary">
				<View className="flex-row flex-wrap gap-2">
					{devAccounts.map((account) => (
						<Pressable
							className="rounded-full bg-background px-3 py-2 active:opacity-75"
							key={account.email}
							onPress={() => {
								setEmail(account.email);
								setPassword("Bambi1234!");
							}}
						>
							<Text className="font-semibold text-foreground text-sm">
								{account.label}
							</Text>
						</Pressable>
					))}
				</View>
				<TextField>
					<Input
						autoCapitalize="none"
						autoComplete="email"
						keyboardType="email-address"
						onChangeText={setEmail}
						placeholder="email@example.com"
						textContentType="emailAddress"
						value={email}
					/>
				</TextField>
				<TextField>
					<Input
						autoComplete="password"
						onChangeText={setPassword}
						placeholder="비밀번호"
						secureTextEntry
						textContentType="password"
						value={password}
					/>
				</TextField>
				{message ? (
					<Text className="text-danger text-sm" selectable>
						{message}
					</Text>
				) : null}
				<Button isDisabled={isSubmitting} onPress={handleSubmit}>
					<Button.Label>{isSubmitting ? "로그인 중" : "로그인"}</Button.Label>
				</Button>
			</Surface>
		</BambiScreen>
	);
}
