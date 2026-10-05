CREATE TABLE support_message (
 id text PRIMARY KEY NOT NULL,
 user_id text NOT NULL,
 email text NOT NULL,
 message text NOT NULL,
 created_at integer NOT NULL
);
CREATE INDEX support_message_user_created ON support_message(user_id, created_at);
