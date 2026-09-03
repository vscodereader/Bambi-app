import type { AppRouterClient } from "@bambi-app/api/routers/index";

type ChatsClient = AppRouterClient["bambi"]["chats"];

export type ChatRoomDetail = Awaited<ReturnType<ChatsClient["getById"]>>;
export type ChatRoomMessage = ChatRoomDetail["messages"][number];
export type ChatRoomSchedule = ChatRoomDetail["schedules"][number];
export type ChatRoomAttachment = ChatRoomMessage["attachments"][number];
export type ChatRoomListItem = Awaited<
	ReturnType<ChatsClient["listMine"]>
>[number];

// 서버 기본값(DEFAULT_CHAT_MESSAGE_PAGE_SIZE)과 같다. 화면 한 번에 그릴 상한.
export const CHAT_MESSAGE_PAGE_SIZE = 50;
