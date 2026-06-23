import { useEffect, useState, useRef } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Upload, Trash2, Image, FileText, Film, Music } from 'lucide-react';

const typeIcon = (mime) => {
    if (mime?.startsWith('image/')) return <Image size={18} color="#25D366" />;
    if (mime?.startsWith('video/')) return <Film size={18} color="#3b82f6" />;
    if (mime?.startsWith('audio/')) return <Music size={18} color="#8b5cf6" />;
    return <FileText size={18} color="#888" />;
};

const MediaLibrary = () => {
    const [items, setItems] = useState([]);
    const [phones, setPhones] = useState([]);
    const [phoneId, setPhoneId] = useState('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(null);
    const fileRef = useRef();

    const load = async () => {
        try {
            const r = await api.get('/media');
            setItems(r.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => {
        api.get('/manage/phone-numbers').then(r => {
            const list = r.data.data || [];
            setPhones(list);
            if (list.length) setPhoneId(String(list[0].id));
        });
        load();
    }, []);

    const upload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !phoneId) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('phone_number_id', phoneId);
            await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Media uploaded to Meta');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const remove = async (id) => {
        if (!confirm('Delete this media file?')) return;
        await api.delete(`/media/${id}`);
        toast.success('Deleted');
        if (preview?.id === id) setPreview(null);
        load();
    };

    const openPreview = async (item) => {
        try {
            const r = await api.get(`/media/${item.id}/url`);
            setPreview({ ...item, url: r.data.data?.url });
        } catch {
            toast.error('Could not load preview URL');
        }
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Media Library</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>
                        Upload images, videos, and documents for WhatsApp messages
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {phones.length > 0 && (
                        <select value={phoneId} onChange={e => setPhoneId(e.target.value)} style={s.select}>
                            {phones.map(p => (
                                <option key={p.id} value={p.id}>{p.display_name || p.phone_number}</option>
                            ))}
                        </select>
                    )}
                    <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,.pdf" onChange={upload} style={{ display: 'none' }} />
                    <button onClick={() => fileRef.current?.click()} style={s.btn} disabled={uploading || !phoneId}>
                        <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Loading...</div>
            ) : items.length === 0 ? (
                <div style={s.empty}>No media yet. Upload files to use in broadcasts and inbox.</div>
            ) : (
                <div style={s.grid}>
                    {items.map(item => (
                        <div key={item.id} style={s.card} onClick={() => openPreview(item)}>
                            <div style={s.cardIcon}>{typeIcon(item.mime_type)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.filename}
                                </div>
                                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                                    {item.mime_type} · {Math.round(item.file_size / 1024)} KB
                                </div>
                                <div style={{ fontSize: '10px', color: '#aaa', fontFamily: 'monospace', marginTop: '4px' }}>
                                    meta: {item.meta_media_id?.slice(0, 12)}...
                                </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); remove(item.id); }} style={s.delBtn}>
                                <Trash2 size={14} color="#e53e3e" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {preview && (
                <div style={s.modal} onClick={() => setPreview(null)}>
                    <div style={s.modalBox} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '15px' }}>{preview.filename}</h3>
                        {preview.url && preview.mime_type?.startsWith('image/') ? (
                            <img src={preview.url} alt={preview.filename} style={{ maxWidth: '100%', borderRadius: '8px' }} />
                        ) : preview.url && preview.mime_type?.startsWith('video/') ? (
                            <video src={preview.url} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
                        ) : (
                            <a href={preview.url} target="_blank" rel="noreferrer" style={{ color: '#25D366' }}>
                                Open file in new tab
                            </a>
                        )}
                        <div style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
                            Use <code>media_id: {preview.meta_media_id}</code> when sending messages
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const s = {
    btn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    select: { padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' },
    card: { display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer', border: '1px solid #f0f0f0' },
    cardIcon: { width: '40px', height: '40px', borderRadius: '8px', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    delBtn: { background: '#fee2e2', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex' },
    empty: { padding: '60px', textAlign: 'center', color: '#888', background: '#fff', borderRadius: '12px' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
    modalBox: { background: '#fff', borderRadius: '12px', padding: '20px', maxWidth: '520px', width: '90%' },
};

export default MediaLibrary;
