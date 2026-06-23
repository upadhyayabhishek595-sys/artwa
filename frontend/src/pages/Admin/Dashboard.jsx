import { useEffect, useState } from 'react';
import api from '../../api/axios';

const AdminDashboard = () => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        api.get('/stats/admin').then(r => setStats(r.data.data));
    }, []);

    return (
        <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: '600' }}>Admin Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                    { title: 'Total Clients',   value: stats?.clients?.total,    color: '#6366f1' },
                    { title: 'Active Clients',  value: stats?.clients?.active,   color: '#25D366' },
                    { title: 'Trial Clients',   value: stats?.clients?.trial,    color: '#f59e0b' },
                    { title: 'Total Messages',  value: stats?.messages?.total,   color: '#3b82f6' },
                ].map(card => (
                    <div key={card.title} style={{ background: '#fff', borderRadius: '12px', padding: '20px', borderLeft: `4px solid ${card.color}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px' }}>{card.title}</div>
                        <div style={{ fontSize: '28px', fontWeight: '700', color: '#111' }}>{card.value ?? '—'}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminDashboard;