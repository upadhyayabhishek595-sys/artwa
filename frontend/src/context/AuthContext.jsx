import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext();

// Token key helper — role ke hisaab se alag key
const tokenKey      = (type) => type === 'admin' ? 'admin_token'         : 'token';
const refreshKey    = (type) => type === 'admin' ? 'admin_refresh_token'  : 'refresh_token';
const userKey       = (type) => type === 'admin' ? 'admin_user'           : 'user';

export const AuthProvider = ({ children }) => {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Current page URL se decide karo kaun sa session load karna hai
        const isAdminPage = window.location.pathname.startsWith('/admin');
        const tKey = isAdminPage ? 'admin_token' : 'token';
        const uKey = isAdminPage ? 'admin_user'  : 'user';

        const token     = localStorage.getItem(tKey);
        const savedUser = localStorage.getItem(uKey);

        if (token && savedUser) {
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    const login = async (email, password, type = 'client') => {
        const res = await api.post(`/auth/${type}/login`, { email, password });

        const accessToken = res.data.token || res.data.access_token;

        // Role ke hisaab se alag keys mein save karo
        localStorage.setItem(tokenKey(type), accessToken);
        if (res.data.refresh_token) {
            localStorage.setItem(refreshKey(type), res.data.refresh_token);
        }
        localStorage.setItem(userKey(type), JSON.stringify({ ...res.data.user, type }));
        setUser({ ...res.data.user, type });
        return res.data;
    };

    const logout = async () => {
        const savedUser = user;
        const type      = savedUser?.type || 'client';
        const rToken    = localStorage.getItem(refreshKey(type));

        try {
            if (rToken) {
                await api.post('/auth/logout', { refresh_token: rToken });
            }
        } catch (err) {
            console.error('Logout API call failed:', err.message);
        }

        // Sirf current role ka data clear karo
        localStorage.removeItem(tokenKey(type));
        localStorage.removeItem(refreshKey(type));
        localStorage.removeItem(userKey(type));
        setUser(null);

        // Role ke hisaab se redirect
        window.location.href = type === 'admin' ? '/admin/login' : '/login';
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);