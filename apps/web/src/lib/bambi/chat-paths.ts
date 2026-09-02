import type { Route } from "next";

export const CHAT_LIST_PATH = "/seeker/chats" as Route;
export const CHAT_ROOM_PATH_PATTERN = /^\/seeker\/chats\/[^/]+$/;

export const buildChatRoomPath = (roomId: string): Route =>
	`${CHAT_LIST_PATH}/${roomId}` as Route;
