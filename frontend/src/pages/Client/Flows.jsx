import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, Workflow, X, Power } from 'lucide-react';

const emptyForm = {
    name: '',
    description: '',
    keywords: '',
    match_type: 'contains',
    reply_message: '',
    priority: 0,
};

const AdminFlows = () => {
    const [flows, setFlows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const load = async () => {
        try {
            const r = await api.get('/flows');
            setFlows(r.data.data || []);
        } catch (err) {
            console.error(err);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const parseFlow = (flow) => {
        const trigger = typeof flow.trigger === 'string' ? JSON.parse(flow.trigger) : flow.trigger;
        const steps = typeof flow.steps === 'string' ? JSON.parse(flow.steps) : flow.steps;
        const keywords = trigger?.keywords || [];
        const reply = steps?.find(s => s.action === 'send_text')?.text || '';
        return { keywords, reply, match_type: trigger?.match_type || 'contains' };
    };

    const create = async (e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.keywords.trim()) {
            return toast.error('Name and trigger keywords are required');
        }
        setSaving(true);
        try {
            const keywords = form.keywords.split(',').map(k => k.trim()).filter(Boolean);
            await api.post('/flows', {
                name: form.name.trim(),
                description: form.description || undefined,
                trigger: {
                    type: 'keyword',
                    keywords,
                    match_type: form.match_type,
                },
                steps: [{
                    action: 'send_text',
                    text: form.reply_message || 'Thanks for your message! We will get back to you shortly.',
                }],
                priority: Number(form.priority) || 0,
                active: true,
            });
            toast.success('Flow created');
            setShowForm(false);
            setForm(emptyForm);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create flow');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (flow) => {
        const newActive = !flow.active;
        try {
            await api.patch(`/flows/${flow.id}`, { active: newActive });
            toast.success(newActive ? 'Flow activated' : 'Flow deactivated');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update flow');
        }
    };

    const deleteFlow = async (id) => {
        if (!confirm('Delete this flow?')) return;
        try {
            await api.delete(`/flows/${id}`);
            toast.success('Flow deleted');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete flow');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Flows</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>
                        Keyword-triggered auto-replies when customers message you
                    </p>
                </div>
                <button onClick={() => setShowForm(true)} style={s.btn}>
                    <Plus size={16} /> New Flow
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Loading...</div>
            ) : flows.length === 0 ? (
                <div style={s.empty}>
                    <Workflow size={40} color="#ddd" />
                    <div style={{ marginTop: '12px', color: '#888' }}>No flows yet</div>
                    <button onClick={() => setShowForm(true)} style={{ ...s.btn, marginTop: '12px' }}>
                        Create your first flow
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {flows.map(f => {
                        const { keywords, reply, match_type } = parseFlow(f);
                        return (
                            <div key={f.id} style={s.card}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{f.name}</div>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500',
                                            background: f.active ? '#dcfce7' : '#f3f4f6',
                                            color: f.active ? '#16a34a' : '#6b7280',
                                        }}>
                                            {f.active ? 'active' : 'inactive'}
                                        </span>
                                        <span style={{ fontSize: '11px', color: '#aaa' }}>priority {f.priority}</span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                        Trigger ({match_type}):{' '}
                                        {keywords.map(k => (
                                            <code key={k} style={{ background: '#f9fafb', padding: '2px 6px', borderRadius: '4px', marginRight: '4px' }}>
                                                {k}
                                            </code>
                                        ))}
                                    </div>
                                    {reply && (
                                        <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
                                            ↳ {reply}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => toggleActive(f)} style={s.iconBtn} title={f.active ? 'Deactivate' : 'Activate'}>
                                        <Power size={14} color={f.active ? '#16a34a' : '#888'} />
                                    </button>
                                    <button onClick={() => deleteFlow(f.id)} style={s.iconBtn}>
                                        <Trash2 size={14} color="#e53e3e" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showForm && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>New Flow</h3>
                            <button onClick={() => setShowForm(false)} style={s.iconBtn}><X size={16} /></button>
                        </div>
                        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={s.field}>
                                <label style={s.label}>Flow Name</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="e.g. Greeting Reply" style={s.input} required />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Trigger Keywords</label>
                                <input value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })}
                                    placeholder="hi, hello, hey" style={s.input} required />
                                <span style={{ fontSize: '11px', color: '#aaa' }}>Comma-separated keywords</span>
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Match Type</label>
                                <select value={form.match_type} onChange={e => setForm({ ...form, match_type: e.target.value })}
                                    style={s.input}>
                                    <option value="contains">Contains keyword</option>
                                    <option value="exact">Exact match only</option>
                                </select>
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Auto-Reply Message</label>
                                <textarea value={form.reply_message} onChange={e => setForm({ ...form, reply_message: e.target.value })}
                                    placeholder="Hi! Thanks for reaching out. How can we help you today?"
                                    style={{ ...s.input, minHeight: '80px', resize: 'vertical' }} />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Priority (lower = runs first)</label>
                                <input type="number" min="0" value={form.priority}
                                    onChange={e => setForm({ ...form, priority: e.target.value })}
                                    style={s.input} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button type="button" onClick={() => setShowForm(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn} disabled={saving}>
                                    {saving ? 'Creating...' : 'Create Flow'}
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
    card: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#fff', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' },
    iconBtn: { background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex' },
    empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px', background: '#fff', borderRadius: '12px' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '440px', maxHeight: '90vh', overflowY: 'auto' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
};

export default AdminFlows;
