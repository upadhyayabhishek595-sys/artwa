import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    Send, Search, Check, CheckCheck, X,
    UserPlus, Tag, CheckCircle, Clock, MoreVertical, Paperclip
} from 'lucide-react';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_BASE.replace(/\/api\/?$/, '');

const socket = io(SOCKET_URL);

const statusIcon = (status) => {
    if (status === 'read')      return <CheckCheck size={13} color="#25D366" />;
    if (status === 'delivered') return <CheckCheck size={13} color="#999" />;
    if (status === 'sent')      return <Check size={13} color="#999" />;
    return null;
};

const statusColors = {
    open: { bg: '#dcfce7', color: '#16a34a' },
    pending: { bg: '#fef9c3', color: '#ca8a04' },
    resolved: { bg: '#f3f4f6', color: '#6b7280' },
    bot: { bg: '#ede9fe', color: '#7c3aed' }
};

const Inbox = () => {
    const { user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [selected, setSelected] = useState(null);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('open');
    const [sending, setSending] = useState(false);
    const [agents, setAgents] = useState([]);
    const [showAssign, setShowAssign] = useState(false);
    const [showLabels, setShowLabels] = useState(false);
    const [showActions, setShowActions] = useState(false);
    const bottomRef = useRef();

    const LABELS = ['urgent', 'sales', 'support', 'billing', 'feedback'];

    // Socket setup
    useEffect(() => {
        socket.emit('join', { client_id: user.id });

        socket.on('new_message', (data) => {
            setConversations(prev => prev.map(c =>
                c.id === data.conversation_id
                    ? { ...c, last_message: data.message.body, unread_count: (c.unread_count || 0) + 1 }
                    : c
            ));
            if (selected?.id === data.conversation_id) {
                setMessages(prev => [...prev, data.message]);
            }
        });

        socket.on('message_status', ({ wamid, status }) => {
            setMessages(prev => prev.map(m => m.wamid === wamid ? { ...m, status } : m));
        });

        socket.on('conversation_updated', (data) => {
            setConversations(prev => prev.map(c =>
                c.id === data.conversation_id
                    ? { ...c, last_message: data.last_message, last_message_at: data.last_message_at }
                    : c
            ));
        });

        return () => {
            socket.off('new_message');
            socket.off('message_status');
            socket.off('conversation_updated');
        };
    }, [user.id, selected]);

    useEffect(() => { loadConversations(); }, [search, filter]);

    useEffect(() => {
        if (!selected) return;
        socket.emit('join_conversation', { conversation_id: selected.id });
        loadMessages();
        // Reset unread
        setConversations(prev => prev.map(c =>
            c.id === selected.id ? { ...c, unread_count: 0 } : c
        ));
    }, [selected]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        api.get('/manage/agents').then(r => setAgents(r.data.data || []));
    }, []);

    const loadConversations = async () => {
        try {
            const r = await api.get(`/conversations?status=${filter}&search=${search}`);
            setConversations(r.data.data || []);
        } catch (err) { console.error(err); }
    };

    const loadMessages = async () => {
        try {
            const r = await api.get(`/messages/${selected.id}`);
            setMessages(r.data.data || []);
        } catch (err) { console.error(err); }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!text.trim() || !selected) return;
        setSending(true);
        try {
            const r = await api.post('/messages/send', {
                conversation_id: selected.id,
                type: 'text',
                body: text
            });
            setMessages(prev => [...prev, {
                id: r.data.data.id,
                wamid: r.data.data.wamid,
                direction: 'outbound',
                type: 'text',
                body: text,
                status: 'sent',
                timestamp: new Date()
            }]);
            setConversations(prev => prev.map(c =>
                c.id === selected.id ? { ...c, last_message: text } : c
            ));
            setText('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const updateStatus = async (status) => {
        try {
            await api.patch(`/conversations/${selected.id}/status`, { status });
            setSelected(prev => ({ ...prev, status }));
            setConversations(prev => prev.map(c =>
                c.id === selected.id ? { ...c, status } : c
            ));
            toast.success(`Marked as ${status}`);
            setShowActions(false);
        } catch (err) {
            toast.error('Failed to update status');
        }
    };

    const assignAgent = async (agentId) => {
        try {
            await api.patch(`/conversations/${selected.id}/assign`, { agent_id: agentId });
            const agent = agents.find(a => a.id === agentId);
            setSelected(prev => ({ ...prev, agent_name: agent?.name, agent_id: agentId }));
            toast.success(`Assigned to ${agent?.name}`);
            setShowAssign(false);
        } catch (err) {
            toast.error('Failed to assign agent');
        }
    };

    const formatTime = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) return formatTime(ts);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    return (
        <div style={s.container}>
            {/* ── Sidebar ── */}
            <div style={s.sidebar}>
                <div style={s.sidebarHeader}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>Inbox</h3>
                    <span style={{ fontSize: '12px', color: '#888' }}>
                        {conversations.filter(c => c.unread_count > 0).length} unread
                    </span>
                </div>

                {/* Search */}
                <div style={s.searchBox}>
                    <Search size={13} color="#999" />
                    <input placeholder="Search conversations..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        style={s.searchInput} />
                </div>

                {/* Filter tabs */}
                <div style={s.filterTabs}>
                    {['open', 'pending', 'resolved'].map(f => (
                        <button key={f} onClick={() => setFilter(f)}
                            style={{ ...s.filterTab, ...(filter === f ? s.filterTabActive : {}) }}>
                            {f}
                        </button>
                    ))}
                </div>

                {/* Conversation list */}
                <div style={s.convList}>
                    {conversations.length === 0 && (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
                            No conversations
                        </div>
                    )}
                    {conversations.map(c => (
                        <div key={c.id} onClick={() => setSelected(c)}
                            style={{
                                ...s.convItem,
                                background: selected?.id === c.id ? '#f0fdf4' : '#fff',
                                borderLeft: selected?.id === c.id ? '3px solid #25D366' : '3px solid transparent'
                            }}>
                            <div style={s.avatar}>
                                {(c.contact_name || c.contact_phone)?.[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={s.convName}>{c.contact_name || c.contact_phone}</span>
                                    <span style={s.convTime}>{formatDate(c.last_message_at)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                    <span style={s.convLast}>{c.last_message || 'No messages yet'}</span>
                                    {c.unread_count > 0 && (
                                        <span style={s.unreadBadge}>{c.unread_count}</span>
                                    )}
                                </div>
                                {c.agent_name && (
                                    <span style={s.agentTag}>👤 {c.agent_name}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Chat Window ── */}
            <div style={s.chat}>
                {selected ? (
                    <>
                        {/* Chat Header */}
                        <div style={s.chatHeader}>
                            <div style={s.avatar}>
                                {(selected.contact_name || selected.contact_phone)?.[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '600', fontSize: '14px' }}>
                                    {selected.contact_name || selected.contact_phone}
                                </div>
                                <div style={{ fontSize: '12px', color: '#888' }}>
                                    {selected.contact_phone}
                                    {selected.agent_name && ` • 👤 ${selected.agent_name}`}
                                </div>
                            </div>

                            {/* Status badge */}
                            <span style={{
                                ...s.statusBadge,
                                background: statusColors[selected.status]?.bg,
                                color: statusColors[selected.status]?.color
                            }}>
                                {selected.status}
                            </span>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '6px', position: 'relative' }}>
                                <button onClick={() => setShowAssign(!showAssign)} style={s.iconBtn} title="Assign Agent">
                                    <UserPlus size={16} color="#555" />
                                </button>
                                <button onClick={() => updateStatus('resolved')} style={s.iconBtn} title="Resolve">
                                    <CheckCircle size={16} color="#25D366" />
                                </button>
                                <button onClick={() => updateStatus('pending')} style={s.iconBtn} title="Mark Pending">
                                    <Clock size={16} color="#f59e0b" />
                                </button>
                                <button onClick={() => setShowActions(!showActions)} style={s.iconBtn}>
                                    <MoreVertical size={16} color="#555" />
                                </button>

                                {/* Assign dropdown */}
                                {showAssign && (
                                    <div style={s.dropdown}>
                                        <div style={s.dropdownHeader}>
                                            Assign to Agent
                                            <button onClick={() => setShowAssign(false)} style={s.closeBtn}><X size={14} /></button>
                                        </div>
                                        {agents.length === 0 && (
                                            <div style={{ padding: '12px', fontSize: '13px', color: '#888' }}>No agents found</div>
                                        )}
                                        {agents.map(a => (
                                            <div key={a.id} onClick={() => assignAgent(a.id)} style={s.dropdownItem}>
                                                <div style={{ ...s.avatar, width: '26px', height: '26px', fontSize: '11px' }}>
                                                    {a.name?.[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{a.name}</div>
                                                    <div style={{ fontSize: '11px', color: '#888' }}>{a.status}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* More actions dropdown */}
                                {showActions && (
                                    <div style={{ ...s.dropdown, width: '160px' }}>
                                        <div style={s.dropdownHeader}>
                                            Actions
                                            <button onClick={() => setShowActions(false)} style={s.closeBtn}><X size={14} /></button>
                                        </div>
                                        {['open', 'pending', 'resolved'].map(st => (
                                            <div key={st} onClick={() => updateStatus(st)} style={s.dropdownItem}>
                                                <span style={{ fontSize: '13px', textTransform: 'capitalize' }}>Mark as {st}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                                
                        {/* Messages */}
                        <div style={s.messages}>
                            {messages.map((m, i) => (
                                <div key={m.id || i} style={{
                                    display: 'flex',
                                    justifyContent: m.direction === 'outbound' ? 'flex-end' : 'flex-start',
                                    marginBottom: '6px'
                                }}>
                                    <div style={{
                                        ...s.bubble,
                                        background: m.direction === 'outbound' ? '#dcfce7' : '#fff',
                                        borderRadius: m.direction === 'outbound'
                                            ? '12px 12px 0 12px' : '12px 12px 12px 0'
                                    }}>
                                        {m.type === 'image' && m.media_url && (
                                            <img src={m.media_url} alt="" style={{ maxWidth: '200px', borderRadius: '8px', marginBottom: '6px' }} />
                                        )}
                                        <div style={{ fontSize: '13px', color: '#111', lineHeight: '1.4' }}>{m.body}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end', marginTop: '4px' }}>
                                            <span style={{ fontSize: '10px', color: '#999' }}>
                                                {formatTime(m.timestamp || m.created_at)}
                                            </span>
                                            {m.direction === 'outbound' && statusIcon(m.status)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={bottomRef} />
                        </div>

                        {/* Input bar */}
                        {selected.status !== 'resolved' ? (
                            <form onSubmit={sendMessage} style={s.inputBar}>
                                <input
                                    placeholder="Type a message... (Enter to send)"
                                    value={text}
                                    onChange={e => setText(e.target.value)}
                                    style={s.msgInput}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage(e);
                                        }
                                    }}
                                />
                                <button type="submit" style={{
                                    ...s.sendBtn,
                                    opacity: sending || !text.trim() ? 0.6 : 1
                                }} disabled={sending || !text.trim()}>
                                    <Send size={17} color="#fff" />
                                </button>
                            </form>
                        ) : (
                            <div style={s.resolvedBar}>
                                <span>Conversation resolved</span>
                                <button onClick={() => updateStatus('open')} style={s.reopenBtn}>
                                    Reopen
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={s.empty}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>💬</div>
                        <div style={{ fontSize: '15px', fontWeight: '500', color: '#555' }}>Select a conversation</div>
                        <div style={{ fontSize: '13px', color: '#aaa', marginTop: '4px' }}>Choose from the left to start messaging</div>
                    </div>
                )}
            </div>
        </div>
    );
};

const s = {
    container: { display: 'flex', height: 'calc(100vh - 48px)', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    sidebar: { width: '300px', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', background: '#fff' },
    sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f0f0f0' },
    searchBox: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' },
    searchInput: { border: 'none', outline: 'none', fontSize: '13px', flex: 1, background: 'transparent' },
    filterTabs: { display: 'flex', borderBottom: '1px solid #f0f0f0' },
    filterTab: { flex: 1, padding: '8px', border: 'none', background: 'none', fontSize: '12px', color: '#888', cursor: 'pointer', textTransform: 'capitalize', borderBottom: '2px solid transparent' },
    filterTabActive: { color: '#25D366', borderBottom: '2px solid #25D366', fontWeight: '600', background: '#f0fdf4' },
    convList: { flex: 1, overflowY: 'auto' },
    convItem: { display: 'flex', gap: '10px', padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid #f9fafb', transition: 'background 0.1s' },
    avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#25D366', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '14px', flexShrink: 0 },
    convName: { fontSize: '13px', fontWeight: '600', color: '#111' },
    convTime: { fontSize: '11px', color: '#bbb' },
    convLast: { fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' },
    unreadBadge: { background: '#25D366', color: '#fff', borderRadius: '50%', minWidth: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', padding: '0 4px' },
    agentTag: { fontSize: '10px', color: '#888', marginTop: '2px', display: 'block' },
    chat: { flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' },
    chatHeader: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid #f0f0f0', position: 'relative' },
    statusBadge: { padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '500', textTransform: 'capitalize' },
    iconBtn: { background: '#f7f8fa', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    dropdown: { position: 'absolute', right: 0, top: '44px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, width: '220px', overflow: 'hidden' },
    dropdownHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: '#888', borderBottom: '1px solid #f0f0f0' },
    dropdownItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer', fontSize: '13px', transition: 'background 0.1s' },
    closeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex' },
    messages: { flex: 1, overflowY: 'auto', padding: '16px', background: '#f7f8fa' },
    bubble: { maxWidth: '65%', padding: '8px 12px', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' },
    inputBar: { display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #f0f0f0', alignItems: 'center', background: '#fff' },
    msgInput: { flex: 1, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: '24px', fontSize: '13px', outline: 'none', background: '#fafafa' },
    sendBtn: { width: '40px', height: '40px', borderRadius: '50%', background: '#25D366', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    resolvedBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '12px', borderTop: '1px solid #f0f0f0', background: '#f9fafb', fontSize: '13px', color: '#888' },
    reopenBtn: { padding: '6px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
    empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }
};

export default Inbox;