import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login        from './pages/Login';
import AdminLogin    from './pages/AdminLogin';
import AcceptInvite  from './pages/AcceptInvite';

import ClientLayout from './layouts/ClientLayout';
import AdminLayout  from './layouts/AdminLayout';

// Client pages — capital 'Client' folder (matches actual filesystem casing)
import ClientDashboard from './pages/Client/Dashboard';
import Inbox           from './pages/Client/Inbox';
import Contacts        from './pages/Client/Contacts';
import Broadcasts      from './pages/Client/Broadcasts';
import Templates       from './pages/Client/Templates';
import Agents          from './pages/Client/Agents';
import Flows           from './pages/Client/Flows';
import ClientSettings  from './pages/Client/Settings';
import MediaLibrary    from './pages/Client/MediaLibrary';

// Admin pages — capital 'Admin' folder (matches actual filesystem casing)
import AdminDashboard from './pages/Admin/Dashboard';
import AdminClients   from './pages/Admin/Clients';
import AdminCredits   from './pages/Admin/Credits';
import AdminResellers from './pages/Admin/Resellers';
import AdminPlans     from './pages/Admin/Plans';
import AdminSettings  from './pages/Admin/Settings';

const App = () => (
    <AuthProvider>
        <BrowserRouter>
            <Toaster position="top-right" />
            <Routes>
                {/* Public */}
                <Route path="/"            element={<Navigate to="/login" />} />
                <Route path="/login"       element={<Login />} />
                <Route path="/invite"      element={<AcceptInvite />} />
                <Route path="/admin/login" element={<AdminLogin />} />

                {/* Client routes */}
                <Route path="/" element={
                    <ProtectedRoute requiredType="client">
                        <ClientLayout />
                    </ProtectedRoute>
                }>
                    <Route path="dashboard"  element={<ClientDashboard />} />
                    <Route path="inbox"      element={<Inbox />} />
                    <Route path="contacts"   element={<Contacts />} />
                    <Route path="broadcasts" element={<Broadcasts />} />
                    <Route path="templates"  element={<Templates />} />
                    <Route path="agents"     element={<Agents />} />
                    <Route path="flows"      element={<Flows />} />
                    <Route path="media"      element={<MediaLibrary />} />
                    <Route path="settings"   element={<ClientSettings />} />
                </Route>

                {/* Admin routes */}
                <Route path="/admin" element={
                    <ProtectedRoute requiredType="admin">
                        <AdminLayout />
                    </ProtectedRoute>
                }>
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="clients"   element={<AdminClients />} />
                    <Route path="credits"   element={<AdminCredits />} />
                    <Route path="resellers" element={<AdminResellers />} />
                    <Route path="plans"     element={<AdminPlans />} />
                    <Route path="settings"  element={<AdminSettings />} />
                </Route>
            </Routes>
        </BrowserRouter>
    </AuthProvider>
);

export default App;