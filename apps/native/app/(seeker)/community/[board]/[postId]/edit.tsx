import { Stack } from "expo-router";

import { CommunityPostEditor } from "@/src/components/community/community-post-editor";
import { MemberOnly } from "@/src/components/member-only";

export default function CommunityEditScreen() {
	return (
		<MemberOnly allowCommunityGuest allowVerifiedGuest>
			<Stack.Screen options={{ title: "글 수정" }} />
			<CommunityPostEditor mode="edit" />
		</MemberOnly>
	);
}
