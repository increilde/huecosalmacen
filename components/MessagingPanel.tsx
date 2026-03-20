
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Conversation, Message, ConversationMember } from '../types';
import { Send, Users, User, Plus, Search, Check, CheckCheck, ArrowLeft, MoreVertical, Trash2, X, Image as ImageIcon } from 'lucide-react';

interface MessagingPanelProps {
  user: UserProfile;
}

const MessagingPanel: React.FC<MessagingPanelProps> = ({ user }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [allMembers, setAllMembers] = useState<ConversationMember[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<{[key: string]: number}>({});
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [pastedImage, setPastedImage] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchConversations = React.useCallback(async () => {
    try {
      // Get conversations the user is part of
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (!memberData || memberData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const conversationIds = memberData.map(m => m.conversation_id);

      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('last_message_at', { ascending: false });

      // Fetch ALL members for these conversations to get names
      const { data: allMembersData } = await supabase
        .from('conversation_members')
        .select('*')
        .in('conversation_id', conversationIds);

      setAllMembers(allMembersData || []);
      setConversations(convData || []);

      // Fetch unread counts for each conversation
      const { data: unreadData } = await supabase
        .from('messages')
        .select('conversation_id')
        .in('conversation_id', conversationIds)
        .eq('is_read', false)
        .neq('sender_id', user.id);
      
      const counts: {[key: string]: number} = {};
      unreadData?.forEach(msg => {
        counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
      });
      setUnreadCounts(counts);
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  const fetchAllUsers = React.useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .eq('has_messaging_access', true);
    setAllUsers(data || []);
  }, [user.id]);

  const fetchMessages = React.useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    
    // Mark all as read
    if (data && data.length > 0) {
      const unreadIds = data.filter(m => !m.is_read && m.sender_id !== user.id).map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
      }
    }
  }, [user.id]);

  const fetchMembers = React.useCallback(async (conversationId: string) => {
    const { data } = await supabase
      .from('conversation_members')
      .select('*')
      .eq('conversation_id', conversationId);
    setMembers(data || []);
  }, []);

  const markAsRead = React.useCallback(async (messageId: string) => {
    await supabase.from('messages').update({ is_read: true }).eq('id', messageId);
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchAllUsers();
    
    // Subscribe to new messages
    const messageSubscription = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', table: 'messages' }, (payload) => {
        const newMessage = payload.new as Message;
        if (activeConversation && newMessage.conversation_id === activeConversation.id) {
          setMessages(prev => [...prev, newMessage]);
          markAsRead(newMessage.id);
        }
        fetchConversations(); // Refresh list to show last message
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSubscription);
    };
  }, [activeConversation, fetchAllUsers, fetchConversations, markAsRead]);

  useEffect(() => {
    if (activeConversation) {
      fetchMessages(activeConversation.id);
      fetchMembers(activeConversation.id);
    }
  }, [activeConversation, fetchMessages, fetchMembers]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !pastedImage) || !activeConversation) return;

    const messageContent = newMessage.trim();
    const imageToUpload = pastedImage;
    
    setNewMessage('');
    setPastedImage(null);

    try {
      const { data, error } = await supabase.from('messages').insert([{
        conversation_id: activeConversation.id,
        sender_id: user.id,
        sender_name: user.full_name,
        content: messageContent || null,
        image_url: imageToUpload
      }]).select().single();

      if (error) throw error;

      // Update last_message_at in conversation
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString()
      }).eq('id', activeConversation.id);

    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setPastedImage(event.target?.result as string);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const startNewConversation = async (targetUser: UserProfile) => {
    try {
      // Check if conversation already exists (individual)
      const { data: existingMembers } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      if (existingMembers) {
        const myConvIds = existingMembers.map(m => m.conversation_id);
        const { data: otherMembers } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', targetUser.id)
          .in('conversation_id', myConvIds);

        if (otherMembers && otherMembers.length > 0) {
          // Check if any of these are individual conversations
          const { data: individualConvs } = await supabase
            .from('conversations')
            .select('id')
            .eq('is_group', false)
            .in('id', otherMembers.map(m => m.conversation_id));

          if (individualConvs && individualConvs.length > 0) {
            const existingConv = conversations.find(c => c.id === individualConvs[0].id);
            if (existingConv) {
              setActiveConversation(existingConv);
              setShowNewChatModal(false);
              return;
            }
          }
        }
      }

      // Create new conversation
      const { data: newConv, error: convError } = await supabase.from('conversations').insert([{
        is_group: false,
        last_message_at: new Date().toISOString()
      }]).select().single();

      if (convError) throw convError;

      // Add members
      await supabase.from('conversation_members').insert([
        { conversation_id: newConv.id, user_id: user.id, user_full_name: user.full_name, user_email: user.email, user_avatar_url: user.avatar_url },
        { conversation_id: newConv.id, user_id: targetUser.id, user_full_name: targetUser.full_name, user_email: targetUser.email, user_avatar_url: targetUser.avatar_url }
      ]);

      fetchConversations();
      setActiveConversation(newConv);
      setShowNewChatModal(false);
    } catch (err) {
      console.error("Error starting conversation:", err);
    }
  };

  const createGroupConversation = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return;

    try {
      const { data: newConv, error: convError } = await supabase.from('conversations').insert([{
        name: groupName.trim(),
        is_group: true,
        last_message_at: new Date().toISOString()
      }]).select().single();

      if (convError) throw convError;

      // Add members
      const membersToInsert = [
        { conversation_id: newConv.id, user_id: user.id, user_full_name: user.full_name, user_email: user.email, user_avatar_url: user.avatar_url },
        ...selectedUsers.map(uid => {
          const u = allUsers.find(u => u.id === uid);
          return { conversation_id: newConv.id, user_id: uid, user_full_name: u?.full_name || '', user_email: u?.email || '', user_avatar_url: u?.avatar_url };
        })
      ];

      await supabase.from('conversation_members').insert(membersToInsert);

      fetchConversations();
      setActiveConversation(newConv);
      setShowNewChatModal(false);
      setIsGroupMode(false);
      setSelectedUsers([]);
      setGroupName('');
    } catch (err) {
      console.error("Error creating group:", err);
    }
  };

  const getConversationName = (conv: Conversation) => {
    if (conv.is_group) return conv.name;
    
    // For individual, find the other member in allMembers
    const otherMember = allMembers.find(m => m.conversation_id === conv.id && m.user_id !== user.id);
    return otherMember ? otherMember.user_full_name : 'Chat';
  };

  const getConversationAvatar = (conv: Conversation) => {
    if (conv.is_group) return null;
    const otherMember = allMembers.find(m => m.conversation_id === conv.id && m.user_id !== user.id);
    return otherMember?.user_avatar_url;
  };

  const getUserAvatar = (userId: string) => {
    if (userId === user.id) return user.avatar_url;
    const member = allMembers.find(m => m.user_id === userId);
    return member?.user_avatar_url;
  };

  const filteredUsers = allUsers.filter(u => 
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden animate-fade-in">
      {/* Sidebar */}
      <div className={`w-full md:w-80 border-r border-slate-100 flex flex-col ${activeConversation ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Mensajes</h2>
            <button 
              onClick={() => setShowNewChatModal(true)}
              className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar chats..." 
              className="w-full bg-slate-50 border-none rounded-2xl py-3 pl-10 pr-4 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-10 px-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No hay conversaciones</p>
              <button 
                onClick={() => setShowNewChatModal(true)}
                className="mt-4 text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:underline"
              >
                Iniciar nuevo chat
              </button>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => {
                  setActiveConversation(conv);
                  setUnreadCounts(prev => ({ ...prev, [conv.id]: 0 }));
                }}
                className={`w-full flex items-center gap-4 p-4 rounded-[2rem] transition-all ${activeConversation?.id === conv.id ? 'bg-indigo-50 shadow-sm' : 'hover:bg-slate-50'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-lg overflow-hidden ${conv.is_group ? 'bg-amber-500' : 'bg-slate-800'}`}>
                  {conv.is_group ? (
                    <Users className="w-6 h-6" />
                  ) : getConversationAvatar(conv) ? (
                    <img src={getConversationAvatar(conv)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 text-left overflow-hidden">
                  <div className="flex justify-between items-center mb-0.5">
                    <h4 className="font-black text-slate-800 text-sm truncate uppercase tracking-tight">
                      {getConversationName(conv)}
                    </h4>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[8px] font-bold text-slate-400">
                        {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {unreadCounts[conv.id] > 0 && (
                        <span className="bg-rose-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg shadow-rose-900/20 animate-pulse">
                          {unreadCounts[conv.id]}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] font-medium text-slate-500 truncate">
                    Toca para ver mensajes
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-slate-50/50 ${!activeConversation ? 'hidden md:flex' : 'flex'}`}>
        {activeConversation ? (
          <>
            {/* Header */}
            <div className="bg-white p-4 md:p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveConversation(null)}
                  className="md:hidden p-2 hover:bg-slate-50 rounded-xl"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-white font-black overflow-hidden ${activeConversation.is_group ? 'bg-amber-500' : 'bg-slate-800'}`}>
                  {activeConversation.is_group ? (
                    <Users className="w-5 h-5 md:w-6 md:h-6" />
                  ) : getConversationAvatar(activeConversation) ? (
                    <img src={getConversationAvatar(activeConversation)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-5 h-5 md:w-6 md:h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm md:text-base uppercase tracking-tight">
                    {getConversationName(activeConversation)}
                  </h3>
                  <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">En línea</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 no-scrollbar">
              {messages.map((msg, index) => {
                const isMe = msg.sender_id === user.id;
                const showSender = !isMe && (index === 0 || messages[index - 1].sender_id !== msg.sender_id);
                
                return (
                  <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isMe && (
                      <div className="w-8 h-8 rounded-xl bg-slate-200 flex-shrink-0 overflow-hidden self-end mb-1">
                        {getUserAvatar(msg.sender_id) ? (
                          <img src={getUserAvatar(msg.sender_id)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white text-[10px] font-black uppercase">
                            {msg.sender_name[0]}
                          </div>
                        )}
                      </div>
                    )}
                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} flex-1`}>
                      {showSender && (
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-2">
                          {msg.sender_name}
                        </span>
                      )}
                      <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-[1.5rem] shadow-sm relative group ${isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'}`}>
                        {msg.image_url && (
                          <div className="mb-2 cursor-pointer overflow-hidden rounded-xl" onClick={() => setSelectedImage(msg.image_url || null)}>
                            <img 
                              src={msg.image_url} 
                              alt="Adjunto" 
                              className="max-w-full h-auto object-cover hover:scale-105 transition-transform"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        )}
                        {msg.content && <p className="text-xs font-medium leading-relaxed">{msg.content}</p>}
                        <div className={`flex items-center gap-1 mt-1 justify-end ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                          <span className="text-[8px] font-bold">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isMe && (
                            msg.is_read ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 md:p-6 bg-white border-t border-slate-100">
              {pastedImage && (
                <div className="mb-4 relative inline-block">
                  <img src={pastedImage} alt="Preview" className="h-24 w-auto rounded-xl border-2 border-indigo-500 shadow-lg" />
                  <button 
                    onClick={() => setPastedImage(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Escribe un mensaje o pega una imagen..." 
                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-6 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {pastedImage && <ImageIcon className="w-4 h-4 text-indigo-500 animate-pulse" />}
                  </div>
                </div>
                <button 
                  type="submit"
                  disabled={!newMessage.trim() && !pastedImage}
                  className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  <Send className="w-6 h-6" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <div className="w-24 h-24 bg-white rounded-[2.5rem] shadow-xl flex items-center justify-center text-4xl mb-6 animate-bounce">💬</div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Tu Mensajería Interna</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest max-w-xs leading-relaxed">
              Selecciona una conversación para empezar a chatear con tu equipo en tiempo real.
            </p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 shadow-2xl animate-fade-in border border-white max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                {isGroupMode ? 'Crear Grupo' : 'Nuevo Mensaje'}
              </h3>
              <button 
                onClick={() => { setShowNewChatModal(false); setIsGroupMode(false); setSelectedUsers([]); }}
                className="text-slate-400 hover:text-slate-600"
              >✕</button>
            </div>

            <div className="flex gap-2 mb-6">
              <button 
                onClick={() => setIsGroupMode(false)}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isGroupMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-400'}`}
              >
                Individual
              </button>
              <button 
                onClick={() => setIsGroupMode(true)}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isGroupMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-400'}`}
              >
                Grupo
              </button>
            </div>

            {isGroupMode && (
              <div className="mb-6">
                <input 
                  type="text" 
                  placeholder="NOMBRE DEL GRUPO" 
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase text-center"
                />
              </div>
            )}

            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="BUSCAR USUARIO..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-2xl py-4 pl-12 pr-6 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 mb-6">
              {filteredUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    if (isGroupMode) {
                      setSelectedUsers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]);
                    } else {
                      startNewConversation(u);
                    }
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all ${selectedUsers.includes(u.id) ? 'bg-indigo-50 border-2 border-indigo-200' : 'bg-slate-50 border-2 border-transparent hover:bg-slate-100'}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white font-black text-sm uppercase overflow-hidden">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      u.full_name[0]
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="font-black text-slate-800 text-xs uppercase">{u.full_name}</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{u.role}</p>
                  </div>
                  {isGroupMode && (
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${selectedUsers.includes(u.id) ? 'bg-indigo-600 text-white' : 'bg-slate-200'}`}>
                      {selectedUsers.includes(u.id) && <Check className="w-4 h-4" />}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {isGroupMode && (
              <button 
                onClick={createGroupConversation}
                disabled={!groupName.trim() || selectedUsers.length === 0}
                className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs disabled:opacity-50"
              >
                CREAR GRUPO ({selectedUsers.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[400] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedImage(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
            onClick={() => setSelectedImage(null)}
          >
            <X className="w-10 h-10" />
          </button>
          <img 
            src={selectedImage} 
            alt="Imagen ampliada" 
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-zoom-in"
            onClick={(e) => e.stopPropagation()}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};

export default MessagingPanel;
