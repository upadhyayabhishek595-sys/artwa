import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

// ── Request interceptor ───────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    const token = isAdminPath
        ? localStorage.getItem('admin_token')
        : localStorage.getItem('token');

    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// ── Response interceptor (refresh token) ─────────────────────────────────────
let isRefreshing = false;
let refreshQueue = [];

api.interceptors.response.use(
    (res) => res,
    async (err) => {
        const originalReq  = err.config;

        if (err.response?.status === 401 && !originalReq._retry) {
            const isAdminPath = window.location.pathname.startsWith('/admin');

            // ✅ Role ke hisaab se sahi keys use karo
            const tKey        = isAdminPath ? 'admin_token'         : 'token';
            const rKey        = isAdminPath ? 'admin_refresh_token'  : 'refresh_token';
            const uKey        = isAdminPath ? 'admin_user'           : 'user';

            const refreshToken = localStorage.getItem(rKey);
            const userType     = JSON.parse(localStorage.getItem(uKey) || '{}').type;

            // Refresh token nahi hai ya refresh call khud fail hui
            if (!refreshToken || originalReq.url?.includes('/auth/refresh')) {
                redirectToLogin(isAdminPath ? 'admin' : userType);
                return Promise.reject(err);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    refreshQueue.push({ resolve, reject, originalReq });
                });
            }

            originalReq._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.post(
                    `${api.defaults.baseURL}/auth/refresh`,
                    { refresh_token: refreshToken }
                );

                const newToken        = res.data.access_token || res.data.token;
                const newRefreshToken = res.data.refresh_token;

                // ✅ Sahi key mein save karo
                localStorage.setItem(tKey, newToken);
                if (newRefreshToken) {
                    localStorage.setItem(rKey, newRefreshToken);
                }

                // Pending requests retry karo
                refreshQueue.forEach(({ resolve, originalReq: req }) => {
                    req.headers.Authorization = `Bearer ${newToken}`;
                    resolve(api(req));
                });
                refreshQueue = [];

                originalReq.headers.Authorization = `Bearer ${newToken}`;
                return api(originalReq);
            } catch (refreshErr) {
                refreshQueue.forEach(({ reject }) => reject(refreshErr));
                refreshQueue = [];
                redirectToLogin(isAdminPath ? 'admin' : userType);
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(err);
    }
);

function redirectToLogin(userType) {
    // Sirf current role ka data clear karo
    if (userType === 'admin') {
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_refresh_token');
        localStorage.removeItem('admin_user');
        window.location.href = '/admin/login';
    } else {
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    }
}

export default api;