import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Dialog, RadioGroup } from "heroui-native";
import { useState } from "react";
import { Alert, Text, View } from "react-native";

import { orpc, queryClient } from "@/src/lib/orpc";

export function UseBenefitDialog({
	itemName,
	orderId,
}: {
	itemName: string;
	orderId: string;
}) {
	const [open, setOpen] = useState(false);
	const [jobPostId, setJobPostId] = useState<string | null>(null);
	const candidates = useQuery({
		...orpc.bambi.pointShop.listUsableJobPosts.queryOptions({
			input: { orderId },
		}),
		enabled: open,
	});
	const useBenefit = useMutation(
		orpc.bambi.pointShop.useBenefit.mutationOptions({
			onError: (error) =>
				Alert.alert("혜택을 사용하지 못했어요", error.message),
			onSuccess: async () => {
				Alert.alert("혜택을 사용했어요");
				setOpen(false);
				setJobPostId(null);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.pointShop.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.attendance.key(),
					}),
					queryClient.invalidateQueries({
						queryKey: orpc.bambi.promotions.key(),
					}),
					queryClient.invalidateQueries({ queryKey: orpc.bambi.jobs.key() }),
				]);
			},
		})
	);
	return (
		<Dialog isOpen={open} onOpenChange={setOpen}>
			<Dialog.Trigger asChild>
				<Button size="sm">
					<Button.Label>사용하기</Button.Label>
				</Button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<View className="gap-4">
						<View className="gap-1">
							<Dialog.Title>혜택 사용</Dialog.Title>
							<Dialog.Description>
								{itemName} 혜택을 사용할 공고를 선택해 주세요.
							</Dialog.Description>
						</View>
						{candidates.isError ? (
							<Button onPress={() => candidates.refetch()} variant="secondary">
								<Button.Label>공고 다시 불러오기</Button.Label>
							</Button>
						) : null}
						{candidates.isSuccess && candidates.data.length === 0 ? (
							<Text className="text-muted text-sm">
								사용할 수 있는 공고가 없어요. 게시 중인 유료 공고에만 쓸 수
								있어요.
							</Text>
						) : null}
						<RadioGroup
							onValueChange={setJobPostId}
							value={jobPostId ?? undefined}
						>
							{(candidates.data ?? []).map((post) => (
								<RadioGroup.Item key={post.id} value={post.id}>
									{post.title}
								</RadioGroup.Item>
							))}
						</RadioGroup>
						{jobPostId ? (
							<Text className="text-sm text-warning">
								사용하면 되돌릴 수 없어요. 선택한 공고에 바로 적용돼요.
							</Text>
						) : null}
						<View className="flex-row gap-2">
							<View className="flex-1">
								<Button onPress={() => setOpen(false)} variant="tertiary">
									<Button.Label>취소</Button.Label>
								</Button>
							</View>
							<View className="flex-1">
								<Button
									isDisabled={!jobPostId || useBenefit.isPending}
									onPress={() =>
										jobPostId && useBenefit.mutate({ jobPostId, orderId })
									}
								>
									<Button.Label>이 공고에 사용하기</Button.Label>
								</Button>
							</View>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}
