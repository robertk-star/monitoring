import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Build the CREATE TABLE SQL directly (avoiding text DEFAULT '' issue)
const createSQL = `
CREATE TABLE IF NOT EXISTS \`safety_reports\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`applicantName\` varchar(255) NOT NULL DEFAULT '',
  \`fileNumber\` varchar(64) NOT NULL DEFAULT '',
  \`created\` varchar(32) NOT NULL DEFAULT '',
  \`status\` enum('S1 Complete','Emp Sent','Emp Complete','Completed') NOT NULL DEFAULT 'S1 Complete',
  \`followUpDate\` varchar(32) NOT NULL DEFAULT '',
  \`notes\` varchar(1000) NOT NULL DEFAULT '',
  \`prevEmployerName\` varchar(255) NOT NULL DEFAULT '',
  \`prevEmployerEmail\` varchar(320) NOT NULL DEFAULT '',
  \`prevEmployerStreet\` varchar(255) NOT NULL DEFAULT '',
  \`prevEmployerPhone\` varchar(64) NOT NULL DEFAULT '',
  \`prevEmployerFax\` varchar(64) NOT NULL DEFAULT '',
  \`prevEmployerCityStateZip\` varchar(255) NOT NULL DEFAULT '',
  \`employerName\` varchar(255) NOT NULL DEFAULT '',
  \`employerAttention\` varchar(255) NOT NULL DEFAULT '',
  \`employerStreet\` varchar(255) NOT NULL DEFAULT '',
  \`employerCityStateZip\` varchar(255) NOT NULL DEFAULT '',
  \`employerPhone\` varchar(64) NOT NULL DEFAULT '',
  \`employerFax\` varchar(64) NOT NULL DEFAULT '',
  \`employerEmail\` varchar(320) NOT NULL DEFAULT '',
  \`confFax\` varchar(64) NOT NULL DEFAULT '',
  \`confEmail\` varchar(320) NOT NULL DEFAULT '',
  \`employedByCompany\` varchar(255) NOT NULL DEFAULT '',
  \`jobTitle\` varchar(255) NOT NULL DEFAULT '',
  \`fromDate\` varchar(32) NOT NULL DEFAULT '',
  \`toDate\` varchar(32) NOT NULL DEFAULT '',
  \`droveMotorVehicle\` varchar(32) NOT NULL DEFAULT '',
  \`vehicleStraightTruck\` boolean NOT NULL DEFAULT false,
  \`vehicleTractorSemitrailer\` boolean NOT NULL DEFAULT false,
  \`vehicleBus\` boolean NOT NULL DEFAULT false,
  \`vehicleCargoTank\` boolean NOT NULL DEFAULT false,
  \`vehicleDoublesTriples\` boolean NOT NULL DEFAULT false,
  \`vehicleOther\` boolean NOT NULL DEFAULT false,
  \`accidentHistory\` varchar(32) NOT NULL DEFAULT '',
  \`accidentDate1\` varchar(32) NOT NULL DEFAULT '',
  \`accidentLocation1\` varchar(255) NOT NULL DEFAULT '',
  \`accidentInjuries1\` varchar(32) NOT NULL DEFAULT '',
  \`accidentFatalities1\` varchar(32) NOT NULL DEFAULT '',
  \`accidentHazmat1\` varchar(32) NOT NULL DEFAULT '',
  \`accidentDate2\` varchar(32) NOT NULL DEFAULT '',
  \`accidentLocation2\` varchar(255) NOT NULL DEFAULT '',
  \`accidentInjuries2\` varchar(32) NOT NULL DEFAULT '',
  \`accidentFatalities2\` varchar(32) NOT NULL DEFAULT '',
  \`accidentHazmat2\` varchar(32) NOT NULL DEFAULT '',
  \`accidentDate3\` varchar(32) NOT NULL DEFAULT '',
  \`accidentLocation3\` varchar(255) NOT NULL DEFAULT '',
  \`accidentInjuries3\` varchar(32) NOT NULL DEFAULT '',
  \`accidentFatalities3\` varchar(32) NOT NULL DEFAULT '',
  \`accidentHazmat3\` varchar(32) NOT NULL DEFAULT '',
  \`otherAccidents\` varchar(1000) NOT NULL DEFAULT '',
  \`dotCompany\` varchar(255) NOT NULL DEFAULT '',
  \`dotEmployee\` varchar(255) NOT NULL DEFAULT '',
  \`dotAlcoholTestPositive\` boolean NOT NULL DEFAULT false,
  \`dotDrugTestPositive\` boolean NOT NULL DEFAULT false,
  \`dotRefusedTest\` boolean NOT NULL DEFAULT false,
  \`dotOtherViolations\` boolean NOT NULL DEFAULT false,
  \`infoReceivedFrom\` varchar(255) NOT NULL DEFAULT '',
  \`infoReceivedDate\` varchar(32) NOT NULL DEFAULT '',
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`safety_reports_id\` PRIMARY KEY(\`id\`)
)`;

try {
  await conn.execute(createSQL);
  console.log('Table created successfully.');
} catch (e) {
  if (e.code === 'ER_TABLE_EXISTS_ERROR') {
    console.log('Table already exists — skipping creation.');
  } else {
    console.error('Error creating table:', e.message);
    process.exit(1);
  }
}

await conn.end();
console.log('Done.');
