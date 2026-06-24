CREATE TABLE `notification_emails` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(128) NOT NULL DEFAULT '',
	`email` varchar(320) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_emails_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_emails_email_unique` UNIQUE(`email`)
);
