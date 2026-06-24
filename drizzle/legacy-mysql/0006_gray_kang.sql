CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(128) NOT NULL,
	`sheetUrlApplicants` text NOT NULL DEFAULT '',
	`sheetUrlMedExpire` text NOT NULL DEFAULT '',
	`sheetUrlNotes` text NOT NULL DEFAULT '',
	`sheetUrlSR` text NOT NULL DEFAULT '',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `viewer_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`canViewMonitoring` boolean NOT NULL DEFAULT true,
	`canEditMonitoring` boolean NOT NULL DEFAULT false,
	`canViewSafetyPerformance` boolean NOT NULL DEFAULT true,
	`canEditSafetyPerformance` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `viewer_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `local_users` MODIFY COLUMN `role` enum('user','admin','viewer') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `local_users` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `safety_reports` ADD `companyId` int DEFAULT 1 NOT NULL;