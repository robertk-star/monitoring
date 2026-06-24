# Safety Performance Backup — Google Sheets Setup Guide

This guide walks you through setting up a Google Sheet that serves as a full backup of all Safety Performance records for a company. Once configured, you can push the entire database to the sheet at any time with a single button click from the dashboard.

---

## How It Works

The backup system is a one-way **push from the dashboard to Google Sheets**. When you click **Push Backup** on the Safety Performance page, the dashboard reads every record from the database for the selected company and sends them all to the Google Sheet in one batch. The sheet is completely replaced with the current database state — no partial updates, no merging, no risk of stale data.

The sheet is **read-only from the dashboard's perspective** — it does not pull data back from the sheet. Its purpose is to give you a human-readable, shareable, and recoverable copy of all records outside the database.

---

## Step 1 — Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it something descriptive, for example: **Driver Pipeline — Safety Performance Backup**.
3. Leave the first tab blank — the script will create and format the header row automatically on the first push.

---

## Step 2 — Add the Google Apps Script

1. Inside the spreadsheet, click **Extensions → Apps Script**.
2. Delete all existing code in the editor (the default `function myFunction() {}` stub).
3. Copy the entire contents of the file `safety-performance-backup-script.gs` (provided alongside this guide) and paste it into the editor.
4. Click the **Save** icon (or press `Ctrl+S` / `Cmd+S`). Name the project something like **SaffHire Backup Script**.

---

## Step 3 — Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to **Select type** and choose **Web app**.
3. Fill in the deployment settings:

| Setting | Value |
|---|---|
| Description | SaffHire Safety Performance Backup |
| Execute as | **Me** (your Google account) |
| Who has access | **Anyone** |

4. Click **Deploy**.
5. Google will ask you to authorize the script — click **Authorize access** and follow the prompts to grant permission to your Google account.
6. After authorization, Google will show you the **Web app URL**. It will look like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   **Copy this URL** — you will need it in Step 4.

> **Important:** Every time you make changes to the script and redeploy, Google creates a new version. If you redeploy, make sure to copy the new URL and update it in the dashboard settings.

---

## Step 4 — Configure the Dashboard

1. Log into the SaffHire dashboard as an **Admin**.
2. Go to **Settings → Companies**.
3. Find the company you want to configure (e.g., Driver Pipeline) and click **Edit**.
4. Scroll down to the **Backup Sheet URL** field.
5. Paste the Web app URL from Step 3.
6. Click **Save Changes**.

---

## Step 5 — Run Your First Backup

1. Navigate to the **Safety Performance** page.
2. Make sure you are viewing the correct company.
3. Click the **Push Backup** button (orange, with a cloud upload icon) in the top-right toolbar.
4. The button will show "Backing up..." while the push is in progress. For 30+ records this typically takes 5–15 seconds.
5. When complete, a success toast will appear: **"Backup complete — X records pushed to Google Sheets."**
6. Open your Google Sheet to verify the data. You should see a header row and one row per safety report.

---

## Sheet Structure

The backup sheet contains one row per safety report with the following columns, in order:

| Column | Description |
|---|---|
| File Number | Unique identifier |
| Applicant Name | Driver's name |
| Created | Date the record was created |
| Status | Current workflow status (S1 Complete, Emp Sent, Emp Complete, Completed) |
| Follow Up Date | Next follow-up date |
| Notes | Internal notes |
| Prev Employer Name | Previous employer contact info |
| Prev Employer Email | |
| Prev Employer Street | |
| Prev Employer Phone | |
| Prev Employer Fax | |
| Prev Employer City/State/Zip | |
| Employer Name | Prospective employer contact info |
| Employer Attention | |
| Employer Street | |
| Employer City/State/Zip | |
| Employer Phone | |
| Employer Fax | |
| Employer Email | |
| Conf Fax | Confirmation fax |
| Conf Email | Confirmation email |
| Employed By Company | Employment history |
| Job Title | |
| From Date | |
| To Date | |
| Drove Motor Vehicle | |
| Vehicle Straight Truck | Yes / No |
| Vehicle Tractor Semitrailer | Yes / No |
| Vehicle Bus | Yes / No |
| Vehicle Cargo Tank | Yes / No |
| Vehicle Doubles/Triples | Yes / No |
| Vehicle Other | Yes / No |
| Accident History | Section 3 — accident records |
| Accident Date 1–3 | |
| Accident Location 1–3 | |
| Accident Injuries 1–3 | |
| Accident Fatalities 1–3 | |
| Accident Hazmat 1–3 | |
| Other Accidents | |
| DOT Company | Section 4 — DOT drug/alcohol |
| DOT Employee | |
| DOT Alcohol Test Positive | Yes / No |
| DOT Drug Test Positive | Yes / No |
| DOT Refused Test | Yes / No |
| DOT Other Violations | Yes / No |
| Info Received From | Section 5 |
| Info Received Date | |
| Last Emailed | Timestamp of last employer form email |
| Last Updated | Timestamp of when this row was last pushed |

---

## When to Push a Backup

There is no automatic schedule — the backup is triggered manually. Recommended times to push:

- After any batch of edits (status changes, follow-up date updates, employer form completions)
- At the end of each work week as a routine snapshot
- Before any major data changes or imports
- Whenever you want to share the current data with someone outside the dashboard

---

## Recovering Data from the Backup

The backup sheet is a plain Google Sheet. If you ever need to recover data:

1. Open the backup sheet in Google Sheets.
2. Find the rows you need and copy the values.
3. Re-enter them in the dashboard via the Safety Performance edit form, or contact your administrator to perform a bulk import.

The backup sheet is not a live restore source — it is a human-readable reference copy.

---

## Troubleshooting

**"No Backup Sheet URL configured" error when clicking Push Backup**
Go to Settings → Companies → Edit and add the Web app URL from Step 3.

**"Backup failed" error**
The most common cause is that the Google Apps Script deployment has expired or the authorization was revoked. Go to the Apps Script editor, click Deploy → Manage deployments, and create a new deployment. Update the URL in Settings.

**The sheet is empty after pushing**
Check that the script was saved and deployed correctly. Open the Apps Script editor and verify the code is present. Try clicking the Push Backup button again.

**"Access denied" when deploying**
Make sure "Who has access" is set to **Anyone** (not "Anyone with Google account"). The dashboard server calls the URL from a server environment without a Google session.
