"use client";

import { buttonVariants } from "@bambi-app/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";

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
						<button
							className={buttonVariants()}
							onClick={() => organizationsQuery.refetch()}
							type="button"
						>
							다시 시도
						</button>
					}
					description="로그인 상태와 연결 상태를 확인한 뒤 다시 시도해 주세요."
					title="조직 설정을 불러올 수 없습니다"
				/>
			</PageShell>
		);
	}

	return (
		<PageShell
			description="조직 표시 정보, 사업자 정보, 팀과 멤버 권한을 관리합니다."
			title="조직 설정"
		>
			<div className="flex flex-wrap gap-2">
				<Link
					className={buttonVariants({ variant: "outline" })}
					href={"/employer" as Route}
				>
					내 공고
				</Link>
				<Link
					className={buttonVariants()}
					href={"/employer/settings/teams" as Route}
				>
					팀 관리
				</Link>
			</div>

			<section aria-labelledby="organization-profiles" className="space-y-3">
				<div>
					<h2 className="font-medium text-base" id="organization-profiles">
						조직 프로필
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						검증 상태와 공개 표시 정보를 확인하고 소유자 권한으로 수정합니다.
					</p>
				</div>
				{organizations.length > 0 ? (
					<div className="grid gap-3">
						{organizations.map((organization) => (
							<OrgProfileForm
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
		</PageShell>
	);
}
