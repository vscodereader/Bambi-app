import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { Alert } from "react-native";

// Same beforeRemove contract as NativeJobFormScreen; also blocks leaving while a
// save is in flight so it cannot appear to have been cancelled after submission.
export function useUnsavedChanges(dirty: boolean, pending = false) {
	const navigation = useNavigation();
	useEffect(
		() =>
			navigation.addListener("beforeRemove", (event) => {
				if (!(dirty || pending)) {
					return;
				}
				event.preventDefault();
				if (pending) {
					return;
				}
				Alert.alert(
					"작성 중인 내용이 있어요",
					"이 화면을 나가면 저장하지 않은 내용이 사라져요.",
					[
						{ text: "계속 작성", style: "cancel" },
						{
							text: "나가기",
							style: "destructive",
							onPress: () => navigation.dispatch(event.data.action),
						},
					]
				);
			}),
		[navigation, dirty, pending]
	);
}
