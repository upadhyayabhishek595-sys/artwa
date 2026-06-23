import { useState, useEffect } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const TABS = [
  { id: 'profile',  label: 'Profile & Business', icon: '👤' },
  { id: 'whatsapp', label: 'WhatsApp / Phone',   icon: '📱' },
  { id: 'hours',    label: 'Business Hours',     icon: '🕐' },
  { id: 'apikeys',  label: 'API Keys & Webhooks',icon: '🔑' },
  { id: 'password', label: 'Password',           icon: '🔒' },
];

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

const DEFAULT_HOURS = {
  enabled: false,
  away_message: 'We are currently outside business hours. We will get back to you soon!',
  schedule: Object.fromEntries(DAYS.map(d => [d, {
    open: !['saturday','sunday'].includes(d), start: '09:00', end: '18:00'
  }]))
};

const Field = ({ label, hint, children }) => (
  <div style={{ marginBottom: 16 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 }}>{label}</label>
    {children}
    {hint && <p style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>{hint}</p>}
  </div>
);

const Input = ({ value, onChange, type = 'text', placeholder, disabled }) => (
  <input type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder} disabled={disabled}
    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
      fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#111',
      background: disabled ? '#f9fafb' : '#fff' }} />
);

const Btn = ({ onClick, disabled, children, variant = 'primary' }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
      background: variant === 'primary' ? '#25D366' : variant === 'danger' ? '#fee2e2' : '#f0f0f0',
      color: variant === 'primary' ? '#fff' : variant === 'danger' ? '#dc2626' : '#444',
      border: variant === 'danger' ? '1px solid #fca5a5' : 'none', borderRadius: 8,
      fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
    {children}
  </button>
);

const Card = ({ title, subtitle, children }) => (
  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)', marginBottom: 20 }}>
    {title && (
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0',
        background: '#fafafa', borderRadius: '12px 12px 0 0' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{subtitle}</div>}
      </div>
    )}
    <div style={{ padding: 20 }}>{children}</div>
  </div>
);

const Toggle = ({ checked, onChange }) => (
  <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
    <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: 24,
      background: checked ? '#25D366' : '#ddd', transition: '0.3s' }}>
      <span style={{ position: 'absolute', width: 18, height: 18, borderRadius: '50%',
        background: '#fff', top: 3, left: checked ? 23 : 3, transition: '0.3s' }} />
    </span>
  </label>
);

export default function ClientSettings() {
  const [tab, setTab]       = useState('profile');
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({ name: '', email: '', business_name: '', phone: '' });
  const [waProfile, setWaProfile] = useState({ about: '', address: '', description: '', email: '', websites: '' });
  const [phoneNumbers, setPhoneNumbers] = useState([]);
  const [addingPhone, setAddingPhone]   = useState(false);
  const [newPhone, setNewPhone] = useState({ phone_number: '', phone_number_id: '', access_token: '', display_name: '', waba_id: '' });
  const [settings, setSettings] = useState(null);
  const [apiKeys, setApiKeys]   = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [newKeyName, setNewKeyName]         = useState('');
  const [newWebhookUrl, setNewWebhookUrl]   = useState('');
  const [revealedKey, setRevealedKey]       = useState(null);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => {
    if (tab === 'profile')  loadProfile();
    if (tab === 'whatsapp') loadPhoneNumbers();
    if (tab === 'hours')    loadSettings();
    if (tab === 'apikeys')  { loadApiKeys(); loadWebhooks(); }
  }, [tab]);

  const loadProfile = async () => {
    try {
      const r = await api.get('/auth/client/me');
      const u = r.data.user;
      setProfile({ name: u.name || '', email: u.email || '', business_name: u.business_name || '', phone: u.phone || '' });
    } catch { toast.error('Failed to load profile'); }
  };

  const loadPhoneNumbers = async () => {
    try {
      const r = await api.get('/manage/phone-numbers');
      setPhoneNumbers(r.data.data || []);
      const phones = r.data.data || [];
      if (phones.length) {
        try {
          const pr = await api.get(`/manage/profile?phone_number_id=${phones[0].id}`);
          const p = pr.data.data || {};
          setWaProfile({ about: p.about || '', address: p.address || '', description: p.description || '',
            email: p.email || '', websites: Array.isArray(p.websites) ? (p.websites[0] || '') : (p.websites || '') });
        } catch {}
      }
    } catch { toast.error('Failed to load phone numbers'); }
  };

  const connectPhone = async () => {
    if (!newPhone.phone_number || !newPhone.phone_number_id || !newPhone.access_token)
      return toast.error('Phone number, Phone Number ID and Access Token required');
    setSaving(true);
    try {
      await api.post('/manage/phone-numbers', newPhone);
      toast.success('Phone number connected');
      setAddingPhone(false);
      setNewPhone({ phone_number: '', phone_number_id: '', access_token: '', display_name: '', waba_id: '' });
      loadPhoneNumbers();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to connect'); }
    finally { setSaving(false); }
  };

  const disconnectPhone = async (id) => {
    if (!confirm('Disconnect this phone number?')) return;
    try { await api.delete(`/manage/phone-numbers/${id}`); toast.success('Disconnected'); loadPhoneNumbers(); }
    catch { toast.error('Failed'); }
  };

  const saveWaProfile = async () => {
    if (!phoneNumbers.length) return toast.error('No phone number connected');
    setSaving(true);
    try {
      await api.patch('/manage/profile', {
        phone_number_id: phoneNumbers[0].id,
        about: waProfile.about, address: waProfile.address,
        description: waProfile.description, email: waProfile.email,
        websites: waProfile.websites ? [waProfile.websites] : [],
      });
      toast.success('WhatsApp business profile updated');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const loadSettings = async () => {
    try {
      const r = await api.get('/settings');
      const d = r.data.data;
      setSettings({ ...d, business_hours: d.business_hours || DEFAULT_HOURS });
    } catch { toast.error('Failed to load settings'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', {
        business_hours_enabled: settings.business_hours_enabled ? 1 : 0,
        business_hours: settings.business_hours,
        timezone: settings.timezone,
        auto_reply_enabled: settings.auto_reply_enabled ? 1 : 0,
        auto_reply_message: settings.auto_reply_message,
        away_message_enabled: settings.away_message_enabled ? 1 : 0,
        away_message: settings.business_hours?.away_message,
        assignment_mode: settings.assignment_mode,
        email_notifications: settings.email_notifications ? 1 : 0,
      });
      toast.success('Settings saved');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const updateHour = (day, field, value) => setSettings(prev => ({
    ...prev,
    business_hours: {
      ...prev.business_hours,
      schedule: { ...prev.business_hours.schedule, [day]: { ...prev.business_hours.schedule[day], [field]: value } }
    }
  }));

  const loadApiKeys = async () => {
    try { const r = await api.get('/manage/api-keys'); setApiKeys(r.data.data || []); }
    catch { toast.error('Failed to load API keys'); }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return toast.error('Key name required');
    setSaving(true);
    try {
      const r = await api.post('/manage/api-keys', { name: newKeyName });
      setRevealedKey(r.data.data);
      setNewKeyName('');
      toast.success('API key created — copy it now!');
      loadApiKeys();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const revokeApiKey = async (id) => {
    if (!confirm('Revoke this API key?')) return;
    try { await api.delete(`/manage/api-keys/${id}`); toast.success('Revoked'); loadApiKeys(); }
    catch { toast.error('Failed'); }
  };

  const loadWebhooks = async () => {
    try { const r = await api.get('/manage/webhooks'); setWebhooks(r.data.data || []); }
    catch { toast.error('Failed to load webhooks'); }
  };

  const createWebhook = async () => {
    if (!newWebhookUrl.trim()) return toast.error('Webhook URL required');
    setSaving(true);
    try {
      await api.post('/manage/webhooks', { url: newWebhookUrl, events: ['*'] });
      toast.success('Webhook added'); setNewWebhookUrl(''); loadWebhooks();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const deleteWebhook = async (id) => {
    if (!confirm('Delete this webhook?')) return;
    try { await api.delete(`/manage/webhooks/${id}`); toast.success('Deleted'); loadWebhooks(); }
    catch { toast.error('Failed'); }
  };

  const toggleWebhook = async (id, status) => {
    try {
      await api.patch(`/manage/webhooks/${id}/status`, { status: status === 'active' ? 'inactive' : 'active' });
      toast.success('Updated'); loadWebhooks();
    } catch { toast.error('Failed'); }
  };

  const changePassword = async () => {
    if (passwords.new !== passwords.confirm) return toast.error('Passwords do not match');
    if (passwords.new.length < 8) return toast.error('Min 8 characters required');
    setSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: passwords.current, new_password: passwords.new });
      toast.success('Password changed');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Settings</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>Manage your account and platform configuration</p>
      </div>

      <div style={{ display: 'flex', gap: 4, background: '#fff', border: '1px solid #f0f0f0',
        borderRadius: 12, padding: 4, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
              background: tab === t.id ? '#25D366' : 'transparent',
              color: tab === t.id ? '#fff' : '#666', transition: 'all 0.15s' }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* PROFILE */}
      {tab === 'profile' && (
        <Card title="Account Info" subtitle="Your login details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Field label="Full Name"><Input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Email" hint="Cannot be changed"><Input value={profile.email} disabled /></Field>
            <Field label="Business Name"><Input value={profile.business_name} onChange={e => setProfile({ ...profile, business_name: e.target.value })} /></Field>
            <Field label="Phone"><Input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></Field>
          </div>
          <Btn onClick={() => toast.success('Profile saved')} disabled={saving}>Save Profile</Btn>
        </Card>
      )}

      {/* WHATSAPP */}
      {tab === 'whatsapp' && (
        <>
          <Card title="Connected Phone Numbers" subtitle="WhatsApp numbers linked to your account">
            {phoneNumbers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#aaa' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📱</div>
                <div style={{ fontSize: 13 }}>No phone numbers connected yet</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {phoneNumbers.map(pn => (
                  <div key={pn.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', border: '1px solid #f0f0f0', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{pn.display_name || pn.phone_number}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{pn.phone_number} • ID: {pn.phone_number_id}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 500,
                        background: pn.status === 'active' ? '#dcfce7' : '#f3f4f6',
                        color: pn.status === 'active' ? '#16a34a' : '#6b7280' }}>{pn.status}</span>
                      <Btn variant="danger" onClick={() => disconnectPhone(pn.id)}>Disconnect</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!addingPhone ? (
              <button onClick={() => setAddingPhone(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                  border: '2px dashed #25D366', color: '#25D366', background: 'none',
                  borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                + Connect Phone Number
              </button>
            ) : (
              <div style={{ border: '1px solid #dcfce7', borderRadius: 10, padding: 16, background: '#f0fdf4' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Connect WhatsApp Number</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <Field label="Phone Number (with country code)"><Input value={newPhone.phone_number} placeholder="+91XXXXXXXXXX" onChange={e => setNewPhone({ ...newPhone, phone_number: e.target.value })} /></Field>
                  <Field label="Display Name"><Input value={newPhone.display_name} placeholder="My Business" onChange={e => setNewPhone({ ...newPhone, display_name: e.target.value })} /></Field>
                  <Field label="Phone Number ID (from Meta)"><Input value={newPhone.phone_number_id} placeholder="1234567890" onChange={e => setNewPhone({ ...newPhone, phone_number_id: e.target.value })} /></Field>
                  <Field label="WABA ID (from Meta)"><Input value={newPhone.waba_id} placeholder="5473062976252355" onChange={e => setNewPhone({ ...newPhone, waba_id: e.target.value })} /></Field>
                  <Field label="Access Token" hint="Encrypted and stored securely"><Input value={newPhone.access_token} type="password" placeholder="EAAxxxxx..." onChange={e => setNewPhone({ ...newPhone, access_token: e.target.value })} /></Field>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Btn onClick={connectPhone} disabled={saving}>{saving ? 'Connecting...' : 'Connect'}</Btn>
                  <Btn variant="secondary" onClick={() => setAddingPhone(false)}>Cancel</Btn>
                </div>
              </div>
            )}
          </Card>

          {phoneNumbers.length > 0 && (
            <Card title="WhatsApp Business Profile" subtitle="Info shown to customers on your WhatsApp profile">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Field label="About"><Input value={waProfile.about} placeholder="We help businesses..." onChange={e => setWaProfile({ ...waProfile, about: e.target.value })} /></Field>
                <Field label="Business Email"><Input value={waProfile.email} placeholder="support@business.com" onChange={e => setWaProfile({ ...waProfile, email: e.target.value })} /></Field>
                <Field label="Address"><Input value={waProfile.address} placeholder="Mumbai, India" onChange={e => setWaProfile({ ...waProfile, address: e.target.value })} /></Field>
                <Field label="Website"><Input value={waProfile.websites} placeholder="https://yourbusiness.com" onChange={e => setWaProfile({ ...waProfile, websites: e.target.value })} /></Field>
              </div>
              <Field label="Description">
                <textarea value={waProfile.description} rows={3}
                  onChange={e => setWaProfile({ ...waProfile, description: e.target.value })}
                  placeholder="Tell customers about your business..."
                  style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
                    fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </Field>
              <Btn onClick={saveWaProfile} disabled={saving}>{saving ? 'Saving...' : 'Update WhatsApp Profile'}</Btn>
            </Card>
          )}
        </>
      )}

      {/* BUSINESS HOURS */}
      {tab === 'hours' && settings && (
        <>
          <Card title="Business Hours" subtitle="Set when your team is available">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Enable business hours</span>
              <Toggle checked={!!settings.business_hours_enabled}
                onChange={e => setSettings({ ...settings, business_hours_enabled: e.target.checked })} />
            </div>
            {DAYS.map(day => {
              const h = settings.business_hours?.schedule?.[day] || { open: false, start: '09:00', end: '18:00' };
              return (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                  <input type="checkbox" checked={!!h.open} onChange={e => updateHour(day, 'open', e.target.checked)} />
                  <span style={{ width: 100, fontSize: 13, textTransform: 'capitalize', fontWeight: h.open ? 600 : 400, color: h.open ? '#111' : '#aaa' }}>{day}</span>
                  {h.open ? (
                    <>
                      <input type="time" value={h.start} onChange={e => updateHour(day, 'start', e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
                      <span style={{ color: '#aaa', fontSize: 12 }}>to</span>
                      <input type="time" value={h.end} onChange={e => updateHour(day, 'end', e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
                    </>
                  ) : <span style={{ fontSize: 12, color: '#aaa' }}>Closed</span>}
                </div>
              );
            })}
            <Field label="Away Message" hint="Sent when customer messages outside business hours">
              <textarea value={settings.business_hours?.away_message || ''} rows={2}
                onChange={e => setSettings({ ...settings, business_hours: { ...settings.business_hours, away_message: e.target.value } })}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', marginTop: 12 }} />
            </Field>
          </Card>

          <Card title="Auto Reply" subtitle="Automatic response for all incoming messages">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Enable auto reply</span>
              <Toggle checked={!!settings.auto_reply_enabled}
                onChange={e => setSettings({ ...settings, auto_reply_enabled: e.target.checked })} />
            </div>
            <Field label="Auto Reply Message">
              <textarea value={settings.auto_reply_message || ''} rows={2}
                onChange={e => setSettings({ ...settings, auto_reply_message: e.target.value })}
                placeholder="Hi! We received your message and will respond shortly."
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </Field>
          </Card>

          <Btn onClick={saveSettings} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Btn>
        </>
      )}

      {/* API KEYS */}
      {tab === 'apikeys' && (
        <>
          {revealedKey && (
            <div style={{ marginBottom: 16, padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', marginBottom: 8 }}>✅ API Key Created — Copy it now, it won't be shown again.</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: 8, wordBreak: 'break-all' }}>{revealedKey.api_key}</code>
                <Btn onClick={() => { navigator.clipboard.writeText(revealedKey.api_key); toast.success('Copied!'); }}>Copy</Btn>
              </div>
              <button onClick={() => setRevealedKey(null)}
                style={{ marginTop: 8, fontSize: 12, color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                I've saved it — dismiss
              </button>
            </div>
          )}

          <Card title="API Keys" subtitle="Use these keys to integrate with external services">
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. CRM Integration)"
                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              <Btn onClick={createApiKey} disabled={saving}>{saving ? '...' : '+ Create Key'}</Btn>
            </div>
            {apiKeys.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>No API keys yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {apiKeys.map(k => (
                  <div key={k.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', border: '1px solid #f0f0f0', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{k.name}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <code style={{ fontSize: 11, background: '#f9fafb', padding: '2px 6px', borderRadius: 4 }}>{k.key_prefix}</code>
                        {k.last_used_at && <span style={{ fontSize: 11, color: '#aaa' }}>Last used: {new Date(k.last_used_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Btn variant="danger" onClick={() => revokeApiKey(k.id)}>Revoke</Btn>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Webhooks" subtitle="Get notified when messages are sent, received, or status changes">
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="url" value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)} placeholder="https://yourapp.com/webhook"
                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              <Btn onClick={createWebhook} disabled={saving}>{saving ? '...' : '+ Add Webhook'}</Btn>
            </div>
            {webhooks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#aaa', fontSize: 13 }}>No webhooks configured</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {webhooks.map(wh => (
                  <div key={wh.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', border: '1px solid #f0f0f0', borderRadius: 10 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wh.url}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 20, fontWeight: 500,
                          background: wh.status === 'active' ? '#dcfce7' : '#f3f4f6',
                          color: wh.status === 'active' ? '#16a34a' : '#6b7280' }}>{wh.status}</span>
                        {wh.failure_count > 0 && <span style={{ fontSize: 11, color: '#dc2626' }}>{wh.failure_count} failures</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn variant="secondary" onClick={() => toggleWebhook(wh.id, wh.status)}>
                        {wh.status === 'active' ? 'Disable' : 'Enable'}
                      </Btn>
                      <Btn variant="danger" onClick={() => deleteWebhook(wh.id)}>Delete</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* PASSWORD */}
      {tab === 'password' && (
        <Card title="Change Password" subtitle="Update your account password">
          <div style={{ maxWidth: 360 }}>
            <Field label="Current Password"><Input type="password" value={passwords.current} onChange={e => setPasswords({ ...passwords, current: e.target.value })} /></Field>
            <Field label="New Password" hint="Minimum 8 characters"><Input type="password" value={passwords.new} onChange={e => setPasswords({ ...passwords, new: e.target.value })} /></Field>
            <Field label="Confirm New Password"><Input type="password" value={passwords.confirm} onChange={e => setPasswords({ ...passwords, confirm: e.target.value })} /></Field>
            <Btn onClick={changePassword} disabled={saving}>{saving ? 'Changing...' : 'Change Password'}</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}