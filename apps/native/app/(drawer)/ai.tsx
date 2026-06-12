import { useChat } from "@ai-sdk/react";
import { env } from "@bambi-app/env/native";
import { Ionicons } from "@expo/vector-icons";
import { DefaultChatTransport } from "ai";
import {
	Button,
	FieldError,
	Input,
	Separator,
	Spinner,
	Surface,
	TextField,
	useThemeColor,
} from "heroui-native";
import { useEffect, useRef, useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	Text,
	View,
} from "react-native";

import { Container } from "@/components/container";

const generateAPIUrl = (relativePath: string) => {
	const serverUrl = env.EXPO_PUBLIC_SERVER_URL;
	if (!serverUrl) {
		throw new Error(
			"EXPO_PUBLIC_SERVER_URL environment variable is not defined"
		);
	}
	const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
	return serverUrl.concat(path);
};

export default function AIScreen() {
	const [input, setInput] = useState("");
	const { messages, error, sendMessage, status } = useChat({
		transport: new DefaultChatTransport({
			api: generateAPIUrl("/ai"),
		}),
		onError: (error) => console.error(error, "AI Chat Error"),
	});
	const scrollViewRef = useRef<ScrollView>(null);
	const foregroundColor = useThemeColor("foreground");
	const mutedColor = useThemeColor("muted");
	const isBusy = status === "submitted" || status === "streaming";

	useEffect(() => {
		scrollViewRef.current?.scrollToEnd({ animated: true });
	});

	const onSubmit = () => {
		const value = input.trim();
		if (value && !isBusy) {
			sendMessage({ text: value });
			setInput("");
		}
	};

	if (error) {
		return (
			<Container isScrollable={false}>
				<View className="flex-1 items-center justify-center px-4">
					<Surface className="rounded-lg p-4" variant="secondary">
						<FieldError isInvalid>
							<Text className="mb-1 text-center font-medium text-danger">
								{error.message}
							</Text>
							<Text className="text-center text-muted text-xs">
								Please check your connection and try again.
							</Text>
						</FieldError>
					</Surface>
				</View>
			</Container>
		);
	}

	return (
		<Container isScrollable={false}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : "height"}
				className="flex-1"
			>
				<View className="flex-1 px-4 py-4">
					<View className="mb-4 py-4">
						<Text className="font-semibold text-2xl text-foreground tracking-tight">
							AI Chat
						</Text>
						<Text className="mt-1 text-muted text-sm">
							Chat with our AI assistant
						</Text>
					</View>

					<ScrollView
						className="mb-4 flex-1"
						contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
						keyboardShouldPersistTaps="handled"
						ref={scrollViewRef}
						showsVerticalScrollIndicator={false}
					>
						{messages.length === 0 ? (
							<Surface
								className="flex-1 items-center justify-center rounded-xl py-8"
								variant="secondary"
							>
								<Ionicons
									color={mutedColor}
									name="chatbubble-ellipses-outline"
									size={32}
								/>
								<Text className="mt-3 text-muted text-sm">
									Ask me anything to get started
								</Text>
							</Surface>
						) : (
							<View className="gap-3">
								{messages.map((message) => (
									<Surface
										className={`rounded-xl p-3 ${message.role === "user" ? "ml-8" : "mr-8"}`}
										key={message.id}
										variant={message.role === "user" ? "tertiary" : "secondary"}
									>
										<Text className="mb-1 font-medium text-muted text-xs">
											{message.role === "user" ? "You" : "AI"}
										</Text>
										<View className="gap-1">
											{message.parts.map((part) =>
												part.type === "text" ? (
													<Text
														className="text-foreground text-sm leading-relaxed"
														key={`${message.id}-${part.text}`}
													>
														{part.text}
													</Text>
												) : (
													<Text
														className="text-foreground text-sm leading-relaxed"
														key={`${message.id}-${JSON.stringify(part)}`}
													>
														{JSON.stringify(part)}
													</Text>
												)
											)}
										</View>
									</Surface>
								))}
								{isBusy && (
									<Surface className="mr-8 rounded-xl p-3" variant="secondary">
										<Text className="mb-1 font-medium text-muted text-xs">
											AI
										</Text>
										<View className="flex-row items-center gap-2">
											<Spinner size="sm" />
											<Text className="text-muted text-sm">Thinking...</Text>
										</View>
									</Surface>
								)}
							</View>
						)}
					</ScrollView>

					<Separator className="mb-3" />

					<View className="flex-row items-center gap-2">
						<View className="flex-1">
							<TextField>
								<Input
									editable={!isBusy}
									onChangeText={setInput}
									onSubmitEditing={onSubmit}
									placeholder="Type a message..."
									returnKeyType="send"
									value={input}
								/>
							</TextField>
						</View>
						<Button
							isDisabled={!input.trim() || isBusy}
							isIconOnly
							onPress={onSubmit}
							size="sm"
							variant={input.trim() && !isBusy ? "primary" : "secondary"}
						>
							<Ionicons
								color={input.trim() && !isBusy ? foregroundColor : mutedColor}
								name="arrow-up"
								size={18}
							/>
						</Button>
					</View>
				</View>
			</KeyboardAvoidingView>
		</Container>
	);
}
