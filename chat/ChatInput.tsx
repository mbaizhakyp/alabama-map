import React from 'react';
// ChatInput.tsx

import { Send } from 'lucide-react';
import { ChatInputProps } from './types';

export function ChatInput({
  inputValue,
  isBotResponding,
  onInputChange,
  onSendMessage,
  isDarkMode,
}: ChatInputProps) {
  return (
    // --- CHANGED: Differentiated background for input area ---
    <div
      className={`border-t p-4 ${
        isDarkMode ? 'border-white/10 bg-black/10' : 'border-black/10 bg-black/5'
      }`}
    >
      <div className="flex items-center space-x-3">
        <input
          type="text"
          value={inputValue}
          onChange={e => onInputChange(e.target.value)}
          onKeyPress={e =>
            e.key === 'Enter' && !isBotResponding && onSendMessage(inputValue)
          }
          placeholder="Type your message..."
          className={`flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm transition-shadow ${
            isDarkMode
              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
              : 'border-gray-300 bg-white' // Keep input solid for readability
          }`}
          disabled={isBotResponding}
        />
        <button
          onClick={() => onSendMessage(inputValue)}
          disabled={!inputValue.trim() || isBotResponding}
          className="group flex-shrink-0 w-10 h-10 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
          title="Send message"
        >
          <Send className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}