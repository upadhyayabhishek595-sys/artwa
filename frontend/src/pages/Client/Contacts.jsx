import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2 } from 'lucide-react';

const Contacts = () => {
    const [contacts, setContacts] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: '', phone: '', email: '' });

    const load = async () => {
        try {
            const r = await api.get(`/contacts?search=${search}`);
            setContacts(r.data.data);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [search]);

    const addContact = async (e) => {
        e.preventDefault();
        try {
            await api.post('/contacts', form);
            toast.success('Contact added');
            setShowAdd(false);
            setForm({ name: '', phone: '', email: '' });
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error');
        }
    };

    const deleteContact = async (id) => {
        if (!confirm('Delete this contact?')) return;
        await api.delete(`/contacts/${id}`);
        toast.success('Deleted');
        load();
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Contacts</h2>
                <button onClick={() => setShowAdd(true)} style={s.btn}>
                    <Plus size={16} /> Add Contact
                </button>
            </div>

            <div style={s.searchBox}>
                <Search size={16} color="#999" />
                <input placeholder="Search contacts..." value={search}
                    onChange={e => setSearch(e.target.value)} style={s.searchInput} />
            </div>

            <div style={s.table}>
                <div style={s.thead}>
                    <span style={{ flex: 2 }}>Name</span>
                    <span style={{ flex: 2 }}>Phone</span>
                    <span style={{ flex: 2 }}>Email</span>
                    <span style={{ flex: 1 }}>Status</span>
                    <span style={{ flex: 1 }}>Action</span>
                </div>
                {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Loading...</div> :
                    contacts.map(c => (
                        <div key={c.id} style={s.row}>
                            <span style={{ flex: 2, fontWeight: '500' }}>{c.name || '—'}</span>
                            <span style={{ flex: 2, color: '#444' }}>{c.phone}</span>
                            <span style={{ flex: 2, color: '#888' }}>{c.email || '—'}</span>
                            <span style={{ flex: 1 }}>
                                <span style={{ ...s.badge, background: c.opted_in ? '#dcfce7' : '#fee2e2', color: c.opted_in ? '#16a34a' : '#dc2626' }}>
                                    {c.opted_in ? 'Opted In' : 'Opted Out'}
                                </span>
                            </span>
                            <span style={{ flex: 1 }}>
                                <button onClick={() => deleteContact(c.id)} style={s.iconBtn}>
                                    <Trash2 size={15} color="#e53e3e" />
                                </button>
                            </span>
                        </div>
                    ))
                }
            </div>

            {showAdd && (
                <div style={s.modal}>
                    <div style={s.modalBox}>
                        <h3 style={{ margin: '0 0 20px', fontSize: '16px' }}>Add Contact</h3>
                        <form onSubmit={addContact} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={s.input} />
                            <input placeholder="Phone (919XXXXXXXXX)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={s.input} required />
                            <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={s.input} />
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button type="button" onClick={() => setShowAdd(false)} style={s.cancelBtn}>Cancel</button>
                                <button type="submit" style={s.btn}>Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const s = {
    btn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    cancelBtn: { padding: '8px 16px', background: '#f0f0f0', color: '#444', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' },
    searchBox: { display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px', maxWidth: '320px' },
    searchInput: { border: 'none', outline: 'none', fontSize: '13px', flex: 1 },
    table: { background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    thead: { display: 'flex', padding: '12px 16px', background: '#f9fafb', fontSize: '12px', fontWeight: '600', color: '#888', borderBottom: '1px solid #f0f0f0' },
    row: { display: 'flex', padding: '12px 16px', fontSize: '13px', borderBottom: '1px solid #f9fafb', alignItems: 'center' },
    badge: { padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500' },
    iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '24px', width: '380px' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none' }
};

export default Contacts;