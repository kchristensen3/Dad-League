ALTER TABLE "event_series" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "event_series" ADD COLUMN "place_address" text;--> statement-breakpoint
ALTER TABLE "event_series" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "event_series" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "place_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "place_address" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "lng" double precision;