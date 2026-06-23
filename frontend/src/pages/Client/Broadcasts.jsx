import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Send } from 'lucide-react';

const statusColor = { draft: '#f59e0b', running: '#3b82f6', completed: '#25D366', failed: '#e53e3e', paused: '#888' };

const Broadcasts = () => {
    const [broadcasts, setBroadcasts] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [phones, setPhones] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', template_id: '', phone_number_id: '' });
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const [b, t, p] = await Promise.all([
                api.get('/broadcast'),
                api.get('/manage/templates'),
                api.get('/manage/phone-numbers')
            ]);
            setBroadcasts(b.data.data);
            setTemplates(t.data.data);
            setPhones(p.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const create = async (e) => {
        e.preventDefault();
        try {
            await api.post('/broadcast', form);
            toast.success('Broadcast started!');
            setShowCreate(false);
            setForm({ name: '', template_id: '', phone_number_id: '' });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Broadcasts</h2>
                <button onClick={() => setShowCreate(true)} style={s.btn}>
                    <Plus size={16} /> New Broadcast
                </button>
            </div>

            <div style={s.table}>
                <div style={s.thead}>
                    <span style={{ flex: 2 }}>Name</span>
                    <span style={{ flex: 2 }}>Template</span>
                    <span style={{ flex: 1 }}>Total</span>
                    <span style={{ flex: 1 }}>Sent</span>
                    <span style={{ flex: 1 }}>Delivered</span>
                    <span style={{ flex: 1 }}>Read</span>
                    <span style={{ flex: 1 }}>Status</span>
                </div>
                {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading...</div> :
                    broadcasts.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No broadcasts yet</div>
                    ) :
                    broadcasts.map(b => (
                        <div key={b.id} style={s.row}>
                            <span style={{ flex: 2, fontWeight: '500' }}>{b.name}</span>
                            <span style={{ flex: 2, color: '#666' }}>{b.template_name}</span>
                            <span style={{ flex: 1 }}>{b.total_contacts}</span>
                            <span style={{ flex: 1 }}>{b.sent_count}</span>
                            <span style={{ flex: 1 }}>{b.delivered_count}</span>
                            <span style={{ flex: 1 }}>{b.read_count}</span>
                            <span style={{ flex: 1 }}>
                                <span style={{ ...s.badge, background: statusColor[b.status] + '22', color: statusColor[b.status] }}>
                                    {b.status}
                                </span>
                            </span>
                        </div>
                    ))
                }
            </div>

            {showCreate && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <h3 style={{ margin: '0 0 20px', fontSize: '16px' }}>New Broadcast</h3>
                        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input placeholder="Campaign name" value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                style={s.input} required />

                            <select value={form.template_id}
                                onChange={e => setForm({ ...form, template_id: e.target.value })}
                                style={s.input} required>
                                <option value="">Select Template</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>

                            {/* Phone number dropdown — loaded from /manage/phone-numbers */}
                            <select value={form.phone_number_id}
                                onChange={e => setForm({ ...form, phone_number_id: e.target.value })}
                                style={s.input} required>
                                <option value="">Select Phone Number</option>
                                {phones.length === 0 && (
                                    <option disabled>No phone numbers added yet</option>
                                )}
                                {phones.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.display_name || p.phone_number}
                                    </option>
                                ))}
                            </select>

                            {phones.length === 0 && (
                                <div style={{ fontSize: '12px', color: '#f59e0b', background: '#fef9c3', padding: '8px 10px', borderRadius: '6px' }}>
                                    ⚠️ No phone numbers found. Add one in Settings → Phone Numbers first.
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setShowCreate(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn} disabled={phones.length === 0}>
                                    <Send size={14} /> Send to All Contacts
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const s = {
    btn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    cancelBtn: { padding: '8px 16px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
    table: { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    thead: { display: 'flex', padding: '12px 16px', background: '#f9fafb', fontSize: '12px', fontWeight: '600', color: '#888', borderBottom: '1px solid #f0f0f0' },
    row: { display: 'flex', padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #f9fafb', alignItems: 'center' },
    badge: { padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '400px' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }
};

export default Broadcasts;