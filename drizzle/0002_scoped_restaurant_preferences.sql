DROP INDEX IF EXISTS `restaurant_preference_user_kind_name_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `restaurant_preference_public_idx`;
--> statement-breakpoint
ALTER TABLE `restaurant_preference` ADD `location_scope` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `restaurant_preference` ADD `allergy_scope` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `restaurant_preference` ADD `food_scope` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE UNIQUE INDEX `restaurant_preference_user_kind_name_unique` ON `restaurant_preference` (`user_id`,`kind`,`normalized_name`,`location_scope`,`allergy_scope`,`food_scope`);
--> statement-breakpoint
CREATE INDEX `restaurant_preference_public_idx` ON `restaurant_preference` (`kind`,`normalized_name`,`location_scope`,`allergy_scope`,`food_scope`);
