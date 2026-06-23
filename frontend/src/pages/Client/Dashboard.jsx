import { useEffect, useState } from 'react';
import api from '../../api/axios';

const StatCard = ({ title, value, color }) => (
    <div style={{
        background: '#fff', borderRadius: '12px', padding: '20px',
        borderLeft: `4px solid ${color}`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
    }}>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px' }}>{title}</div>
        <div style={{ fontSize: '28px', fontWeight: '700', color: '#111' }}>{value ?? '—'}</div>
    </div>
);

const Dashboard = () => {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        api.get('/stats/overview').then(r => setStats(r.data.data));
    }, []);

    return (
        <div>
            <h2 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: '600' }}>Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <StatCard title="Total Messages"    value={stats?.messages?.total}          color="#25D366" />
                <StatCard title="Open Conversations" value={stats?.conversations?.open}      color="#3b82f6" />
                <StatCard title="Total Contacts"    value={stats?.contacts?.total}           color="#f59e0b" />
                <StatCard title="Agents Online"     value={stats?.agents?.online}            color="#8b5cf6" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600' }}>Messages</h3>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        <div><div style={{ fontSize: '12px', color: '#888' }}>Inbound</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#25D366' }}>{stats?.messages?.inbound ?? '—'}</div></div>
                        <div><div style={{ fontSize: '12px', color: '#888' }}>Outbound</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>{stats?.messages?.outbound ?? '—'}</div></div>
                    </div>
                </div>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: '600' }}>Conversations</h3>
                    <div style={{ display: 'flex', gap: '24px' }}>
                        <div><div style={{ fontSize: '12px', color: '#888' }}>Resolved</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#25D366' }}>{stats?.conversations?.resolved ?? '—'}</div></div>
                        <div><div style={{ fontSize: '12px', color: '#888' }}>Pending</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#f59e0b' }}>{stats?.conversations?.pending ?? '—'}</div></div>
                        <div><div style={{ fontSize: '12px', color: '#888' }}>Unread</div><div style={{ fontSize: '22px', fontWeight: '700', color: '#e53e3e' }}>{stats?.conversations?.unread ?? '—'}</div></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;