import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, Pencil, X } from 'lucide-react';

const emptyPlan = {
    name: '', price: '', message_limit: '', agent_limit: '',
    api_access: false, chatbot_access: false, broadcast_access: false,
};

const AdminPlans = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyPlan);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const r = await api.get('/manage/plans');
            setPlans(r.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const openCreate = () => {
        setForm(emptyPlan);
        setEditingId(null);
        setShowForm(true);
    };

    const openEdit = (plan) => {
        setForm({
            name: plan.name || '',
            price: plan.price ?? '',
            message_limit: plan.message_limit ?? '',
            agent_limit: plan.agent_limit ?? '',
            api_access: !!plan.api_access,
            chatbot_access: !!plan.chatbot_access,
            broadcast_access: !!plan.broadcast_access,
        });
        setEditingId(plan.id);
        setShowForm(true);
    };

    const save = async (e) => {
        e.preventDefault();
        if (!form.name || form.price === '') {
            return toast.error('Name and price are required');
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                price: Number(form.price),
                message_limit: form.message_limit === '' ? null : Number(form.message_limit),
                agent_limit: form.agent_limit === '' ? null : Number(form.agent_limit),
                api_access: form.api_access ? 1 : 0,
                chatbot_access: form.chatbot_access ? 1 : 0,
                broadcast_access: form.broadcast_access ? 1 : 0,
            };

            if (editingId) {
                await api.patch(`/manage/plans/${editingId}`, payload);
                toast.success('Plan updated');
            } else {
                await api.post('/manage/plans', payload);
                toast.success('Plan created');
            }
            setShowForm(false);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save plan');
        } finally {
            setSaving(false);
        }
    };

    const deletePlan = async (id) => {
        if (!confirm('Delete this plan? Clients on this plan will keep it until reassigned.')) return;
        try {
            await api.delete(`/manage/plans/${id}`);
            toast.success('Plan deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete plan');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Plans</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>Manage subscription plans offered to clients</p>
                </div>
                <button onClick={openCreate} style={s.btn}>
                    <Plus size={16} /> New Plan
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Loading...</div>
            ) : plans.length === 0 ? (
                <div style={s.empty}>
                    <div style={{ color: '#888' }}>No plans created yet</div>
                    <button onClick={openCreate} style={{ ...s.btn, marginTop: '12px' }}>Create your first plan</button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                    {plans.map(p => (
                        <div key={p.id} style={s.card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: '700', fontSize: '16px' }}>{p.name}</div>
                                    <div style={{ fontSize: '22px', fontWeight: '700', color: '#6366f1', marginTop: '4px' }}>
                                        ₹{p.price}<span style={{ fontSize: '12px', color: '#888', fontWeight: '400' }}>/mo</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => openEdit(p)} style={s.iconBtn}><Pencil size={14} color="#555" /></button>
                                    <button onClick={() => deletePlan(p.id)} style={s.iconBtn}><Trash2 size={14} color="#e53e3e" /></button>
                                </div>
                            </div>
                            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#666' }}>
                                <div>📨 {p.message_limit ? `${p.message_limit.toLocaleString()} messages/mo` : 'Unlimited messages'}</div>
                                <div>👤 {p.agent_limit ? `${p.agent_limit} agents` : 'Unlimited agents'}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                                {p.api_access ? <span style={s.tag}>API Access</span> : null}
                                {p.chatbot_access ? <span style={s.tag}>Chatbot</span> : null}
                                {p.broadcast_access ? <span style={s.tag}>Broadcast</span> : null}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showForm && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>{editingId ? 'Edit Plan' : 'New Plan'}</h3>
                            <button onClick={() => setShowForm(false)} style={s.iconBtn}><X size={16} /></button>
                        </div>
                        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={s.field}>
                                <label style={s.label}>Plan Name</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Pro" style={s.input} required />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div style={s.field}>
                                    <label style={s.label}>Price (₹/month)</label>
                                    <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                                        placeholder="999" style={s.input} required min="0" />
                                </div>
                                <div style={s.field}>
                                    <label style={s.label}>Message Limit</label>
                                    <input type="number" value={form.message_limit} onChange={e => setForm({ ...form, message_limit: e.target.value })}
                                        placeholder="Leave blank = unlimited" style={s.input} min="0" />
                                </div>
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Agent Limit</label>
                                <input type="number" value={form.agent_limit} onChange={e => setForm({ ...form, agent_limit: e.target.value })}
                                    placeholder="Leave blank = unlimited" style={s.input} min="0" />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                {[
                                    { key: 'api_access', label: 'API Access' },
                                    { key: 'chatbot_access', label: 'Chatbot Access' },
                                    { key: 'broadcast_access', label: 'Broadcast Access' },
                                ].map(f => (
                                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={form[f.key]}
                                            onChange={e => setForm({ ...form, [f.key]: e.target.checked })} />
                                        {f.label}
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button type="button" onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn} disabled={saving}>
                                    {saving ? 'Saving...' : editingId ? 'Update Plan' : 'Create Plan'}
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
    card: { background: '#fff', borderRadius: '12px', padding: '18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' },
    iconBtn: { background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px', cursor: 'pointer', display: 'flex' },
    tag: { fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: '#ede9fe', color: '#7c3aed', fontWeight: '500' },
    empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px', background: '#fff', borderRadius: '12px' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '420px', maxHeight: '85vh', overflowY: 'auto' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }
};

export default AdminPlans;