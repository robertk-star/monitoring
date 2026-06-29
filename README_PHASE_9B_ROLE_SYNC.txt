SAFFHIRE MONITORING - PHASE 9B ROLE SYNC FIX

Problem fixed:
After logging out and logging in as a different user, the Phase 9 sidebar role card could keep showing the previous user, for example Robert · Admin, while the rest of the page correctly applied viewer restrictions.

What this phase does:
- Forces the sidebar role card to resync from /api/auth/me every 1.2 seconds.
- Updates the native sidebar user display.
- Hides Settings for non-admins based on the current active session.
- Applies viewer read-only controls from the current active session.
- Updates the Phase 9 Permissions panel to match the active login.

Files included:
- index.html
- public/phase9b-role-sync.js
- README_PHASE_9B_ROLE_SYNC.txt

SQL needed:
No.

Vercel ENV needed:
No.

Install:
1. Upload these files over the existing project.
2. Redeploy Vercel.
3. Hard refresh the browser.
4. Log out.
5. Log in as the test viewer.
6. Confirm the sidebar says test · viewer instead of Robert · admin.
7. Confirm Settings is hidden for the viewer.
8. Confirm viewer restrictions still apply.

If browser still shows old content:
- Do a hard refresh.
- Or open in an incognito/private window.
