import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, X, Users } from 'lucide-react';

const AdminResellers = () => {
    const [resellers, setResellers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', markup_percent: 20 });

    const load = async () => {
        try {
            const r = await api.get('/manage/resellers');
            setResellers(r.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const create = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post('/manage/resellers', {
                ...form,
                markup_percent: Number(form.markup_percent) || 20,
            });
            toast.success('Reseller created');
            setShowForm(false);
            setForm({ name: '', email: '', password: '', markup_percent: 20 });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create reseller');
        } finally {
            setSaving(false);
        }
    };

    const statusColor = { active: '#25D366', suspended: '#e53e3e', inactive: '#888' };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Resellers</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>Partners who onboard and bill their own sub-clients</p>
                </div>
                <button onClick={() => setShowForm(true)} style={s.btn}>
                    <Plus size={16} /> New Reseller
                </button>
            </div>

            <div style={s.table}>
                <div style={s.thead}>
                    <span style={{ flex: 2 }}>Name</span>
                    <span style={{ flex: 2 }}>Email</span>
                    <span style={{ flex: 1 }}>Markup %</span>
                    <span style={{ flex: 1 }}>Credit Balance</span>
                    <span style={{ flex: 1 }}>Clients</span>
                    <span style={{ flex: 1 }}>Status</span>
                </div>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading...</div>
                ) : resellers.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                        No resellers yet
                    </div>
                ) : (
                    resellers.map(r => (
                        <div key={r.id} style={s.row}>
                            <span style={{ flex: 2, fontWeight: '500' }}>{r.name}</span>
                            <span style={{ flex: 2, color: '#666' }}>{r.email}</span>
                            <span style={{ flex: 1 }}>{r.markup_percent}%</span>
                            <span style={{ flex: 1 }}>₹{r.credit_balance ?? 0}</span>
                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Users size={13} color="#888" /> {r.client_count ?? 0}
                            </span>
                            <span style={{ flex: 1 }}>
                                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', background: (statusColor[r.status] || '#888') + '22', color: statusColor[r.status] || '#888' }}>
                                    {r.status}
                                </span>
                            </span>
                        </div>
                    ))
                )}
            </div>

            {showForm && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>New Reseller</h3>
                            <button onClick={() => setShowForm(false)} style={s.iconBtn}><X size={16} /></button>
                        </div>
                        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={s.field}>
                                <label style={s.label}>Name</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Reseller business name" style={s.input} required />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Email</label>
                                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                                    placeholder="reseller@example.com" style={s.input} required />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Password</label>
                                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                                    placeholder="Min 8 characters" style={s.input} required minLength={8} />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Markup % <span style={{ color: '#aaa' }}>(margin on credits resold to clients)</span></label>
                                <input type="number" value={form.markup_percent} onChange={e => setForm({ ...form, markup_percent: e.target.value })}
                                    style={s.input} min="0" max="100" />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button type="button" onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn} disabled={saving}>
                                    {saving ? 'Creating...' : 'Create Reseller'}
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
    btn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    cancelBtn: { padding: '8px 16px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
    iconBtn: { background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px', cursor: 'pointer', display: 'flex' },
    table: { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    thead: { display: 'flex', padding: '12px 16px', background: '#f9fafb', fontSize: '12px', fontWeight: '600', color: '#888', borderBottom: '1px solid #f0f0f0' },
    row: { display: 'flex', padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #f9fafb', alignItems: 'center' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '400px' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }
};

export default AdminResellers;