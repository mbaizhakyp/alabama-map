import { useState, useEffect, useRef } from 'react';
import { Message } from './types';
import { chatAPI } from '../services/api.js';

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isBotResponding, setIsBotResponding] = useState(false);
  const [showExamples, setShowExamples] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set()
  );
  const [lastError, setLastError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastBotMessageRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the start of the last bot message when it arrives
  useEffect(() => {
    const scrollToLastBotMessage = () => {
      if (lastBotMessageRef.current) {
        lastBotMessageRef.current.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
      } else if (messagesEndRef.current) {
        // Fallback to bottom if no bot message ref
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };
    
    // Small delay to ensure DOM is updated
    const timeoutId = setTimeout(scrollToLastBotMessage, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages, isBotResponding]);

  // Hide examples when user starts chatting
  useEffect(() => {
    if (messages.length > 0) {
      setShowExamples(false);
    }
  }, [messages.length]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: text.trim(),
      isBot: false,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsBotResponding(true);
    setLastError(null);

    try {
      // Send question to API
      const response = await chatAPI.sendQuestion({ text: text.trim() });
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.answer,
        isBot: true,
        timestamp: new Date(),
        sources: response.sources,
        links: response.links,
      };
      setMessages(prev => [...prev, botMessage]);
      
      // Clear any previous errors on successful response
      if (response.success) {
        setLastError(null);
      } else {
        setLastError(response.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = 'Sorry, I encountered an error while processing your question. Please try again later.';
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: errorMessage,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      setLastError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsBotResponding(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setShowExamples(true);
    setLastError(null);
  };

  const handleRetryLastMessage = () => {
    if (messages.length > 0) {
      const lastUserMessage = [...messages].reverse().find(msg => !msg.isBot);
      if (lastUserMessage) {
        handleSendMessage(lastUserMessage.text);
      }
    }
  };

  const handleToggleCategory = (index: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedCategories(newExpanded);
  };

  const handleShowExamples = () => {
    setShowExamples(true);
  };

  const handleShowChat = () => {
    setShowExamples(false);
  };

  return {
    messages,
    inputValue,
    isBotResponding,
    showExamples,
    expandedCategories,
    lastError,
    messagesEndRef,
    lastBotMessageRef,
    setInputValue,
    handleSendMessage,
    handleClearChat,
    handleToggleCategory,
    handleShowExamples,
    handleShowChat,
    handleRetryLastMessage,
  };
}
