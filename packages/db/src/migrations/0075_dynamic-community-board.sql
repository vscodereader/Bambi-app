-- 수다방 게시판을 pgEnum에서 테이블로 옮긴다. 순서가 중요하다: pg는 타입과 테이블이
-- 같은 이름 공간을 쓰므로 enum 타입을 지우기 전에는 같은 이름의 테이블을 만들 수 없다.
-- ① 컬럼을 text로 → ② 타입 DROP → ③ 테이블 생성 → ④ 기존 5개 게시판 시드 → ⑤ FK.
ALTER TABLE "community_post" ALTER COLUMN "board" SET DATA TYPE text USING "board"::text;--> statement-breakpoint
DROP TYPE "public"."community_board";--> statement-breakpoint
CREATE TABLE "community_board" (
	"key" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_writable" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "community_board_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
INSERT INTO "community_board" ("key", "slug", "label", "description", "sort_order") VALUES
	('notice', 'notice', '공지사항', '밤비알바 수다방 공지', 0),
	('free', 'free', '자유수다', '밤비알바 회원들의 자유로운 이야기', 20),
	('work_talk', 'work-talk', '밤문화 이야기', '일·알바 경험과 정보를 나눠요', 30),
	('market', 'market', '중고거래', '회원 간 중고 물품 거래', 40),
	('legal', 'legal', '무료 법률 자문', '법률자문에게 비밀글로 물어보는 무료 상담', 50);
--> statement-breakpoint
ALTER TABLE "community_post" ADD CONSTRAINT "community_post_board_community_board_key_fk" FOREIGN KEY ("board") REFERENCES "public"."community_board"("key") ON DELETE no action ON UPDATE no action;
