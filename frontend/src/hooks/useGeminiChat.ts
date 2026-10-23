// Hook para chat con Gemini (streaming SSE)
import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import type { Chat, MensajeChat } from '@/lib/api';

interface ChatWithMessages extends Chat {
  mensajes: MensajeChat[];
}

interface UseGeminiChatReturn {
  chats: Chat[];
  currentChat: ChatWithMessages | null;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  
  // Chat management
  createChat: (data: {titulo?: string; modelo?: string; system_prompt?: string}) => Promise<Chat | null>;
  loadChats: () => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  updateChat: (chatId: string, data: Partial<{titulo: string; modelo: string; system_prompt: string}>) => Promise<void>;
  
  // Messaging
  sendMessage: (content: string, options?: {stream?: boolean}) => Promise<void>;
  stopStreaming: () => void;
}

export function useGeminiChat(): UseGeminiChatReturn {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatWithMessages | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadChats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getChats();
      setChats(data);
    } catch (e: any) {
      setError(e.message || 'Error cargando chats');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadChat = useCallback(async (chatId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getChat(chatId);
      setCurrentChat(data as ChatWithMessages);
    } catch (e: any) {
      setError(e.message || 'Error cargando chat');
    } finally {
      setLoading(false);
    }
  }, []);

  const createChat = useCallback(async (data: {titulo?: string; modelo?: string; system_prompt?: string}) => {
    setError(null);
    try {
      const chat = await api.createChat(data);
      setChats(prev => [chat, ...prev]);
      await loadChat(chat.id);
      return chat;
    } catch (e: any) {
      setError(e.message || 'Error creando chat');
      return null;
    }
  }, [loadChat]);

  const deleteChat = useCallback(async (chatId: string) => {
    setError(null);
    try {
      await api.deleteChat(chatId);
      setChats(prev => prev.filter(c => c.id !== chatId));
      if (currentChat?.id === chatId) {
        setCurrentChat(null);
      }
    } catch (e: any) {
      setError(e.message || 'Error eliminando chat');
    }
  }, [currentChat]);

  const updateChat = useCallback(async (chatId: string, data: Partial<{titulo: string; modelo: string; system_prompt: string}>) => {
    setError(null);
    try {
      await api.updateChat(chatId, data);
      await loadChat(chatId);
      await loadChats();
    } catch (e: any) {
      setError(e.message || 'Error actualizando chat');
    }
  }, [loadChat, loadChats]);

  const sendMessage = useCallback(async (content: string, options = {stream: true}) => {
    if (!currentChat) {
      const chat = await createChat({titulo: content.slice(0, 50)});
      if (!chat) return;
    }
    
    const chatId = currentChat?.id;
    if (!chatId) return;
    
    setError(null);
    setStreaming(true);
    abortControllerRef.current = new AbortController();
    
    try {
      if (options.stream) {
        const reader = await api.sendMessage(chatId, content, true);
        if (!reader) throw new Error('No se pudo iniciar streaming');
        
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantMessage = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, {stream: true});
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.chunk) {
                  assistantMessage += data.chunk;
                  setCurrentChat(prev => prev ? {
                    ...prev,
                    mensajes: [
                      ...prev.mensajes.filter(m => m.id !== 'streaming'),
                      {id: 'streaming', rol: 'assistant', contenido: assistantMessage, creado_at: new Date().toISOString(), tokens_entrada: 0, tokens_salida: 0, modelo: ''}
                    ]
                  } : null);
                } else if (data.done) {
                  await loadChat(chatId);
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } else {
        await api.sendMessage(chatId, content, false);
        await loadChat(chatId);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message || 'Error enviando mensaje');
      }
    } finally {
      setStreaming(false);
      readerRef.current = null;
    }
  }, [currentChat, createChat, loadChat]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    readerRef.current?.cancel();
    setStreaming(false);
  }, []);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      readerRef.current?.cancel();
    };
  }, []);

  return {
    chats,
    currentChat,
    loading,
    streaming,
    error,
    createChat,
    loadChats,
    loadChat,
    deleteChat,
    updateChat,
    sendMessage,
    stopStreaming,
  };
}