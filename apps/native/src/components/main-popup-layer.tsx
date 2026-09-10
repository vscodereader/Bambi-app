import { useQuery } from "@tanstack/react-query";
import { type Href, router, usePathname } from "expo-router";
import { getItem, setItemAsync } from "expo-secure-store";
import { Button, Dialog } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, View } from "react-native";

import { authClient } from "@/lib/auth-client";
import { MessageBody } from "@/src/components/message-body";
import {
	ABSOLUTE_WEB_URL,
	isPopupHidden,
	nativePopupLink,
	nativePopupPageId,
	POPUP_HIDE_MS,
	popupHiddenKey,
	savePopupLoginTarget,
	takePopupLoginTarget,
} from "@/src/lib/account-experience";
import { orpc } from "@/src/lib/orpc";

const storedPopupIsHidden = (id: string, revision: number): boolean => {
	try {
		return isPopupHidden(getItem(popupHiddenKey(id)), revision, Date.now());
	} catch {
		return false;
	}
};

export function MainPopupLayer() {
	const pathname = usePathname();
	const session = authClient.useSession();
	const [closed, setClosed] = useState<Set<string>>(new Set());
	const query = useQuery(orpc.bambi.mainPopups.listPublic.queryOptions());
	const pageId = nativePopupPageId(pathname);
	useEffect(() => {
		if (!session.data?.user) {
			return;
		}
		const target = takePopupLoginTarget();
		if (target) {
			router.replace(target as Href);
		}
	}, [session.data?.user]);
	const item = useMemo(
		() =>
			(query.data?.items ?? []).find(
				(candidate) =>
					pageId &&
					candidate.targetPages.includes(pageId) &&
					!closed.has(candidate.id) &&
					!storedPopupIsHidden(candidate.id, candidate.revision)
			) ?? null,
		[closed, pageId, query.data?.items]
	);
	if (!item) {
		return null;
	}
	const close = () => setClosed((current) => new Set(current).add(item.id));
	const openLink = () => {
		const target = nativePopupLink(item.linkPath);
		if (!target) {
			return;
		}
		close();
		if (ABSOLUTE_WEB_URL.test(target)) {
			Linking.openURL(target).catch(() => undefined);
		} else {
			if (!session.data?.user) {
				savePopupLoginTarget(target);
				router.push("/login" as Href);
				return;
			}
			router.push(target as Href);
		}
	};
	return (
		<Dialog isOpen onOpenChange={(open) => !open && close()}>
			<Dialog.Portal>
				<Dialog.Overlay />
				<Dialog.Content>
					<View className="gap-3">
						{item.contentType === "image" && item.editedImage ? (
							<Pressable
								accessibilityLabel={
									item.linkPath ? "팝업 연결 페이지로 이동" : "안내 팝업 이미지"
								}
								disabled={!item.linkPath}
								onPress={openLink}
							>
								<Image
									className="aspect-square w-full rounded-lg"
									resizeMode="contain"
									source={{ uri: item.editedImage.dataUrl }}
								/>
							</Pressable>
						) : (
							<MessageBody
								body={JSON.stringify(
									item.textDocument ?? {
										content: [{ type: "paragraph" }],
										type: "doc",
									}
								)}
							/>
						)}
						<View className="flex-row gap-2">
							<View className="flex-1">
								<Button
									onPress={() => {
										setItemAsync(
											popupHiddenKey(item.id),
											JSON.stringify({
												hiddenUntil: Date.now() + POPUP_HIDE_MS,
												revision: item.revision,
											})
										).catch(() => undefined);
										close();
									}}
									variant="secondary"
								>
									<Button.Label>오늘 하루 보지 않기</Button.Label>
								</Button>
							</View>
							<View className="flex-1">
								<Button onPress={close} variant="tertiary">
									<Button.Label>창닫기</Button.Label>
								</Button>
							</View>
						</View>
					</View>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog>
	);
}
