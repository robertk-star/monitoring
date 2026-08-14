import React, { useEffect, useState } from 'react';
import { Bell, Building2, CheckCircle, Database, KeyRound, RefreshCw, Save, Trash2, Upload, UserPlus } from 'lucide-react';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned non-JSON: ${text.slice(0, 140)}`); }
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }

const CLIENT_ACCESS_OPTIONS = [
  ['dashboard', 'Dashboard'],
  ['monitoring', 'Monitoring'],
  ['safetyReports', 'Safety Reports'],
  ['userAdmin', 'User Admin'],
  ['editMonitoring', 'Edit Monitoring'],
  ['terminated', 'Terminated'],
];
const DEFAULT_CLIENT_ACCESS = CLIENT_ACCESS_OPTIONS.reduce((acc, [key]) => ({ ...acc, [key]: true }), {});

const INTERNAL_ACCESS_OPTIONS = [
  ['monitoring', 'Monitoring Reports'],
  ['safetyReports', 'Safety Performance Reports'],
];
const DEFAULT_INTERNAL_ACCESS = { monitoring: true, safetyReports: true };
const NEW_INTERNAL_ACCESS = { monitoring: false, safetyReports: false };
function normalizeInternalAccess(value) {
  const source = value && typeof value === 'object' ? value : {};
  return INTERNAL_ACCESS_OPTIONS.reduce((acc, [key]) => ({ ...acc, [key]: Object.prototype.hasOwnProperty.call(source, key) ? source[key] === true : true }), {});
}
function isSaffHireUserRole(role) {
  return String(role || '') === 'user';
}
function InternalAccessCheckboxes({ value, onChange, disabled }) {
  const access = normalizeInternalAccess(value);
  return <div className="client-access-grid">
    {INTERNAL_ACCESS_OPTIONS.map(([key, label]) => (
      <label key={key} className="client-access-check">
        <input type="checkbox" disabled={disabled} checked={access[key] === true} onChange={(e) => onChange({ ...access, [key]: e.target.checked })} />
        <span>{label}</span>
      </label>
    ))}
  </div>;
}
const CLIENT_ACCESS_PRESETS = {
  full: { dashboard: true, monitoring: true, safetyReports: true, userAdmin: true, editMonitoring: true, terminated: true },
  monitoring: { dashboard: true, monitoring: true, safetyReports: false, userAdmin: false, editMonitoring: true, terminated: true },
  safety: { dashboard: true, monitoring: false, safetyReports: true, userAdmin: false, editMonitoring: false, terminated: false },
  readonly: { dashboard: true, monitoring: true, safetyReports: true, userAdmin: false, editMonitoring: false, terminated: true },
};
function normalizeClientAccess(value) {
  const source = value && typeof value === 'object' ? value : {};
  return CLIENT_ACCESS_OPTIONS.reduce((acc, [key]) => ({ ...acc, [key]: source[key] !== false }), {});
}
function isClientRole(role) {
  return ['client_admin', 'client_user', 'viewer'].includes(String(role || ''));
}
function AccessCheckboxes({ value, onChange, disabled }) {
  const access = normalizeClientAccess(value);
  return <div className="client-access-grid">
    {CLIENT_ACCESS_OPTIONS.map(([key, label]) => (
      <label key={key} className="client-access-check">
        <input type="checkbox" disabled={disabled} checked={access[key] !== false} onChange={(e) => onChange({ ...access, [key]: e.target.checked })} />
        <span>{label}</span>
      </label>
    ))}
  </div>;
}

function detectDelimiter(line) {
  if ((line.match(/\t/g) || []).length >= (line.match(/,/g) || []).length) return '\t';
  if (line.includes('|') && !line.includes(',')) return '|';
  if (line.includes(';') && !line.includes(',')) return ';';
  return ',';
}

function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(header) {
  return String(header || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function canonicalHeader(header) {
  const key = normalizeHeader(header);
  const map = {
    filenumber: 'fileNumber',
    file: 'fileNumber',
    fileno: 'fileNumber',
    filenum: 'fileNumber',
    ordernumber: 'fileNumber',
    orderno: 'fileNumber',
    order: 'fileNumber',
    orderid: 'fileNumber',
    reportnumber: 'fileNumber',
    casenumber: 'fileNumber',
    applicantnumber: 'fileNumber',
    applicantname: 'applicantName',
    applicant: 'applicantName',
    name: 'applicantName',
    fullname: 'applicantName',
    drivername: 'applicantName',
    driver: 'applicantName',
    subjectname: 'applicantName',
    employeename: 'applicantName',
    orderdate: 'orderDate',
    ordereddate: 'orderDate',
    requestdate: 'orderDate',
    reportdate: 'orderDate',
    datecreated: 'orderDate',
    createddate: 'orderDate',
    created: 'orderDate',
    date: 'orderDate',
    monitoringstatus: 'monitorStatus',
    monitorstatus: 'monitorStatus',
    monitoring: 'monitorStatus',
    monitor: 'monitorStatus',
    monitoringon: 'monitorStatus',
    monitoringonoff: 'monitorStatus',
    onmonitoring: 'monitorStatus',
    mvrstatus: 'mvrStatus',
    mvr: 'mvrStatus',
    driverlicensestatus: 'mvrStatus',
    licensestatus: 'mvrStatus',
    medexpire: 'medExpire',
    medicalexpiration: 'medExpire',
    medicalexpirationdate: 'medExpire',
    medicalcertificateexpiration: 'medExpire',
    medicalcertificateexpirationdate: 'medExpire',
    medicalcertificateexpire: 'medExpire',
    medicalcertexpiration: 'medExpire',
    medicalcertexp: 'medExpire',
    medcertexpiration: 'medExpire',
    medcertexp: 'medExpire',
    medicalcardexpiration: 'medExpire',
    medicalexpdate: 'medExpire',
    expirationdate: 'medExpire',
    terminated: 'terminated',
    inactive: 'terminated',
    donotmonitor: 'terminated',
    stopped: 'terminated',
    stopmonitoring: 'terminated',
    notes: 'notes',
    note: 'notes',
    comments: 'notes',
    comment: 'notes',
    remarks: 'notes',
    memo: 'notes',
  };
  return map[key] || header;
}

function parseCsv(text) {
  const rawLines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = rawLines.filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map((h) => h.replace(/^\uFEFF/, '').trim());
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line, delimiter);
    const row = {};
    headers.forEach((h, i) => {
      const value = values[i] || '';
      row[h] = value;
      row[canonicalHeader(h)] = value;
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value || '').trim()));
}

async function readImportFile(file, setter) {
  if (!file) return;
  const text = await file.text();
  setter(text);
}


export default function SettingsManager({ user, company, companies, setCompanies, companyId, refresh }) {
  const [users, setUsers] = useState([]);
  const [emails, setEmails] = useState([]);
  const [checks, setChecks] = useState([]);
  const [message, setMessage] = useState('');
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [newCompany, setNewCompany] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', displayName: '', role: 'user', companyId: companyId || '', clientAccess: DEFAULT_CLIENT_ACCESS, internalAccess: NEW_INTERNAL_ACCESS });
  const [newEmail, setNewEmail] = useState({ label: '', email: '' });
  const [monitoringCsv, setMonitoringCsv] = useState('');
  const [safetyCsv, setSafetyCsv] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => { setCompanyName(company?.name || ''); }, [company?.name]);
  useEffect(() => { if (isAdmin) loadSettings().catch((err) => setMessage(err.message)); }, [isAdmin]);

  async function loadSettings() {
    const [u, e] = await Promise.all([api('/api/index?path=users'), api('/api/notification-emails')]);
    setUsers(u.users || []);
    setEmails(e.emails || []);
  }
  function show(text) { setMessage(text); setTimeout(() => setMessage(''), 5000); }
  function fail(err, fallback) { setMessage(err?.message || fallback); }

  async function saveCompany() { try { const data = await api('/api/companies', { method: 'PATCH', body: JSON.stringify({ id: company.id, name: companyName, isActive: true }) }); setCompanies(companies.map((c) => c.id === data.company.id ? data.company : c)); show('Company saved.'); } catch (err) { fail(err, 'Could not save company.'); } }
  async function addCompany() { try { const data = await api('/api/companies', { method: 'POST', body: JSON.stringify({ name: newCompany }) }); setCompanies([...companies, data.company]); setNewCompany(''); show('Company added.'); } catch (err) { fail(err, 'Could not add company.'); } }
  async function addUser() { try { const data = await api('/api/index?path=users', { method: 'POST', body: JSON.stringify(newUser) }); setUsers([...users, data.user]); setNewUser({ username: '', password: '', displayName: '', role: 'user', companyId: companyId || '', clientAccess: DEFAULT_CLIENT_ACCESS, internalAccess: NEW_INTERNAL_ACCESS }); show('User added.'); } catch (err) { fail(err, 'Could not add user.'); } }
  async function saveUser(row, patch) { try { const payload = { ...row, ...patch }; delete payload.password; const data = await api('/api/index?path=users', { method: 'PATCH', body: JSON.stringify(payload) }); setUsers(users.map((u) => u.id === data.user.id ? data.user : u)); show('User saved.'); } catch (err) { fail(err, 'Could not save user.'); } }
  async function resetUserPassword(row) {
    const newPassword = window.prompt(`Create a temporary password for ${row.username}. It must be at least 8 characters. The user will be required to replace it after signing in.`);
    if (newPassword === null) return;
    if (newPassword.length < 8) return fail(new Error('Password must be at least 8 characters.'), 'Could not reset password.');
    const confirmation = window.prompt('Enter the temporary password again to confirm it.');
    if (confirmation === null) return;
    if (newPassword !== confirmation) return fail(new Error('The passwords do not match.'), 'Could not reset password.');
    try {
      const data = await api('/api/index?path=users', { method: 'PATCH', body: JSON.stringify({ id: row.id, action: 'reset-password', password: newPassword }) });
      setUsers(users.map((u) => u.id === data.user.id ? data.user : u));
      show(`Temporary password created for ${row.username}. The user must change it at next sign-in.`);
    } catch (err) {
      fail(err, 'Could not reset password.');
    }
  }
  async function deleteUser(row) { if (!confirm(`Delete ${row.username}?`)) return; try { await api(`/api/index?path=users&id=${row.id}`, { method: 'DELETE' }); setUsers(users.filter((u) => u.id !== row.id)); show('User deleted.'); } catch (err) { fail(err, 'Could not delete user.'); } }
  async function addEmail() { try { const data = await api('/api/notification-emails', { method: 'POST', body: JSON.stringify(newEmail) }); setEmails([...emails, data.email]); setNewEmail({ label: '', email: '' }); show('Email added.'); } catch (err) { fail(err, 'Could not add email.'); } }
  async function saveEmail(row, patch) { try { const data = await api('/api/notification-emails', { method: 'PATCH', body: JSON.stringify({ ...row, ...patch }) }); setEmails(emails.map((e) => e.id === data.email.id ? data.email : e)); show('Email saved.'); } catch (err) { fail(err, 'Could not save email.'); } }
  async function deleteEmail(row) { if (!confirm(`Delete ${row.email}?`)) return; try { await api(`/api/notification-emails?id=${row.id}`, { method: 'DELETE' }); setEmails(emails.filter((e) => e.id !== row.id)); show('Email deleted.'); } catch (err) { fail(err, 'Could not delete email.'); } }
  async function importMonitoringRows() { try { const rows = parseCsv(monitoringCsv); if (!rows.length) throw new Error('No rows found. Paste or upload a CSV with a header row and at least one data row.'); const data = await api('/api/import-applicants', { method: 'POST', body: JSON.stringify({ companyId, rows }) }); setMonitoringCsv(''); await refresh?.(); const sample = data.errors?.length ? ` First issue: ${data.errors[0]}` : ''; show(`Monitoring import complete. Imported ${data.imported}. Updated ${data.updated || 0}. Skipped ${data.skipped}.${sample}`); } catch (err) { fail(err, 'Could not import monitoring CSV.'); } }
  async function importSafetyRows() { try { const rows = parseCsv(safetyCsv); const data = await api('/api/import-safety-reports', { method: 'POST', body: JSON.stringify({ companyId, rows }) }); setSafetyCsv(''); await refresh?.(); show(`Safety report import complete. Imported ${data.imported}. Updated ${data.updated}. Skipped ${data.skipped}.`); } catch (err) { fail(err, 'Could not import Safety Performance CSV.'); } }
  async function runSystemCheck() { try { const data = await api('/api/system-check'); setChecks(data.checks || []); show('System check complete.'); } catch (err) { fail(err, 'Could not run system check.'); } }

  return <>
    <div className="page-header"><div><h1>Settings</h1><p>Users, companies, notification emails, imports, and system checks</p></div><button className="secondary-btn" onClick={loadSettings}><RefreshCw size={16}/> Refresh</button></div>
    {message ? <div className={message.toLowerCase().includes('could not') || message.toLowerCase().includes('failed') ? 'error-box' : 'success-box'}>{message}</div> : null}
    {!isAdmin ? <div className="error-box">Only admins can edit settings.</div> : null}
    <section className="card wide-card settings-card"><h2><CheckCircle size={19}/> System Check</h2><p className="muted">Checks database connection, required tables, and Safety Performance report count.</p><button className="secondary-btn" disabled={!isAdmin} onClick={runSystemCheck}>Run System Check</button>{checks.length ? <div className="system-check-list">{checks.map((c,i)=><div key={i} className={c.ok ? 'check-ok' : 'check-bad'}><b>{c.ok ? '✓' : '!'}</b><span>{c.name}</span><small>{c.detail}</small></div>)}</div> : null}</section>
    <section className="card wide-card settings-card"><h2><Building2 size={19}/> Company Settings</h2><div className="form-grid two"><Field label="Active Company"><input disabled={!isAdmin} value={companyName} onChange={(e)=>setCompanyName(e.target.value)} /></Field><Field label="New Company"><input disabled={!isAdmin} value={newCompany} onChange={(e)=>setNewCompany(e.target.value)} /></Field></div><button className="primary-inline" disabled={!isAdmin} onClick={saveCompany}><Save size={16}/> Save Company</button><button className="secondary-btn spaced" disabled={!isAdmin || !newCompany} onClick={addCompany}><Building2 size={16}/> Add Company</button></section>
    <section className="card wide-card settings-card"><h2><Upload size={19}/> Import Monitoring CSV</h2><p className="muted">Upload or paste the old Monitoring export. Accepted headers include File Number, Applicant Name/Name, Order Date/Created, Monitor Status/Monitoring, MVR Status, Med Expire/Medical Expiration, Terminated, and Notes.</p><input disabled={!isAdmin} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e)=>readImportFile(e.target.files?.[0], setMonitoringCsv).catch((err)=>fail(err, 'Could not read file.'))} /><textarea disabled={!isAdmin} rows={7} value={monitoringCsv} onChange={(e)=>setMonitoringCsv(e.target.value)} placeholder="Paste the old Monitoring CSV here, or upload a CSV file above." /><button className="primary-inline" disabled={!isAdmin || !monitoringCsv.trim()} onClick={importMonitoringRows}><Database size={16}/> Import Monitoring Records</button></section>
    <section className="card wide-card settings-card"><h2><Upload size={19}/> Import Safety Performance CSV</h2><p className="muted">Paste the Safety Performance backup rows here. It accepts copied spreadsheet cells with columns like File Number, Applicant Name, Employer 1 Name, Employer 1 Phone, Employer 1 Email, Employer 1 Street, City, State, and Zip.</p><textarea disabled={!isAdmin} rows={7} value={safetyCsv} onChange={(e)=>setSafetyCsv(e.target.value)} /><button className="primary-inline" disabled={!isAdmin || !safetyCsv.trim()} onClick={importSafetyRows}><Database size={16}/> Import Safety Reports</button></section>
    <section className="card wide-card settings-card"><h2><UserPlus size={19}/> Users</h2><p className="muted">For a SaffHire User, select the report areas they administer. They receive full create, edit, delete, sync, PDF, email, and workflow rights inside each selected report area. Client accounts keep their separate client access controls.</p><div className="form-grid five"><Field label="Username"><input disabled={!isAdmin} value={newUser.username} onChange={(e)=>setNewUser({...newUser,username:e.target.value})} /></Field><Field label="Password"><input disabled={!isAdmin} type="password" value={newUser.password} onChange={(e)=>setNewUser({...newUser,password:e.target.value})} /></Field><Field label="Display Name"><input disabled={!isAdmin} value={newUser.displayName} onChange={(e)=>setNewUser({...newUser,displayName:e.target.value})} /></Field><Field label="Role"><select disabled={!isAdmin} value={newUser.role} onChange={(e)=>setNewUser({...newUser,role:e.target.value})}><option value="admin">Admin</option><option value="user">SaffHire User</option><option value="viewer">Viewer</option><option value="client_admin">Client Admin</option><option value="client_user">Client User</option></select></Field><Field label="Company"><select disabled={!isAdmin} value={newUser.companyId || ''} onChange={(e)=>setNewUser({...newUser,companyId:e.target.value})}><option value="">All / None</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div>{isSaffHireUserRole(newUser.role) ? <div className="client-access-panel"><div className="client-access-head"><b>SaffHire Report Admin Rights</b><small>At least one report area is required.</small></div><InternalAccessCheckboxes disabled={!isAdmin} value={newUser.internalAccess} onChange={(internalAccess)=>setNewUser({...newUser,internalAccess})}/></div> : null}{isClientRole(newUser.role) ? <div className="client-access-panel"><div className="client-access-head"><b>Client Access Options</b><select disabled={!isAdmin} value="" onChange={(e)=>{ if (e.target.value) setNewUser({...newUser,clientAccess:CLIENT_ACCESS_PRESETS[e.target.value]}); }}><option value="">Apply preset...</option><option value="full">Full Access</option><option value="monitoring">Monitoring Only</option><option value="safety">Safety Reports Only</option><option value="readonly">Read Only</option></select></div><AccessCheckboxes disabled={!isAdmin} value={newUser.clientAccess} onChange={(clientAccess)=>setNewUser({...newUser,clientAccess})}/></div> : null}<button className="primary-inline" disabled={!isAdmin || !newUser.username || !newUser.password || (isSaffHireUserRole(newUser.role) && !newUser.internalAccess?.monitoring && !newUser.internalAccess?.safetyReports)} onClick={addUser}>Add User</button><div className="table-card mini-table"><table><thead><tr><th>User</th><th>Role</th><th>Company</th><th>Report / Client Access</th><th>Active</th><th>Temporary Password</th><th></th></tr></thead><tbody>{users.map(row=><UserRow key={row.id} row={row} companies={companies} currentUserId={user?.id} onSave={saveUser} onResetPassword={resetUserPassword} onDelete={deleteUser}/>)}</tbody></table></div></section>
    <section className="card wide-card settings-card"><h2><Bell size={19}/> Notification Emails</h2><div className="form-grid three"><Field label="Label"><input disabled={!isAdmin} value={newEmail.label} onChange={(e)=>setNewEmail({...newEmail,label:e.target.value})}/></Field><Field label="Email"><input disabled={!isAdmin} value={newEmail.email} onChange={(e)=>setNewEmail({...newEmail,email:e.target.value})}/></Field><div className="field button-field"><button className="secondary-btn" disabled={!isAdmin || !newEmail.email} onClick={addEmail}>Add Email</button></div></div><div className="table-card mini-table"><table><thead><tr><th>Label</th><th>Email</th><th>Active</th><th></th></tr></thead><tbody>{emails.map(row=><EmailRow key={row.id} row={row} onSave={saveEmail} onDelete={deleteEmail}/>)}</tbody></table></div></section>
  </>;
}

function UserRow({ row, companies, currentUserId, onSave, onResetPassword, onDelete }) {
  const [draft, setDraft] = useState({ ...row, clientAccess: normalizeClientAccess(row.clientAccess), internalAccess: normalizeInternalAccess(row.internalAccess) });
  useEffect(()=>setDraft({ ...row, clientAccess: normalizeClientAccess(row.clientAccess), internalAccess: normalizeInternalAccess(row.internalAccess) }),[row]);
  const accessDisplay = draft.role === 'admin'
    ? <small><b>Full system admin</b><br/>All report areas</small>
    : isSaffHireUserRole(draft.role)
      ? <div><b>SaffHire Report Admin Rights</b><InternalAccessCheckboxes value={draft.internalAccess} onChange={(internalAccess)=>setDraft({...draft,internalAccess})}/></div>
      : isClientRole(draft.role)
        ? <AccessCheckboxes value={draft.clientAccess} onChange={(clientAccess)=>setDraft({...draft,clientAccess})}/>
        : <small>Internal read-only account</small>;
  const invalidInternalAccess = isSaffHireUserRole(draft.role) && !draft.internalAccess?.monitoring && !draft.internalAccess?.safetyReports;
  return <tr><td>{row.username}<br/><small>{row.displayName}</small></td><td><select value={draft.role} onChange={(e)=>setDraft({...draft,role:e.target.value})}><option value="admin">Admin</option><option value="user">SaffHire User</option><option value="viewer">Viewer</option><option value="client_admin">Client Admin</option><option value="client_user">Client User</option></select></td><td><select value={draft.companyId || ''} onChange={(e)=>setDraft({...draft,companyId:e.target.value})}><option value="">All / None</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></td><td>{accessDisplay}{invalidInternalAccess ? <small className="error-box">Select at least one report area.</small> : null}</td><td><select value={String(draft.isActive)} onChange={(e)=>setDraft({...draft,isActive:e.target.value==='true'})}><option value="true">Active</option><option value="false">Inactive</option></select></td><td><button type="button" className="secondary-btn settings-reset-password-btn" disabled={row.id===currentUserId} title={row.id===currentUserId ? 'Use your account password-change screen for your own password' : 'Create a temporary password'} onClick={()=>onResetPassword(row)}><KeyRound size={15}/> Temporary Password</button></td><td><button className="icon-btn" disabled={invalidInternalAccess} onClick={()=>onSave(row,draft)}><Save size={15}/></button><button className="icon-btn danger" disabled={row.id===currentUserId} onClick={()=>onDelete(row)}><Trash2 size={15}/></button></td></tr>;
}
function EmailRow({ row, onSave, onDelete }) {
  const [draft, setDraft] = useState(row);
  useEffect(()=>setDraft(row),[row]);
  return <tr><td><input value={draft.label || ''} onChange={(e)=>setDraft({...draft,label:e.target.value})}/></td><td><input value={draft.email || ''} onChange={(e)=>setDraft({...draft,email:e.target.value})}/></td><td><select value={String(draft.isActive)} onChange={(e)=>setDraft({...draft,isActive:e.target.value==='true'})}><option value="true">Active</option><option value="false">Inactive</option></select></td><td><button className="icon-btn" onClick={()=>onSave(row,draft)}><Save size={15}/></button><button className="icon-btn danger" onClick={()=>onDelete(row)}><Trash2 size={15}/></button></td></tr>;
}
