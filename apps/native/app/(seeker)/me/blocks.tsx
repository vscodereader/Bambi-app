import { useMutation, useQuery } from "@tanstack/react-query";
import { Avatar, Button, Skeleton, Surface } from "heroui-native";
import { Alert, Text, View } from "react-native";

import {
	BambiHeader,
	BambiScreen,
	ErrorState,
	formatDateTime,
	StateCard,
} from "@/src/components/bambi-screen";
import { MemberOnly } from "@/src/components/member-only";
import { orpc, queryClient } from "@/src/lib/orpc";

// 차단 목록 화면. 차단 "생성"은 채팅방 쪽 몫이라 여기서는 조회와 해제만 한다.
// name은 서버(resolveVisibleDisplayName)가 이미 "탈퇴한 회원"/"알 수 없는 사용자"까지
// 처리한 표시값이라 화면에서 가공하지 않는다.
function SeekerBlocksInner() {
	const query = useQuery(orpc.bambi.blocks.listMine.queryOptions());
	const unblock = useMutation(
		orpc.bambi.blocks.unblockUser.mutationOptions({
			onError: (error) => {
				Alert.alert(
					"차단 해제에 실패했어요",
					error.message || "잠시 후 다시 시도해 주세요."
				);
			},
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.blocks.listMine.key(),
				});
				// 차단 상태는 chats.listMine 출력에도 실려 채팅 탭이 "차단됨" 배지를 그린다.
				// 이 화면은 탭 위에 push되는 스택이라 뒤로 가도 채팅 탭이 재마운트되지 않으므로
				// (RN에는 window focus refetch도 없다) 채팅 캐시까지 함께 무효화한다.
				await queryClient.invalidateQueries({
					queryKey: orpc.bambi.chats.key(),
				});
				Alert.alert("차단을 해제했어요");
			},
		})
	);

	const blocks = query.data ?? [];

	// ErrorState는 스스로 BambiScreen(=flex-1 Container)을 감싸므로 다른 화면과 같이
	// 최상단 early return으로만 쓴다. 본문 안에 중첩하면 auto 높이 래퍼 밑의 flex-1이
	// 0으로 접혀 "다시 시도"에 손이 닿지 않는다.
	if (query.isError) {
		return (
			<ErrorState
				onRetry={() => query.refetch()}
				title="차단 목록을 불러오지 못했어요"
			/>
		);
	}

	return (
		<BambiScreen>
			<BambiHeader
				description="차단한 상대를 확인하고 해제할 수 있어요. 차단 중에는 서로 채팅을 주고받을 수 없어요."
				title="차단한 상대"
			/>
			{renderBody()}
		</BambiScreen>
	);

	function renderBody() {
		// 전체화면 LoadingState 대신 스켈레톤 — 헤더가 먼저 자리를 잡아 화면이 튀지 않는다.
		if (query.isPending) {
			return (
				<View className="gap-3">
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
					<Skeleton className="h-20 rounded-lg" />
				</View>
			);
		}

		if (blocks.length === 0) {
			return (
				<StateCard
					description="채팅에서 차단한 상대가 여기에 표시됩니다."
					title="차단한 상대가 없어요"
				/>
			);
		}

		return (
			<View className="gap-3">
				{blocks.map((block) => {
					// 웹과 같은 규칙 — 지금 해제 중인 행만 비활성화한다.
					const isRowPending =
						unblock.isPending &&
						unblock.variables?.blockedUserId === block.blockedUserId;

					return (
						<Surface
							className="rounded-lg p-4"
							key={block.blockedUserId}
							variant="secondary"
						>
							<View className="flex-row items-center gap-3">
								<Avatar size="md">
									<Avatar.Fallback>{block.name.slice(0, 1)}</Avatar.Fallback>
								</Avatar>
								<View className="min-w-0 flex-1 gap-0.5">
									<Text className="font-semibold text-foreground" selectable>
										{block.name}
									</Text>
									<Text className="text-muted text-xs" selectable>
										{formatDateTime(block.createdAt)} 차단
									</Text>
								</View>
								<Button
									// 행마다 반복되는 버튼이라 스크린리더가 구분할 수 있게 이름을 넣는다.
									accessibilityLabel={`${block.name} 님 차단 해제`}
									isDisabled={isRowPending}
									onPress={() =>
										Alert.alert(
											"차단을 해제할까요?",
											`${block.name} 님의 차단을 해제하면 다시 채팅을 주고받을 수 있어요.`,
											[
												{ style: "cancel", text: "취소" },
												{
													onPress: () =>
														unblock.mutate({
															blockedUserId: block.blockedUserId,
														}),
													style: "destructive",
													text: "차단 해제",
												},
											]
										)
									}
									size="sm"
									variant="secondary"
								>
									<Button.Label>
										{isRowPending ? "해제 중" : "차단 해제"}
									</Button.Label>
								</Button>
							</View>
						</Surface>
					);
				})}
			</View>
		);
	}
}

export default function SeekerBlocksScreen() {
	return (
		<MemberOnly>
			<SeekerBlocksInner />
		</MemberOnly>
	);
}
