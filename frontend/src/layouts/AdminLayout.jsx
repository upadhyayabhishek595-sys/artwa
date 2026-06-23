import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, Users, CreditCard,
    UserCheck, Package, Settings, MessageSquare, LogOut
} from 'lucide-react';

const AdminLayout = () => {
    const { user, logout } = useAuth();

    const links = [
        { to: '/admin/dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
        { to: '/admin/clients',   icon: <Users size={18} />,           label: 'Clients' },
        { to: '/admin/credits',   icon: <CreditCard size={18} />,      label: 'Credits' },
        { to: '/admin/resellers', icon: <UserCheck size={18} />,       label: 'Resellers' },
        { to: '/admin/plans',     icon: <Package size={18} />,         label: 'Plans' },
        { to: '/admin/settings',  icon: <Settings size={18} />,        label: 'Settings' },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f8fa' }}>
            <aside style={s.sidebar}>
                <div style={s.logo}>
                    <MessageSquare size={22} color="#6366f1" />
                    <span style={{ ...s.logoText, color: '#6366f1' }}>Artwa Admin</span>
                </div>
                <div style={s.userBox}>
                    <div style={{ ...s.avatar, background: '#6366f1' }}>
                        {user?.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                        <div style={s.userName}>{user?.name}</div>
                        <div style={s.userSub}>{user?.role}</div>
                    </div>
                </div>
                <nav style={{ flex: 1, padding: '8px 0' }}>
                    {links.map(link => (
                        <NavLink key={link.to} to={link.to}
                            style={({ isActive }) => ({
                                ...s.link,
                                ...(isActive ? { color: '#6366f1', background: '#eef2ff', borderRight: '3px solid #6366f1', fontWeight: '500' } : {})
                            })}>
                            {link.icon}
                            <span>{link.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <button onClick={logout} style={s.logout}>
                    <LogOut size={16} /><span>Logout</span>
                </button>
            </aside>
            <main style={{ marginLeft: '240px', flex: 1, padding: '24px' }}>
                <Outlet />
            </main>
        </div>
    );
};

const s = {
    sidebar: { width: '240px', minHeight: '100vh', background: '#fff', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0 },
    logo: { display: 'flex', alignItems: 'center', gap: '8px', padding: '20px', borderBottom: '1px solid #f0f0f0' },
    logoText: { fontSize: '18px', fontWeight: '700' },
    userBox: { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px', borderBottom: '1px solid #f0f0f0' },
    avatar: { width: '34px', height: '34px', borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '14px', flexShrink: 0 },
    userName: { fontSize: '13px', fontWeight: '600', color: '#111' },
    userSub: { fontSize: '11px', color: '#999', textTransform: 'capitalize' },
    link: { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 20px', color: '#666', textDecoration: 'none', fontSize: '13px', transition: 'all 0.15s' },
    logout: { display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '13px', borderTop: '1px solid #f0f0f0', width: '100%' }
};

export default AdminLayout;