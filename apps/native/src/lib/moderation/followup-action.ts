// One instance belongs to one report. A failed followup must never repeat an
// already committed sanction/content mutation.
export function createFollowupAction() {
	let primaryDone = false;
	let pending = false;
	return {
		async run({
			primary,
			onPrimaryDone,
			followup,
		}: {
			primary: () => Promise<unknown>;
			onPrimaryDone: () => void;
			followup: () => Promise<boolean>;
		}) {
			if (pending) {
				throw new Error("이미 처리 중입니다.");
			}
			pending = true;
			try {
				if (!primaryDone) {
					await primary();
					primaryDone = true;
					onPrimaryDone();
				}
				return await followup();
			} finally {
				pending = false;
			}
		},
	};
}
