import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

const Login = () => {
    const [form, setForm] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await login(form.email, form.password, 'client');
            toast.success('Welcome back!');
            navigate('/dashboard');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={s.page}>
            <div style={s.card}>
                <div style={s.logo}>
                    <MessageSquare size={28} color="#25D366" />
                    <h1 style={s.title}>Artwa</h1>
                </div>
                <p style={s.sub}>WhatsApp Business Platform</p>

                <form onSubmit={handleSubmit} style={s.form}>
                    <div style={s.field}>
                        <label style={s.label}>Email</label>
                        <input type="email" placeholder="you@example.com"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            style={s.input} required />
                    </div>
                    <div style={s.field}>
                        <label style={s.label}>Password</label>
                        <input type="password" placeholder="••••••••"
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            style={s.input} required />
                    </div>
                    <button type="submit" style={s.btn} disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

             
            </div>
        </div>
    );
};

const s = {
    page: { minHeight: '100vh', background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    card: { background: '#fff', borderRadius: '16px', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    logo: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' },
    title: { fontSize: '22px', fontWeight: '700', color: '#111', margin: 0 },
    sub: { color: '#888', fontSize: '13px', marginBottom: '28px', marginTop: '4px' },
    form: { display: 'flex', flexDirection: 'column', gap: '16px' },
    field: { display: 'flex', flexDirection: 'column', gap: '6px' },
    label: { fontSize: '13px', fontWeight: '500', color: '#444' },
    input: { padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', outline: 'none', color: '#111' },
    btn: { padding: '12px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginTop: '4px' },
    footer: { textAlign: 'center', fontSize: '13px', color: '#888', marginTop: '20px', marginBottom: 0 },
    link: { color: '#25D366', textDecoration: 'none', fontWeight: '500' }
};

export default Login;