CREATE TABLE IF NOT EXISTS `restaurant_search_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `restaurant_search_cache_mode_idx` ON `restaurant_search_cache` (`mode`);
