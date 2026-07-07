"use client";

import { Button, buttonVariants } from "@bambi-app/ui/components/button";
import { Card, CardContent } from "@bambi-app/ui/components/card";
import { Separator } from "@bambi-app/ui/components/separator";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { useEmployerVerified } from "@/components/bambi/employer-approval-context";
import { EmployerGateBanner } from "@/components/bambi/employer-gate-banner";
import { EmptyState } from "@/components/bambi/empty-state";
import { OrgProfileForm } from "@/components/bambi/org-profile-form";
import { PageShell } from "@/components/bambi/page-shell";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

const getErrorCode = (error: Error | null): string | undefined =>
	error && "code" in error && typeof error.code === "string"
		? error.code
		: undefined;

export default function EmployerSettingsPage() {
	const session = authClient.useSession();
	const verified = useEmployerVerified();
	const isSignedIn = Boolean(session.data?.user);
	const organizationsQuery = useQuery({
		...orpc.bambi.organizations.getMine.queryOptions(),
		enabled: isSignedIn,
	});
	const organizations = organizationsQuery.data ?? [];

	if (session.isPending || organizationsQuery.isLoading) {
		return <Loader />;
	}

	if (
		!isSignedIn ||
		getErrorCode(organizationsQuery.error) === "UNAUTHORIZED"
	) {
		return (
			<PageShell
				description="조직 설정은 로그인 후 이용할 수 있습니다."
				title="조직 설정"
			>
				<EmptyState
					action={
						<Link className={buttonVariants()} href="/login">
							로그인
						</Link>
					}
					description="구인자 계정으로 로그인하면 조직 프로필과 팀을 관리할 수 있습니다."
					title="로그인이 필요합니다"
				/>
			</PageShell>
		);
	}

	if (organizationsQuery.isError) {
		return (
			<PageShell
				description="조직 설정 정보를 불러오지 못했습니다."
				title="조직 설정"
			>
				<EmptyState
					action={
						<Button onClick={() => organizationsQuery.refetch()} type="button">
							다시 시도
						</Button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="조직 설정을 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="공고에 노출되는 조직 이름을 관리하고, 팀과 멤버를 관리합니다."
			title="조직 설정"
		>
			<EmployerGateBanner action="조직 설정을 변경" />
			<section
				aria-labelledby="organization-profiles"
				className="flex flex-col gap-3"
			>
				<div>
					<h2 className="font-semibold text-lg" id="organization-profiles">
						조직 프로필
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						공고에 노출되는 조직 이름을 관리합니다.
					</p>
				</div>
				{organizations.length > 0 ? (
					<div className="grid gap-3">
						{organizations.map((organization) => (
							<OrgProfileForm
								disabled={!verified}
								key={organization.organizationId}
								organization={organization}
							/>
						))}
					</div>
				) : (
					<EmptyState
						action={
							<Link className={buttonVariants()} href="/employer">
								구인자 관리로 이동
							</Link>
						}
						description="조직 소유자 또는 매니저 권한이 있으면 설정을 관리할 수 있습니다."
						title="관리 가능한 조직이 없습니다"
					/>
				)}
			</section>

			<Separator />

			<section
				aria-labelledby="team-management"
				className="flex flex-col gap-3"
			>
				<div>
					<h2 className="font-semibold text-lg" id="team-management">
						팀 관리
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						팀을 나눠 지역·매장별로 공고 등록 권한을 관리합니다.
					</p>
				</div>
				<Card>
					<CardContent className="flex flex-wrap items-center gap-4">
						<span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-foreground">
							<Users className="size-5" />
						</span>
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<p className="font-medium text-sm">팀과 멤버</p>
							<p className="text-muted-foreground text-xs">
								팀을 만들고 멤버를 초대해 권한을 나눠요.
							</p>
						</div>
						{verified ? (
							<Link
								className={buttonVariants({ size: "sm", variant: "outline" })}
								href={"/employer/settings/teams" as Route}
							>
								팀 관리로 이동
							</Link>
						) : (
							<Button disabled size="sm" type="button" variant="outline">
								팀 관리로 이동
							</Button>
						)}
					</CardContent>
				</Card>
			</section>
		</PageShell>
	);
}
