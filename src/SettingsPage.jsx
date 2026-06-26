import React, { useEffect, useState } from 'react';
import { Bell, Building2, CheckCircle, Database, RefreshCw, Save, Trash2, Upload, UserPlus } from 'lucide-react';

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned non-JSON: ${text.slice(0, 140)}`); }
  if (!response.ok) throw new Error(data.message || `Request failed: ${response.status}`);
  return data;
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') { value += '"'; i++; continue; }
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { row.push(value.trim()); value = ''; continue; }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
      continue;
    }
    value += char;
  }
  row.push(value.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const out = {};
    headers.forEach((h, i) => { out[h] = cells[i] || ''; });
    return out;
  });
}

export default function SettingsManager({ user, company, companies, setCompanies, companyId, refresh }) {
  const [users, setUsers] = useState([]);
  const [emails, setEmails] = useState([]);
  const [checks, setChecks] = useState([]);
  const [message, setMessage] = useState('');
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [newCompany, setNewCompany] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', displayName: '', role: 'user', companyId: companyId || '' });
  const [newEmail, setNewEmail] = useState({ label: '', email: '' });
  const [monitoringCsv, setMonitoringCsv] = useState('');
  const [safetyCsv, setSafetyCsv] = useState('');
  const isAdmin = user?.role === 'admin';

  useEffect(() => { setCompanyName(company?.name || ''); }, [company?.name]);
  useEffect(() => { if (isAdmin) loadSettings().catch((err) => setMessage(err.message)); }, [isAdmin]);

  async function loadSettings() {
    const [u, e] = await Promise.all([api('/api/users'), api('/api/notification-emails')]);
    setUsers(u.users || []);
    setEmails(e.emails || []);
  }
  function show(text) { setMessage(text); setTimeout(() => setMessage(''), 5000); }
  function fail(err, fallback) { setMessage(err?.message || fallback); }

  async function saveCompany() { try { const data = await api('/api/companies', { method: 'PATCH', body: JSON.stringify({ id: company.id, name: companyName, isActive: true }) }); setCompanies(companies.map((c) => c.id === data.company.id ? data.company : c)); show('Company saved.'); } catch (err) { fail(err, 'Could not save company.'); } }
  async function addCompany() { try { const data = await api('/api/companies', { method: 'POST', body: JSON.stringify({ name: newCompany }) }); setCompanies([...companies, data.company]); setNewCompany(''); show('Company added.'); } catch (err) { fail(err, 'Could not add company.'); } }
  async function addUser() { try { const data = await api('/api/users', { method: 'POST', body: JSON.stringify(newUser) }); setUsers([...users, data.user]); setNewUser({ username: '', password: '', displayName: '', role: 'user', companyId: companyId || '' }); show('User added.'); } catch (err) { fail(err, 'Could not add user.'); } }
  async function saveUser(row, patch) { try { const payload = { ...row, ...patch }; if (!payload.password) delete payload.password; const data = await api('/api/users', { method: 'PATCH', body: JSON.stringify(payload) }); setUsers(users.map((u) => u.id === data.user.id ? data.user : u)); show(payload.password ? 'User saved and login reset.' : 'User saved.'); } catch (err) { fail(err, 'Could not save user.'); } }
  async function deleteUser(row) { if (!confirm(`Delete ${row.username}?`)) return; try { await api(`/api/users?id=${row.id}`, { method: 'DELETE' }); setUsers(users.filter((u) => u.id !== row.id)); show('User deleted.'); } catch (err) { fail(err, 'Could not delete user.'); } }
  async function addEmail() { try { const data = await api('/api/notification-emails', { method: 'POST', body: JSON.stringify(newEmail) }); setEmails([...emails, data.email]); setNewEmail({ label: '', email: '' }); show('Email added.'); } catch (err) { fail(err, 'Could not add email.'); } }
  async function saveEmail(row, patch) { try { const data = await api('/api/notification-emails', { method: 'PATCH', body: JSON.stringify({ ...row, ...patch }) }); setEmails(emails.map((e) => e.id === data.email.id ? data.email : e)); show('Email saved.'); } catch (err) { fail(err, 'Could not save email.'); } }
  async function deleteEmail(row) { if (!confirm(`Delete ${row.email}?`)) return; try { await api(`/api/notification-emails?id=${row.id}`, { method: 'DELETE' }); setEmails(emails.filter((e) => e.id !== row.id)); show('Email deleted.'); } catch (err) { fail(err, 'Could not delete email.'); } }
  async function importMonitoringRows() { try { const rows = parseCsv(monitoringCsv); const data = await api('/api/import-applicants', { method: 'POST', body: JSON.stringify({ companyId, rows }) }); setMonitoringCsv(''); await refresh?.(); show(`Monitoring import complete. Imported ${data.imported}. Skipped ${data.skipped}.`); } catch (err) { fail(err, 'Could not import monitoring CSV.'); } }
  async function importSafetyRows() { try { const rows = parseCsv(safetyCsv); const data = await api('/api/import-safety-reports', { method: 'POST', body: JSON.stringify({ companyId, rows }) }); setSafetyCsv(''); await refresh?.(); show(`Safety report import complete. Imported ${data.imported}. Updated ${data.updated}. Skipped ${data.skipped}.`); } catch (err) { fail(err, 'Could not import Safety Performance CSV.'); } }
  async function runSystemCheck() { try { const data = await api('/api/system-check'); setChecks(data.checks || []); show('System check complete.'); } catch (err) { fail(err, 'Could not run system check.'); } }

  return <>
    <div className="page-header"><div><h1>Settings</h1><p>Users, companies, notification emails, imports, and system checks</p></div><button className="secondary-btn" onClick={loadSettings}><RefreshCw size={16}/> Refresh</button></div>
    {message ? <div className={message.toLowerCase().includes('could not') || message.toLowerCase().includes('failed') ? 'error-box' : 'success-box'}>{message}</div> : null}
    {!isAdmin ? <div className="error-box">Only admins can edit settings.</div> : null}
    <section className="card wide-card settings-card"><h2><CheckCircle size={19}/> System Check</h2><p className="muted">Checks database connection, required tables, and Safety Performance report count.</p><button className="secondary-btn" disabled={!isAdmin} onClick={runSystemCheck}>Run System Check</button>{checks.length ? <div className="system-check-list">{checks.map((c,i)=><div key={i} className={c.ok ? 'check-ok' : 'check-bad'}><b>{c.ok ? '✓' : '!'}</b><span>{c.name}</span><small>{c.detail}</small></div>)}</div> : null}</section>
    <section className="card wide-card settings-card"><h2><Building2 size={19}/> Company Settings</h2><div className="form-grid two"><Field label="Active Company"><input disabled={!isAdmin} value={companyName} onChange={(e)=>setCompanyName(e.target.value)} /></Field><Field label="New Company"><input disabled={!isAdmin} value={newCompany} onChange={(e)=>setNewCompany(e.target.value)} /></Field></div><button className="primary-inline" disabled={!isAdmin} onClick={saveCompany}><Save size={16}/> Save Company</button><button className="secondary-btn spaced" disabled={!isAdmin || !newCompany} onClick={addCompany}><Building2 size={16}/> Add Company</button></section>
    <section className="card wide-card settings-card"><h2><Upload size={19}/> Import Monitoring CSV</h2><p className="muted">Paste CSV with headers: File Number, Applicant Name, Order Date, Monitor Status, MVR Status, Med Expire, Notes.</p><textarea disabled={!isAdmin} rows={7} value={monitoringCsv} onChange={(e)=>setMonitoringCsv(e.target.value)} /><button className="primary-inline" disabled={!isAdmin || !monitoringCsv.trim()} onClick={importMonitoringRows}><Database size={16}/> Import Applicants</button></section>
    <section className="card wide-card settings-card"><h2><Upload size={19}/> Import Safety Performance CSV</h2><p className="muted">Paste the Safety Performance backup CSV here. This fills the Safety Performance Reports table in Supabase. It updates matching file numbers and inserts new ones.</p><textarea disabled={!isAdmin} rows={7} value={safetyCsv} onChange={(e)=>setSafetyCsv(e.target.value)} /><button className="primary-inline" disabled={!isAdmin || !safetyCsv.trim()} onClick={importSafetyRows}><Database size={16}/> Import Safety Reports</button></section>
    <section className="card wide-card settings-card"><h2><UserPlus size={19}/> Users</h2><div className="form-grid five"><Field label="Username"><input disabled={!isAdmin} value={newUser.username} onChange={(e)=>setNewUser({...newUser,username:e.target.value})} /></Field><Field label="Password"><input disabled={!isAdmin} type="password" value={newUser.password} onChange={(e)=>setNewUser({...newUser,password:e.target.value})} /></Field><Field label="Display Name"><input disabled={!isAdmin} value={newUser.displayName} onChange={(e)=>setNewUser({...newUser,displayName:e.target.value})} /></Field><Field label="Role"><select disabled={!isAdmin} value={newUser.role} onChange={(e)=>setNewUser({...newUser,role:e.target.value})}><option value="admin">Admin</option><option value="user">User</option><option value="viewer">Viewer</option></select></Field><Field label="Company"><select disabled={!isAdmin} value={newUser.companyId || ''} onChange={(e)=>setNewUser({...newUser,companyId:e.target.value})}><option value="">All / None</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div><button className="primary-inline" disabled={!isAdmin || !newUser.username || !newUser.password} onClick={addUser}>Add User</button><div className="table-card mini-table"><table><thead><tr><th>User</th><th>Role</th><th>Company</th><th>Active</th><th>Reset Login</th><th></th></tr></thead><tbody>{users.map(row=><UserRow key={row.id} row={row} companies={companies} currentUserId={user?.id} onSave={saveUser} onDelete={deleteUser}/>)}</tbody></table></div></section>
    <section className="card wide-card settings-card"><h2><Bell size={19}/> Notification Emails</h2><div className="form-grid three"><Field label="Label"><input disabled={!isAdmin} value={newEmail.label} onChange={(e)=>setNewEmail({...newEmail,label:e.target.value})}/></Field><Field label="Email"><input disabled={!isAdmin} value={newEmail.email} onChange={(e)=>setNewEmail({...newEmail,email:e.target.value})}/></Field><div className="field button-field"><button className="secondary-btn" disabled={!isAdmin || !newEmail.email} onClick={addEmail}>Add Email</button></div></div><div className="table-card mini-table"><table><thead><tr><th>Label</th><th>Email</th><th>Active</th><th></th></tr></thead><tbody>{emails.map(row=><EmailRow key={row.id} row={row} onSave={saveEmail} onDelete={deleteEmail}/>)}</tbody></table></div></section>
  </>;
}

function UserRow({ row, companies, currentUserId, onSave, onDelete }) {
  const [draft, setDraft] = useState({ ...row, password: '' });
  useEffect(()=>setDraft({ ...row, password: '' }),[row]);
  return <tr><td>{row.username}<br/><small>{row.displayName}</small></td><td><select value={draft.role} onChange={(e)=>setDraft({...draft,role:e.target.value})}><option value="admin">Admin</option><option value="user">User</option><option value="viewer">Viewer</option></select></td><td><select value={draft.companyId || ''} onChange={(e)=>setDraft({...draft,companyId:e.target.value})}><option value="">All / None</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></td><td><select value={String(draft.isActive)} onChange={(e)=>setDraft({...draft,isActive:e.target.value==='true'})}><option value="true">Active</option><option value="false">Inactive</option></select></td><td><input type="password" placeholder="Optional" value={draft.password || ''} onChange={(e)=>setDraft({...draft,password:e.target.value})}/></td><td><button className="icon-btn" onClick={()=>onSave(row,draft)}><Save size={15}/></button><button className="icon-btn danger" disabled={row.id===currentUserId} onClick={()=>onDelete(row)}><Trash2 size={15}/></button></td></tr>;
}
function EmailRow({ row, onSave, onDelete }) {
  const [draft, setDraft] = useState(row);
  useEffect(()=>setDraft(row),[row]);
  return <tr><td><input value={draft.label || ''} onChange={(e)=>setDraft({...draft,label:e.target.value})}/></td><td><input value={draft.email || ''} onChange={(e)=>setDraft({...draft,email:e.target.value})}/></td><td><select value={String(draft.isActive)} onChange={(e)=>setDraft({...draft,isActive:e.target.value==='true'})}><option value="true">Active</option><option value="false">Inactive</option></select></td><td><button className="icon-btn" onClick={()=>onSave(row,draft)}><Save size={15}/></button><button className="icon-btn danger" onClick={()=>onDelete(row)}><Trash2 size={15}/></button></td></tr>;
}
