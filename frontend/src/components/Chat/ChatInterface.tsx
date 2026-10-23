import { useState, useRef, useEffect } from 'react';
import { useGeminiChat } from '@/hooks/useGeminiChat';
import { Send, Stop, Plus, Trash2, Loader2, MessageSquare } from 'lucide-react';
import './ChatInterface.css';

export function ChatInterface() {
  const {
    chats,
    currentChat,
    loading,
    streaming,
    error,
    createChat,
    loadChats,
    loadChat,
    deleteChat,
    sendMessage,
    stopStreaming,
  } = useGeminiChat();
  
  const [input, setInput] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.mensajes, streaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleNewChat = async () => {
    const chat = await createChat({ titulo: 'Nueva conversación' });
    if (chat) setShowSidebar(false);
  };

  if (loading && !currentChat) {
    return (
      <div className="chat-loading">
        <Loader2 className="spin" size={32} />
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      {/* Sidebar - Chat List */}
      <aside className={`chat-sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2><MessageSquare size={20} /> Chats</h2>
          <button onClick={handleNewChat} className="btn-new-chat" aria-label="Nuevo chat">
            <Plus size={20} />
          </button>
        </div>
        
        {error && <div className="chat-error">{error}</div>}
        
        <ul className="chat-list">
          {chats.map(chat => (
            <li key={chat.id} className={currentChat?.id === chat.id ? 'active' : ''}>
              <button onClick={() => loadChat(chat.id)} className="chat-item">
                <span className="chat-title">{chat.titulo || 'Sin título'}</span>
                <span className="chat-model">{chat.modelo}</span>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                className="btn-delete"
                aria-label="Eliminar chat"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {chats.length === 0 && (
            <li className="empty-state">
              <button onClick={handleNewChat}><MessageSquare size={20} /> Crear primer chat</button>
            </li>
          )}
        </ul>
        
        <button 
          className="btn-toggle-sidebar-mobile"
          onClick={() => setShowSidebar(!showSidebar)}
        >
          {showSidebar ? '◀' : '▶'} Chat
        </button>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-main">
        {currentChat ? (
          <>
            <header className="chat-header">
              <button 
                className="btn-toggle-sidebar" 
                onClick={() => setShowSidebar(!showSidebar)}
                aria-label="Toggle sidebar"
              >
                <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                  <polyline points="9 22 9 12 15 12"/>
                </svg>
              </button>
              <div className="chat-info">
                <h3>{currentChat.titulo || 'Nueva conversación'}</h3>
                <span className="model-badge">{currentChat.modelo}</span>
              </div>
              <button onClick={() => loadChat(currentChat.id)} className="btn-refresh" title="Recargar" disabled={loading}>
                <Loader2 size={18} className={loading ? 'spin' : ''} />
              </button>
            </header>

            <div className="messages-container">
              {currentChat.mensajes.map((msg, idx) => (
                <div key={`${msg.id}-${idx}`} className={`message ${msg.rol}`}>
                  <div className="message-avatar">
                    {msg.rol === 'assistant' ? (
                      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 8V4H8"/><rect x="8" y="14" width="16" height="8" rx="2"/>
                        <path d="M12 18h.01"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    )}
                  </div>
                  <div className="message-bubble">
                    <div className="message-content">
                      {msg.rol === 'assistant' ? (
                        <div className="markdown" dangerouslySetInnerHTML={{__html: formatMarkdown(msg.contenido)}} />
                      ) : (
                        <pre>{msg.contenido}</pre>
                      )}
                    </div>
                    <div className="message-meta">
                      <span>{new Date(msg.creado_at).toLocaleTimeString()}</span>
                      {msg.tokens_entrada && msg.tokens_salida && (
                        <span className="tokens">↑{msg.tokens_entrada} ↓{msg.tokens_salida}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="chat-input-form">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={streaming ? 'Generando respuesta...' : 'Escribe tu mensaje... (Shift+Enter para nueva línea)'}
                disabled={streaming}
                rows={1}
                maxLength={50000}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <button 
                type="submit" 
                disabled={!input.trim() || streaming}
                className="btn-send"
              >
                {streaming ? (
                  <>
                    <Stop size={20} />
                    <span>Detener</span>
                  </>
                ) : (
                  <Send size={20} />
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="chat-empty">
            <MessageSquare size={64} />
            <h2>Bienvenido a LifeAgente</h2>
            <p>Crea un nuevo chat para empezar a conversar con Gemini</p>
            <button onClick={handleNewChat} className="btn-primary">
              <Plus size={20} /> Nuevo chat
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// Simple markdown formatting
function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/```(\w+)?\n([\s\S]+?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/\n/g, '<br>');
}