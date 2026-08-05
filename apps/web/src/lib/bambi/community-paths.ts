"use client";

// 같은 글 폼·참여 UI가 공개 영역(/board)과 회원 수다방(/seeker/community) 양쪽에서 쓰인다.
// 이동 경로는 "지금 어느 영역에 있는가"로 정한다 — 회원/비회원 신분으로 가르면 회원 화면에
// 들어온 여성 인증 게스트가 공개 영역으로 튕겨 나간다.

import { usePathname } from "next/navigation";
import {
	communityBoardPath,
	communityEditPath,
	communityPostPath,
} from "./community";
import {
	isPublicBoardPath,
	publicBoardPath,
	publicEditPath,
	publicPostPath,
} from "./public-community";

interface CommunityAreaPaths {
	boardPath: (slug: string) => string;
	editPath: (slug: string, postId: string) => string;
	postPath: (slug: string, postId: string) => string;
}

const PUBLIC_AREA_PATHS: CommunityAreaPaths = {
	boardPath: (slug) => publicBoardPath(slug),
	editPath: publicEditPath,
	postPath: publicPostPath,
};

const MEMBER_AREA_PATHS: CommunityAreaPaths = {
	boardPath: communityBoardPath,
	editPath: communityEditPath,
	postPath: communityPostPath,
};

export const useCommunityAreaPaths = (): CommunityAreaPaths =>
	isPublicBoardPath(usePathname()) ? PUBLIC_AREA_PATHS : MEMBER_AREA_PATHS;
