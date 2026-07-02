import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Surface } from "heroui-native";
import { Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	LoadingState,
	Pill,
	StateCard,
} from "@/src/components/bambi-screen";
import { orpc } from "@/src/lib/orpc";

export default function ModeratorUsersScreen() {
	const usersQuery = useQuery(
		orpc.bambi.moderation.listUsers.queryOptions({ input: { limit: 50 } })
	);
	const setStatusMutation = useMutation(
		orpc.bambi.moderation.setUserStatus.mutationOptions({
			onSuccess: () => usersQuery.refetch(),
		})
	);

	if (usersQuery.isLoading) {
		return <LoadingState label="사용자 목록을 불러오고 있습니다." />;
	}

	if (usersQuery.isError) {
		return <ErrorState onRetry={() => usersQuery.refetch()} />;
	}

	const users = usersQuery.data ?? [];

	return (
		<BambiScreen>
			<BambiHeader
				description="사용자 계정을 경고, 정지, 활성 상태로 전환합니다."
				title="사용자 관리"
			/>
			{users.length === 0 ? (
				<StateCard
					description="관리할 밤비 프로필이 없습니다."
					title="사용자가 없습니다"
				/>
			) : (
				<View className="gap-3">
					{users.map((user) => (
						<Surface
							className="gap-3 rounded-lg p-4"
							key={user.userId}
							variant="secondary"
						>
							<View className="flex-row flex-wrap gap-2">
								<Pill tone={user.status === "active" ? "success" : "warning"}>
									{user.status}
								</Pill>
								<Pill>{user.role}</Pill>
							</View>
							<Text className="font-semibold text-foreground" selectable>
								{user.displayName ?? user.email}
							</Text>
							<Text className="text-muted text-sm" selectable>
								{user.email}
							</Text>
							<View className="flex-row flex-wrap gap-2">
								{(["warned", "suspended", "active"] as const).map((status) => (
									<Button
										isDisabled={setStatusMutation.isPending}
										key={status}
										onPress={() =>
											setStatusMutation.mutate({
												reason: "모바일 사용자 상태 변경",
												status,
												targetUserId: user.userId,
											})
										}
										size="sm"
										variant={status === "active" ? "primary" : "secondary"}
									>
										<Button.Label>{status}</Button.Label>
									</Button>
								))}
							</View>
						</Surface>
					))}
				</View>
			)}
		</BambiScreen>
	);
}
