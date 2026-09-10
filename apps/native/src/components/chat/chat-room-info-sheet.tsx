import { Ionicons } from "@expo/vector-icons";
import { type Href, router } from "expo-router";
import { BottomSheet, Button, useThemeColor } from "heroui-native";
import { Linking, Pressable, Text, View } from "react-native";
import { Pill } from "@/src/components/bambi-screen";
import { formatInterviewDate } from "@/src/lib/chat/chat-time";
import type { ChatRoomDetail } from "@/src/lib/chat/chat-types";
import { interviewStatusLabel } from "@/src/lib/me-interviews";

export function ChatRoomInfoSheet({
	onOpenChange,
	open,
	room,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
	room: ChatRoomDetail;
}) {
	const foreground = useThemeColor("foreground");
	const job = room.jobPost;
	const canOpenJob =
		job?.status === "published" && job.paymentStatus === "paid";
	return (
		<BottomSheet isOpen={open} onOpenChange={onOpenChange}>
			<BottomSheet.Portal>
				<BottomSheet.Overlay />
				<BottomSheet.Content>
					<BottomSheet.Title>공고·면접 정보</BottomSheet.Title>
					<View className="mt-4 gap-4">
						{job ? (
							<View className="gap-2 rounded-lg bg-surface-secondary p-4">
								<Text className="font-bold text-foreground">{job.title}</Text>
								<Text className="text-muted text-sm">
									{job.region}
									{job.district ? ` · ${job.district}` : ""} ·{" "}
									{job.industryCategory}
								</Text>
								<Text className="text-foreground text-sm">
									{job.payAmount === null
										? "급여 협의"
										: `${job.payAmount.toLocaleString("ko-KR")}원 / ${job.payUnit ?? ""}`}
								</Text>
								<Text className="text-muted text-sm">{job.workSchedule}</Text>
								<Button
									isDisabled={!canOpenJob}
									onPress={() =>
										router.push(`/(seeker)/jobs/${job.id}` as unknown as Href)
									}
									variant="secondary"
								>
									<Button.Label>
										{canOpenJob ? "공고 보기" : "공고 비공개"}
									</Button.Label>
								</Button>
							</View>
						) : (
							<Text className="text-muted text-sm">삭제된 공고예요.</Text>
						)}
						<View className="gap-2">
							<Text className="font-bold text-foreground text-lg">
								면접 일정
							</Text>
							{room.schedules.length === 0 ? (
								<Text className="text-muted text-sm">
									아직 제안된 면접 일정이 없어요.
								</Text>
							) : (
								room.schedules.map((schedule) => (
									<View
										className="gap-1 rounded-lg bg-surface-secondary p-3"
										key={schedule.id}
									>
										<View className="flex-row items-center justify-between">
											<Text className="text-foreground text-sm">
												{formatInterviewDate(schedule.scheduledAt)}
											</Text>
											<Pill>{interviewStatusLabel(schedule.status)}</Pill>
										</View>
										{schedule.locationNote ? (
											<Text className="text-muted text-xs">
												{schedule.locationNote}
											</Text>
										) : null}
									</View>
								))
							)}
						</View>
						{room.employerVerifiedPhone ? (
							<Pressable
								accessibilityRole="link"
								className="min-h-11 justify-center rounded-lg bg-surface-secondary p-3"
								onPress={() =>
									Linking.openURL(`tel:${room.employerVerifiedPhone}`)
								}
							>
								<Text className="font-semibold text-foreground">
									구인자 인증 연락처
								</Text>
								<Text className="text-accent">
									{room.employerVerifiedPhone}
								</Text>
							</Pressable>
						) : null}
						<View className="flex-row items-center gap-2">
							<Ionicons
								color={foreground}
								name="shield-checkmark-outline"
								size={20}
							/>
							<Text className="flex-1 text-muted text-sm">
								면접 확정 전 연락처 보호 중이에요. 조건 불일치와 외부 연락
								유도는 신고할 수 있어요.
							</Text>
						</View>
					</View>
				</BottomSheet.Content>
			</BottomSheet.Portal>
		</BottomSheet>
	);
}
