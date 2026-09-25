SAFFHIRE MONITORING - DRIVER PIPELINE LOGIN SYNC

After a successful client or staff login, the browser posts to /api/driverpipeline-login-sync.
If the host is driverpipeline.com, the username is a Driver Pipeline account, or the company name is Driver Pipeline, that endpoint runs /api/index?path=auto-sync&force=1.

This is a background refresh so new TazWorks orders appear without a manual Settings sync.
