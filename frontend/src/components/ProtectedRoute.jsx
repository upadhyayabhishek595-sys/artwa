import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children, requiredType }) => {
    const { user, loading } = useAuth();

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
            Loading...
        </div>
    );

    if (!user) {
        // Role ke hisaab se correct login page pe bhejo
        return <Navigate to={requiredType === 'admin' ? '/admin/login' : '/login'} />;
    }

    if (requiredType && user.type !== requiredType) {
        // Galat role — apne dashboard pe bhejo
        return <Navigate to={user.type === 'admin' ? '/admin/dashboard' : '/dashboard'} />;
    }

    return children;
};

export default ProtectedRoute;