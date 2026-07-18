import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowLeft, ClipboardCheck, Copy, Database, LogOut, Mail, Pencil, Plus, Printer, RefreshCw, Save, Search, Settings, ShieldCheck, Trash2, Truck, UserCog, X } from 'lucide-react';
import SettingsManager from './SettingsPage.jsx';
import './styles.css';

const LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/SaffhireLogoShirtStyle_0449b2e9.webp';
const STATUSES = ['Consent Needed', 'Consent Given', 'S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed'];
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
    applicantName: '', fileNumber: '', created: new Date().toISOString().slice(0, 10), status: 'Consent Needed', followUpDate: '', notes: '',
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

function Layout({ user, children, page, setPage, onLogout }) {
  const nav = [
    ['dashboard', 'Dashboard', Activity],
    ['monitoring', 'Monitoring', ClipboardCheck],
    ['safety', 'Safety Performance', Truck],
    ['settings', 'Settings', Settings],
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <img src={LOGO} alt="SaffHire" className="side-logo" />
        <div className="side-title">Monitoring</div>
        <nav>{nav.map(([key, label, Icon]) => <button key={key} className={page === key ? 'nav-btn active' : 'nav-btn'} onClick={() => setPage(key)}><Icon size={18} /> {label}</button>)}</nav>
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

function Dashboard({ company, applicants, reports, refresh, openCard }) {
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
      <section className="dashboard-section-title">Monitoring</section>
      <div className="grid cards dashboard-card-grid">
        <Metric title="Total Applicants" value={applicants.length} icon={Database} onClick={() => openCard({ page: 'monitoring', filter: 'all', label: 'Total Applicants' })} />
        <Metric title="On Monitor" value={onCount} icon={ClipboardCheck} subtitle={applicants.length ? `${Math.round((onCount / applicants.length) * 100)}% of total` : ''} onClick={() => openCard({ page: 'monitoring', filter: 'on', label: 'On Monitor' })} />
        <Metric title="Off Monitor" value={offCount} icon={Activity} onClick={() => openCard({ page: 'monitoring', filter: 'off', label: 'Off Monitor' })} />
        <Metric title="Med Certs Expiring" value={medExpiring} icon={Activity} subtitle="within 30 days" onClick={() => openCard({ page: 'monitoring', filter: 'med-expiring', label: 'Med Certs Expiring' })} />
      </div>
      <section className="dashboard-section-title">Safety Performance Reports</section>
      <div className="grid cards dashboard-card-grid safety-dashboard-grid">
        <Metric title="Total Reports" value={reports.length} icon={Truck} onClick={() => openCard({ page: 'safety', filter: 'all', label: 'Total Reports' })} />
        <Metric title="Consent Needed" value={consentNeeded} icon={ShieldCheck} onClick={() => openCard({ page: 'safety', filter: 'consent-needed', label: 'Consent Needed' })} />
        <Metric title="Consent Given" value={consentGiven} icon={ClipboardCheck} onClick={() => openCard({ page: 'safety', filter: 'consent-given', label: 'Consent Given' })} />
        <Metric title="Orders Open" value={ordersOpen} icon={Activity} subtitle="not completed" onClick={() => openCard({ page: 'safety', filter: 'orders-open', label: 'Orders Open' })} />
        <Metric title="Completed" value={completedReports} icon={Database} onClick={() => openCard({ page: 'safety', filter: 'completed', label: 'Completed' })} />
      </div>
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
    let alertOk = true;
    if (alertFilter && alertFilter !== 'all') alertOk = monitoringAlertState(a) === alertFilter;
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
      <section className="card table-card"><table><thead><tr><SortHeader label="File #" sortKey="fileNumber" /><SortHeader label="Name" sortKey="name" /><SortHeader label="Order Date" sortKey="orderDate" /><SortHeader label="Monitoring" sortKey="monitorStatus" /><SortHeader label="MVR Status" sortKey="mvrStatus" /><SortHeader label="Med Expire" sortKey="medExpire" /><SortHeader label="Notes" sortKey="notes" /><th></th></tr></thead><tbody>{sorted.map((a) => <ApplicantRow key={a.id} applicant={a} onSave={updateApplicant} />)}</tbody></table>{!sorted.length ? <div className="empty">No applicants found. Import your CSV data into Supabase.</div> : null}</section>
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
  const url = `/api/client-safety-pdf?companyId=${encodeURIComponent(companyId)}&fileNumber=${encodeURIComponent(fileNumber)}`;
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

function SafetyLinks({ report, companyId, company, onReportUpdated }) {
  const [busyAction, setBusyAction] = useState('');

  async function run(label, fn) {
    setBusyAction(label);
    try { await fn(); } catch (error) { alert(error?.message || 'Action failed.'); } finally { setBusyAction(''); }
  }

  async function makeResponseLink(role) {
    const data = await api('/api/safety-response-link', {
      method: 'POST',
      body: JSON.stringify({ companyId, fileNumber: report.fileNumber, reportId: report.id, responseRole: role }),
    });
    if (!data.formUrl) throw new Error('The app did not return a response link.');
    await copyToClipboard(data.formUrl);
    const title = role === 'applicant' ? 'Applicant Link' : 'Employer Link';
    window.prompt(`${title} created and copied. Copy/send this link:`, data.formUrl);
  }

  async function openClientGmail() {
    const template = await chooseTemplate(companyId, report, 'client');
    if (!template) return;
    const subject = replaceTemplateTokens(template.subject, report);
    const body = replaceTemplateTokens(template.body, report);
    const to = report.employerEmail || '';
    const draft = `To: ${to || '[enter client email]'}\nSubject: ${subject}\n\n${body}`;
    await copyToClipboard(draft);
    window.open(gmailComposeUrl(to, subject, body), '_blank', 'noopener,noreferrer');
  }

  async function openFaxGmail() {
    const rawFax = window.prompt('Enter recipient fax number:');
    if (rawFax === null) return;
    const digits = String(rawFax || '').replace(/[^0-9]/g, '');
    if (digits.length < 7) throw new Error('Recipient fax number is required.');
    const faxEmail = `${digits}@efaxsend.com`;
    const template = await chooseTemplate(companyId, report, 'fax');
    if (!template) return;
    const filename = await downloadFmcsaPdf(report, companyId);
    const subject = replaceTemplateTokens(template.subject, report, { faxNumber: digits });
    const body = replaceTemplateTokens(template.body, report, { faxNumber: digits });
    const draft = `To: ${faxEmail}\nSubject: ${subject}\n\n${body}\n\nAttach downloaded file: ${filename}`;
    await copyToClipboard(draft);
    alert(`The FMCSA PDF was downloaded as ${filename}. Gmail will open now. Attach the downloaded PDF before sending.`);
    window.open(gmailComposeUrl(faxEmail, subject, body), '_blank', 'noopener,noreferrer');
  }

  async function markCompleted() {
    const data = await api(`/api/safety-reports?companyId=${encodeURIComponent(companyId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...report, status: 'Completed' }),
    });
    onReportUpdated(data.report || { ...report, status: 'Completed' });
  }

  const disabled = Boolean(busyAction);
  return (
    <div className="safety-links-native">
      <button type="button" className="safety-native-button applicant" disabled={disabled} onClick={() => run('Applicant Link', () => makeResponseLink('applicant'))}>Applicant Link</button>
      <button type="button" className="safety-native-button employer" disabled={disabled} onClick={() => run('Employer Link', () => makeResponseLink('employer'))}>Employer Link</button>
      <button type="button" className="safety-native-button fmcsa" disabled={disabled} onClick={() => run('FMCSA PDF', () => downloadFmcsaPdf(report, companyId))}>FMCSA PDF</button>
      <button type="button" className="safety-native-button fax" disabled={disabled} onClick={() => run('Fax FMCSA', openFaxGmail)}>Fax FMCSA</button>
      <button type="button" className="safety-native-button client-gmail" disabled={disabled} onClick={() => run('Client Gmail', openClientGmail)}>Client Gmail</button>
      <button type="button" className="safety-native-button mark-completed" disabled={disabled} onClick={() => run('Mark Completed', markCompleted)}>Mark Completed</button>
      {busyAction ? <small>Working on {busyAction}...</small> : null}
    </div>
  );
}

function Safety({ reports, setReports, company, refresh, companyId, dashboardFilter, clearDashboardFilter }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState('list');
  const activeDashboardFilter = dashboardFilter?.page === 'safety' ? dashboardFilter : null;

  const filtered = useMemo(() => reports.filter((r) => {
    const term = query.toLowerCase();
    const currentStatus = statusText(r.status);
    const matches = !term || `${r.fileNumber} ${r.applicantName} ${r.prevEmployerName} ${r.notes}`.toLowerCase().includes(term);
    const ok = status === 'All' || currentStatus === status;
    let dashboardOk = true;
    if (activeDashboardFilter?.filter === 'consent-needed') dashboardOk = ['Consent Needed', 'S1 Complete'].includes(currentStatus);
    if (activeDashboardFilter?.filter === 'consent-given') dashboardOk = ['Consent Given', 'Emp Sent'].includes(currentStatus);
    if (activeDashboardFilter?.filter === 'orders-open') dashboardOk = currentStatus !== 'Completed';
    if (activeDashboardFilter?.filter === 'completed') dashboardOk = currentStatus === 'Completed';
    return matches && ok && dashboardOk;
  }), [reports, query, status, activeDashboardFilter]);

  async function saveReport(form) {
    const method = form.id ? 'PATCH' : 'POST';
    const data = await api(`/api/safety-reports?companyId=${companyId}`, { method, body: JSON.stringify(form) });
    setReports((rows) => form.id ? rows.map((r) => r.id === form.id ? data.report : r) : [data.report, ...rows]);
    setEditing(null);
    setMode('list');
  }

  async function deleteReport(report) {
    if (!confirm(`Delete Safety Performance report for ${report.applicantName || report.fileNumber}?`)) return;
    await api(`/api/safety-reports?id=${report.id}&companyId=${companyId}`, { method: 'DELETE' });
    setReports((rows) => rows.filter((r) => r.id !== report.id));
  }

  if (mode === 'edit') {
    return <SafetyForm company={company} report={editing || defaultReport(company)} onCancel={() => { setEditing(null); setMode('list'); }} onSave={saveReport} />;
  }

  return (
    <>
      <Header title="Safety Performance Reports" subtitle={`${company?.name || 'Driver Pipeline'} · ${filtered.length} reports`} action={refresh} actions={<button className="primary-inline" onClick={() => { setEditing(defaultReport(company)); setMode('edit'); }}><Plus size={16} /> New Report</button>} />
      <DashboardFilterBanner filter={activeDashboardFilter} onClear={clearDashboardFilter} />
      <section className="card toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search file #, applicant, employer, notes..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></section>
      <section className="card table-card">
        <table>
          <thead><tr><th>File #</th><th>Applicant</th><th>Created</th><th>Status</th><th>Follow Up</th><th>Previous Employer</th><th>Notes</th><th>Links</th><th></th></tr></thead>
          <tbody>{filtered.map((r) => {
            return (
              <tr key={r.id}>
                <td><b>{r.fileNumber}</b></td>
                <td>{r.applicantName}</td>
                <td>{r.created}</td>
                <td><span className={`status-chip ${r.status?.replaceAll(' ', '-').toLowerCase()}`}>{r.status}</span></td>
                <td>{r.followUpDate}</td>
                <td>{r.prevEmployerName}<small>{r.prevEmployerEmail || 'No email saved'}</small></td>
                <td className="notes-cell">{r.notes}</td>
                <td className="safety-links-cell" data-safety-links="native"><SafetyLinks report={r} companyId={companyId} company={company} onReportUpdated={(updated) => setReports((rows) => rows.map((row) => row.id === updated.id ? updated : row))} /></td>
                <td><div className="row-actions"><button className="icon-btn" onClick={() => { setEditing(r); setMode('edit'); }}><Pencil size={15} /></button><button className="icon-btn danger" onClick={() => deleteReport(r)}><Trash2 size={15} /></button></div></td>
              </tr>
            );
          })}</tbody>
        </table>
        {!filtered.length ? <div className="empty">No Safety Performance reports found.</div> : null}
      </section>
      <section className="card wide-card helper-card">
        <h2><Printer size={18} /> Phase 4 Safety Performance Workflow</h2>
        <p><b>PDF</b> opens a printable report from the Supabase record. Choose “Save as PDF” in the browser print window.</p>
        <p><b>Email</b> copies a draft, then opens your email client when the previous employer email is saved. Nothing is sent automatically.</p>
      </section>
    </>
  );
}

function SafetyForm({ company, report, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({ ...defaultReport(company), ...report }));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setAccident = (n, field, value) => set(`accident${field}${n}`, value);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } catch (err) { alert(err.message); } finally { setSaving(false); }
  }

  return (
    <>
      <Header title="Safety Performance Submission" subtitle={form.id ? `Editing ${form.fileNumber || form.applicantName}` : 'New report'} actions={<button className="secondary-btn" onClick={onCancel}><ArrowLeft size={16} /> Back</button>} />
      <form className="card form-card" onSubmit={submit}>
        <FormSection title="SECTION 1: To be Completed by Prospective Employee">
          <div className="form-grid three"><Field label="Applicant Name"><input value={form.applicantName} onChange={(e) => set('applicantName', e.target.value)} /></Field><Field label="File Number"><input value={form.fileNumber} onChange={(e) => set('fileNumber', e.target.value)} /></Field><Field label="Status"><select value={form.status} onChange={(e) => set('status', e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field></div>
          <div className="form-grid two"><Field label="Created"><input type="date" value={form.created || ''} onChange={(e) => set('created', e.target.value)} /></Field><Field label="Follow Up Date"><input type="date" value={form.followUpDate || ''} onChange={(e) => set('followUpDate', e.target.value)} /></Field></div>
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

  async function loadData() {
    const c = await api('/api/companies');
    setCompanies(c.companies || []);
    const activeCompanyId = companyId || c.companies?.[0]?.id || 1;
    const [a, s] = await Promise.all([api(`/api/applicants?companyId=${activeCompanyId}`), api(`/api/safety-reports?companyId=${activeCompanyId}`)]);
    setApplicants(a.applicants || []);
    setReports(s.reports || []);
  }
  useEffect(() => { if (user) loadData().catch((err) => alert(err.message)); }, [user, companyId]);

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

  return <Layout user={user} page={page} setPage={(nextPage) => { setPage(nextPage); if (nextPage === 'dashboard') clearDashboardFilter(); }} onLogout={logout}>{companies.length > 1 ? <div className="company-switcher"><span>Active company</span><select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div> : null}{page === 'dashboard' && <Dashboard company={company} applicants={applicants} reports={reports} refresh={loadData} openCard={openDashboardCard} />}{page === 'monitoring' && <Monitoring company={company} applicants={applicants} setApplicants={setApplicants} refresh={loadData} dashboardFilter={dashboardFilter} clearDashboardFilter={clearDashboardFilter} />}{page === 'safety' && <Safety company={company} reports={reports} setReports={setReports} refresh={loadData} companyId={companyId} dashboardFilter={dashboardFilter} clearDashboardFilter={clearDashboardFilter} />}{page === 'settings' && <SettingsManager user={user} company={company} companies={companies} setCompanies={setCompanies} companyId={companyId} refresh={loadData} setApplicants={setApplicants} />}</Layout>;
}

createRoot(document.getElementById('root')).render(<App />);
