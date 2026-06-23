import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, MessageSquare, Users,
    Megaphone, FileText, UserCog, Settings, LogOut, Workflow, Image
} from 'lucide-react';

const ClientLayout = () => {
    const { user, logout } = useAuth();

    const links = [
        { to: '/dashboard',  icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
        { to: '/inbox',      icon: <MessageSquare size={18} />,   label: 'Inbox' },
        { to: '/contacts',   icon: <Users size={18} />,           label: 'Contacts' },
        { to: '/broadcasts', icon: <Megaphone size={18} />,       label: 'Broadcasts' },
        { to: '/templates',  icon: <FileText size={18} />,        label: 'Templates' },
        { to: '/flows',      icon: <Workflow size={18} />,        label: 'Flows' },
        { to: '/media',      icon: <Image size={18} />,           label: 'Media' },
        { to: '/agents',     icon: <UserCog size={18} />,         label: 'Agents' },
        { to: '/settings',   icon: <Settings size={18} />,        label: 'Settings' },
    ];

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f8fa' }}>
            {/* Sidebar */}
            <aside style={s.sidebar}>
                <div style={s.logo}>
                    <MessageSquare size={22} color="#25D366" />
                    <span style={s.logoText}>Artwa</span>
                </div>

                <div style={s.userBox}>
                    <div style={s.avatar}>{user?.name?.[0]?.toUpperCase()}</div>
                    <div>
                        <div style={s.userName}>{user?.name}</div>
                        <div style={s.userSub}>{user?.business_name}</div>
                    </div>
                </div>

                <nav style={{ flex: 1, padding: '8px 0' }}>
                    {links.map(link => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            style={({ isActive }) => ({
                                ...s.link,
                                ...(isActive ? s.linkActive : {})
                            })}
                        >
                            {link.icon}
                            <span>{link.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <button onClick={logout} style={s.logout}>
                    <LogOut size={16} />
                    <span>Logout</span>
                </button>
            </aside>

            {/* Main content */}
            <main style={{ marginLeft: '240px', flex: 1, padding: '24px' }}>
                <Outlet />
            </main>
        </div>
    );
};

const s = {
    sidebar: {
        width: '240px', minHeight: '100vh', background: '#fff',
        borderRight: '1px solid #f0f0f0', display: 'flex',
        flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0
    },
    logo: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '20px', borderBottom: '1px solid #f0f0f0'
    },
    logoText: { fontSize: '18px', fontWeight: '700', color: '#111' },
    userBox: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 20px', borderBottom: '1px solid #f0f0f0'
    },
    avatar: {
        width: '34px', height: '34px', borderRadius: '50%',
        background: '#25D366', color: '#fff', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontWeight: '600', fontSize: '14px', flexShrink: 0
    },
    userName: { fontSize: '13px', fontWeight: '600', color: '#111' },
    userSub: { fontSize: '11px', color: '#999' },
    link: {
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 20px', color: '#666', textDecoration: 'none',
        fontSize: '13px', transition: 'all 0.15s'
    },
    linkActive: {
        color: '#25D366', background: '#f0fdf4',
        borderRight: '3px solid #25D366', fontWeight: '500'
    },
    logout: {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '14px 20px', background: 'none', border: 'none',
        color: '#e53e3e', cursor: 'pointer', fontSize: '13px',
        borderTop: '1px solid #f0f0f0', width: '100%'
    }
};

export default ClientLayout;