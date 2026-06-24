CREATE TABLE `employer_form_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`safetyReportId` int NOT NULL,
	`fileNumber` varchar(64) NOT NULL,
	`applicantEmail` varchar(320) NOT NULL DEFAULT '',
	`used` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `employer_form_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `employer_form_tokens_token_unique` UNIQUE(`token`)
);
