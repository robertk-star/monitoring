CREATE TABLE `local_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`displayName` text,
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `local_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `local_users_username_unique` UNIQUE(`username`)
);
