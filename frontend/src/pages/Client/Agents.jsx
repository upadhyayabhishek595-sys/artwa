import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, UserCog } from 'lucide-react';

const statusColors = {
    online:  { bg: '#dcfce7', color: '#16a34a' },
    offline: { bg: '#f3f4f6', color: '#6b7280' },
    busy:    { bg: '#fef9c3', color: '#ca8a04' },
    inactive:{ bg: '#fee2e2', color: '#dc2626' }
};

const Agents = () => {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' });

    const load = async () => {
        try {
            const r = await api.get('/manage/agents');
            setAgents(r.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const create = async (e) => {
        e.preventDefault();
        try {
            await api.post('/manage/agents', form);
            toast.success('Agent created');
            setShowCreate(false);
            setForm({ name: '', email: '', password: '', role: 'agent' });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error');
        }
    };

    const deactivate = async (id) => {
        if (!confirm('Deactivate this agent?')) return;
        await api.delete(`/manage/agents/${id}`);
        toast.success('Agent deactivated');
        load();
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Agents</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>Manage your support team</p>
                </div>
                <button onClick={() => setShowCreate(true)} style={s.btn}>
                    <Plus size={16} /> Add Agent
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Loading...</div>
            ) : agents.length === 0 ? (
                <div style={s.empty}>
                    <UserCog size={40} color="#ddd" />
                    <div style={{ marginTop: '12px', color: '#888' }}>No agents yet</div>
                    <button onClick={() => setShowCreate(true)} style={{ ...s.btn, marginTop: '12px' }}>
                        Add your first agent
                    </button>
                </div>
            ) : (
                <div style={s.grid}>
                    {agents.map(a => (
                        <div key={a.id} style={s.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={s.avatar}>{a.name?.[0]?.toUpperCase()}</div>
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{a.name}</div>
                                        <div style={{ fontSize: '12px', color: '#888' }}>{a.email}</div>
                                    </div>
                                </div>
                                <button onClick={() => deactivate(a.id)} style={s.iconBtn}>
                                    <Trash2 size={14} color="#e53e3e" />
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                <span style={{ ...s.badge, background: '#ede9fe', color: '#7c3aed', textTransform: 'capitalize' }}>
                                    {a.role}
                                </span>
                                <span style={{
                                    ...s.badge,
                                    background: statusColors[a.status]?.bg,
                                    color: statusColors[a.status]?.color,
                                    textTransform: 'capitalize'
                                }}>
                                    {a.status}
                                </span>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '12px', color: '#aaa' }}>
                                Last login: {a.last_login ? new Date(a.last_login).toLocaleDateString() : 'Never'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showCreate && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Add Agent</h3>
                            <button onClick={() => setShowCreate(false)} style={s.iconBtn}>✕</button>
                        </div>
                        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={s.field}>
                                <label style={s.label}>Full Name</label>
                                <input placeholder="John Doe" value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    style={s.input} required />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Email</label>
                                <input type="email" placeholder="agent@company.com" value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    style={s.input} required />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Password</label>
                                <input type="password" placeholder="Min 8 characters" value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    style={s.input} required />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Role</label>
                                <select value={form.role}
                                    onChange={e => setForm({ ...form, role: e.target.value })}
                                    style={s.input}>
                                    <option value="agent">Agent</option>
                                    <option value="supervisor">Supervisor</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                <button type="button" onClick={() => setShowCreate(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn}>Add Agent</button>
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
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
    card: { background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' },
    avatar: { width: '40px', height: '40px', borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '16px' },
    badge: { padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' },
    iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px' },
    empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px', background: '#fff', borderRadius: '12px' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '400px' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }
};

export default Agents;