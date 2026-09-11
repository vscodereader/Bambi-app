import { useQuery } from "@tanstack/react-query";
import {
	type Href,
	router,
	useGlobalSearchParams,
	usePathname,
} from "expo-router";
import { getItemAsync, setItemAsync } from "expo-secure-store";
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

export function MainPopupLayer() {
	const pathname = usePathname();
	const params = useGlobalSearchParams<{ coachmarks?: string }>();
	const session = authClient.useSession();
	const [closed, setClosed] = useState<Set<string>>(new Set());
	const [storedHidden, setStoredHidden] = useState<Record<
		string,
		null | string
	> | null>(null);
	const query = useQuery(orpc.bambi.mainPopups.listPublic.queryOptions());
	const pageId = nativePopupPageId(pathname);
	useEffect(() => {
		const items = query.data?.items;
		if (!items) {
			setStoredHidden(null);
			return;
		}
		let cancelled = false;
		Promise.all(
			items.map(async (candidate) => {
				const raw = await getItemAsync(popupHiddenKey(candidate.id)).catch(
					() => null
				);
				return [candidate.id, raw] as const;
			})
		).then((entries) => {
			if (!cancelled) {
				setStoredHidden(Object.fromEntries(entries));
			}
		});
		return () => {
			cancelled = true;
		};
	}, [query.data?.items]);
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
			(storedHidden ? (query.data?.items ?? []) : []).find(
				(candidate) =>
					params.coachmarks !== "1" &&
					pageId &&
					candidate.targetPages.includes(pageId) &&
					!closed.has(candidate.id) &&
					!isPopupHidden(
						storedHidden?.[candidate.id] ?? null,
						candidate.revision,
						Date.now()
					)
			) ?? null,
		[closed, pageId, params.coachmarks, query.data?.items, storedHidden]
	);
	if (!item) {
		return null;
	}
	const close = () => setClosed((current) => new Set(current).add(item.id));
	const hideForToday = async () => {
		const raw = JSON.stringify({
			hiddenUntil: Date.now() + POPUP_HIDE_MS,
			revision: item.revision,
		});
		try {
			await setItemAsync(popupHiddenKey(item.id), raw);
			setStoredHidden((current) => ({
				...(current ?? {}),
				[item.id]: raw,
			}));
		} catch {
			// 현재 팝업은 닫되, 저장 실패 시 다음 실행에서 다시 안내한다.
		} finally {
			close();
		}
	};
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
								<Button onPress={hideForToday} variant="secondary">
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
