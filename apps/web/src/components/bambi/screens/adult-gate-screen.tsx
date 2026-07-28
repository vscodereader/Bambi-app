import { AuthPanel } from "../auth/auth-panel";

// 19금 고지는 AuthPanel이 카드 상단에 상시 노출하므로(auth/adult-notice.tsx) 여기서
// 따로 그리지 않는다 — 같은 화면에 두 번 나오지 않게 한다.
export function AdultGateScreen() {
	return (
		<div className="flex flex-1 flex-col justify-center bg-secondary">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
				<AuthPanel />
			</div>
		</div>
	);
}
