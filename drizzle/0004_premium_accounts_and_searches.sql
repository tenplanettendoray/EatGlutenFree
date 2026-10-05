ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user` ADD `premium_plan` text;
--> statement-breakpoint
ALTER TABLE `user` ADD `premium_activated_at` integer;
--> statement-breakpoint
ALTER TABLE `user` ADD `premium_updated_at` integer;
--> statement-breakpoint
CREATE TABLE `user_search` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mode` text NOT NULL,
	`location` text NOT NULL,
	`food` text DEFAULT '' NOT NULL,
	`allergies` text DEFAULT '' NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_search_user_created_idx` ON `user_search` (`user_id`,`created_at`);
