ALTER TABLE "boards" ADD COLUMN "card_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: sem isto, um quadro que já tem cards recomeçaria a numeração em 1
-- e a primeira criação violaria cards_board_number_unique.
UPDATE "boards" SET "card_sequence" = COALESCE(
  (SELECT MAX("number") FROM "cards" WHERE "cards"."board_id" = "boards"."id"),
  0
);
