CREATE TABLE "counters" (
	"name" text NOT NULL,
	"period" text NOT NULL,
	"value" integer NOT NULL,
	CONSTRAINT "counters_name_period_pk" PRIMARY KEY("name","period")
);
