CREATE TABLE restaurant_rating_half (
 id text PRIMARY KEY NOT NULL,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 restaurant_key text NOT NULL,
 stars real NOT NULL CHECK(stars BETWEEN 0.5 AND 5 AND stars * 2 = CAST(stars * 2 AS integer)),
 updated_at integer NOT NULL
);
INSERT INTO restaurant_rating_half SELECT id, user_id, restaurant_key, stars, updated_at FROM restaurant_rating;
DROP TABLE restaurant_rating;
ALTER TABLE restaurant_rating_half RENAME TO restaurant_rating;
CREATE UNIQUE INDEX restaurant_rating_user_key ON restaurant_rating(user_id, restaurant_key);
CREATE INDEX restaurant_rating_key ON restaurant_rating(restaurant_key);
