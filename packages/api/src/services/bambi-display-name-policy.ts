import { findReservedDisplayNameTerm } from "@bambi-app/auth/reserved-display-name";
import { ORPCError } from "@orpc/server";

import { getActiveBannedWords } from "./bambi-banned-words";

export const assertDisplayNameAllowed = async (
	value: string,
	{ isAdmin }: { isAdmin: boolean }
): Promise<void> => {
	if (isAdmin) {
		return;
	}

	const entries = await getActiveBannedWords("display_name");
	const term = findReservedDisplayNameTerm(value, entries);
	if (term) {
		throw new ORPCError("BAD_REQUEST", {
			message: `닉네임 또는 작성인에 사용할 수 없는 단어가 포함되어 있습니다: '${term}'`,
		});
	}
};
