import { useState, useEffect, useRef } from 'react';
import { Message } from './types';
// Remove or comment out the api.js import if it's no longer needed elsewhere
// import { chatAPI } from '../services/api.js';

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

  // Auto-scroll effect (keep as is)
  useEffect(() => {
    const scrollToLastBotMessage = () => {
      if (lastBotMessageRef.current) {
        lastBotMessageRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      } else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    };
    const timeoutId = setTimeout(scrollToLastBotMessage, 100);
    return () => clearTimeout(timeoutId);
  }, [messages, isBotResponding]);

  // Hide examples effect (keep as is)
  useEffect(() => {
    if (messages.length > 0) {
      setShowExamples(false);
    }
  }, [messages.length]);

  // --- MODIFIED handleSendMessage ---
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
      // --- Use fetch to call the new backend endpoint ---
      const response = await fetch('http://localhost:3001/api/chat', { // Adjust URL if needed
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: text.trim() }),
      });

      if (!response.ok) {
        // Handle HTTP errors (e.g., 500 Internal Server Error)
        const errorData = await response.json().catch(() => ({})); // Try to get error details
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
         // Handle errors reported by the backend/python script
        throw new Error(data.error);
      }
      // --- NEW FEATURE: Handle county_name from response ---
      // If we received a county_name, dispatch a global event for the map
      if (data.county_name) {
        const highlightEvent = new CustomEvent('highlightCounty', {
          detail: { countyName: data.county_name }
        });
        window.dispatchEvent(highlightEvent);
      }
      // --- END NEW FEATURE ---

      // --- Use the answer from the backend response ---
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.answer || "Sorry, I couldn't get a proper answer.", // Use received answer
        isBot: true,
        timestamp: new Date(),
        // sources and links are NOT returned by the current backend, set to null
        sources: null,
        links: null,
      };
      setMessages(prev => [...prev, botMessage]);
      setLastError(null); // Clear error on success

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessageText = 'Sorry, I encountered an error. Please try again later.';
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: errorMessageText,
        isBot: true,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
      setLastError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsBotResponding(false);
    }
  };
  // --- END MODIFIED handleSendMessage ---

  // Other handlers (keep as is)
  const handleClearChat = () => {
    setMessages([]);
    setShowExamples(true);
    setLastError(null);
  };

  const handleRetryLastMessage = () => {
     if (lastError && messages.length > 0) { // Only retry if there was an error
      const lastUserMessage = [...messages].reverse().find(msg => !msg.isBot);
      if (lastUserMessage) {
        // Remove the last error message before retrying
        setMessages(prev => prev.slice(0, -1));
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