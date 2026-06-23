import { useEffect, useState } from 'react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Plus, Trash2, FileText, ArrowLeft, Check, CheckCheck, X, Image, Video, FileIcon, Type, RefreshCw, Send } from 'lucide-react';

const statusColors = {
    approved:     { bg: '#dcfce7', color: '#16a34a' },
    pending:      { bg: '#f3f4f6', color: '#6b7280' },
    pending_meta: { bg: '#fef9c3', color: '#ca8a04' },
    rejected:     { bg: '#fee2e2', color: '#dc2626' },
    paused:       { bg: '#fef9c3', color: '#ca8a04' },
    disabled:     { bg: '#fee2e2', color: '#991b1b' },
};

// ─── Live WhatsApp Preview ───────────────────────────────────────────────────
const WhatsAppPreview = ({ form }) => {
    const renderHeader = () => {
        if (!form.header_type) return null;
        if (form.header_type === 'text') return (
            <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '4px', color: '#111' }}>
                {form.header_content || <span style={{ color: '#bbb' }}>Header text</span>}
            </div>
        );
        const icons = { image: '🖼️', video: '▶️', document: '📄' };
        return (
            <div style={{ background: '#e5e7eb', borderRadius: '6px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', fontSize: '32px' }}>
                {icons[form.header_type]}
                {form.header_content && (
                    <div style={{ fontSize: '11px', color: '#666', position: 'absolute', bottom: '4px' }}>{form.header_type}</div>
                )}
            </div>
        );
    };

    const renderBody = () => {
        let text = form.body || '';
        // Bold **text**
        text = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
        // Italic _text_
        text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
        // Variables {{1}} highlighted
        text = text.replace(/\{\{(\d+)\}\}/g, '<span style="background:#fef9c3;padding:0 2px;border-radius:3px;font-weight:600;">{{$1}}</span>');
        return text || '<span style="color:#bbb">Your message body will appear here...</span>';
    };

    const hasButtons = form.buttons.some(b => b.text.trim());

    return (
        <div style={{ width: '280px', flexShrink: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px' }}>📱</span> Live Preview
            </div>
            {/* Phone frame */}
            <div style={{ background: '#e5e7eb', borderRadius: '32px', padding: '16px 12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
                {/* Status bar */}
                <div style={{ background: '#075E54', borderRadius: '20px 20px 0 0', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>B</div>
                    <div>
                        <div style={{ color: '#fff', fontSize: '12px', fontWeight: '600' }}>Business</div>
                        <div style={{ color: '#b2dfdb', fontSize: '10px' }}>WhatsApp Business</div>
                    </div>
                </div>
                {/* Chat bg */}
                <div style={{ background: '#e5ddd5', padding: '12px 8px', minHeight: '200px', borderRadius: '0 0 20px 20px' }}>
                    {/* Message bubble */}
                    <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', padding: '8px 10px', maxWidth: '90%', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', position: 'relative' }}>
                        {renderHeader()}
                        <div style={{ fontSize: '12px', color: '#111', lineHeight: '1.5' }}
                            dangerouslySetInnerHTML={{ __html: renderBody() }} />
                        {form.footer && (
                            <div style={{ fontSize: '10px', color: '#888', marginTop: '4px', fontStyle: 'italic' }}>{form.footer}</div>
                        )}
                        <div style={{ fontSize: '10px', color: '#999', textAlign: 'right', marginTop: '4px' }}>
                            Now <CheckCheck size={11} color="#53bdeb" style={{ display: 'inline' }} />
                        </div>
                    </div>
                    {/* Buttons preview */}
                    {hasButtons && (
                        <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px', maxWidth: '90%' }}>
                            {form.buttons.filter(b => b.text.trim()).map((btn, i) => (
                                <div key={i} style={{ background: '#fff', borderRadius: '8px', padding: '7px 10px', textAlign: 'center', fontSize: '12px', color: '#00a5f4', fontWeight: '500', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                    {btn.type === 'QUICK_REPLY' && '↩ '}
                                    {btn.type === 'URL' && '🔗 '}
                                    {btn.type === 'PHONE_NUMBER' && '📞 '}
                                    {btn.text}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Button Editor ────────────────────────────────────────────────────────────
const ButtonEditor = ({ buttons, setButtons }) => {
    const addButton = (type) => {
        if (buttons.length >= 3) return toast.error('Max 3 buttons allowed');
        setButtons([...buttons, { type, text: '', url: '', phone: '' }]);
    };

    const updateButton = (i, field, value) => {
        setButtons(buttons.map((b, idx) => idx === i ? { ...b, [field]: value } : b));
    };

    const removeButton = (i) => {
        setButtons(buttons.filter((_, idx) => idx !== i));
    };

    const btnTypeLabels = { QUICK_REPLY: 'Quick Reply', URL: 'Visit Website', PHONE_NUMBER: 'Call Phone' };

    return (
        <div>
            {buttons.map((btn, i) => (
                <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>
                            {btnTypeLabels[btn.type] || btn.type}
                        </span>
                        <button type="button" onClick={() => removeButton(i)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', padding: '2px' }}>
                            <X size={14} />
                        </button>
                    </div>
                    <input placeholder="Button text (max 25 chars)" maxLength={25}
                        value={btn.text}
                        onChange={e => updateButton(i, 'text', e.target.value)}
                        style={fs.input} />
                    {btn.type === 'URL' && (
                        <input placeholder="https://example.com" value={btn.url}
                            onChange={e => updateButton(i, 'url', e.target.value)}
                            style={{ ...fs.input, marginTop: '6px' }} />
                    )}
                    {btn.type === 'PHONE_NUMBER' && (
                        <input placeholder="+91 9999999999" value={btn.phone}
                            onChange={e => updateButton(i, 'phone', e.target.value)}
                            style={{ ...fs.input, marginTop: '6px' }} />
                    )}
                </div>
            ))}
            {buttons.length < 3 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => addButton('QUICK_REPLY')} style={fs.addBtn}>
                        ↩ Quick Reply
                    </button>
                    <button type="button" onClick={() => addButton('URL')} style={fs.addBtn}>
                        🔗 Visit Website
                    </button>
                    <button type="button" onClick={() => addButton('PHONE_NUMBER')} style={fs.addBtn}>
                        📞 Call Phone
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Template Creator ─────────────────────────────────────────────────────────
const TemplateCreator = ({ onBack, onCreated }) => {
    const [form, setForm] = useState({
        name: '', category: 'marketing', language: 'en_US',
        header_type: '', header_content: '',
        body: '', footer: ''
    });
    const [buttons, setButtons] = useState([]);
    const [saving, setSaving] = useState(false);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const insertVariable = () => {
        const varCount = (form.body.match(/\{\{\d+\}\}/g) || []).length;
        set('body', form.body + `{{${varCount + 1}}}`);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.body.trim()) return toast.error('Body is required');
        setSaving(true);
        try {
            const components = [];

            if (form.header_type && form.header_content) {
                if (form.header_type === 'text') {
                    components.push({ type: 'HEADER', format: 'TEXT', text: form.header_content });
                } else {
                    components.push({ type: 'HEADER', format: form.header_type.toUpperCase(), example: { header_handle: [form.header_content] } });
                }
            }

            components.push({ type: 'BODY', text: form.body });

            if (form.footer.trim()) {
                components.push({ type: 'FOOTER', text: form.footer });
            }

            const validButtons = buttons.filter(b => b.text.trim());
            if (validButtons.length > 0) {
                components.push({
                    type: 'BUTTONS',
                    buttons: validButtons.map(b => {
                        if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
                        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
                        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone };
                        return b;
                    })
                });
            }

            await api.post('/manage/templates', {
                name: form.name,
                category: form.category.toUpperCase(),
                language: form.language,
                components
            });

            toast.success('Template created successfully');
            onCreated();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create template');
        } finally { setSaving(false); }
    };

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onBack} style={{ background: '#f0f0f0', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500' }}>
                    <ArrowLeft size={15} /> Back
                </button>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Create Template</h2>
                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#888' }}>Build your WhatsApp message template</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                    {/* Left: form */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* Section: Name & Language */}
                        <div style={fs.section}>
                            <div style={fs.sectionTitle}>TEMPLATE NAME AND LANGUAGE</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                <div style={fs.field}>
                                    <label style={fs.label}>Template Name *</label>
                                    <input placeholder="e.g. order_confirmation"
                                        value={form.name}
                                        onChange={e => set('name', e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                                        style={fs.input} required />
                                    <span style={{ fontSize: '11px', color: '#aaa' }}>Lowercase, underscores only</span>
                                </div>
                                <div style={fs.field}>
                                    <label style={fs.label}>Category *</label>
                                    <select value={form.category} onChange={e => set('category', e.target.value)} style={fs.input}>
                                        <option value="marketing">Marketing</option>
                                        <option value="utility">Utility</option>
                                        <option value="authentication">Authentication</option>
                                    </select>
                                </div>
                                <div style={fs.field}>
                                    <label style={fs.label}>Language *</label>
                                    <select value={form.language} onChange={e => set('language', e.target.value)} style={fs.input}>
                                        <option value="en_US">English (US)</option>
                                        <option value="en_GB">English (UK)</option>
                                        <option value="hi">Hindi</option>
                                        <option value="mr">Marathi</option>
                                        <option value="ta">Tamil</option>
                                        <option value="te">Telugu</option>
                                        <option value="gu">Gujarati</option>
                                        <option value="bn">Bengali</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Section: Header */}
                        <div style={fs.section}>
                            <div style={fs.sectionTitle}>HEADER <span style={{ color: '#aaa', fontWeight: '400', textTransform: 'none' }}>(optional)</span></div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                {[
                                    { value: '', label: 'None', icon: <X size={14} /> },
                                    { value: 'text', label: 'Text', icon: <Type size={14} /> },
                                    { value: 'image', label: 'Image', icon: <Image size={14} /> },
                                    { value: 'video', label: 'Video', icon: <Video size={14} /> },
                                    { value: 'document', label: 'Document', icon: <FileIcon size={14} /> },
                                ].map(opt => (
                                    <button key={opt.value} type="button"
                                        onClick={() => { set('header_type', opt.value); set('header_content', ''); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '5px',
                                            padding: '7px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                                            border: form.header_type === opt.value ? '2px solid #25D366' : '2px solid #e5e7eb',
                                            background: form.header_type === opt.value ? '#f0fdf4' : '#fff',
                                            color: form.header_type === opt.value ? '#16a34a' : '#555'
                                        }}>
                                        {opt.icon} {opt.label}
                                    </button>
                                ))}
                            </div>
                            {form.header_type === 'text' && (
                                <div style={fs.field}>
                                    <input placeholder="Header text (max 60 chars)" maxLength={60}
                                        value={form.header_content}
                                        onChange={e => set('header_content', e.target.value)}
                                        style={fs.input} />
                                </div>
                            )}
                            {['image', 'video', 'document'].includes(form.header_type) && (
                                <div style={fs.field}>
                                    <label style={fs.label}>Media URL</label>
                                    <input placeholder={`https://example.com/file.${form.header_type === 'image' ? 'jpg' : form.header_type === 'video' ? 'mp4' : 'pdf'}`}
                                        value={form.header_content}
                                        onChange={e => set('header_content', e.target.value)}
                                        style={fs.input} />
                                    <span style={{ fontSize: '11px', color: '#aaa' }}>Public URL to your {form.header_type} file</span>
                                </div>
                            )}
                        </div>

                        {/* Section: Body */}
                        <div style={fs.section}>
                            <div style={fs.sectionTitle}>BODY *</div>
                            <div style={{ position: 'relative' }}>
                                <textarea
                                    placeholder="Hello {{1}}, your order {{2}} has been placed successfully! Track it here."
                                    value={form.body}
                                    onChange={e => set('body', e.target.value)}
                                    style={{ ...fs.input, minHeight: '100px', resize: 'vertical', paddingBottom: '36px' }}
                                    required />
                                <div style={{ position: 'absolute', bottom: '8px', left: '8px', display: 'flex', gap: '6px' }}>
                                    <button type="button" onClick={insertVariable}
                                        style={{ ...fs.addBtn, fontSize: '11px', padding: '3px 8px' }}>
                                        + Add Variable
                                    </button>
                                    <span style={{ fontSize: '11px', color: '#aaa', alignSelf: 'center' }}>
                                        Use *bold*, _italic_, {'{{1}}'} for variables
                                    </span>
                                </div>
                            </div>
                            <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px', textAlign: 'right' }}>
                                {form.body.length}/1024
                            </div>
                        </div>

                        {/* Section: Footer */}
                        <div style={fs.section}>
                            <div style={fs.sectionTitle}>FOOTER <span style={{ color: '#aaa', fontWeight: '400', textTransform: 'none' }}>(optional)</span></div>
                            <input placeholder="Reply STOP to unsubscribe"
                                value={form.footer}
                                onChange={e => set('footer', e.target.value)}
                                style={fs.input} maxLength={60} />
                        </div>

                        {/* Section: Buttons */}
                        <div style={fs.section}>
                            <div style={fs.sectionTitle}>BUTTONS <span style={{ color: '#aaa', fontWeight: '400', textTransform: 'none' }}>(optional, max 3)</span></div>
                            <ButtonEditor buttons={buttons} setButtons={setButtons} />
                        </div>

                        {/* Submit */}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingBottom: '40px' }}>
                            <button type="button" onClick={onBack}
                                style={{ padding: '10px 20px', background: '#f0f0f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                style={{ padding: '10px 24px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: saving ? 0.7 : 1 }}>
                                {saving ? 'Creating...' : '✓ Create Template'}
                            </button>
                        </div>
                    </div>

                    {/* Right: live preview */}
                    <div style={{ position: 'sticky', top: '20px' }}>
                        <WhatsAppPreview form={{ ...form, buttons }} />
                    </div>
                </div>
            </form>
        </div>
    );
};

// ─── Template List ────────────────────────────────────────────────────────────
const Templates = () => {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [submittingId, setSubmittingId] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const r = await api.get('/manage/templates');
            setTemplates(r.data.data || []);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const deleteTemplate = async (id) => {
        if (!confirm('Delete this template?')) return;
        await api.delete(`/manage/templates/${id}`);
        toast.success('Deleted');
        load();
    };

    // Push a saved (pending) template to Meta for approval
    const submitToMeta = async (id) => {
        setSubmittingId(id);
        try {
            await api.post(`/manage/templates/${id}/submit`, {waba_id: '5473062976252355'});
            toast.success('Submitted to Meta for approval');
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.message || 'Failed to submit to Meta');
        } finally {
            setSubmittingId(null);
        }
    };

    // Pull latest status (approved/rejected/etc) from Meta for all templates
    const syncStatus = async () => {
        setSyncing(true);
        try {
            const r = await api.post('/manage/templates/sync', {});
            const { synced, updated } = r.data.data || {};
            toast.success(`Synced ${synced ?? 0} templates — ${updated ?? 0} updated`);
            load();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.response?.data?.message || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const getBodyText = (t) => {
        if (t.body) return t.body;
        try {
            const comps = typeof t.components === 'string' ? JSON.parse(t.components) : t.components;
            return comps?.find(c => c.type === 'BODY')?.text || '';
        } catch { return ''; }
    };

    if (creating) {
        return <TemplateCreator onBack={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Templates</h2>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>
                        {templates.length} template{templates.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={syncStatus} disabled={syncing}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', background: '#fff', color: '#444', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500', opacity: syncing ? 0.6 : 1 }}>
                        <RefreshCw size={14} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} /> {syncing ? 'Syncing...' : 'Refresh Status'}
                    </button>
                    <button onClick={() => setCreating(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                        <Plus size={16} /> New Template
                    </button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Loading...</div>
            ) : templates.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px', background: '#fff', borderRadius: '12px' }}>
                    <FileText size={48} color="#ddd" />
                    <div style={{ marginTop: '16px', fontSize: '16px', fontWeight: '500', color: '#555' }}>No templates yet</div>
                    <div style={{ fontSize: '13px', color: '#aaa', marginTop: '6px', marginBottom: '20px' }}>Create your first WhatsApp message template</div>
                    <button onClick={() => setCreating(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                        <Plus size={16} /> Create Template
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                    {templates.map(t => (
                        <div key={t.id} style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: '600', fontSize: '14px', color: '#111', fontFamily: 'monospace' }}>{t.name}</div>
                                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px', textTransform: 'capitalize' }}>
                                        {t.category} • {t.language}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '8px' }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '500',
                                        background: statusColors[t.status]?.bg || '#f3f4f6',
                                        color: statusColors[t.status]?.color || '#6b7280'
                                    }}>
                                        {t.status}
                                    </span>
                                    <button onClick={() => deleteTemplate(t.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                        <Trash2 size={14} color="#e53e3e" />
                                    </button>
                                </div>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '13px', color: '#444', background: '#f9fafb', padding: '10px', borderRadius: '8px', lineHeight: '1.5', maxHeight: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {getBodyText(t) || <span style={{ color: '#bbb' }}>No body content</span>}
                            </div>

                            {/* Only a locally-saved template (not yet sent to Meta) can be submitted */}
                            {t.status === 'pending' && (
                                <button onClick={() => submitToMeta(t.id)} disabled={submittingId === t.id}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                        width: '100%', marginTop: '10px', padding: '8px', background: '#f0fdf4',
                                        color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px',
                                        cursor: submittingId === t.id ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600',
                                        opacity: submittingId === t.id ? 0.6 : 1
                                    }}>
                                    <Send size={13} /> {submittingId === t.id ? 'Submitting...' : 'Submit to Meta'}
                                </button>
                            )}

                            {t.status === 'pending_meta' && (
                                <div style={{ marginTop: '10px', fontSize: '12px', color: '#ca8a04', textAlign: 'center', padding: '6px' }}>
                                    ⏳ Awaiting Meta review — use "Refresh Status" above to check
                                </div>
                            )}

                            {t.status === 'rejected' && (
                                <div style={{ marginTop: '10px', fontSize: '12px', color: '#dc2626', textAlign: 'center', padding: '6px', background: '#fef2f2', borderRadius: '6px' }}>
                                    ✕ Rejected by Meta — edit and resubmit, or delete
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Shared form styles
const fs = {
    section: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' },
    sectionTitle: { fontSize: '12px', fontWeight: '700', color: '#555', letterSpacing: '0.5px', marginBottom: '14px' },
    field: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '12px', fontWeight: '500', color: '#555' },
    input: { padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' },
    addBtn: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }
};

export default Templates;