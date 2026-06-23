import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { MessageSquare, CheckCircle } from 'lucide-react';
import api from '../api/axios';
import toast from 'react-hot-toast';

const AcceptInvite = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [form, setForm] = useState({ name: '', password: '', confirm: '' });
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (!token) {
            toast.error('Invite link is invalid or missing a token');
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (form.password !== form.confirm) {
            return toast.error('Passwords do not match');
        }
        if (form.password.length < 8) {
            return toast.error('Password must be at least 8 characters');
        }

        setLoading(true);
        try {
            await api.post('/auth/client/accept-invite', {
                token,
                password: form.password,
                name: form.name || undefined,
            });
            setDone(true);
            toast.success('Account activated!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to activate account');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <div style={s.logo}>
                        <MessageSquare size={28} color="#25D366" />
                        <h1 style={s.title}>Artwa</h1>
                    </div>
                    <p style={{ ...s.sub, color: '#dc2626' }}>
                        This invite link is invalid or has expired. Please ask your administrator
                        to resend the invite.
                    </p>
                    <p style={s.footer}>
                        <Link to="/login" style={s.link}>Back to login</Link>
                    </p>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <CheckCircle size={48} color="#25D366" />
                        <h1 style={s.title}>You're all set!</h1>
                        <p style={s.sub}>Your account has been activated. You can now log in.</p>
                        <button onClick={() => navigate('/login')} style={{ ...s.btn, width: '100%' }}>
                            Go to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={s.page}>
            <div style={s.card}>
                <div style={s.logo}>
                    <MessageSquare size={28} color="#25D366" />
                    <h1 style={s.title}>Artwa</h1>
                </div>
                <p style={s.sub}>Activate your account — set a password to get started</p>

                <form onSubmit={handleSubmit} style={s.form}>
                    <div style={s.field}>
                        <label style={s.label}>Your Name <span style={{ color: '#aaa' }}>(optional)</span></label>
                        <input type="text" placeholder="John Doe"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            style={s.input} />
                    </div>
                    <div style={s.field}>
                        <label style={s.label}>Set Password</label>
                        <input type="password" placeholder="Min 8 characters"
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            style={s.input} required minLength={8} />
                    </div>
                    <div style={s.field}>
                        <label style={s.label}>Confirm Password</label>
                        <input type="password" placeholder="Re-enter password"
                            value={form.confirm}
                            onChange={e => setForm({ ...form, confirm: e.target.value })}
                            style={s.input} required minLength={8} />
                    </div>
                    <button type="submit" style={s.btn} disabled={loading}>
                        {loading ? 'Activating...' : 'Activate Account'}
                    </button>
                </form>

                <p style={s.footer}>
                    Already activated? <Link to="/login" style={s.link}>Login</Link>
                </p>
            </div>
        </div>
    );
};

const s = {
    page: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' },
    card: { background: '#fff', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' },
    title: { fontSize: '22px', fontWeight: '700', color: '#111', margin: 0 },
    sub: { color: '#888', fontSize: '13px', marginBottom: '28px', marginTop: '4px', textAlign: 'center' },
    form: { display: 'flex', flexDirection: 'column', gap: '16px' },
    field: { display: 'flex', flexDirection: 'column', gap: '6px' },
    label: { fontSize: '13px', fontWeight: '500', color: '#444' },
    input: { padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111' },
    btn: { padding: '12px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' },
    footer: { textAlign: 'center', fontSize: '13px', color: '#888', marginTop: '20px', marginBottom: 0 },
    link: { color: '#25D366', textDecoration: 'none', fontWeight: '500' }
};

export default AcceptInvite;