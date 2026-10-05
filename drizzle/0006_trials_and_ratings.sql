ALTER TABLE "user" ADD COLUMN trial_started_at integer;
CREATE TABLE restaurant_rating (
 id text PRIMARY KEY NOT NULL,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 restaurant_key text NOT NULL,
 stars integer NOT NULL CHECK(stars BETWEEN 1 AND 5),
 updated_at integer NOT NULL
);
CREATE UNIQUE INDEX restaurant_rating_user_key ON restaurant_rating(user_id, restaurant_key);
CREATE INDEX restaurant_rating_key ON restaurant_rating(restaurant_key);
