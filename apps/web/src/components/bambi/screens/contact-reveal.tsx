"use client";

// 밤비 — 연락처 공개 (양측 동의 게이트).

import { useState } from "react";
import type { Job } from "@/lib/bambi/types";
import { AppBar, Avatar, Badge, Button, Card, Switch } from "../ds";
import { CheckIcon, CopyIcon, PhoneIcon } from "../icons";

export function ContactReveal({
	job,
	onBack,
	onDone,
}: {
	job?: Job;
	onBack: () => void;
	onDone: () => void;
}) {
	const [agree, setAgree] = useState(false);
	const revealed = agree;
	const company = job ? job.company : "달밤 라운지";
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<AppBar onBack={onBack} title="연락처 공개" />
			<div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pt-2 pb-5">
				<div className="flex flex-col items-center gap-2.5 pt-2 pb-1 text-center">
					<div className="flex size-16 items-center justify-center rounded-[20px] bg-[var(--status-success-bg)] text-[color:var(--status-success-fg)]">
						<span className="inline-flex size-[30px]">
							<CheckIcon />
						</span>
					</div>
					<h1 className="mt-1 font-extrabold text-[22px] text-foreground">
						면접 일정이 확정됐어요
					</h1>
					<p className="m-0 max-w-[280px] text-muted-foreground text-sm leading-[1.55]">
						양쪽 모두 동의해야 연락처가 공개됩니다. 안전을 위해 면접 확정 후에만
						열려요.
					</p>
				</div>
				<Card className="overflow-hidden" pad="none">
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<Avatar name={company} square />
							<div className="flex flex-col">
								<span className="font-bold text-[15px] text-foreground">
									{company}
								</span>
								<span className="text-muted-foreground text-xs">구인자</span>
							</div>
						</div>
						<Badge dot tone="success">
							동의함
						</Badge>
					</div>
					<div className="h-px bg-border" />
					<div className="flex items-center justify-between p-4">
						<div className="flex items-center gap-3">
							<Avatar name="김하늘" />
							<div className="flex flex-col">
								<span className="font-bold text-[15px] text-foreground">
									나
								</span>
								<span className="text-muted-foreground text-xs">구직자</span>
							</div>
						</div>
						<Switch checked={agree} onChange={setAgree} />
					</div>
				</Card>
				{revealed ? (
					<Card className="flex flex-col gap-[14px]">
						<span className="font-bold text-[color:var(--text-subtle)] text-xs uppercase tracking-[0.04em]">
							공개된 연락처
						</span>
						<div className="flex items-center gap-3">
							<div className="inline-flex size-11 items-center justify-center rounded-xl bg-coral-50 text-coral-700">
								<span className="inline-flex size-[22px]">
									<PhoneIcon />
								</span>
							</div>
							<div className="flex flex-col">
								<span className="text-muted-foreground text-xs">{company}</span>
								<span className="font-extrabold text-foreground text-lg">
									010-2840-1188
								</span>
							</div>
						</div>
						<Button block leftIcon={<CopyIcon />} size="md" variant="soft">
							번호 복사
						</Button>
					</Card>
				) : (
					<div className="rounded-2xl bg-secondary p-4 text-center text-[13px] text-muted-foreground leading-normal">
						동의하면 상대방의 연락처가 여기에 표시됩니다.
					</div>
				)}
			</div>
			<div className="border-border border-t px-6 pt-3 pb-1.5">
				<Button
					block
					disabled={!revealed}
					onClick={onDone}
					size="lg"
					variant={revealed ? "primary" : "secondary"}
				>
					완료
				</Button>
			</div>
		</div>
	);
}
