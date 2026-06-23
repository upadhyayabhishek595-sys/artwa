import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Key, Lock, Phone, Plus, Trash2, Clock, Building2 } from 'lucide-react';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const defaultSchedule = () => ({
    monday:    { open: true, start: '09:00', end: '18:00' },
    tuesday:   { open: true, start: '09:00', end: '18:00' },
    wednesday: { open: true, start: '09:00', end: '18:00' },
    thursday:  { open: true, start: '09:00', end: '18:00' },
    friday:    { open: true, start: '09:00', end: '18:00' },
    saturday:  { open: false, start: '09:00', end: '13:00' },
    sunday:    { open: false, start: '09:00', end: '13:00' },
});

const Settings = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('profile');
    const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
    const [apiKeyForm, setApiKeyForm] = useState({ name: '' });
    const [apiKeys, setApiKeys] = useState([]);
    const [newKey, setNewKey] = useState(null);
    const [loading, setLoading] = useState(false);

    // Phone numbers state
    const [phones, setPhones] = useState([]);
    const [phoneForm, setPhoneForm] = useState({ phone_number_id: '', phone_number: '', display_name: '', access_token: '' });
    const [showAddPhone, setShowAddPhone] = useState(false);

    const [bizPhoneId, setBizPhoneId] = useState('');
    const [bizProfile, setBizProfile] = useState({ about: '', description: '', email: '', address: '', vertical: '', websites: '' });
    const [bhEnabled, setBhEnabled] = useState(false);
    const [awayMessage, setAwayMessage] = useState('');
    const [schedule, setSchedule] = useState(defaultSchedule());
    const [embedConfig, setEmbedConfig] = useState(null);
    const [embedSession, setEmbedSession] = useState(null);
    const [embedCode, setEmbedCode] = useState(null);

    const loadApiKeys = async () => {
        try {
            const r = await api.get('/manage/api-keys');
            setApiKeys(r.data.data || []);
        } catch (err) { console.error(err); }
    };

    const loadPhones = async () => {
        try {
            const r = await api.get('/manage/phone-numbers');
            const list = r.data.data || [];
            setPhones(list);
            if (list.length && !bizPhoneId) setBizPhoneId(String(list[0].id));
        } catch (err) { console.error(err); }
    };

    const loadSettings = async () => {
        try {
            const r = await api.get('/settings');
            const d = r.data.data || {};
            setBhEnabled(d.business_hours_enabled === 1 || d.business_hours?.enabled);
            const bh = d.business_hours || {};
            setAwayMessage(bh.away_message || d.away_message || '');
            setSchedule(bh.schedule || defaultSchedule());
        } catch (err) { console.error(err); }
    };

    const loadBizProfile = async (phoneId) => {
        if (!phoneId) return;
        try {
            const r = await api.get(`/manage/profile?phone_number_id=${phoneId}`);
            const d = r.data.data || {};
            setBizProfile({
                about: d.about || '',
                description: d.description || '',
                email: d.email || '',
                address: d.address || '',
                vertical: d.vertical || '',
                websites: (d.websites || []).join(', '),
            });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load WhatsApp profile');
        }
    };

    useEffect(() => {
        loadApiKeys();
        loadPhones();
        loadSettings();
    }, []);

    useEffect(() => {
        if (bizPhoneId) loadBizProfile(bizPhoneId);
    }, [bizPhoneId]);

    useEffect(() => {
        const onMessage = (event) => {
            if (event.origin !== 'https://www.facebook.com') return;
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'WA_EMBEDDED_SIGNUP' && data.data) {
                    setEmbedSession(data.data);
                    toast.success('WhatsApp account selected — click Complete Connection');
                }
            } catch { /* ignore non-JSON */ }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        if (activeTab !== 'phones') return;
        api.get('/manage/embedded-signup/config')
            .then(r => {
                setEmbedConfig(r.data.data);
                const appId = r.data.data?.app_id;
                if (!appId || window.FB) return;
                const script = document.createElement('script');
                script.src = 'https://connect.facebook.net/en_US/sdk.js';
                script.async = true;
                script.defer = true;
                script.crossOrigin = 'anonymous';
                script.onload = () => {
                    window.FB.init({ appId, cookie: true, xfbml: true, version: 'v21.0' });
                };
                document.body.appendChild(script);
            })
            .catch(() => setEmbedConfig(null));
    }, [activeTab]);

    const changePassword = async (e) => {
        e.preventDefault();
        if (pwForm.new_password !== pwForm.confirm) {
            return toast.error('Passwords do not match');
        }
        setLoading(true);
        try {
            await api.post('/auth/change-password', {
                current_password: pwForm.current_password,
                new_password: pwForm.new_password
            });
            toast.success('Password changed successfully');
            setPwForm({ current_password: '', new_password: '', confirm: '' });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error');
        } finally { setLoading(false); }
    };

    const createApiKey = async (e) => {
        e.preventDefault();
        try {
            const r = await api.post('/manage/api-keys', apiKeyForm);
            setNewKey(r.data.data.api_key);
            toast.success('API key created');
            setApiKeyForm({ name: '' });
            loadApiKeys();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error');
        }
    };

    const revokeKey = async (id) => {
        if (!confirm('Revoke this API key?')) return;
        await api.delete(`/manage/api-keys/${id}`);
        toast.success('Key revoked');
        loadApiKeys();
    };

    const addPhone = async (e) => {
        e.preventDefault();
        try {
            await api.post('/manage/phone-numbers', phoneForm);
            toast.success('Phone number added');
            setShowAddPhone(false);
            setPhoneForm({ phone_number_id: '', phone_number: '', display_name: '', access_token: '' });
            loadPhones();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error');
        }
    };

    const removePhone = async (id) => {
        if (!confirm('Remove this phone number?')) return;
        await api.delete(`/manage/phone-numbers/${id}`);
        toast.success('Phone number removed');
        loadPhones();
    };

    const saveBizProfile = async (e) => {
        e.preventDefault();
        if (!bizPhoneId) return toast.error('Select a phone number');
        try {
            await api.patch('/manage/profile', {
                phone_number_id: Number(bizPhoneId),
                about: bizProfile.about,
                description: bizProfile.description,
                email: bizProfile.email || undefined,
                address: bizProfile.address || undefined,
                vertical: bizProfile.vertical || undefined,
                websites: bizProfile.websites
                    ? bizProfile.websites.split(',').map(w => w.trim()).filter(Boolean)
                    : undefined,
            });
            toast.success('WhatsApp business profile updated');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Update failed');
        }
    };

    const saveBusinessHours = async (e) => {
        e.preventDefault();
        try {
            await api.patch('/settings', {
                business_hours_enabled: bhEnabled ? 1 : 0,
                business_hours: {
                    enabled: bhEnabled,
                    away_message: awayMessage,
                    schedule,
                },
            });
            toast.success('Business hours saved');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Save failed');
        }
    };

    const launchEmbeddedSignup = () => {
        if (!embedConfig) return toast.error('Embedded Signup not configured on server');
        if (!window.FB) return toast.error('Facebook SDK loading — try again in a moment');
        window.FB.login((response) => {
            if (response.authResponse?.code) {
                setEmbedCode(response.authResponse.code);
                toast.success('Authorization received');
            }
        }, {
            config_id: embedConfig.config_id,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: '3' },
        });
    };

    const completeEmbeddedSignup = async () => {
        if (!embedCode || !embedSession) {
            return toast.error('Launch Embedded Signup and select your WhatsApp account first');
        }
        try {
            await api.post('/manage/embedded-signup/complete', {
                code: embedCode,
                waba_id: embedSession.waba_id,
                phone_number_id: embedSession.phone_number_id,
                phone_number: String(embedSession.phone_number || embedSession.display_phone_number || '').replace(/\D/g, ''),
                display_name: embedSession.display_name || embedSession.verified_name,
            });
            toast.success('WhatsApp number connected!');
            setEmbedCode(null);
            setEmbedSession(null);
            loadPhones();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Connection failed');
        }
    };

    const tabs = [
        { id: 'profile',  label: 'Profile',          icon: <Phone size={15} /> },
        { id: 'phones',   label: 'Phone Numbers',    icon: <Phone size={15} /> },
        { id: 'whatsapp', label: 'WhatsApp Profile', icon: <Building2 size={15} /> },
        { id: 'hours',    label: 'Business Hours',   icon: <Clock size={15} /> },
        { id: 'password', label: 'Password',         icon: <Lock size={15} /> },
        { id: 'apikeys',  label: 'API Keys',         icon: <Key size={15} /> },
    ];

    return (
        <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: '600' }}>Settings</h2>

            <div style={{ display: 'flex', gap: '24px' }}>
                {/* Tab nav */}
                <div style={s.tabNav}>
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            style={{ ...s.tabBtn, ...(activeTab === t.id ? s.tabBtnActive : {}) }}>
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                <div style={s.content}>
                    {/* Profile */}
                    {activeTab === 'profile' && (
                        <div style={s.card}>
                            <h3 style={s.cardTitle}>Profile Information</h3>
                            <div style={s.infoGrid}>
                                {[
                                    { label: 'Name',       value: user?.name },
                                    { label: 'Email',      value: user?.email },
                                    { label: 'Business',   value: user?.business_name },
                                    { label: 'Plan',       value: user?.plan },
                                    { label: 'Status',     value: user?.status },
                                    { label: 'Trial Ends', value: user?.trial_ends_at ? new Date(user.trial_ends_at).toLocaleDateString() : '—' },
                                ].map(item => (
                                    <div key={item.label} style={s.infoItem}>
                                        <div style={s.infoLabel}>{item.label}</div>
                                        <div style={s.infoValue}>{item.value || '—'}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Phone Numbers */}
                    {activeTab === 'phones' && (
                        <div style={s.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ ...s.cardTitle, margin: 0 }}>Phone Numbers</h3>
                                <button onClick={() => setShowAddPhone(true)} style={s.btn}>
                                    <Plus size={14} /> Add Number
                                </button>
                            </div>

                            {phones.length === 0 ? (
                                <div style={{ color: '#888', fontSize: '13px', padding: '20px 0' }}>
                                    No phone numbers connected yet.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {phones.map(p => (
                                        <div key={p.id} style={s.keyRow}>
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: '500' }}>{p.display_name || p.phone_number}</div>
                                                <div style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>{p.phone_number}</div>
                                                {p.quality_rating && (
                                                    <span style={{ fontSize: '11px', color: '#666' }}>
                                                        Quality: {p.quality_rating}
                                                        {p.messaging_limit_tier ? ` · ${p.messaging_limit_tier}` : ''}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '20px', background: p.status === 'active' ? '#dcfce7' : '#fee2e2', color: p.status === 'active' ? '#16a34a' : '#dc2626' }}>
                                                    {p.status}
                                                </span>
                                                <button onClick={() => removePhone(p.id)}
                                                    style={{ padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {embedConfig && (
                                <div style={{ marginTop: '24px', padding: '16px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                                    <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Connect with Meta Embedded Signup</h4>
                                    <p style={{ fontSize: '12px', color: '#666', margin: '0 0 12px' }}>
                                        Official Meta flow to connect your WhatsApp Business Account without copying tokens manually.
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button onClick={launchEmbeddedSignup} style={s.btn}>Launch Embedded Signup</button>
                                        {embedCode && embedSession && (
                                            <button onClick={completeEmbeddedSignup} style={s.btn}>Complete Connection</button>
                                        )}
                                    </div>
                                    {embedSession && (
                                        <div style={{ fontSize: '11px', color: '#555', marginTop: '8px', fontFamily: 'monospace' }}>
                                            WABA: {embedSession.waba_id} · Phone ID: {embedSession.phone_number_id}
                                        </div>
                                    )}
                                </div>
                            )}

                            {showAddPhone && (
                                <div style={s.modal}>
                                    <div style={s.modalBox}>
                                        <h3 style={{ margin: '0 0 20px', fontSize: '16px' }}>Add Phone Number</h3>
                                        <form onSubmit={addPhone} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={s.field}>
                                                <label style={s.label}>Phone Number ID <span style={{ color: '#888' }}>(from Meta Business Manager)</span></label>
                                                <input placeholder="e.g. 123456789012345"
                                                    value={phoneForm.phone_number_id}
                                                    onChange={e => setPhoneForm({ ...phoneForm, phone_number_id: e.target.value })}
                                                    style={s.input} required />
                                            </div>
                                            <div style={s.field}>
                                                <label style={s.label}>Phone Number</label>
                                                <input placeholder="e.g. 919XXXXXXXXX"
                                                    value={phoneForm.phone_number}
                                                    onChange={e => setPhoneForm({ ...phoneForm, phone_number: e.target.value })}
                                                    style={s.input} required />
                                            </div>
                                            <div style={s.field}>
                                                <label style={s.label}>Display Name <span style={{ color: '#888' }}>(optional)</span></label>
                                                <input placeholder="e.g. Support Line"
                                                    value={phoneForm.display_name}
                                                    onChange={e => setPhoneForm({ ...phoneForm, display_name: e.target.value })}
                                                    style={s.input} />
                                            </div>
                                            <div style={s.field}>
                                                <label style={s.label}>Access Token <span style={{ color: '#888' }}>(WhatsApp Business API token)</span></label>
                                                <input type="password" placeholder="EAAxxxxxxxxxx..."
                                                    value={phoneForm.access_token}
                                                    onChange={e => setPhoneForm({ ...phoneForm, access_token: e.target.value })}
                                                    style={s.input} required />
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button type="button" onClick={() => setShowAddPhone(false)} style={s.cancelBtn}>Cancel</button>
                                                <button type="submit" style={s.btn}>Add Number</button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* WhatsApp Business Profile */}
                    {activeTab === 'whatsapp' && (
                        <div style={s.card}>
                            <h3 style={s.cardTitle}>WhatsApp Business Profile</h3>
                            {phones.length === 0 ? (
                                <p style={{ color: '#888', fontSize: '13px' }}>Connect a phone number first.</p>
                            ) : (
                                <form onSubmit={saveBizProfile} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
                                    <div style={s.field}>
                                        <label style={s.label}>Phone Number</label>
                                        <select value={bizPhoneId} onChange={e => setBizPhoneId(e.target.value)} style={s.input}>
                                            {phones.map(p => (
                                                <option key={p.id} value={p.id}>{p.display_name || p.phone_number}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {['about', 'description', 'email', 'address', 'vertical'].map(field => (
                                        <div key={field} style={s.field}>
                                            <label style={s.label}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                                            <input value={bizProfile[field]}
                                                onChange={e => setBizProfile({ ...bizProfile, [field]: e.target.value })}
                                                style={s.input} />
                                        </div>
                                    ))}
                                    <div style={s.field}>
                                        <label style={s.label}>Websites (comma-separated)</label>
                                        <input value={bizProfile.websites}
                                            onChange={e => setBizProfile({ ...bizProfile, websites: e.target.value })}
                                            placeholder="https://example.com" style={s.input} />
                                    </div>
                                    <button type="submit" style={s.btn}>Save to WhatsApp</button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* Business Hours */}
                    {activeTab === 'hours' && (
                        <div style={s.card}>
                            <h3 style={s.cardTitle}>Business Hours Auto-Reply</h3>
                            <p style={{ fontSize: '13px', color: '#888', margin: '0 0 16px' }}>
                                Sends an automatic reply when customers message outside your working hours.
                            </p>
                            <form onSubmit={saveBusinessHours} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                    <input type="checkbox" checked={bhEnabled}
                                        onChange={e => setBhEnabled(e.target.checked)} />
                                    Enable business hours auto-reply
                                </label>
                                <div style={s.field}>
                                    <label style={s.label}>Away Message</label>
                                    <textarea value={awayMessage} onChange={e => setAwayMessage(e.target.value)}
                                        style={{ ...s.input, minHeight: '72px' }}
                                        placeholder="We are currently outside business hours..." />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {DAYS.map(day => (
                                        <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                                            <input type="checkbox" checked={schedule[day]?.open}
                                                onChange={e => setSchedule({ ...schedule, [day]: { ...schedule[day], open: e.target.checked } })} />
                                            <span style={{ width: '90px', textTransform: 'capitalize' }}>{day}</span>
                                            <input type="time" value={schedule[day]?.start || '09:00'}
                                                onChange={e => setSchedule({ ...schedule, [day]: { ...schedule[day], start: e.target.value } })}
                                                style={{ ...s.input, width: '110px' }} disabled={!schedule[day]?.open} />
                                            <span>–</span>
                                            <input type="time" value={schedule[day]?.end || '18:00'}
                                                onChange={e => setSchedule({ ...schedule, [day]: { ...schedule[day], end: e.target.value } })}
                                                style={{ ...s.input, width: '110px' }} disabled={!schedule[day]?.open} />
                                        </div>
                                    ))}
                                </div>
                                <button type="submit" style={s.btn}>Save Business Hours</button>
                            </form>
                        </div>
                    )}

                    {/* Password */}
                    {activeTab === 'password' && (
                        <div style={s.card}>
                            <h3 style={s.cardTitle}>Change Password</h3>
                            <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '360px' }}>
                                {[
                                    { key: 'current_password', label: 'Current Password' },
                                    { key: 'new_password',     label: 'New Password' },
                                    { key: 'confirm',          label: 'Confirm New Password' },
                                ].map(f => (
                                    <div key={f.key} style={s.field}>
                                        <label style={s.label}>{f.label}</label>
                                        <input type="password" value={pwForm[f.key]}
                                            onChange={e => setPwForm({ ...pwForm, [f.key]: e.target.value })}
                                            style={s.input} required />
                                    </div>
                                ))}
                                <button type="submit" style={s.btn} disabled={loading}>
                                    {loading ? 'Saving...' : 'Change Password'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* API Keys */}
                    {activeTab === 'apikeys' && (
                        <div style={s.card}>
                            <h3 style={s.cardTitle}>API Keys</h3>

                            {newKey && (
                                <div style={s.keyAlert}>
                                    <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '6px' }}>
                                        ⚠️ Copy this key now — it won't be shown again!
                                    </div>
                                    <code style={s.keyCode}>{newKey}</code>
                                    <button onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied!'); }}
                                        style={{ ...s.btn, marginTop: '8px', fontSize: '12px', padding: '6px 12px' }}>
                                        Copy Key
                                    </button>
                                </div>
                            )}

                            <form onSubmit={createApiKey} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                                <input placeholder="Key name (e.g. Production)" value={apiKeyForm.name}
                                    onChange={e => setApiKeyForm({ name: e.target.value })}
                                    style={{ ...s.input, flex: 1 }} required />
                                <button type="submit" style={s.btn}>Generate Key</button>
                            </form>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {apiKeys.length === 0 && (
                                    <div style={{ color: '#888', fontSize: '13px' }}>No API keys yet</div>
                                )}
                                {apiKeys.map(k => (
                                    <div key={k.id} style={s.keyRow}>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: '500' }}>{k.name}</div>
                                            <div style={{ fontSize: '12px', color: '#888', fontFamily: 'monospace' }}>{k.key_prefix}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '12px', color: '#aaa' }}>
                                                {/* Fixed: last_used_at not last_used */}
                                                {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'Never used'}
                                            </span>
                                            <button onClick={() => revokeKey(k.id)}
                                                style={{ padding: '4px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                                Revoke
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const s = {
    tabNav: { display: 'flex', flexDirection: 'column', gap: '4px', width: '180px', flexShrink: 0 },
    tabBtn: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', border: 'none', background: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#666', textAlign: 'left' },
    tabBtnActive: { background: '#f0fdf4', color: '#25D366', fontWeight: '600' },
    content: { flex: 1 },
    card: { background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    cardTitle: { margin: '0 0 20px', fontSize: '15px', fontWeight: '600', color: '#111' },
    infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' },
    infoItem: { display: 'flex', flexDirection: 'column', gap: '4px' },
    infoLabel: { fontSize: '12px', color: '#888' },
    infoValue: { fontSize: '14px', fontWeight: '500', color: '#111', textTransform: 'capitalize' },
    btn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    cancelBtn: { padding: '8px 16px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
    keyAlert: { background: '#fef9c3', border: '1px solid #fde047', borderRadius: '8px', padding: '14px', marginBottom: '16px' },
    keyCode: { display: 'block', background: '#fff', padding: '8px', borderRadius: '6px', fontSize: '12px', wordBreak: 'break-all', fontFamily: 'monospace' },
    keyRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #f0f0f0' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '440px' }
};

export default Settings;