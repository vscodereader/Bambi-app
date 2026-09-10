import { useQuery } from "@tanstack/react-query";
import { getItem, setItemAsync } from "expo-secure-store";
import { Button, Surface } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { warnedDismissKey } from "@/src/lib/account-experience";
import { orpc } from "@/src/lib/orpc";

export function AccountStatusBanner() {
	const session = authClient.useSession();
	const query = useQuery({
		...orpc.bambi.onboarding.getMine.queryOptions(),
		enabled: Boolean(session.data?.user),
	});
	const profile = query.data?.bambiProfile;
	const sanction = query.data?.accountSanction;
	const key = useMemo(
		() =>
			session.data?.user.id && profile?.status === "warned"
				? warnedDismissKey(session.data.user.id, sanction?.createdAt ?? null)
				: null,
		[profile?.status, sanction?.createdAt, session.data?.user.id]
	);
	const [dismissed, setDismissed] = useState(false);
	const [checked, setChecked] = useState(false);
	useEffect(() => {
		if (!key) {
			setDismissed(false);
			setChecked(true);
			return;
		}
		try {
			setDismissed(getItem(key) === "1");
		} catch {
			setDismissed(false);
		}
		setChecked(true);
	}, [key]);
	if (
		!profile ||
		(profile.status !== "warned" && profile.status !== "suspended") ||
		(profile.status === "warned" && (!checked || dismissed))
	) {
		return null;
	}
	const warned = profile.status === "warned";
	return (
		<View className="px-4 pt-3">
			<Surface
				className={`gap-2 rounded-lg border p-4 ${
					warned ? "border-warning" : "border-danger"
				}`}
				variant="secondary"
			>
				<View className="flex-row items-start justify-between gap-3">
					<Text className="flex-1 font-bold text-foreground">
						{warned ? "운영자 경고를 받았어요" : "계정 이용이 정지되었어요"}
					</Text>
					{warned ? (
						<Button
							accessibilityLabel="경고 안내 닫기"
							isIconOnly
							onPress={() => {
								setDismissed(true);
								if (key) {
									setItemAsync(key, "1").catch(() => undefined);
								}
							}}
							size="sm"
							variant="tertiary"
						>
							<Button.Label>×</Button.Label>
						</Button>
					) : null}
				</View>
				<Text className="text-foreground text-sm">
					{warned
						? "정책 위반 소지가 확인되어 운영자가 경고를 보냈어요. 같은 문제가 반복되면 이용이 제한될 수 있으니 활동 내용을 다시 확인해 주세요."
						: "정책 위반이 확인되어 공고 등록·지원·채팅 등 일부 이용이 제한되었어요."}
				</Text>
				{sanction?.reason ? (
					<Text className="font-semibold text-foreground text-sm">
						사유: {sanction.reason}
					</Text>
				) : null}
				<Text className="text-muted text-sm">
					이 조치에 이의가 있다면 고객센터로 문의해 이의를 신청할 수 있어요.
				</Text>
			</Surface>
		</View>
	);
}
