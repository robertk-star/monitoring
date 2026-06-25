import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ClipboardCheck, Database, LogOut, RefreshCw, Save, Search, Settings, ShieldCheck, Truck, UserCog } from 'lucide-react';
import './styles.css';

const LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663368468239/3wvjutsFdcEUnRywyqJHNV/SaffhireLogoShirtStyle_0449b2e9.webp';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned non-JSON: ${text.slice(0, 140)}`); }
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
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
    api('/api/auth/setup-status')
      .then((data) => setHasAdmin(Boolean(data.hasAdmin)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const isSetup = !hasAdmin;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (isSetup && password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      const data = await api(isSetup ? '/api/auth/setup-admin' : '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, rememberMe }),
      });
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
          <div>
            <h1>{isSetup ? 'First-Time Setup' : 'Sign In'}</h1>
            <p>{isSetup ? 'Create the first admin account.' : 'Enter your username and password.'}</p>
          </div>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <label>Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} autoFocus />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isSetup ? 6 : undefined} />
        {isSetup ? (
          <>
            <label>Confirm Password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </>
        ) : (
          <label className="check-row"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember me for 30 days</label>
        )}
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
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button key={key} className={page === key ? 'nav-btn active' : 'nav-btn'} onClick={() => setPage(key)}><Icon size={18} /> {label}</button>
          ))}
        </nav>
        <div className="side-footer">
          <div className="user-pill"><UserCog size={16} /> {user?.displayName || user?.username}</div>
          <button className="nav-btn" onClick={onLogout}><LogOut size={18} /> Logout</button>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}

function Dashboard({ company, applicants, reports, refresh }) {
  const onCount = applicants.filter((a) => a.monitorStatus === 'On').length;
  const offCount = applicants.filter((a) => a.monitorStatus === 'Off').length;
  const medCount = applicants.filter((a) => a.medExpire).length;
  return (
    <>
      <Header title="Dashboard" subtitle={company?.name || 'Driver Pipeline'} action={refresh} />
      <div className="grid cards">
        <Metric title="Total Applicants" value={applicants.length} icon={Database} />
        <Metric title="On Monitoring" value={onCount} icon={ClipboardCheck} />
        <Metric title="Off Monitoring" value={offCount} icon={Activity} />
        <Metric title="Med Expire Dates" value={medCount} icon={Truck} />
      </div>
      <section className="card wide-card">
        <h2>Phase 1 Clean Build</h2>
        <p>This build uses Supabase only. Google Sheets, Manus auth, and tRPC login are not used.</p>
        <div className="status-list">
          <span>Database login</span><b>Ready</b>
          <span>Monitoring reads</span><b>Ready</b>
          <span>Monitoring edits</span><b>Ready</b>
          <span>Safety Performance</span><b>Shell</b>
        </div>
      </section>
    </>
  );
}

function Header({ title, subtitle, action }) {
  return <div className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action ? <button className="secondary-btn" onClick={action}><RefreshCw size={16} /> Refresh</button> : null}</div>;
}

function Metric({ title, value, icon: Icon }) {
  return <div className="card metric"><div><p>{title}</p><strong>{value}</strong></div><Icon size={28} /></div>;
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
    const next = applicants.map((a) => a.id === applicant.id ? { ...a, ...patch } : a);
    setApplicants(next);
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
      <section className="card toolbar">
        <div className="search-box"><Search size={17} /><input placeholder="Search file number, name, notes..." value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option>All</option><option>On</option><option>Off</option></select>
      </section>
      <section className="card table-card">
        <table>
          <thead><tr><th>File #</th><th>Name</th><th>Order Date</th><th>Monitoring</th><th>MVR Status</th><th>Med Expire</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {filtered.map((a) => <ApplicantRow key={a.id} applicant={a} onSave={updateApplicant} />)}
          </tbody>
        </table>
        {!filtered.length ? <div className="empty">No applicants found. Import your CSV data into Supabase.</div> : null}
      </section>
    </>
  );
}

function ApplicantRow({ applicant, onSave }) {
  const [draft, setDraft] = useState(applicant);
  useEffect(() => setDraft(applicant), [applicant]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(applicant);
  return (
    <tr>
      <td><b>{applicant.fileNumber}</b></td>
      <td>{applicant.name}</td>
      <td>{applicant.orderDate}</td>
      <td><select value={draft.monitorStatus} onChange={(e) => setDraft({ ...draft, monitorStatus: e.target.value })}><option>On</option><option>Off</option></select></td>
      <td>{applicant.mvrStatus}</td>
      <td><input className="small-input" value={draft.medExpire || ''} onChange={(e) => setDraft({ ...draft, medExpire: e.target.value })} /></td>
      <td><input value={draft.notes || ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></td>
      <td><button className="icon-btn" disabled={!dirty} onClick={() => onSave(applicant, { monitorStatus: draft.monitorStatus, medExpire: draft.medExpire, notes: draft.notes })}><Save size={16} /></button></td>
    </tr>
  );
}

function Safety({ reports, company, refresh }) {
  return (
    <>
      <Header title="Safety Performance" subtitle={`${company?.name || 'Driver Pipeline'} · ${reports.length} reports`} action={refresh} />
      <section className="card table-card"><table><thead><tr><th>File #</th><th>Applicant</th><th>Status</th><th>Follow Up</th><th>Notes</th></tr></thead><tbody>{reports.map((r) => <tr key={r.id}><td>{r.fileNumber}</td><td>{r.applicantName}</td><td>{r.status}</td><td>{r.followUpDate}</td><td>{r.notes}</td></tr>)}</tbody></table>{!reports.length ? <div className="empty">Safety Performance rebuild starts in Phase 2.</div> : null}</section>
    </>
  );
}

function SettingsPage({ company }) {
  return (
    <>
      <Header title="Settings" subtitle="Clean database-only settings" />
      <section className="card wide-card"><h2>Current Company</h2><p>{company?.name || 'Driver Pipeline'}</p><p className="muted">Next phase adds users, notification emails, imports, and Safety Performance form editing.</p></section>
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

  return <Layout user={user} page={page} setPage={setPage} onLogout={logout}>{companies.length > 1 ? <div className="company-switcher"><span>Active company</span><select value={companyId} onChange={(e) => setCompanyId(Number(e.target.value))}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div> : null}{page === 'dashboard' && <Dashboard company={company} applicants={applicants} reports={reports} refresh={loadData} />}{page === 'monitoring' && <Monitoring company={company} applicants={applicants} setApplicants={setApplicants} refresh={loadData} />}{page === 'safety' && <Safety company={company} reports={reports} refresh={loadData} />}{page === 'settings' && <SettingsPage company={company} />}</Layout>;
}

createRoot(document.getElementById('root')).render(<App />);
