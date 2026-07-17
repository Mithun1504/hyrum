CREATE INDEX "behavior_definitions_label_trgm_idx" ON "behavior_definitions" USING gin ("default_label" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "api_services_name_trgm_idx" ON "api_services" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "api_operations_path_trgm_idx" ON "api_operations" USING gin ("normalized_path_template" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "api_operations_display_name_trgm_idx" ON "api_operations" USING gin ("display_name" gin_trgm_ops) WHERE "api_operations"."display_name" is not null;