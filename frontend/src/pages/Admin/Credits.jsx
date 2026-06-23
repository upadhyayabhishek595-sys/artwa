import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Wallet, Plus, X, History } from 'lucide-react';

const AdminCredits = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    const [showTopup, setShowTopup] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [topupForm, setTopupForm] = useState({ amount: '', description: '' });
    const [saving, setSaving] = useState(false);

    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);

    const load = async () => {
        try {
            const r = await api.get('/manage/clients?limit=100');
            setClients(r.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const openTopup = (client) => {
        setSelectedClient(client);
        setTopupForm({ amount: '', description: '' });
        setShowTopup(true);
    };

    const submitTopup = async (e) => {
        e.preventDefault();
        if (!topupForm.amount || Number(topupForm.amount) <= 0) {
            return toast.error('Enter a valid amount');
        }
        setSaving(true);
        try {
            await api.post(`/manage/clients/${selectedClient.id}/credits/topup`, {
                amount: Number(topupForm.amount),
                description: topupForm.description || undefined,
            });
            toast.success(`₹${topupForm.amount} added to ${selectedClient.name}`);
            setShowTopup(false);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add credits');
        } finally {
            setSaving(false);
        }
    };

    const openHistory = async (client) => {
        setSelectedClient(client);
        setShowHistory(true);
        setHistoryLoading(true);
        try {
            const r = await api.get(`/manage/clients/${client.id}/credits`);
            setHistoryData(r.data.data);
        } catch {
            toast.error('Failed to load credit history');
        } finally {
            setHistoryLoading(false);
        }
    };

    return (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Credits</h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>Top up client credit balances and review transaction history</p>
            </div>

            <div style={s.table}>
                <div style={s.thead}>
                    <span style={{ flex: 2 }}>Client</span>
                    <span style={{ flex: 2 }}>Email</span>
                    <span style={{ flex: 1 }}>Balance</span>
                    <span style={{ flex: 2 }}>Actions</span>
                </div>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading...</div>
                ) : clients.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No clients yet</div>
                ) : (
                    clients.map(c => (
                        <div key={c.id} style={s.row}>
                            <span style={{ flex: 2, fontWeight: '500' }}>{c.name}</span>
                            <span style={{ flex: 2, color: '#666' }}>{c.email}</span>
                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', color: '#16a34a' }}>
                                <Wallet size={13} /> ₹{c.credit_balance ?? 0}
                            </span>
                            <span style={{ flex: 2, display: 'flex', gap: '6px' }}>
                                <button onClick={() => openTopup(c)} style={s.smallBtn}>
                                    <Plus size={12} /> Add Credits
                                </button>
                                <button onClick={() => openHistory(c)} style={s.smallBtnGhost}>
                                    <History size={12} /> History
                                </button>
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* Top-up Modal */}
            {showTopup && selectedClient && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Add Credits — {selectedClient.name}</h3>
                            <button onClick={() => setShowTopup(false)} style={s.iconBtn}><X size={16} /></button>
                        </div>
                        <form onSubmit={submitTopup} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={s.field}>
                                <label style={s.label}>Amount (₹)</label>
                                <input type="number" value={topupForm.amount}
                                    onChange={e => setTopupForm({ ...topupForm, amount: e.target.value })}
                                    placeholder="1000" style={s.input} required min="1" />
                            </div>
                            <div style={s.field}>
                                <label style={s.label}>Note <span style={{ color: '#aaa' }}>(optional)</span></label>
                                <input value={topupForm.description}
                                    onChange={e => setTopupForm({ ...topupForm, description: e.target.value })}
                                    placeholder="e.g. Manual top-up via bank transfer" style={s.input} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button type="button" onClick={() => setShowTopup(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn} disabled={saving}>
                                    {saving ? 'Adding...' : 'Add Credits'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {showHistory && selectedClient && (
                <div style={s.modal}>
                    <div style={{ ...s.modalBox, width: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Credit History — {selectedClient.name}</h3>
                            <button onClick={() => setShowHistory(false)} style={s.iconBtn}><X size={16} /></button>
                        </div>
                        {historyLoading ? (
                            <div style={{ textAlign: 'center', padding: '30px', color: '#888' }}>Loading...</div>
                        ) : (
                            <>
                                <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
                                    Current balance: <strong style={{ color: '#16a34a' }}>₹{historyData?.balance ?? 0}</strong>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '320px', overflowY: 'auto' }}>
                                    {(!historyData?.transactions || historyData.transactions.length === 0) ? (
                                        <div style={{ color: '#aaa', fontSize: '13px', padding: '12px 0' }}>No transactions yet</div>
                                    ) : (
                                        historyData.transactions.map((t, i) => (
                                            <div key={i} style={s.txnRow}>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: '500', textTransform: 'capitalize' }}>{t.type}</div>
                                                    <div style={{ fontSize: '11px', color: '#888' }}>{t.description || '—'}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{ fontSize: '13px', fontWeight: '600', color: t.type === 'topup' ? '#16a34a' : '#dc2626' }}>
                                                        {t.type === 'topup' ? '+' : '-'}₹{t.amount}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#aaa' }}>
                                                        {new Date(t.created_at).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const s = {
    btn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    cancelBtn: { padding: '8px 16px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
    smallBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' },
    smallBtnGhost: { display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: '#f9fafb', color: '#555', border: '1px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '500' },
    iconBtn: { background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px', cursor: 'pointer', display: 'flex' },
    table: { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    thead: { display: 'flex', padding: '12px 16px', background: '#f9fafb', fontSize: '12px', fontWeight: '600', color: '#888', borderBottom: '1px solid #f0f0f0' },
    row: { display: 'flex', padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #f9fafb', alignItems: 'center' },
    txnRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '380px' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box' }
};

export default AdminCredits;