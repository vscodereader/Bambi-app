"use client";

// 아이디 찾기 · 비밀번호 찾기. 포트원 인증창은 PG(KCP)가 소유해 우리 내용을 그릴 수 없으므로,
// 결과는 인증창이 닫힌 뒤 밤비알바 페이지 위 이 모달에서 보여준다.
// 진입점 링크는 로그인 폼 안(아이디·비밀번호 라벨 옆)에 있어야 해서 auth-fields가 그리고,
// 인증 시작과 모달 상태는 이 훅이 들고 있다 — auth-panel은 핸들러와 모달만 받아 간다.

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@bambi-app/ui/components/dialog";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { Button, Input } from "../ds";
import { usePortOneVerification } from "../use-portone-verification";
import { AuthNotice, type Notice } from "./auth-notice";

// 모바일 인증은 리디렉션이라 한 화면의 인증 진입점이 모두 같은 복귀를 본다. 인증을 시작한
// 진입점만 결과를 처리하도록 auth-panel의 GUEST_INTENT, auth-verify-step의 SIGNUP_INTENT와
// 반드시 다른 값을 쓴다.
const FIND_ID_INTENT = "auth-panel:find-id";
const RESET_PASSWORD_INTENT = "auth-panel:reset-password";

// 완료 화면을 읽을 만큼만 두고 스스로 닫힌다. 타이머는 완료 화면 컴포넌트가 들고 있어
// 사용자가 먼저 닫으면 언마운트와 함께 정리된다.
const AUTO_CLOSE_MS = 5000;

type RecoveryScreen =
	// loginId가 null이면 아이디 없이 이메일로 가입된 옛 계정이다.
	| { kind: "id-result"; loginId: string | null }
	| { kind: "not-found" }
	| { kind: "password-done" }
	| { kind: "password-form"; identityVerificationId: string };

const resolveErrorText = (error: unknown, fallback: string): string =>
	error instanceof Error && error.message ? error.message : fallback;

function IdFound({
	loginId,
	onUseLoginId,
}: {
	loginId: string;
	onUseLoginId: (loginId: string) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			{/* 본인인증을 통과한 본인에게 보여주는 값이라 마스킹하지 않는다.
			    긴 아이디가 모바일 폭에서 넘치지 않게 break-all로 접는다. */}
			<p className="m-0 break-all rounded-lg border border-border bg-secondary px-4 py-3 text-center font-extrabold text-lg">
				{loginId}
			</p>
			<Button block onClick={() => onUseLoginId(loginId)}>
				이 아이디로 로그인
			</Button>
		</div>
	);
}

function PasswordForm({
	identityVerificationId,
	onCancel,
	onDone,
}: {
	identityVerificationId: string;
	onCancel: () => void;
	onDone: () => void;
}) {
	const [password, setPassword] = useState("");
	const [passwordConfirm, setPasswordConfirm] = useState("");
	const [notice, setNotice] = useState<Notice | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const submit = async () => {
		setNotice(null);
		if (password.length < 8) {
			setNotice({ text: "비밀번호를 8자 이상 입력해 주세요.", tone: "error" });
			return;
		}
		if (password !== passwordConfirm) {
			setNotice({ text: "비밀번호가 일치하지 않아요.", tone: "error" });
			return;
		}
		setIsSubmitting(true);
		try {
			await client.bambi.accountRecovery.resetPasswordByIdentity({
				identityVerificationId,
				newPassword: password,
			});
			onDone();
		} catch (error) {
			setNotice({
				text: resolveErrorText(
					error,
					"비밀번호를 변경하지 못했어요. 다시 시도해 주세요."
				),
				tone: "error",
			});
			setIsSubmitting(false);
		}
	};

	return (
		<form
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				submit().catch(() => setIsSubmitting(false));
			}}
		>
			<label className="grid gap-2" htmlFor="recovery-new-password">
				<span className="font-bold text-sm">새 비밀번호</span>
				<Input
					autoComplete="new-password"
					id="recovery-new-password"
					onChange={(event) => setPassword(event.target.value)}
					placeholder="8자 이상 입력해주세요."
					type="password"
					value={password}
				/>
			</label>
			<label className="grid gap-2" htmlFor="recovery-new-password-confirm">
				<span className="font-bold text-sm">새 비밀번호 확인</span>
				<Input
					autoComplete="new-password"
					id="recovery-new-password-confirm"
					onChange={(event) => setPasswordConfirm(event.target.value)}
					placeholder="비밀번호를 다시 입력해주세요."
					type="password"
					value={passwordConfirm}
				/>
			</label>
			<AuthNotice notice={notice} />
			<div className="mt-1 grid grid-cols-2 gap-2">
				<Button
					block
					disabled={isSubmitting}
					onClick={onCancel}
					variant="secondary"
				>
					취소
				</Button>
				<Button block disabled={isSubmitting} type="submit">
					{isSubmitting ? "변경 중" : "확인"}
				</Button>
			</div>
		</form>
	);
}

function PasswordDone({ onClose }: { onClose: () => void }) {
	// onClose는 호출부에서 useCallback으로 고정돼 있어 타이머가 렌더마다 다시 걸리지 않는다.
	useEffect(() => {
		const timer = setTimeout(onClose, AUTO_CLOSE_MS);
		return () => clearTimeout(timer);
	}, [onClose]);

	return (
		<div className="flex flex-col gap-4">
			<p className="m-0 text-muted-foreground text-sm">
				이 창은 5초 뒤 자동으로 닫혀요. 지금 닫으셔도 됩니다.
			</p>
			<Button block onClick={onClose} variant="secondary">
				닫기
			</Button>
		</div>
	);
}

export function useAccountRecovery({
	onSignUp,
	onUseLoginId,
}: {
	onSignUp: () => void;
	onUseLoginId: (loginId: string) => void;
}): {
	dialog: ReactNode;
	findId: (() => void) | null;
	resetPassword: (() => void) | null;
} {
	// isOpen을 screen과 따로 두는 이유: 닫는 순간 screen을 비우면 200ms 닫힘 애니메이션이
	// 빈 모달로 흐른다. 다음 열기가 어차피 screen을 덮어쓰므로 남겨 두는 편이 안전하다.
	const [screen, setScreen] = useState<RecoveryScreen | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	const close = useCallback(() => setIsOpen(false), []);

	const open = (next: RecoveryScreen) => {
		setScreen(next);
		setIsOpen(true);
	};

	// 인증 성공 직후의 계정 조회. 아직 모달이 없어 오류를 그릴 자리가 없으므로 인증 실패와
	// 같은 방식(토스트)으로 알린다.
	const lookupAccount = async (identityVerificationId: string) => {
		try {
			return await client.bambi.accountRecovery.lookupAccountByIdentity({
				identityVerificationId,
			});
		} catch (error) {
			toast.error(
				resolveErrorText(
					error,
					"계정을 조회하지 못했어요. 잠시 후 다시 시도해 주세요."
				)
			);
			return null;
		}
	};

	const findIdVerification = usePortOneVerification({
		intent: FIND_ID_INTENT,
		onVerified: async (identityVerificationId) => {
			const account = await lookupAccount(identityVerificationId);
			if (!account) {
				return;
			}
			open(
				account.found
					? { kind: "id-result", loginId: account.loginId }
					: { kind: "not-found" }
			);
		},
	});

	const resetPasswordVerification = usePortOneVerification({
		intent: RESET_PASSWORD_INTENT,
		onVerified: async (identityVerificationId) => {
			// 새 비밀번호를 다 입력한 뒤에 "계정이 없다"고 실패시키지 않으려고 존재부터 본다.
			// 조회는 인증건을 소진하지 않으므로 뒤이은 변경 요청이 같은 인증건을 다시 쓴다.
			const account = await lookupAccount(identityVerificationId);
			if (!account) {
				return;
			}
			open(
				account.found
					? { kind: "password-form", identityVerificationId }
					: { kind: "not-found" }
			);
		},
	});

	// 인증창이 이미 떠 있는데 링크를 또 누르면 인증건만 새로 발급된다. 시작만 막는다.
	const startOrNull = (verification: {
		isConfigured: boolean;
		isVerifying: boolean;
		startVerification: () => void;
	}) => {
		// 포트원 미구성 환경(목 인증)에는 CI/DI가 없어 계정을 특정할 수 없다 — 링크를 숨긴다.
		if (!verification.isConfigured) {
			return null;
		}
		return () => {
			if (!verification.isVerifying) {
				verification.startVerification();
			}
		};
	};

	const renderScreen = (current: RecoveryScreen): ReactNode => {
		if (current.kind === "id-result") {
			if (current.loginId) {
				return (
					<IdFound
						loginId={current.loginId}
						onUseLoginId={(loginId) => {
							onUseLoginId(loginId);
							close();
						}}
					/>
				);
			}
			return (
				<Button block onClick={close} variant="secondary">
					닫기
				</Button>
			);
		}
		if (current.kind === "password-form") {
			// 인증건이 바뀌면 폼을 새로 띄운다(직전 입력이 남지 않게).
			return (
				<PasswordForm
					identityVerificationId={current.identityVerificationId}
					key={current.identityVerificationId}
					onCancel={close}
					onDone={() => setScreen({ kind: "password-done" })}
				/>
			);
		}
		if (current.kind === "password-done") {
			return <PasswordDone onClose={close} />;
		}
		return (
			<Button
				block
				onClick={() => {
					onSignUp();
					close();
				}}
				variant="secondary"
			>
				회원가입 하러 가기
			</Button>
		);
	};

	const heading = (
		current: RecoveryScreen
	): { desc: string; title: string } => {
		if (current.kind === "id-result") {
			return current.loginId
				? {
						desc: "본인인증으로 확인한 회원님의 아이디예요.",
						title: "가입된 아이디",
					}
				: {
						desc: "아이디 없이 이메일로 가입된 계정이에요. 가입하신 이메일로 로그인해 주세요.",
						title: "이메일로 가입된 계정이에요",
					};
		}
		if (current.kind === "password-form") {
			return {
				desc: "새로 사용할 비밀번호를 입력해 주세요.",
				title: "비밀번호 재설정",
			};
		}
		if (current.kind === "password-done") {
			return {
				desc: "비밀번호가 성공적으로 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
				title: "비밀번호가 변경되었어요",
			};
		}
		return {
			desc: "본인인증하신 정보로 가입된 계정을 찾지 못했어요. 회원가입 후 이용해 주세요.",
			title: "가입된 계정이 없어요",
		};
	};

	const dialog = (
		<Dialog
			onOpenChange={(next) => {
				if (!next) {
					close();
				}
			}}
			open={isOpen}
		>
			<DialogContent>
				{screen ? (
					<>
						<div className="flex flex-col gap-2">
							<DialogTitle>{heading(screen).title}</DialogTitle>
							<DialogDescription>{heading(screen).desc}</DialogDescription>
						</div>
						{renderScreen(screen)}
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);

	return {
		dialog,
		findId: startOrNull(findIdVerification),
		resetPassword: startOrNull(resetPasswordVerification),
	};
}
