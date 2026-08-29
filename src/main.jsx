import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { Activity, ArrowLeft, ClipboardCheck, Copy, Database, LogOut, Mail, Pencil, Plus, Printer, RefreshCw, Save, Search, Settings, ShieldCheck, Trash2, Truck, UserCog, X } from 'lucide-react';
import SettingsManager from './SettingsPage.jsx';
import './styles.css';

const LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/SaffhireLogoShirtStyle_0449b2e9.webp';
const STATUSES = ['Consent Needed', 'Sent to Applicant', 'Consent Given', 'S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed'];
const VEHICLES = [
  ['vehicleStraightTruck', 'Straight Truck'],
  ['vehicleTractorSemitrailer', 'Tractor/Semitrailer'],
  ['vehicleBus', 'Bus'],
  ['vehicleCargoTank', 'Cargo Tank'],
  ['vehicleDoublesTriples', 'Doubles/Triples'],
  ['vehicleOther', 'Other'],
];
const DOT_FIELDS = [
  ['dotAlcoholTestPositive', 'Alcohol test positive'],
  ['dotDrugTestPositive', 'Drug test positive'],
  ['dotRefusedTest', 'Refused test'],
  ['dotOtherViolations', 'Other DOT violations'],
];

function isClientPortalAccount(user) {
  const role = String(user?.role || '');
  if (role === 'client_admin' || role === 'client_user') return true;
  if (role === 'viewer' && user?.companyId && user?.clientAccess && Object.values(user.clientAccess).some((value) => value === false)) return true;
  return false;
}

const DEFAULT_INTERNAL_ACCESS = { monitoring: true, safetyReports: true };
function normalizedInternalAccess(user) {
  const source = user?.internalAccess && typeof user.internalAccess === 'object' ? user.internalAccess : {};
  return {
    monitoring: Object.prototype.hasOwnProperty.call(source, 'monitoring') ? source.monitoring === true : true,
    safetyReports: Object.prototype.hasOwnProperty.call(source, 'safetyReports') ? source.safetyReports === true : true,
  };
}
function canAccessMonitoringAdmin(user) {
  if (user?.role === 'admin' || user?.role === 'viewer') return true;
  return user?.role === 'user' && normalizedInternalAccess(user).monitoring;
}
function canAccessSafetyAdmin(user) {
  if (user?.role === 'admin' || user?.role === 'viewer') return true;
  return user?.role === 'user' && normalizedInternalAccess(user).safetyReports;
}
function canManageEmailSettings(user) {
  return user?.role === 'admin' || (user?.role === 'user' && normalizedInternalAccess(user).safetyReports);
}
function allowedInternalPages(user) {
  const pages = ['dashboard'];
  if (canAccessMonitoringAdmin(user)) pages.push('monitoring');
  if (canAccessSafetyAdmin(user)) pages.push('safety');
  if (canManageEmailSettings(user)) pages.push('email-settings');
  if (user?.role === 'admin') pages.push('settings');
  return pages;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned non-JSON: ${text.slice(0, 140)}`); }
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
}

function defaultReport(company) {
  return {
    applicantName: '', applicantEmail: '', fileNumber: '', created: new Date().toISOString().slice(0, 10), status: 'Consent Needed', followUpDate: '', notes: '',
    prevEmployerName: '', prevEmployerEmail: '', prevEmployerStreet: '', prevEmployerPhone: '', prevEmployerFax: '', prevEmployerCityStateZip: '',
    employerName: company?.name || 'Driver Pipeline', employerAttention: '', employerStreet: '1200 N. Union Bower Road', employerCityStateZip: 'Irving, TX 75061', employerPhone: '972-573-2301', employerFax: '', employerEmail: 'lmercado@driverpipeline.com', confFax: '', confEmail: '',
    employedByCompany: '', jobTitle: '', fromDate: '', toDate: '', droveMotorVehicle: '',
    vehicleStraightTruck: false, vehicleTractorSemitrailer: false, vehicleBus: false, vehicleCargoTank: false, vehicleDoublesTriples: false, vehicleOther: false,
    accidentHistory: '', accidentDate1: '', accidentLocation1: '', accidentInjuries1: '', accidentFatalities1: '', accidentHazmat1: '', accidentDate2: '', accidentLocation2: '', accidentInjuries2: '', accidentFatalities2: '', accidentHazmat2: '', accidentDate3: '', accidentLocation3: '', accidentInjuries3: '', accidentFatalities3: '', accidentHazmat3: '', otherAccidents: '',
    dotCompany: '', dotEmployee: '', dotAlcoholTestPositive: false, dotDrugTestPositive: false, dotRefusedTest: false, dotOtherViolations: false,
    infoReceivedFrom: '', infoReceivedDate: '',
  };
}

function clean(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function display(value, fallback = '—') {
  const text = clean(value);
  return text || fallback;
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function vehicleSummary(report) {
  const selected = VEHICLES.filter(([key]) => Boolean(report[key])).map(([, label]) => label);
  return selected.length ? selected.join(', ') : 'None listed';
}

function accidentRows(report) {
  return [1, 2, 3].map((n) => ({
    number: n,
    date: report[`accidentDate${n}`],
    location: report[`accidentLocation${n}`],
    injuries: report[`accidentInjuries${n}`],
    fatalities: report[`accidentFatalities${n}`],
    hazmat: report[`accidentHazmat${n}`],
  }));
}

function buildSafetyPrintHtml(report, company) {
  const safe = (value, fallback = '') => escapeHtml(display(value, fallback));
  const accidents = accidentRows(report);
  const title = `Safety Performance Report - ${display(report.fileNumber, report.applicantName)}`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; background: #f3f4f6; }
    .page { width: 8.5in; min-height: 11in; margin: 20px auto; background: #fff; padding: .45in; border: 1px solid #d1d5db; }
    .top { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #111827; padding-bottom: 12px; margin-bottom: 16px; }
    .logo { max-height: 48px; max-width: 190px; object-fit: contain; }
    h1 { font-size: 22px; margin: 0; }
    h2 { font-size: 15px; background: #f3f4f6; border: 1px solid #d1d5db; padding: 8px 10px; margin: 18px 0 10px; }
    h3 { font-size: 13px; margin: 12px 0 6px; }
    .meta { color: #4b5563; font-size: 12px; margin-top: 5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
    .field { border-bottom: 1px solid #d1d5db; min-height: 26px; padding: 3px 0; font-size: 12px; }
    .field b { display: inline-block; min-width: 155px; color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
    th, td { border: 1px solid #d1d5db; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; color: #374151; }
    .notes { white-space: pre-wrap; border: 1px solid #d1d5db; padding: 8px; min-height: 46px; font-size: 12px; }
    .signature { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin-top: 24px; font-size: 12px; }
    .line { border-bottom: 1px solid #111827; height: 30px; }
    .print-note { color: #6b7280; font-size: 11px; margin-top: 14px; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; width: auto; min-height: auto; border: 0; padding: .35in; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top">
      <div>
        <h1>Safety Performance History Request</h1>
        <div class="meta">Printable PDF-style report generated from the SaffHire Monitoring database.</div>
      </div>
      <img class="logo" src="${LOGO}" alt="SaffHire" />
    </div>

    <div class="grid">
      <div class="field"><b>File Number:</b> ${safe(report.fileNumber)}</div>
      <div class="field"><b>Status:</b> ${safe(report.status)}</div>
      <div class="field"><b>Applicant Name:</b> ${safe(report.applicantName)}</div>
      <div class="field"><b>Created:</b> ${safe(report.created)}</div>
      <div class="field"><b>Current Company:</b> ${safe(company?.name || report.employerName)}</div>
      <div class="field"><b>Follow Up Date:</b> ${safe(report.followUpDate)}</div>
    </div>

    <h2>Section 1: Previous Employer</h2>
    <div class="grid">
      <div class="field"><b>Employer Name:</b> ${safe(report.prevEmployerName)}</div>
      <div class="field"><b>Email:</b> ${safe(report.prevEmployerEmail)}</div>
      <div class="field"><b>Street:</b> ${safe(report.prevEmployerStreet)}</div>
      <div class="field"><b>Phone:</b> ${safe(report.prevEmployerPhone)}</div>
      <div class="field"><b>City/State/Zip:</b> ${safe(report.prevEmployerCityStateZip)}</div>
      <div class="field"><b>Fax:</b> ${safe(report.prevEmployerFax)}</div>
    </div>

    <h2>Prospective Employer</h2>
    <div class="grid">
      <div class="field"><b>Employer Name:</b> ${safe(report.employerName)}</div>
      <div class="field"><b>Attention:</b> ${safe(report.employerAttention)}</div>
      <div class="field"><b>Street:</b> ${safe(report.employerStreet)}</div>
      <div class="field"><b>Phone:</b> ${safe(report.employerPhone)}</div>
      <div class="field"><b>City/State/Zip:</b> ${safe(report.employerCityStateZip)}</div>
      <div class="field"><b>Email:</b> ${safe(report.employerEmail)}</div>
      <div class="field"><b>Confidential Fax:</b> ${safe(report.confFax)}</div>
      <div class="field"><b>Confidential Email:</b> ${safe(report.confEmail)}</div>
    </div>

    <h2>Section 2: Employment Verification</h2>
    <div class="grid">
      <div class="field"><b>Employed by Company:</b> ${safe(report.employedByCompany)}</div>
      <div class="field"><b>Job Title:</b> ${safe(report.jobTitle)}</div>
      <div class="field"><b>From Date:</b> ${safe(report.fromDate)}</div>
      <div class="field"><b>To Date:</b> ${safe(report.toDate)}</div>
      <div class="field"><b>Drove Motor Vehicle:</b> ${safe(report.droveMotorVehicle)}</div>
      <div class="field"><b>Vehicles:</b> ${escapeHtml(vehicleSummary(report))}</div>
    </div>

    <h2>Section 3: Accident History</h2>
    <div class="field"><b>Accident History:</b> ${safe(report.accidentHistory)}</div>
    <table>
      <thead><tr><th>#</th><th>Date</th><th>Location</th><th>Injuries</th><th>Fatalities</th><th>Hazmat</th></tr></thead>
      <tbody>
        ${accidents.map((row) => `<tr><td>${row.number}</td><td>${safe(row.date)}</td><td>${safe(row.location)}</td><td>${safe(row.injuries)}</td><td>${safe(row.fatalities)}</td><td>${safe(row.hazmat)}</td></tr>`).join('')}
      </tbody>
    </table>
    <h3>Other Accidents</h3>
    <div class="notes">${safe(report.otherAccidents)}</div>

    <h2>Section 4: DOT Drug and Alcohol Questions</h2>
    <div class="grid">
      <div class="field"><b>Company Representative:</b> ${safe(report.dotCompany)}</div>
      <div class="field"><b>Employee:</b> ${safe(report.dotEmployee)}</div>
      <div class="field"><b>Alcohol Test Positive:</b> ${yesNo(report.dotAlcoholTestPositive)}</div>
      <div class="field"><b>Drug Test Positive:</b> ${yesNo(report.dotDrugTestPositive)}</div>
      <div class="field"><b>Refused Test:</b> ${yesNo(report.dotRefusedTest)}</div>
      <div class="field"><b>Other DOT Violations:</b> ${yesNo(report.dotOtherViolations)}</div>
    </div>

    <h2>Section 5: Information Received</h2>
    <div class="grid">
      <div class="field"><b>Received From:</b> ${safe(report.infoReceivedFrom)}</div>
      <div class="field"><b>Date Received:</b> ${safe(report.infoReceivedDate)}</div>
    </div>

    <h2>Internal Notes</h2>
    <div class="notes">${safe(report.notes)}</div>

    <div class="signature">
      <div><div class="line"></div> Completed By / Signature</div>
      <div><div class="line"></div> Date</div>
    </div>

    <p class="print-note no-print">Use your browser print window and choose “Save as PDF” to save this report.</p>
  </div>
</body>
</html>`;
}

function printSafetyReport(report, company) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Popup blocked. Please allow popups for this site and try again.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(buildSafetyPrintHtml(report, company));
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 350);
}

function buildEmployerEmailDraft(report, company) {
  const applicant = display(report.applicantName, 'the applicant');
  const fileNumber = display(report.fileNumber, '');
  const to = clean(report.prevEmployerEmail);
  const subject = `Safety Performance Information Request${fileNumber ? ` - File #${fileNumber}` : ''}`;
  const body = [
    'Hello,',
    '',
    `SaffHire is completing a Safety Performance report for ${display(company?.name || report.employerName, 'our client')}.`,
    '',
    `Applicant: ${applicant}`,
    fileNumber ? `File Number: ${fileNumber}` : '',
    report.prevEmployerName ? `Previous Employer Listed: ${report.prevEmployerName}` : '',
    '',
    'Please reply with the employment verification and safety performance information you are able to provide, including:',
    '- Employment dates and job title',
    '- Whether the applicant drove a motor vehicle',
    '- Vehicle type(s), if applicable',
    '- Accident history, if applicable',
    '- DOT drug/alcohol testing information, if applicable',
    '- Name of the person providing the information and the date completed',
    '',
    'Thank you,',
    'SaffHire Background Screening',
  ].filter(Boolean).join('\n');
  return { to, subject, body };
}

function draftText({ to, subject, body }) {
  return `To: ${to || '[enter previous employer email]'}\nSubject: ${subject}\n\n${body}`;
}

async function copyDraftToClipboard(draft) {
  const text = draftText(draft);
  try {
    await navigator.clipboard.writeText(text);
    alert('Email draft copied to clipboard.');
  } catch {
    window.prompt('Copy this email draft:', text);
  }
}

async function openEmployerEmail(report, company) {
  const draft = buildEmployerEmailDraft(report, company);
  await copyDraftToClipboard(draft);
  if (!draft.to) {
    alert('No previous employer email is saved on this report. The draft was copied so you can paste it into an email manually.');
    return;
  }
  const mailto = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  const mailWindow = window.open(mailto, '_blank', 'noopener,noreferrer');
  if (!mailWindow) window.location.href = mailto;
}

function Login({ onAuth }) {
  const [loading, setLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/auth/setup-status').then((data) => setHasAdmin(Boolean(data.hasAdmin))).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const isSetup = !hasAdmin;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (isSetup && password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      const data = await api(isSetup ? '/api/auth/setup-admin' : '/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password, rememberMe }) });
      onAuth(data.user);
    } catch (err) {
      setError(err.message || 'Could not log in.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="center-screen"><div className="spinner" /></div>;

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <img src={LOGO} alt="SaffHire" className="login-logo" />
        <div className="login-title-row">
          {isSetup ? <ShieldCheck size={30} /> : <Truck size={30} />}
          <div><h1>{isSetup ? 'First-Time Setup' : 'Sign In'}</h1><p>{isSetup ? 'Create the first admin account.' : 'Enter your username and password.'}</p></div>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} autoFocus />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isSetup ? 6 : undefined} />
        {isSetup ? <><label>Confirm Password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></> : <label className="check-row"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember me for 30 days</label>}
        <button className="primary-btn" disabled={submitting}>{submitting ? 'Please wait...' : isSetup ? 'Create Admin Account' : 'Sign In'}</button>
      </form>
    </div>
  );
}

function RequiredPasswordChange({ user, onChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('Your new password must be at least 8 characters.');
    if (newPassword !== confirmation) return setError('The new passwords do not match.');
    if (newPassword === currentPassword) return setError('Choose a password different from the temporary password.');
    setSaving(true);
    try {
      await api('/api/index?path=change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onChanged({ ...user, mustChangePassword: false });
    } catch (err) {
      setError(err.message || 'Could not change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <img src={LOGO} alt="SaffHire" className="login-logo" />
        <div className="login-title-row">
          <ShieldCheck size={30} />
          <div><h1>Create Your Password</h1><p>Your administrator issued a temporary password. You must replace it before continuing.</p></div>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <label>Temporary Password</label>
        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoFocus autoComplete="current-password" />
        <label>New Password</label>
        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
        <label>Confirm New Password</label>
        <input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" />
        <button className="primary-btn" disabled={saving}>{saving ? 'Saving...' : 'Set My Password'}</button>
        <button type="button" className="secondary-btn" onClick={onLogout}>Sign Out</button>
      </form>
    </div>
  );
}

function Layout({ user, children, page, setPage, onLogout }) {
  const nav = [
    ['dashboard', 'Dashboard', Activity, true],
    ['monitoring', 'Monitoring', ClipboardCheck, canAccessMonitoringAdmin(user)],
    ['safety', 'Safety Performance', Truck, canAccessSafetyAdmin(user)],
    ['email-settings', 'Email Settings', Mail, canManageEmailSettings(user)],
    ['settings', 'Settings', Settings, user?.role === 'admin'],
  ].filter(([, , , allowed]) => allowed);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src={LOGO} alt="SaffHire" className="side-logo" />
        <div className="side-title">Monitoring</div>
        <nav>{nav.map(([key, label, Icon]) => <button key={key} data-native-page={key} className={page === key ? 'nav-btn active' : 'nav-btn'} onClick={() => setPage(key)}><Icon size={18} /> {label}</button>)}</nav>
        <div className="side-footer"><div className="user-pill"><UserCog size={16} /> {user?.displayName || user?.username}</div><button className="nav-btn" onClick={onLogout}><LogOut size={18} /> Logout</button></div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}

function Header({ title, subtitle, action, actions }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="header-actions">{action ? <button className="secondary-btn" onClick={action}><RefreshCw size={16} /> Refresh</button> : null}{actions}</div></div>;
}

function Metric({ title, value, icon: Icon, subtitle, onClick }) {
  const content = <><div><p>{title}</p><strong>{value}</strong>{subtitle ? <small>{subtitle}</small> : null}</div><Icon size={28} /></>;
  if (!onClick) return <div className="card metric">{content}</div>;
  return <button type="button" className="card metric metric-button" onClick={onClick} title={`Open ${title}`}>{content}</button>;
}

function statusText(value) {
  return String(value || '').trim();
}

function parseAppDate(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function medExpireDays(value) {
  const d = parseAppDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function medExpiresWithin30(value) {
  const days = medExpireDays(value);
  return days !== null && days >= 0 && days <= 30;
}

function monitoringIsOn(applicant) {
  return String(applicant?.monitorStatus || '').trim().toLowerCase() === 'on';
}

function monitoringAlertState(applicant) {
  if (!monitoringIsOn(applicant)) return 'off';
  const days = medExpireDays(applicant?.medExpire);
  if (days === null) return 'blank';
  if (days < 0) return 'expired';
  if (days <= 30) return 'exp30';
  if (days <= 60) return 'exp60';
  if (/pending|review|needed|expired|attention/i.test(String(applicant?.mvrStatus || ''))) return 'mvr';
  return 'ok';
}

function monitoringMatchesAlertFilter(applicant, alertFilter) {
  if (!alertFilter || alertFilter === 'all') return true;
  if (alertFilter === 'on') return monitoringIsOn(applicant);
  if (alertFilter === 'off') return !monitoringIsOn(applicant);
  return monitoringAlertState(applicant) === alertFilter;
}

function monitoringAlertCounts(applicants) {
  const out = { total: 0, on: 0, off: 0, expired: 0, exp30: 0, exp60: 0, blank: 0, mvr: 0 };
  applicants.forEach((applicant) => {
    const state = monitoringAlertState(applicant);
    out.total += 1;
    if (monitoringIsOn(applicant)) out.on += 1;
    else out.off += 1;
    if (state === 'expired') out.expired += 1;
    if (state === 'exp30') out.exp30 += 1;
    if (state === 'exp60') out.exp60 += 1;
    if (state === 'blank') out.blank += 1;
    if (state === 'mvr') out.mvr += 1;
  });
  return out;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadMonitoringCsv(applicants) {
  const rows = [
    ['File #', 'Name', 'Order Date', 'Monitoring', 'MVR Status', 'Med Expire', 'Notes'],
    ...applicants.map((a) => [a.fileNumber, a.name, a.orderDate, a.monitorStatus, a.mvrStatus, a.medExpire, a.notes]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monitoring-current-view-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function MonitoringAlerts({ applicants, activeFilter, onFilterChange }) {
  const counts = monitoringAlertCounts(applicants);
  const items = [
    ['all', 'Total', counts.total],
    ['on', 'On Monitoring', counts.on],
    ['off', 'Off Monitoring', counts.off],
    ['expired', 'Expired Medical', counts.expired],
    ['exp30', 'Expiring 30 Days', counts.exp30],
    ['exp60', 'Expiring 60 Days', counts.exp60],
    ['blank', 'Blank Med Expire', counts.blank],
    ['mvr', 'MVR Attention', counts.mvr],
  ];
  const summary = [
    `Total: ${counts.total}`,
    `On Monitoring: ${counts.on}`,
    `Off Monitoring: ${counts.off}`,
    `Expired Medical: ${counts.expired}`,
    `Expiring 30 Days: ${counts.exp30}`,
    `Expiring 60 Days: ${counts.exp60}`,
    `Blank Med Expire: ${counts.blank}`,
    `MVR Attention: ${counts.mvr}`,
  ].join('\n');
  return (
    <section className="card wide-card monitoring-alerts-card">
      <h2>Monitoring Alerts</h2>
      <div className="monitoring-alert-metrics-native">
        {items.map(([key, label, count]) => (
          <button key={key} type="button" className={activeFilter === key ? 'active' : ''} onClick={() => onFilterChange(key)}>
            <b>{count}</b><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="monitoring-alert-actions-native">
        <button type="button" onClick={() => navigator.clipboard?.writeText(summary).catch(() => window.prompt('Copy this summary:', summary))}>Copy Summary</button>
        <button type="button" onClick={() => downloadMonitoringCsv(applicants)}>Download Current View CSV</button>
        <button type="button" onClick={() => onFilterChange(activeFilter || 'all')}>Recalculate Alerts</button>
      </div>
      <p>Sort records by clicking the table headers for File #, Name, Order Date, or Med Expire.</p>
    </section>
  );
}

function Dashboard({ company, applicants, reports, refresh, openCard, showMonitoring, showSafety }) {
  const onCount = applicants.filter((a) => a.monitorStatus === 'On').length;
  const offCount = applicants.length - onCount;
  const medExpiring = applicants.filter((a) => monitoringIsOn(a) && medExpiresWithin30(a.medExpire)).length;
  const completedReports = reports.filter((r) => statusText(r.status) === 'Completed').length;
  const consentNeeded = reports.filter((r) => ['Consent Needed', 'S1 Complete'].includes(statusText(r.status))).length;
  const consentGiven = reports.filter((r) => ['Consent Given', 'Emp Sent'].includes(statusText(r.status))).length;
  const ordersOpen = reports.filter((r) => statusText(r.status) !== 'Completed').length;

  return (
    <>
      <Header title="Dashboard" subtitle={company?.name || 'Driver Pipeline'} action={refresh} />
      {showMonitoring ? <><section className="dashboard-section-title">Monitoring</section>
      <div className="grid cards dashboard-card-grid">
        <Metric title="Total Applicants" value={applicants.length} icon={Database} onClick={() => openCard({ page: 'monitoring', filter: 'all', label: 'Total Applicants' })} />
        <Metric title="On Monitor" value={onCount} icon={ClipboardCheck} subtitle={applicants.length ? `${Math.round((onCount / applicants.length) * 100)}% of total` : ''} onClick={() => openCard({ page: 'monitoring', filter: 'on', label: 'On Monitor' })} />
        <Metric title="Off Monitor" value={offCount} icon={Activity} onClick={() => openCard({ page: 'monitoring', filter: 'off', label: 'Off Monitor' })} />
        <Metric title="Med Certs Expiring" value={medExpiring} icon={Activity} subtitle="within 30 days" onClick={() => openCard({ page: 'monitoring', filter: 'med-expiring', label: 'Med Certs Expiring' })} />
      </div></> : null}
      {showSafety ? <><section className="dashboard-section-title">Safety Performance Reports</section>
      <div className="grid cards dashboard-card-grid safety-dashboard-grid">
        <Metric title="Total Reports" value={reports.length} icon={Truck} onClick={() => openCard({ page: 'safety', filter: 'all', label: 'Total Reports' })} />
        <Metric title="Consent Needed" value={consentNeeded} icon={ShieldCheck} onClick={() => openCard({ page: 'safety', filter: 'consent-needed', label: 'Consent Needed' })} />
        <Metric title="Consent Given" value={consentGiven} icon={ClipboardCheck} onClick={() => openCard({ page: 'safety', filter: 'consent-given', label: 'Consent Given' })} />
        <Metric title="Orders Open" value={ordersOpen} icon={Activity} subtitle="not completed" onClick={() => openCard({ page: 'safety', filter: 'orders-open', label: 'Orders Open' })} />
        <Metric title="Completed" value={completedReports} icon={Database} onClick={() => openCard({ page: 'safety', filter: 'completed', label: 'Completed' })} />
      </div></> : null}
      {!showMonitoring && !showSafety ? <section className="card wide-card"><h2>No report access assigned</h2><p>Ask the SaffHire administrator to assign Monitoring Reports, Safety Performance Reports, or both.</p></section> : null}
    </>
  );
}

function DashboardFilterBanner({ filter, onClear }) {
  if (!filter || !filter.filter || filter.filter === 'all') return null;
  return <div className="dashboard-filter-banner"><span>Dashboard filter: {filter.label}</span><button type="button" onClick={onClear}>Clear filter</button></div>;
}

function Monitoring({ applicants, setApplicants, company, refresh, dashboardFilter, clearDashboardFilter }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [sort, setSort] = useState({ key: '', direction: 'asc' });
  const [alertFilter, setAlertFilter] = useState(() => localStorage.getItem('monitoring-alert-filter') || 'all');

  function setAlertFilterPersisted(nextFilter) {
    const value = nextFilter || 'all';
    setAlertFilter(value);
    localStorage.setItem('monitoring-alert-filter', value);
  }

  const activeDashboardFilter = dashboardFilter?.page === 'monitoring' ? dashboardFilter : null;

  const filtered = useMemo(() => applicants.filter((a) => {
    const term = query.toLowerCase();
    const matches = !term || `${a.fileNumber} ${a.name} ${a.orderDate} ${a.monitorStatus} ${a.mvrStatus} ${a.medExpire} ${a.notes}`.toLowerCase().includes(term);
    const statusOk = status === 'All' || a.monitorStatus === status;
    let dashboardOk = true;
    if (activeDashboardFilter?.filter === 'on') dashboardOk = a.monitorStatus === 'On';
    if (activeDashboardFilter?.filter === 'off') dashboardOk = a.monitorStatus === 'Off';
    if (activeDashboardFilter?.filter === 'med-expiring') dashboardOk = monitoringIsOn(a) && medExpiresWithin30(a.medExpire);
    const alertOk = monitoringMatchesAlertFilter(a, alertFilter);
    return matches && statusOk && dashboardOk && alertOk;
  }), [applicants, query, status, activeDashboardFilter, alertFilter]);

  function sortValue(row, key) {
    const value = row?.[key];

    if (key === 'fileNumber') {
      const numeric = Number(String(value || '').replace(/[^0-9.-]/g, ''));
      return Number.isNaN(numeric) ? String(value || '').toLowerCase() : numeric;
    }

    if (key === 'orderDate' || key === 'medExpire') {
      if (!value) return 0;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value || '').toLowerCase() : date.getTime();
    }

    return String(value || '').toLowerCase();
  }

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;

    const direction = sort.direction === 'desc' ? -1 : 1;

    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);

      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * direction;
      }

      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
  }, [filtered, sort]);

  function toggleSort(key) {
    setSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  }

  function sortIcon(key) {
    if (sort.key !== key) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  }

  function SortHeader({ label, sortKey }) {
    return (
      <th>
        <button type="button" className="sort-header-button" onClick={() => toggleSort(sortKey)} title={`Sort by ${label}`}>
          <span>{label}</span>
          <span className={sort.key === sortKey ? 'sort-icon active' : 'sort-icon'}>{sortIcon(sortKey)}</span>
        </button>
      </th>
    );
  }

  async function updateApplicant(applicant, patch) {
    const previous = applicants;
    setApplicants(applicants.map((a) => a.id === applicant.id ? { ...a, ...patch } : a));
    try {
      const data = await api('/api/applicants', { method: 'PATCH', body: JSON.stringify({ id: applicant.id, ...patch }) });
      setApplicants((rows) => rows.map((a) => a.id === applicant.id ? data.applicant : a));
    } catch (err) {
      alert(err.message);
      setApplicants(previous);
    }
  }

  return (
    <>
      <Header title="Monitoring" subtitle={`${company?.name || 'Driver Pipeline'} · ${sorted.length} records`} action={refresh} />
      <MonitoringAlerts applicants={applicants} activeFilter={alertFilter} onFilterChange={setAlertFilterPersisted} />
      <DashboardFilterBanner filter={activeDashboardFilter} onClear={clearDashboardFilter} />
      <section className="card toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search file number, name, notes..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option><option>On</option><option>Off</option></select></section>
      <section className="card table-card"><table data-native-monitoring-table="true"><thead><tr><SortHeader label="File #" sortKey="fileNumber" /><SortHeader label="Name" sortKey="name" /><SortHeader label="Order Date" sortKey="orderDate" /><SortHeader label="Monitoring" sortKey="monitorStatus" /><SortHeader label="MVR Status" sortKey="mvrStatus" /><SortHeader label="Med Expire" sortKey="medExpire" /><SortHeader label="Notes" sortKey="notes" /><th></th></tr></thead><tbody>{sorted.map((a) => <ApplicantRow key={a.id} applicant={a} onSave={updateApplicant} />)}</tbody></table>{!sorted.length ? <div className="empty">No applicants found. Import your CSV data into Supabase.</div> : null}</section>
    </>
  );
}

function ApplicantRow({ applicant, onSave }) {
  const [draft, setDraft] = useState(applicant);
  useEffect(() => setDraft(applicant), [applicant]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applicant);
  return <tr><td><b>{applicant.fileNumber}</b></td><td>{applicant.name}</td><td>{applicant.orderDate}</td><td><select value={draft.monitorStatus} onChange={(e) => setDraft({ ...draft, monitorStatus: e.target.value })}><option>On</option><option>Off</option></select></td><td>{applicant.mvrStatus}</td><td><input className="small-input" value={draft.medExpire || ''} onChange={(e) => setDraft({ ...draft, medExpire: e.target.value })} /></td><td><input value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></td><td><button className="icon-btn" disabled={!dirty} onClick={() => onSave(applicant, { monitorStatus: draft.monitorStatus, medExpire: draft.medExpire, notes: draft.notes })}><Save size={16} /></button></td></tr>;
}


function replaceTemplateTokens(value, report, extra = {}) {
  const today = new Date().toLocaleDateString();
  const tokens = {
    applicantName: report?.applicantName || '',
    fileNumber: report?.fileNumber || '',
    previousEmployer: report?.prevEmployerName || '',
    clientName: report?.employerName || '',
    clientEmail: report?.employerEmail || '',
    recipientName: extra.recipientName || report?.prevEmployerName || '',
    faxNumber: extra.faxNumber || '',
    today,
  };
  return String(value || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => tokens[key] ?? '');
}

async function copyToClipboard(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

async function fetchEmailTemplates(companyId) {
  const data = await api(`/api/email-templates?type=fax&companyId=${encodeURIComponent(companyId)}`);
  return (data.templates || []).filter((template) => template.isActive !== false);
}

async function chooseTemplate(companyId, report, purpose) {
  let templates = [];
  try { templates = await fetchEmailTemplates(companyId); } catch { templates = []; }
  if (!templates.length) {
    return {
      id: null,
      name: 'Manual/default',
      subject: purpose === 'fax'
        ? 'FMCSA Safety Performance Report - File #{{fileNumber}}'
        : 'Safety Performance Report - {{applicantName}}',
      body: purpose === 'fax'
        ? 'Please see the attached FMCSA Safety Performance report for {{applicantName}}.\n\nFile Number: {{fileNumber}}\n\nThank you,\nSaffHire Background Screening'
        : 'Please see the completed Safety Performance report for {{applicantName}}.\n\nFile Number: {{fileNumber}}\n\nThank you,\nSaffHire Background Screening',
    };
  }
  const list = templates.map((template, index) => `${index + 1}. ${template.name}`).join('\n');
  const picked = window.prompt(`Select an email template for ${purpose === 'fax' ? 'Fax FMCSA' : 'Client Gmail'}:\n\n${list}`, '1');
  if (picked === null) return null;
  const index = Math.max(0, Math.min(templates.length - 1, Number(picked || 1) - 1));
  return templates[index] || templates[0];
}

async function downloadFmcsaPdf(report, companyId) {
  const fileNumber = String(report?.fileNumber || '').trim();
  const reportId = report?.id ? String(report.id).trim() : '';
  const url = `/api/client-safety-pdf?companyId=${encodeURIComponent(companyId)}${reportId ? `&id=${encodeURIComponent(reportId)}` : `&fileNumber=${encodeURIComponent(fileNumber)}`}`;
  const response = await fetch(url, { credentials: 'include' });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `Could not download FMCSA PDF: ${response.status}`;
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      if (payload?.message) message = payload.message;
    } else {
      const text = await response.text().catch(() => '');
      if (text) message = text.slice(0, 200);
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  const filename = filenameMatch ? filenameMatch[1] : `completed-safety-performance-${fileNumber || 'report'}.pdf`;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  return filename;
}

function gmailComposeUrl(to, subject, body) {
  return 'https://mail.google.com/mail/?view=cm&fs=1'
    + `&to=${encodeURIComponent(to || '')}`
    + `&su=${encodeURIComponent(subject || '')}`
    + `&body=${encodeURIComponent(body || '')}`;
}

function buildSafetyResponseLinkDraft(link, report, responseRole) {
  const isApplicant = responseRole === 'applicant';
  const applicant = report?.applicantName || '[Applicant Name]';
  const fileNumber = report?.fileNumber || '';
  const to = isApplicant ? '' : (report?.prevEmployerEmail || '');
  const subject = isApplicant
    ? `Applicant Safety Performance Verification${fileNumber ? ` - File #${fileNumber}` : ''}`
    : `Safety Performance Form Request${fileNumber ? ` - File #${fileNumber}` : ''}`;
  const body = isApplicant ? [
    'Hello,',
    '',
    'SaffHire Background Screening needs you to review the Safety Performance form information below.',
    '',
    `Applicant: ${applicant}`,
    fileNumber ? `File Number: ${fileNumber}` : '',
    '',
    'Please use this secure link to verify the previous employer / prospective employer information and sign electronically:',
    link,
    '',
    'Thank you,',
    'SaffHire Background Screening',
  ].filter(Boolean).join('\n') : [
    'Hello,',
    '',
    'SaffHire Background Screening is requesting Safety Performance information for the applicant listed below.',
    '',
    `Applicant: ${applicant}`,
    fileNumber ? `File Number: ${fileNumber}` : '',
    '',
    'Please complete the secure form here:',
    link,
    '',
    'If this request should be handled by another department, please reply with the correct contact information.',
    '',
    'Thank you,',
    'SaffHire Background Screening',
  ].filter(Boolean).join('\n');

  return {
    to,
    subject,
    body,
    full: `To: ${to || (isApplicant ? '[enter applicant email]' : '[enter employer email]')}\nSubject: ${subject}\n\n${body}`,
    gmailUrl: gmailComposeUrl(to, subject, body),
  };
}


function parseApplicantSignatureFromNotes(notes) {
  const text = String(notes || '');
  const re = /\[Applicant Electronic Signature\]\s*Name:\s*([^\n|]+?)\s*\|\s*Date:\s*([^\n|]+)(?:\s*\|\s*IP:\s*([^\n]+))?/g;
  let match;
  let latest = null;
  while ((match = re.exec(text)) !== null) {
    latest = {
      name: String(match[1] || '').trim(),
      signedAt: String(match[2] || '').trim(),
      ip: String(match[3] || '').trim(),
    };
  }
  return latest || null;
}

function stripApplicantSignatureFromNotes(notes) {
  return String(notes || '')
    .split(/\n+/)
    .filter((line) => !/\[Applicant Electronic Signature\]/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatSignatureDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function signatureStatusForReport(report) {
  const signature = parseApplicantSignatureFromNotes(report?.notes);
  if (signature?.name) return { state: 'signed', signature };
  if (/consent\s+given/i.test(String(report?.status || ''))) return { state: 'warning', signature: null };
  return { state: 'unsigned', signature: null };
}

function ApplicantSignatureStatus({ form, saving, onClear }) {
  const status = signatureStatusForReport(form);
  if (status.state === 'signed') {
    return (
      <div className="native-signature-card signed" data-native-signature-status="1">
        <div className="native-signature-icon">✓</div>
        <div>
          <h4>Applicant Signed</h4>
          <p><b>Electronic Signature:</b> {status.signature.name}</p>
          <p><b>Signed Date:</b> {formatSignatureDate(status.signature.signedAt)}</p>
          {status.signature.ip ? <p><b>IP Address:</b> {status.signature.ip}</p> : null}
          <button type="button" className="danger-inline small-danger" disabled={saving} onClick={onClear}>Delete Signature</button>
        </div>
      </div>
    );
  }
  if (status.state === 'warning') {
    return (
      <div className="native-signature-card warning" data-native-signature-status="1">
        <div className="native-signature-icon">!</div>
        <div>
          <h4>Consent Given — Signature Detail Not Found</h4>
          <p>The report status is Consent Given, but no electronic signature marker was found in the notes field.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="native-signature-card unsigned" data-native-signature-status="1">
      <div className="native-signature-icon">!</div>
      <div>
        <h4>Applicant Not Signed Yet</h4>
        <p>{form?.applicantName || 'The applicant'} has not submitted the applicant verification form yet.</p>
        <p>Send the <b>Applicant Link</b> from the Safety Performance report list before sending the Employer Link.</p>
      </div>
    </div>
  );
}

function SafetyLinks({ report, companyId, company, onReportUpdated }) {
  const [busyAction, setBusyAction] = useState('');
  const [modal, setModal] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateId, setTemplateId] = useState('default');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [linkModal, setLinkModal] = useState(null);
  const [modalDraftTouched, setModalDraftTouched] = useState(false);

  useEffect(() => {
    if (!modal && !linkModal) return;
    document.querySelectorAll('#phase12a78-fax-modal, #phase12a92-client-modal, #phase6-modal').forEach((legacyModal) => {
      legacyModal.classList.add('hidden');
      legacyModal.setAttribute('aria-hidden', 'true');
    });
  }, [modal, linkModal]);

  function defaultTemplate(purpose) {
    return {
      id: 'default',
      name: 'Manual/default',
      subject: purpose === 'fax'
        ? 'FMCSA Safety Performance Report - File #{{fileNumber}}'
        : 'Safety Performance Report - {{applicantName}}',
      body: purpose === 'fax'
        ? 'Please see the attached FMCSA Safety Performance report for {{applicantName}}.\n\nFile Number: {{fileNumber}}\n\nThank you,\nSaffHire Background Screening'
        : 'Please see the completed Safety Performance report for {{applicantName}}.\n\nFile Number: {{fileNumber}}\n\nThank you,\nSaffHire Background Screening',
    };
  }

  function templateContext(extra = {}) {
    return {
      ...extra,
      recipientName: extra.recipientName || report.prevEmployerName || company?.name || '',
      faxNumber: extra.faxNumber || '',
    };
  }

  function applyTemplate(template, purpose, extra = {}) {
    const next = template || defaultTemplate(purpose);
    setTemplateId(String(next.id ?? 'default'));
    setSubject(replaceTemplateTokens(next.subject, report, templateContext(extra)));
    setBody(replaceTemplateTokens(next.body, report, templateContext(extra)));
  }

  async function loadTemplatesForModal(purpose, extra = {}) {
    setTemplatesLoading(true);
    try {
      const loaded = await fetchEmailTemplates(companyId);
      const list = [defaultTemplate(purpose), ...loaded];
      setTemplates(list);
      applyTemplate(list[0], purpose, extra);
    } catch {
      const fallback = [defaultTemplate(purpose)];
      setTemplates(fallback);
      applyTemplate(fallback[0], purpose, extra);
    } finally {
      setTemplatesLoading(false);
    }
  }

  async function run(label, fn) {
    setBusyAction(label);
    try { await fn(); } catch (error) { alert(error?.message || 'Action failed.'); } finally { setBusyAction(''); }
  }

  async function makeResponseLink(role) {
    const data = await api('/api/index?path=safety-response-link', {
      method: 'POST',
      body: JSON.stringify({ companyId, fileNumber: report.fileNumber, reportId: report.id, responseRole: role }),
    });
    if (!data.formUrl) throw new Error('The app did not return a response link.');
    await copyToClipboard(data.formUrl);
    setLinkModal({
      role,
      url: data.formUrl,
      expiresAt: data.expiresAt || null,
      title: role === 'applicant' ? 'Secure Applicant Verification Link' : 'Secure Employer Response Link',
      label: role === 'applicant' ? 'Applicant verification URL' : 'Employer response URL',
      note: role === 'applicant'
        ? 'Send this link to the applicant first. After the applicant signs, generate/send the employer response link.'
        : 'Send this link to the previous employer after the applicant has verified and signed Section 1.',
    });
  }

  async function openClientGmailModal() {
    const base = defaultTemplate('client');
    const initialRecipient = report.employerEmail || company?.email || '';
    setModalDraftTouched(false);
    setRecipient(initialRecipient);
    setTemplates([base]);
    applyTemplate(base, 'client', { clientName: company?.name || report.employerName || '', clientEmail: initialRecipient });
    setModal('client');
    fetchEmailTemplates(companyId)
      .then((loaded) => {
        const list = [base, ...loaded];
        setTemplates(list);
      })
      .catch(() => setTemplates([base]));
  }

  async function openFaxGmailModal() {
    const base = defaultTemplate('fax');
    const initialRecipient = report.prevEmployerFax || report.employerFax || '';
    const faxDigits = String(initialRecipient || '').replace(/[^0-9]/g, '');
    setModalDraftTouched(false);
    setRecipient(initialRecipient);
    setTemplates([base]);
    applyTemplate(base, 'fax', { faxNumber: faxDigits });
    setModal('fax');
    fetchEmailTemplates(companyId)
      .then((loaded) => {
        const list = [base, ...loaded];
        setTemplates(list);
      })
      .catch(() => setTemplates([base]));
  }

  function handleTemplateChange(nextId) {
    const nextTemplate = templates.find((template) => String(template.id ?? 'default') === String(nextId)) || templates[0] || defaultTemplate(modal || 'client');
    const faxDigits = modal === 'fax' ? String(recipient || '').replace(/[^0-9]/g, '') : '';
    applyTemplate(nextTemplate, modal || 'client', { faxNumber: faxDigits, clientEmail: recipient });
  }

  async function openClientGmail() {
    const to = String(recipient || '').trim();
    const draft = `To: ${to || '[enter client email]'}\nSubject: ${subject}\n\n${body}`;
    await copyToClipboard(draft);
    window.open(gmailComposeUrl(to, subject, body), '_blank', 'noopener,noreferrer');
    setModal(null);
  }

  async function openFaxGmail() {
    const digits = String(recipient || '').replace(/[^0-9]/g, '');
    if (digits.length < 7) throw new Error('Recipient fax number is required.');

    // Open Gmail immediately while still inside the user's click event.
    // If we wait until after the PDF download finishes, browsers can treat the
    // Gmail window as an automatic popup and block it.
    const gmailWindow = window.open('', '_blank');

    const faxEmail = `${digits}@efaxsend.com`;
    const currentTemplate = templates.find((template) => String(template.id ?? 'default') === String(templateId)) || defaultTemplate('fax');
    const nextSubject = subject || replaceTemplateTokens(currentTemplate.subject, report, { faxNumber: digits });
    const nextBody = body || replaceTemplateTokens(currentTemplate.body, report, { faxNumber: digits });
    const gmailUrl = gmailComposeUrl(faxEmail, nextSubject, nextBody);

    try {
      if (gmailWindow) {
        gmailWindow.document.write('<!doctype html><title>Opening Gmail...</title><body style="font-family:Arial,sans-serif;padding:24px;"><h2>Preparing fax email...</h2><p>Downloading the FMCSA PDF, then Gmail will open here.</p></body>');
        gmailWindow.document.close();
      }
    } catch {}

    const filename = await downloadFmcsaPdf(report, companyId);
    const draft = `To: ${faxEmail}\nSubject: ${nextSubject}\n\n${nextBody}\n\nAttach downloaded file: ${filename}`;
    await copyToClipboard(draft);

    if (gmailWindow && !gmailWindow.closed) {
      gmailWindow.location.href = gmailUrl;
    } else {
      const opened = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      if (!opened) {
        await copyToClipboard(gmailUrl);
        alert(`The FMCSA PDF was downloaded as ${filename}, but your browser blocked the Gmail popup. The Gmail compose URL was copied to your clipboard. Paste it into your browser, then attach the downloaded PDF before sending.`);
        return;
      }
    }

    alert(`The FMCSA PDF was downloaded as ${filename}. Gmail opened in a new tab. Attach the downloaded PDF before sending.`);
    setModal(null);
  }

  async function markCompleted() {
    if (!window.confirm(`Mark file #${report.fileNumber || ''} as Completed?`)) return;
    const data = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...report, status: 'Completed' }),
    });
    onReportUpdated(data.report || { ...report, status: 'Completed' });
  }

  const disabled = Boolean(busyAction);
  const modalTitle = modal === 'fax' ? 'Fax FMCSA through Gmail' : 'Client Gmail Draft';
  const modalPrimaryText = modal === 'fax' ? 'Download PDF & Open Gmail' : 'Open Gmail';
  const recipientLabel = modal === 'fax' ? 'Fax Number' : 'Client Email';
  const recipientHelp = modal === 'fax' ? 'Gmail will open to faxnumber@efaxsend.com. Attach the downloaded PDF before sending.' : 'Gmail will open with the selected template. Attach the completed FMCSA PDF if needed.';

  const linkModalNode = linkModal ? (() => {
    const draft = buildSafetyResponseLinkDraft(linkModal.url, report, linkModal.role);
    return createPortal((
      <div className="safety-modal-backdrop" role="dialog" aria-modal="true">
        <div className="safety-modal-card safety-link-modal-card" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <div className="safety-modal-header">
            <h2>{linkModal.title}</h2>
            <button type="button" className="safety-modal-close" onClick={() => setLinkModal(null)}>×</button>
          </div>
          <p className="safety-modal-subtitle">File #{report.fileNumber || '—'} · {report.applicantName || 'Applicant'}</p>
          <label className="safety-modal-field">
            <span>{linkModal.label}</span>
            <textarea value={linkModal.url} readOnly rows={3} onFocus={(event) => event.target.select()} />
          </label>
          <p className="safety-modal-note">{linkModal.expiresAt ? `Expires: ${new Date(linkModal.expiresAt).toLocaleString()}` : 'Expires in 14 days.'}</p>
          <p className="safety-modal-note">{linkModal.note}</p>
          <div className="safety-modal-actions safety-link-modal-actions">
            <button type="button" className="secondary-btn" onClick={() => copyToClipboard(linkModal.url).then(() => alert('Response link copied.'))}>Copy Link</button>
            <button type="button" className="secondary-btn" onClick={() => copyToClipboard(draft.full).then(() => alert(linkModal.role === 'applicant' ? 'Applicant verification email draft copied.' : 'Employer form email draft copied.'))}>Copy Email Draft</button>
            <button type="button" className="secondary-btn" onClick={() => window.open(linkModal.url, '_blank', 'noopener,noreferrer')}>Open Form</button>
            <button type="button" className="primary-inline" onClick={() => { copyToClipboard(draft.full); window.open(draft.gmailUrl, '_blank', 'noopener,noreferrer'); }}>Open Gmail</button>
            <button type="button" className="secondary-btn" onClick={() => setLinkModal(null)}>Close</button>
          </div>
        </div>
      </div>
    ), document.body);
  })() : null;

  const actionModalNode = modal ? createPortal((
    <div className="safety-modal-backdrop" role="dialog" aria-modal="true">
      <div className="safety-modal-card" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <div className="safety-modal-header">
          <h2>{modalTitle}</h2>
          <button type="button" className="safety-modal-close" onClick={() => setModal(null)}>×</button>
        </div>
        <p className="safety-modal-subtitle">File #{report.fileNumber || '—'} · {report.applicantName || 'Applicant'}</p>
        <label className="safety-modal-field">
          <span>{recipientLabel}</span>
          <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={modal === 'fax' ? '12145551234' : 'client@email.com'} autoFocus={modal === 'fax'} />
        </label>
        <label className="safety-modal-field">
          <span>Email Template</span>
          <select value={templateId} onChange={(event) => handleTemplateChange(event.target.value)} disabled={templatesLoading}>
            {templates.map((template) => <option key={String(template.id ?? 'default')} value={String(template.id ?? 'default')}>{template.name}</option>)}
          </select>
        </label>
        <label className="safety-modal-field">
          <span>Subject</span>
          <input value={subject} onChange={(event) => { setModalDraftTouched(true); setSubject(event.target.value); }} />
        </label>
        <label className="safety-modal-field">
          <span>Body</span>
          <textarea value={body} onChange={(event) => { setModalDraftTouched(true); setBody(event.target.value); }} rows={8} />
        </label>
        <p className="safety-modal-note">{recipientHelp}</p>
        <div className="safety-modal-actions">
          <button type="button" className="secondary-btn" onClick={() => setModal(null)}>Cancel</button>
          <button type="button" className="primary-inline" onClick={() => run(modalPrimaryText, modal === 'fax' ? openFaxGmail : openClientGmail)}>{modalPrimaryText}</button>
        </div>
      </div>
    </div>
  ), document.body) : null;

  return (
    <>
      <div className="safety-links-native">
        <button type="button" className="safety-native-button applicant" disabled={disabled} onClick={() => run('Applicant Link', () => makeResponseLink('applicant'))}>Applicant Link</button>
        <button type="button" className="safety-native-button employer" disabled={disabled} onClick={() => run('Employer Link', () => makeResponseLink('employer'))}>Employer Link</button>
        <button type="button" className="safety-native-button fmcsa" disabled={disabled} onClick={() => run('FMCSA PDF', () => downloadFmcsaPdf(report, companyId))}>FMCSA PDF</button>
        <button type="button" className="safety-native-button fax" disabled={disabled} onClick={() => run('Fax FMCSA', openFaxGmailModal)}>Fax FMCSA</button>
        <button type="button" className="safety-native-button client-gmail" disabled={disabled} onClick={() => run('Client Gmail', openClientGmailModal)}>Client Gmail</button>
        <button type="button" className="safety-native-button mark-completed" disabled={disabled} onClick={() => run('Mark Completed', markCompleted)}>Mark Completed</button>
        {busyAction ? <small>Working on {busyAction}...</small> : null}
      </div>
      {linkModalNode}
      {actionModalNode}
    </>
  );
}


function SyncedHorizontalScrollTable({ children, watchKey }) {
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const contentRef = useRef(null);
  const syncingRef = useRef(false);
  const [contentWidth, setContentWidth] = useState(2);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const bottom = bottomRef.current;
        const content = contentRef.current;
        if (!bottom || !content) return;

        const measuredWidth = Math.ceil(Math.max(
          bottom.scrollWidth || 0,
          content.scrollWidth || 0,
          content.getBoundingClientRect().width || 0,
          bottom.clientWidth + 2,
        ));

        // Never let a temporary React/layout measurement collapse the top scrollbar.
        setContentWidth((current) => Math.max(current, measuredWidth));
        if (topRef.current) topRef.current.scrollLeft = bottom.scrollLeft;
      });
    };

    update();
    const settleTimer = window.setTimeout(update, 150);
    window.addEventListener('resize', update);

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    resizeObserver?.observe(bottomRef.current);
    resizeObserver?.observe(contentRef.current);

    const mutationObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver(update) : null;
    mutationObserver?.observe(contentRef.current, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', update);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [watchKey]);

  const syncScroll = (source, target) => {
    if (!target || syncingRef.current) return;
    syncingRef.current = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => { syncingRef.current = false; });
  };

  return (
    <>
      <div
        ref={topRef}
        className="safety-top-horizontal-scroll"
        aria-label="Safety reports horizontal scrollbar"
        onScroll={(event) => syncScroll(event.currentTarget, bottomRef.current)}
        style={{
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          overflowX: 'scroll',
          overflowY: 'hidden',
          scrollbarGutter: 'stable',
          minHeight: 20,
          height: 20,
          marginBottom: 8,
        }}
      >
        <div aria-hidden="true" style={{ width: contentWidth, minWidth: contentWidth, height: 1 }} />
      </div>
      <div
        ref={bottomRef}
        className="safety-bottom-horizontal-scroll"
        onScroll={(event) => syncScroll(event.currentTarget, topRef.current)}
        style={{ width: '100%', maxWidth: '100%', overflowX: 'auto', scrollbarGutter: 'stable' }}
      >
        <div ref={contentRef} style={{ width: 'max-content', minWidth: '100%' }}>
          {children}
        </div>
      </div>
    </>
  );
}

function Safety({ reports, setReports, company, refresh, companyId, dashboardFilter, clearDashboardFilter }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [safetyCardFilter, setSafetyCardFilter] = useState('');
  const [followUpSort, setFollowUpSort] = useState('');
  const [savingFollowUpId, setSavingFollowUpId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState('list');
  const activeDashboardFilter = dashboardFilter?.page === 'safety' ? dashboardFilter : null;
  const safetyStatusCounts = useMemo(() => ({
    total: reports.length,
    completed: reports.filter((r) => statusText(r.status) === 'Completed').length,
    sentToApplicant: reports.filter((r) => statusText(r.status) === 'Sent to Applicant').length,
    consentNeeded: reports.filter((r) => ['Consent Needed', 'S1 Complete'].includes(statusText(r.status))).length,
    consentGiven: reports.filter((r) => ['Consent Given', 'Emp Sent'].includes(statusText(r.status))).length,
    ordersOpen: reports.filter((r) => statusText(r.status) !== 'Completed').length,
  }), [reports]);

  function filterByStatus(nextStatus, cardFilter = '') {
    clearDashboardFilter?.();
    setStatus(nextStatus);
    setSafetyCardFilter(cardFilter);
  }

  const filtered = useMemo(() => reports.filter((r) => {
    const term = query.toLowerCase();
    const currentStatus = statusText(r.status);
    const matches = !term || `${r.fileNumber} ${r.applicantName} ${r.prevEmployerName} ${r.notes}`.toLowerCase().includes(term);
    const ok = status === 'All' || currentStatus === status;
    let cardOk = true;
    if (safetyCardFilter === 'consent-needed') cardOk = ['Consent Needed', 'S1 Complete'].includes(currentStatus);
    if (safetyCardFilter === 'consent-given') cardOk = ['Consent Given', 'Emp Sent'].includes(currentStatus);
    if (safetyCardFilter === 'orders-open') cardOk = currentStatus !== 'Completed';
    let dashboardOk = true;
    if (activeDashboardFilter?.filter === 'consent-needed') dashboardOk = ['Consent Needed', 'S1 Complete'].includes(currentStatus);
    if (activeDashboardFilter?.filter === 'consent-given') dashboardOk = ['Consent Given', 'Emp Sent'].includes(currentStatus);
    if (activeDashboardFilter?.filter === 'orders-open') dashboardOk = currentStatus !== 'Completed';
    if (activeDashboardFilter?.filter === 'completed') dashboardOk = currentStatus === 'Completed';
    return matches && ok && cardOk && dashboardOk;
  }), [reports, query, status, safetyCardFilter, activeDashboardFilter]);

  const sorted = useMemo(() => {
    if (!followUpSort) return filtered;

    return [...filtered].sort((a, b) => {
      const aDate = String(a.followUpDate || '').trim();
      const bDate = String(b.followUpDate || '').trim();
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;

      const comparison = aDate.localeCompare(bDate);
      return followUpSort === 'asc' ? comparison : -comparison;
    });
  }, [filtered, followUpSort]);

  function toggleFollowUpSort() {
    setFollowUpSort((current) => current === 'asc' ? 'desc' : 'asc');
  }

  async function updateFollowUpDate(report, followUpDate) {
    const previous = reports;
    const updated = { ...report, followUpDate };
    setReports((rows) => rows.map((row) => row.id === report.id ? updated : row));
    setSavingFollowUpId(report.id);

    try {
      const data = await api(`/api/safety-reports?companyId=${companyId}`, {
        method: 'PATCH',
        body: JSON.stringify(updated),
      });
      setReports((rows) => rows.map((row) => row.id === report.id ? data.report : row));
    } catch (err) {
      setReports(previous);
      alert(err.message || 'Could not save follow-up date.');
    } finally {
      setSavingFollowUpId(null);
    }
  }

  async function saveReport(form) {
    const method = form.id ? 'PATCH' : 'POST';
    const data = await api(`/api/safety-reports?companyId=${companyId}`, { method, body: JSON.stringify(form) });
    setReports((rows) => form.id ? rows.map((r) => r.id === form.id ? data.report : r) : [data.report, ...rows]);
    if (!form.id && data.applicantNotification) {
      if (data.applicantNotification.sent) {
        alert(`Report created and emailed to ${data.applicantNotification.email}.`);
      } else {
        alert(`Report created, but the applicant was not emailed: ${data.applicantNotification.reason || 'Unknown email error'}`);
      }
    }
    setEditing(null);
    setMode('list');
  }

  async function deleteReport(report) {
    if (!confirm(`Delete Safety Performance report for ${report.applicantName || report.fileNumber}?`)) return;
    await api(`/api/safety-reports?id=${report.id}&companyId=${companyId}`, { method: 'DELETE' });
    setReports((rows) => rows.filter((r) => r.id !== report.id));
  }

  if (mode === 'edit') {
    return <SafetyForm company={company} companyId={companyId} report={editing || defaultReport(company)} onCancel={() => { setEditing(null); setMode('list'); }} onSave={saveReport} onReportUpdated={(updated) => setReports((rows) => rows.map((row) => row.id === updated.id ? updated : row))} />;
  }

  return (
    <>
      <Header title="Safety Performance Reports" subtitle={`${company?.name || 'Driver Pipeline'} · ${filtered.length} reports`} action={refresh} actions={<button className="primary-inline" onClick={() => { setEditing(defaultReport(company)); setMode('edit'); }}><Plus size={16} /> New Report</button>} />
      <DashboardFilterBanner filter={activeDashboardFilter} onClear={clearDashboardFilter} />
      <div className="grid cards dashboard-card-grid safety-report-status-grid" aria-label="Safety report status filters">
        <Metric title="Total Reports" value={safetyStatusCounts.total} icon={Truck} onClick={() => filterByStatus('All')} />
        <Metric title="Consent Needed" value={safetyStatusCounts.consentNeeded} icon={ShieldCheck} onClick={() => filterByStatus('All', 'consent-needed')} />
        <Metric title="Consent Given" value={safetyStatusCounts.consentGiven} icon={ClipboardCheck} onClick={() => filterByStatus('All', 'consent-given')} />
        <Metric title="Orders Open" value={safetyStatusCounts.ordersOpen} icon={Activity} subtitle="not completed" onClick={() => filterByStatus('All', 'orders-open')} />
        <Metric title="Completed" value={safetyStatusCounts.completed} icon={Database} onClick={() => filterByStatus('Completed')} />
        <Metric title="Sent to Applicant" value={safetyStatusCounts.sentToApplicant} icon={Mail} onClick={() => filterByStatus('Sent to Applicant')} />
      </div>
      <section className="card toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search file #, applicant, employer, notes..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={status} onChange={(e) => { setStatus(e.target.value); setSafetyCardFilter(''); }}><option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></section>
      <section className="card table-card">
        <SyncedHorizontalScrollTable watchKey={`${sorted.length}:${reports.length}:${status}:${query}:${followUpSort}`}>
          <table>
            <thead><tr><th aria-label="Actions"></th><th>File #</th><th><button type="button" className="sort-header-button" onClick={toggleFollowUpSort} title="Sort by Follow Up date"><span>Follow Up</span><span className={followUpSort ? 'sort-icon active' : 'sort-icon'}>{followUpSort === 'asc' ? '↑' : followUpSort === 'desc' ? '↓' : '↕'}</span></button></th><th>Notes</th><th>Links</th><th>Applicant</th><th>Created</th><th>Status</th><th>Previous Employer</th></tr></thead>
            <tbody>{sorted.map((r) => {
              return (
                <tr key={r.id}>
                  <td><div className="row-actions"><button className="icon-btn" onClick={() => { setEditing(r); setMode('edit'); }} aria-label={`Edit ${r.fileNumber || r.applicantName}`} title="Edit report"><Pencil size={15} /></button><button className="icon-btn danger" onClick={() => deleteReport(r)} aria-label={`Delete ${r.fileNumber || r.applicantName}`} title="Delete report"><Trash2 size={15} /></button></div></td>
                  <td><b>{r.fileNumber}</b></td>
                  <td>
                    <input
                      type="date"
                      className="small-input"
                      value={r.followUpDate || ''}
                      onChange={(event) => updateFollowUpDate(r, event.target.value)}
                      disabled={savingFollowUpId === r.id}
                      aria-label={`Follow Up date for ${r.applicantName || r.fileNumber}`}
                      title={savingFollowUpId === r.id ? 'Saving follow-up date...' : 'Select follow-up date'}
                    />
                    {savingFollowUpId === r.id ? <small>Saving...</small> : null}
                  </td>
                  <td className="notes-cell">{r.notes}</td>
                  <td className="safety-links-cell" data-safety-links="native"><SafetyLinks report={r} companyId={companyId} company={company} onReportUpdated={(updated) => setReports((rows) => rows.map((row) => row.id === updated.id ? updated : row))} /></td>
                  <td>{r.applicantName}</td>
                  <td>{r.created}</td>
                  <td><span className={`status-chip ${r.status?.replaceAll(' ', '-').toLowerCase()}`}>{r.status}</span></td>
                  <td>{r.prevEmployerName}<small>{r.prevEmployerEmail || 'No email saved'}</small></td>
                </tr>
              );
            })}</tbody>
          </table>
        </SyncedHorizontalScrollTable>
        {!filtered.length ? <div className="empty">No Safety Performance reports found.</div> : null}
      </section>
      <section className="card wide-card helper-card">
        <h2><Printer size={18} /> Safety Performance Workflow</h2>
        <p><b>PDF</b> opens a printable report from the Supabase record. Choose “Save as PDF” in the browser print window.</p>
        <p><b>Email</b> copies a draft, then opens your email client when the previous employer email is saved. Nothing is sent automatically.</p>
      </section>
    </>
  );
}

function SafetyForm({ company, companyId, report, onCancel, onSave, onReportUpdated }) {
  const [form, setForm] = useState(() => ({ ...defaultReport(company), ...report }));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setAccident = (n, field, value) => set(`accident${field}${n}`, value);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } catch (err) { alert(err.message); } finally { setSaving(false); }
  }

  async function clearApplicantSignature() {
    if (!form.id) return;
    if (!window.confirm('Delete the applicant electronic signature from this Safety Performance report?')) return;
    const nextNotes = stripApplicantSignatureFromNotes(form.notes);
    const nextStatus = /consent\s+given/i.test(String(form.status || '')) ? 'Consent Needed' : form.status;
    const nextForm = { ...form, notes: nextNotes, status: nextStatus };
    setSaving(true);
    try {
      const data = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`, { method: 'PATCH', body: JSON.stringify(nextForm) });
      const updated = data.report || nextForm;
      setForm((current) => ({ ...current, ...updated }));
      onReportUpdated?.(updated);
      alert('Applicant signature deleted.');
    } catch (err) {
      alert(err.message || 'Could not delete applicant signature.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header title="Safety Performance Submission" subtitle={form.id ? `Editing ${form.fileNumber || form.applicantName}` : 'New report'} actions={<button className="secondary-btn" onClick={onCancel}><ArrowLeft size={16} /> Back</button>} />
      <form className="card form-card" onSubmit={submit}>
        <FormSection title="SECTION 1: To be Completed by Prospective Employee">
          <div className="form-grid three"><Field label="Applicant Name"><input value={form.applicantName} onChange={(e) => set('applicantName', e.target.value)} /></Field><Field label="Applicant Email"><input type="email" value={form.applicantEmail || ''} onChange={(e) => set('applicantEmail', e.target.value)} placeholder="applicant@example.com" /></Field><Field label="File Number"><input value={form.fileNumber} onChange={(e) => set('fileNumber', e.target.value)} /></Field></div>
          <div className="form-grid three"><Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
          <div className="form-grid two"><Field label="Created"><input type="date" value={form.created || ''} onChange={(e) => set('created', e.target.value)} /></Field><Field label="Follow Up Date"><input type="date" value={form.followUpDate || ''} onChange={(e) => set('followUpDate', e.target.value)} /></Field></div>
          <ApplicantSignatureStatus form={form} saving={saving} onClear={clearApplicantSignature} />
          <Field label="Notes"><textarea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} rows={4} /></Field>
          <h4>Previous Employer</h4>
          <div className="form-grid two"><Field label="Name"><input value={form.prevEmployerName || ''} onChange={(e) => set('prevEmployerName', e.target.value)} /></Field><Field label="Email"><input value={form.prevEmployerEmail || ''} onChange={(e) => set('prevEmployerEmail', e.target.value)} /></Field><Field label="Street"><input value={form.prevEmployerStreet || ''} onChange={(e) => set('prevEmployerStreet', e.target.value)} /></Field><Field label="Phone"><input value={form.prevEmployerPhone || ''} onChange={(e) => set('prevEmployerPhone', e.target.value)} /></Field><Field label="Fax"><input value={form.prevEmployerFax || ''} onChange={(e) => set('prevEmployerFax', e.target.value)} /></Field><Field label="City / State / Zip"><input value={form.prevEmployerCityStateZip || ''} onChange={(e) => set('prevEmployerCityStateZip', e.target.value)} /></Field></div>
          <h4>Prospective Employer</h4>
          <div className="form-grid two"><Field label="Name"><input value={form.employerName || ''} onChange={(e) => set('employerName', e.target.value)} /></Field><Field label="Attention"><input value={form.employerAttention || ''} onChange={(e) => set('employerAttention', e.target.value)} /></Field><Field label="Street"><input value={form.employerStreet || ''} onChange={(e) => set('employerStreet', e.target.value)} /></Field><Field label="City / State / Zip"><input value={form.employerCityStateZip || ''} onChange={(e) => set('employerCityStateZip', e.target.value)} /></Field><Field label="Phone"><input value={form.employerPhone || ''} onChange={(e) => set('employerPhone', e.target.value)} /></Field><Field label="Fax"><input value={form.employerFax || ''} onChange={(e) => set('employerFax', e.target.value)} /></Field><Field label="Employer Email"><input value={form.employerEmail || ''} onChange={(e) => set('employerEmail', e.target.value)} /></Field><Field label="Confidential Email"><input value={form.confEmail || ''} onChange={(e) => set('confEmail', e.target.value)} /></Field></div>
        </FormSection>
        <FormSection title="SECTION 2: To be Completed by Previous Employer">
          <div className="form-grid two"><Field label="Was applicant employed by your company?"><select value={form.employedByCompany || ''} onChange={(e) => set('employedByCompany', e.target.value)}><option value="">Select...</option><option>Yes</option><option>No</option></select></Field><Field label="Job Title"><input value={form.jobTitle || ''} onChange={(e) => set('jobTitle', e.target.value)} /></Field><Field label="From Date"><input type="date" value={form.fromDate || ''} onChange={(e) => set('fromDate', e.target.value)} /></Field><Field label="To Date"><input type="date" value={form.toDate || ''} onChange={(e) => set('toDate', e.target.value)} /></Field><Field label="Did they drive a motor vehicle?"><select value={form.droveMotorVehicle || ''} onChange={(e) => set('droveMotorVehicle', e.target.value)}><option value="">Select...</option><option>Yes</option><option>No</option></select></Field></div>
          <Field label="Types of Vehicles Operated"><div className="check-grid">{VEHICLES.map(([key, label]) => <label key={key} className="check-row"><input type="checkbox" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked)} /> {label}</label>)}</div></Field>
        </FormSection>
        <FormSection title="SECTION 3: Accident History">
          <Field label="Accident history"><select value={form.accidentHistory || ''} onChange={(e) => set('accidentHistory', e.target.value)}><option value="">Select...</option><option>No accidents reported</option><option>Accidents reported</option></select></Field>
          {[1, 2, 3].map((n) => <div className="accident-row" key={n}><b>Accident {n}</b><input placeholder="Date" value={form[`accidentDate${n}`] || ''} onChange={(e) => setAccident(n, 'Date', e.target.value)} /><input placeholder="Location" value={form[`accidentLocation${n}`] || ''} onChange={(e) => setAccident(n, 'Location', e.target.value)} /><input placeholder="Injuries" value={form[`accidentInjuries${n}`] || ''} onChange={(e) => setAccident(n, 'Injuries', e.target.value)} /><input placeholder="Fatalities" value={form[`accidentFatalities${n}`] || ''} onChange={(e) => setAccident(n, 'Fatalities', e.target.value)} /><input placeholder="Hazmat" value={form[`accidentHazmat${n}`] || ''} onChange={(e) => setAccident(n, 'Hazmat', e.target.value)} /></div>)}
          <Field label="Other accidents"><textarea value={form.otherAccidents || ''} onChange={(e) => set('otherAccidents', e.target.value)} rows={3} /></Field>
        </FormSection>
        <FormSection title="SECTION 4: DOT Drug and Alcohol Questions">
          <div className="form-grid two"><Field label="Company Representative"><input value={form.dotCompany || ''} onChange={(e) => set('dotCompany', e.target.value)} /></Field><Field label="Employee"><input value={form.dotEmployee || ''} onChange={(e) => set('dotEmployee', e.target.value)} /></Field></div>
          <div className="check-grid">{DOT_FIELDS.map(([key, label]) => <label key={key} className="check-row"><input type="checkbox" checked={Boolean(form[key])} onChange={(e) => set(key, e.target.checked)} /> {label}</label>)}</div>
        </FormSection>
        <FormSection title="SECTION 5: Information Received">
          <div className="form-grid two"><Field label="Information Received From"><input value={form.infoReceivedFrom || ''} onChange={(e) => set('infoReceivedFrom', e.target.value)} /></Field><Field label="Date"><input type="date" value={form.infoReceivedDate || ''} onChange={(e) => set('infoReceivedDate', e.target.value)} /></Field></div>
        </FormSection>
        <div className="form-actions"><button type="button" className="secondary-btn" onClick={onCancel}><X size={16} /> Cancel</button><button className="primary-inline" disabled={saving}><Save size={16} /> {saving ? 'Saving...' : 'Save Form'}</button></div>
      </form>
    </>
  );
}

function FormSection({ title, children }) {
  return <section className="form-section"><h3>{title}</h3>{children}</section>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}


function EmailSettingsPage({ company, companyId }) {
  const emptyTemplate = { name: '', subject: '', body: '', isActive: true };
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState(emptyTemplate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function endpoint() {
    return `/api/email-templates?type=fax&companyId=${encodeURIComponent(companyId || 1)}`;
  }

  function notify(text, isError = false) {
    if (isError) {
      setError(text);
      setMessage('');
    } else {
      setMessage(text);
      setError('');
    }
    window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 5000);
  }

  async function loadTemplates() {
    setLoading(true);
    try {
      const data = await api(endpoint());
      setTemplates(data.templates || []);
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load email templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, [companyId]);

  async function createTemplate(event) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.subject.trim() || !draft.body.trim()) {
      notify('Template name, subject, and body are required.', true);
      return;
    }
    setSaving(true);
    try {
      const data = await api(endpoint(), {
        method: 'POST',
        body: JSON.stringify({ ...draft, type: 'fax' }),
      });
      setTemplates((rows) => [...rows, data.template].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
      setDraft(emptyTemplate);
      notify('Email template created.');
    } catch (err) {
      notify(err.message || 'Could not create email template.', true);
    } finally {
      setSaving(false);
    }
  }

  function updateLocalTemplate(id, patch) {
    setTemplates((rows) => rows.map((row) => Number(row.id) === Number(id) ? { ...row, ...patch } : row));
  }

  async function saveTemplate(template) {
    if (!String(template.name || '').trim() || !String(template.subject || '').trim() || !String(template.body || '').trim()) {
      notify('Template name, subject, and body are required.', true);
      return;
    }
    try {
      const data = await api(endpoint(), {
        method: 'PATCH',
        body: JSON.stringify({ ...template, type: 'fax' }),
      });
      updateLocalTemplate(template.id, data.template || template);
      notify('Email template saved.');
    } catch (err) {
      notify(err.message || 'Could not save email template.', true);
    }
  }

  async function deleteTemplate(template) {
    if (!window.confirm(`Delete email template "${template.name || 'Untitled'}"?`)) return;
    try {
      await api(`${endpoint()}&id=${encodeURIComponent(template.id)}`, { method: 'DELETE' });
      setTemplates((rows) => rows.filter((row) => Number(row.id) !== Number(template.id)));
      notify('Email template deleted.');
    } catch (err) {
      notify(err.message || 'Could not delete email template.', true);
    }
  }

  return (
    <>
      <Header title="Email Settings" subtitle={`${company?.name || 'Active company'} · Safety Performance email and fax templates`} action={loadTemplates} />
      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      <section className="card wide-card settings-card">
        <h2><Mail size={19} /> Create Email Template</h2>
        <p className="muted">Templates can use: <b>{'{{applicantName}}'}</b>, <b>{'{{fileNumber}}'}</b>, <b>{'{{previousEmployer}}'}</b>, <b>{'{{recipientName}}'}</b>, <b>{'{{faxNumber}}'}</b>, and <b>{'{{today}}'}</b>.</p>
        <form onSubmit={createTemplate}>
          <div className="form-grid two">
            <Field label="Template Name"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Example: FMCSA Fax Cover" /></Field>
            <Field label="Subject"><input value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} placeholder="FMCSA report - {{applicantName}}" /></Field>
          </div>
          <Field label="Email Body"><textarea rows={7} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="Please see the attached FMCSA report for {{applicantName}}." /></Field>
          <label className="check-row"><input type="checkbox" checked={draft.isActive !== false} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Active template</label>
          <button className="primary-inline" disabled={saving}><Plus size={16} /> {saving ? 'Creating...' : 'Create Template'}</button>
        </form>
      </section>
      <section className="card wide-card settings-card">
        <h2><Mail size={19} /> Saved Email Templates</h2>
        {loading ? <p className="muted">Loading templates...</p> : null}
        {!loading && !templates.length ? <p className="muted">No email templates have been created for this company.</p> : null}
        {!loading && templates.length ? <div className="table-card mini-table"><table><thead><tr><th>Name</th><th>Subject</th><th>Body</th><th>Active</th><th>Actions</th></tr></thead><tbody>{templates.map((template) => (
          <tr key={template.id}>
            <td><input value={template.name || ''} onChange={(event) => updateLocalTemplate(template.id, { name: event.target.value })} /></td>
            <td><input value={template.subject || ''} onChange={(event) => updateLocalTemplate(template.id, { subject: event.target.value })} /></td>
            <td><textarea rows={5} value={template.body || ''} onChange={(event) => updateLocalTemplate(template.id, { body: event.target.value })} /></td>
            <td><select value={template.isActive === false ? 'false' : 'true'} onChange={(event) => updateLocalTemplate(template.id, { isActive: event.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></td>
            <td><div className="row-actions"><button type="button" className="icon-btn" title="Save template" onClick={() => saveTemplate(template)}><Save size={15} /></button><button type="button" className="icon-btn danger" title="Delete template" onClick={() => deleteTemplate(template)}><Trash2 size={15} /></button></div></td>
          </tr>
        ))}</tbody></table></div> : null}
      </section>
    </>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState('dashboard');
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(1);
  const [applicants, setApplicants] = useState([]);
  const [reports, setReports] = useState([]);
  const [dashboardFilter, setDashboardFilter] = useState(null);
  const company = companies.find((c) => c.id === companyId) || companies[0];

  useEffect(() => { api('/api/auth/me').then((d) => setUser(d.user)).finally(() => setChecking(false)); }, []);

  useEffect(() => {
    if (isClientPortalAccount(user)) {
      window.location.replace('/client-portal.html');
    }
  }, [user]);

  const canMonitoring = canAccessMonitoringAdmin(user);
  const canSafety = canAccessSafetyAdmin(user);
  const allowedPages = allowedInternalPages(user);

  async function loadData() {
    const c = await api('/api/companies');
    setCompanies(c.companies || []);
    const activeCompanyId = companyId || c.companies?.[0]?.id || 1;
    const [a, s] = await Promise.all([
      canMonitoring ? api(`/api/applicants?companyId=${activeCompanyId}`) : Promise.resolve({ applicants: [] }),
      canSafety ? api(`/api/safety-reports?companyId=${activeCompanyId}`) : Promise.resolve({ reports: [] }),
    ]);
    setApplicants(a.applicants || []);
    setReports(s.reports || []);
  }
  useEffect(() => { if (user && !isClientPortalAccount(user)) loadData().catch((err) => alert(err.message)); }, [user, companyId]);
  useEffect(() => {
    if (user && !allowedPages.includes(page)) setPage(allowedPages[0] || 'dashboard');
  }, [user, page, canMonitoring, canSafety]);

  async function logout() { await api('/api/auth/logout', { method: 'POST' }); setUser(null); }

  function openDashboardCard(filter) {
    setDashboardFilter(filter);
    setPage(filter.page);
  }

  function clearDashboardFilter() {
    setDashboardFilter(null);
  }

  if (checking) return <div className="center-screen"><div className="spinner" /></div>;
  if (!user) return <Login onAuth={setUser} />;
  if (user.mustChangePassword && !isClientPortalAccount(user)) return <RequiredPasswordChange user={user} onChanged={setUser} onLogout={logout} />;
  if (isClientPortalAccount(user)) return <div className="center-screen"><div className="login-card"><h1>Opening Client Portal...</h1><p>Please wait.</p></div></div>;

  return <Layout user={user} page={page} setPage={(nextPage) => { if (!allowedPages.includes(nextPage)) return; setPage(nextPage); if (nextPage === 'dashboard') clearDashboardFilter(); }} onLogout={logout}>{companies.length > 1 ? <div className="company-switcher"><span>Active company</span><select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div> : null}{page === 'dashboard' && <Dashboard company={company} applicants={applicants} reports={reports} refresh={loadData} openCard={openDashboardCard} showMonitoring={canMonitoring} showSafety={canSafety} />}{page === 'monitoring' && canMonitoring && <Monitoring company={company} applicants={applicants} setApplicants={setApplicants} refresh={loadData} dashboardFilter={dashboardFilter} clearDashboardFilter={clearDashboardFilter} />}{page === 'safety' && canSafety && <Safety company={company} reports={reports} setReports={setReports} refresh={loadData} companyId={companyId} dashboardFilter={dashboardFilter} clearDashboardFilter={clearDashboardFilter} />}{page === 'email-settings' && canManageEmailSettings(user) && <EmailSettingsPage company={company} companyId={companyId} />}{page === 'settings' && user?.role === 'admin' && <SettingsManager user={user} company={company} companies={companies} setCompanies={setCompanies} companyId={companyId} refresh={loadData} setApplicants={setApplicants} />}</Layout>;
}

createRoot(document.getElementById('root')).render(<App />);
