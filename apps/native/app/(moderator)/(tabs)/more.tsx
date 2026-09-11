import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ListGroup, Separator, useThemeColor } from "heroui-native";
import { Fragment } from "react";
import { Text, View } from "react-native";

import { BambiHeader, BambiScreen } from "@/src/components/bambi-screen";
import { MODERATOR_MORE_GROUPS } from "@/src/lib/moderation/navigation";

export default function ModeratorMoreScreen() {
	const foreground = useThemeColor("foreground");

	return (
		<BambiScreen>
			<BambiHeader
				description="운영 업무별 관리 화면으로 이동합니다."
				title="더보기"
			/>
			{MODERATOR_MORE_GROUPS.map((group) => (
				<View className="gap-2" key={group.label}>
					<Text className="font-bold text-muted text-xs">{group.label}</Text>
					<ListGroup className="rounded-lg" variant="secondary">
						{group.items.map((item, index) => (
							<Fragment key={item.label}>
								{index > 0 ? <Separator className="mx-4" /> : null}
								<ListGroup.Item
									accessibilityLabel={`${item.label} — ${item.description}`}
									onPress={() => router.push(item.href)}
								>
									<ListGroup.ItemContent>
										<ListGroup.ItemTitle>{item.label}</ListGroup.ItemTitle>
										<ListGroup.ItemDescription>
											{item.description}
										</ListGroup.ItemDescription>
									</ListGroup.ItemContent>
									<ListGroup.ItemSuffix>
										<Ionicons
											color={foreground}
											name="chevron-forward"
											size={18}
										/>
									</ListGroup.ItemSuffix>
								</ListGroup.Item>
							</Fragment>
						))}
					</ListGroup>
				</View>
			))}
		</BambiScreen>
	);
}
