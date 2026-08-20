UPDATE "report"
SET "target_snapshot" = coalesce("target_snapshot", '{}'::jsonb)
	#- '{reporterIdentity,realName}'
	#- '{reporterIdentity,name}'
	#- '{communityPost,authorIdentity,realName}'
	#- '{communityPost,authorIdentity,name}'
	#- '{communityPost,secretIdentity,realName}'
	#- '{communityPost,secretIdentity,name}'
	#- '{communityComment,authorIdentity,realName}'
	#- '{communityComment,authorIdentity,name}'
	#- '{communityComment,secretIdentity,realName}'
	#- '{communityComment,secretIdentity,name}'
WHERE "target_snapshot" IS NOT NULL;
