import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowLeft, ClipboardCheck, Database, LogOut, Pencil, Plus, RefreshCw, Save, Search, Settings, ShieldCheck, Trash2, Truck, UserCog, X } from 'lucide-react';
import SettingsManager from './SettingsPage.jsx';
import './styles.css';

const LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/SaffhireLogoShirtStyle_0449b2e9.webp';
const STATUSES = ['S1 Complete', 'Emp Sent', 'Emp Complete', 'Completed'];
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
    applicantName: '', fileNumber: '', created: new Date().toISOString().slice(0, 10), status: 'S1 Complete', followUpDate: '', notes: '',
    prevEmployerName: '', prevEmployerEmail: '', prevEmployerStreet: '', prevEmployerPhone: '', prevEmployerFax: '', prevEmployerCityStateZip: '',
    employerName: company?.name || 'Driver Pipeline', employerAttention: '', employerStreet: '1200 N. Union Bower Road', employerCityStateZip: 'Irving, TX 75061', employerPhone: '972-573-2301', employerFax: '', employerEmail: 'lmercado@driverpipeline.com', confFax: '', confEmail: '',
    employedByCompany: '', jobTitle: '', fromDate: '', toDate: '', droveMotorVehicle: '',
    vehicleStraightTruck: false, vehicleTractorSemitrailer: false, vehicleBus: false, vehicleCargoTank: false, vehicleDoublesTriples: false, vehicleOther: false,
    accidentHistory: '', accidentDate1: '', accidentLocation1: '', accidentInjuries1: '', accidentFatalities1: '', accidentHazmat1: '', accidentDate2: '', accidentLocation2: '', accidentInjuries2: '', accidentFatalities2: '', accidentHazmat2: '', accidentDate3: '', accidentLocation3: '', accidentInjuries3: '', accidentFatalities3: '', accidentHazmat3: '', otherAccidents: '',
    dotCompany: '', dotEmployee: '', dotAlcoholTestPositive: false, dotDrugTestPositive: false, dotRefusedTest: false, dotOtherViolations: false,
    infoReceivedFrom: '', infoReceivedDate: '',
  };
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

function Metric({ title, value, icon: Icon }) {
  return <div className="card metric"><div><p>{title}</p><strong>{value}</strong></div><Icon size={28} /></div>;
}

function Dashboard({ company, applicants, reports, refresh }) {
  const onCount = applicants.filter((a) => a.monitorStatus === 'On').length;
  const statusCounts = STATUSES.map((status) => [status, reports.filter((r) => r.status === status).length]);
  return (
    <>
      <Header title="Dashboard" subtitle={company?.name || 'Driver Pipeline'} action={refresh} />
      <div className="grid cards">
        <Metric title="Total Applicants" value={applicants.length} icon={Database} />
        <Metric title="On Monitoring" value={onCount} icon={ClipboardCheck} />
        <Metric title="Safety Reports" value={reports.length} icon={Truck} />
        <Metric title="Follow Ups" value={reports.filter((r) => r.followUpDate).length} icon={Activity} />
      </div>
      <section className="card wide-card">
        <h2>Phase 3 Clean Build</h2>
        <p>This build adds admin settings, users, notification emails, companies, and CSV import.</p>
        <div className="status-list">{statusCounts.map(([label, count]) => <React.Fragment key={label}><span>{label}</span><b>{count}</b></React.Fragment>)}</div>
      </section>
    </>
  );
}

function Monitoring({ applicants, setApplicants, company, refresh }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const filtered = useMemo(() => applicants.filter((a) => {
    const term = query.toLowerCase();
    const matches = !term || `${a.fileNumber} ${a.name} ${a.notes}`.toLowerCase().includes(term);
    const statusOk = status === 'All' || a.monitorStatus === status;
    return matches && statusOk;
  }), [applicants, query, status]);

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
      <Header title="Monitoring" subtitle={`${company?.name || 'Driver Pipeline'} · ${filtered.length} records`} action={refresh} />
      <section className="card toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search file number, name, notes..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option><option>On</option><option>Off</option></select></section>
      <section className="card table-card"><table><thead><tr><th>File #</th><th>Name</th><th>Order Date</th><th>Monitoring</th><th>MVR Status</th><th>Med Expire</th><th>Notes</th><th></th></tr></thead><tbody>{filtered.map((a) => <ApplicantRow key={a.id} applicant={a} onSave={updateApplicant} />)}</tbody></table>{!filtered.length ? <div className="empty">No applicants found. Import your CSV data into Supabase.</div> : null}</section>
    </>
  );
}

function ApplicantRow({ applicant, onSave }) {
  const [draft, setDraft] = useState(applicant);
  useEffect(() => setDraft(applicant), [applicant]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applicant);
  return <tr><td><b>{applicant.fileNumber}</b></td><td>{applicant.name}</td><td>{applicant.orderDate}</td><td><select value={draft.monitorStatus} onChange={(e) => setDraft({ ...draft, monitorStatus: e.target.value })}><option>On</option><option>Off</option></select></td><td>{applicant.mvrStatus}</td><td><input className="small-input" value={draft.medExpire || ''} onChange={(e) => setDraft({ ...draft, medExpire: e.target.value })} /></td><td><input value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></td><td><button className="icon-btn" disabled={!dirty} onClick={() => onSave(applicant, { monitorStatus: draft.monitorStatus, medExpire: draft.medExpire, notes: draft.notes })}><Save size={16} /></button></td></tr>;
}

function Safety({ reports, setReports, company, refresh, companyId }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [editing, setEditing] = useState(null);
  const [mode, setMode] = useState('list');
  const filtered = useMemo(() => reports.filter((r) => {
    const term = query.toLowerCase();
    const matches = !term || `${r.fileNumber} ${r.applicantName} ${r.prevEmployerName} ${r.notes}`.toLowerCase().includes(term);
    const ok = status === 'All' || r.status === status;
    return matches && ok;
  }), [reports, query, status]);

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
      <section className="card toolbar"><div className="search-box"><Search size={17} /><input placeholder="Search file #, applicant, employer, notes..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></section>
      <section className="card table-card"><table><thead><tr><th>File #</th><th>Applicant</th><th>Created</th><th>Status</th><th>Follow Up</th><th>Previous Employer</th><th>Notes</th><th></th></tr></thead><tbody>{filtered.map((r) => <tr key={r.id}><td><b>{r.fileNumber}</b></td><td>{r.applicantName}</td><td>{r.created}</td><td><span className={`status-chip ${r.status?.replaceAll(' ', '-').toLowerCase()}`}>{r.status}</span></td><td>{r.followUpDate}</td><td>{r.prevEmployerName}</td><td className="notes-cell">{r.notes}</td><td><div className="row-actions"><button className="icon-btn" onClick={() => { setEditing(r); setMode('edit'); }}><Pencil size={15} /></button><button className="icon-btn danger" onClick={() => deleteReport(r)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{!filtered.length ? <div className="empty">No Safety Performance reports found.</div> : null}</section>
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

  if (checking) return <div className="center-screen"><div className="spinner" /></div>;
  if (!user) return <Login onAuth={setUser} />;

  return <Layout user={user} page={page} setPage={setPage} onLogout={logout}>{companies.length > 1 ? <div className="company-switcher"><span>Active company</span><select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div> : null}{page === 'dashboard' && <Dashboard company={company} applicants={applicants} reports={reports} refresh={loadData} />}{page === 'monitoring' && <Monitoring company={company} applicants={applicants} setApplicants={setApplicants} refresh={loadData} />}{page === 'safety' && <Safety company={company} reports={reports} setReports={setReports} refresh={loadData} companyId={companyId} />}{page === 'settings' && <SettingsManager user={user} company={company} companies={companies} setCompanies={setCompanies} companyId={companyId} refresh={loadData} setApplicants={setApplicants} />}</Layout>;
}

createRoot(document.getElementById('root')).render(<App />);
