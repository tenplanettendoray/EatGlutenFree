CREATE TABLE `restaurant_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restaurant_preference_user_kind_name_unique` ON `restaurant_preference` (`user_id`,`kind`,`normalized_name`);
--> statement-breakpoint
CREATE INDEX `restaurant_preference_user_idx` ON `restaurant_preference` (`user_id`);
--> statement-breakpoint
CREATE INDEX `restaurant_preference_public_idx` ON `restaurant_preference` (`kind`,`normalized_name`);
