import { Stack } from "expo-router";

import { CommunityPostEditor } from "@/src/components/community/community-post-editor";
import { MemberOnly } from "@/src/components/member-only";

export default function CommunityWriteScreen() {
	return (
		<MemberOnly allowCommunityGuest allowVerifiedGuest>
			<Stack.Screen options={{ title: "글쓰기" }} />
			<CommunityPostEditor mode="create" />
		</MemberOnly>
	);
}
