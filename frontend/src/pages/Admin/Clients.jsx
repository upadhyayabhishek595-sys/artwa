import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const AdminClients = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const r = await api.get('/manage/clients');
            setClients(r.data.data);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const updateStatus = async (id, status) => {
        await api.patch(`/manage/clients/${id}/status`, { status });
        toast.success(`Client ${status}`);
        load();
    };

    const statusColor = { active: '#25D366', trial: '#f59e0b', suspended: '#e53e3e', inactive: '#888' };

    return (
        <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: '600' }}>Clients</h2>
            <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', padding: '12px 16px', background: '#f9fafb', fontSize: '12px', fontWeight: '600', color: '#888' }}>
                    <span style={{ flex: 2 }}>Name</span>
                    <span style={{ flex: 2 }}>Email</span>
                    <span style={{ flex: 2 }}>Business</span>
                    <span style={{ flex: 1 }}>Plan</span>
                    <span style={{ flex: 1 }}>Status</span>
                    <span style={{ flex: 1 }}>Actions</span>
                </div>
                {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading...</div> :
                    clients.map(c => (
                        <div key={c.id} style={{ display: 'flex', padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #f9fafb', alignItems: 'center' }}>
                            <span style={{ flex: 2, fontWeight: '500' }}>{c.name}</span>
                            <span style={{ flex: 2, color: '#666' }}>{c.email}</span>
                            <span style={{ flex: 2, color: '#666' }}>{c.business_name}</span>
                            <span style={{ flex: 1 }}>{c.plan_name || '—'}</span>
                            <span style={{ flex: 1 }}>
                                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', background: (statusColor[c.status] || '#888') + '22', color: statusColor[c.status] || '#888' }}>
                                    {c.status}
                                </span>
                            </span>
                            <span style={{ flex: 1, display: 'flex', gap: '4px' }}>
                                {c.status !== 'active' && (
                                    <button onClick={() => updateStatus(c.id, 'active')}
                                        style={{ padding: '3px 8px', background: '#dcfce7', color: '#16a34a', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                        Activate
                                    </button>
                                )}
                                {c.status !== 'suspended' && (
                                    <button onClick={() => updateStatus(c.id, 'suspended')}
                                        style={{ padding: '3px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                        Suspend
                                    </button>
                                )}
                            </span>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};

export default AdminClients;