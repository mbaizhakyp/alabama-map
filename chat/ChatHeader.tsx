import React from 'react';
// ChatHeader.tsx

import {
  Bot,
  RotateCcw,
  HelpCircle,
  X,
  Moon,
  Sun,
  MessageCircle,
} from 'lucide-react';
import { ChatHeaderProps } from './types';

export function ChatHeader({
  showExamples,
  onShowExamples,
  onShowChat,
  onClearChat,
  onClose,
  isDarkMode,
  onToggleDarkMode,
}: ChatHeaderProps) {
  return (
    // --- CHANGED: Removed explicit background color to allow frosted glass effect ---
    <div
      className={`px-4 py-3 border-b flex items-center justify-between drag-handle cursor-grab ${
        isDarkMode ? 'border-white/10' : 'border-black/10'
      }`}
    >
      <div className="flex items-center space-x-3">
        <div
          className={`h-8 w-8 rounded-full flex items-center justify-center ${
            isDarkMode ? 'bg-gray-700' : 'bg-primary-500/20'
          }`}
        >
          <Bot
            className={`h-5 w-5 ${
              isDarkMode ? 'text-gray-300' : 'text-primary-600'
            }`}
          />
        </div>
        <div>
          <h3
            className={`font-semibold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}
          >
            CIROH AI
          </h3>
          <div className="flex items-center space-x-1.5">
            <div className="h-2 w-2 bg-green-500 rounded-full" />
            <p
              className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Online
            </p>
          </div>
        </div>
      </div>
      <div
        className="flex items-center space-x-1 group" // ADDED: group for hover effects
        onClick={e => e.stopPropagation()}
      >
        {!showExamples && (
          <button
            onClick={e => {
              e.stopPropagation();
              onShowExamples();
            }}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode
                ? 'hover:bg-white/10 text-gray-300'
                : 'hover:bg-black/10 text-gray-600'
            }`}
            title="Show example questions"
          >
            {/* --- ADDED: Hover scale animation --- */}
            <HelpCircle className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
          </button>
        )}
        {showExamples && (
          <button
            onClick={e => {
              e.stopPropagation();
              onShowChat();
            }}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode
                ? 'hover:bg-white/10 text-gray-300'
                : 'hover:bg-black/10 text-gray-600'
            }`}
            title="Back to chat"
          >
            <MessageCircle className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
          </button>
        )}
        <button
          onClick={e => {
            e.stopPropagation();
            onToggleDarkMode();
          }}
          className={`p-2 rounded-full transition-colors ${
            isDarkMode
              ? 'hover:bg-white/10 text-gray-300'
              : 'hover:bg-black/10 text-gray-600'
          }`}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDarkMode ? (
            <Sun className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
          ) : (
            <Moon className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
          )}
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            onClearChat();
          }}
          className={`p-2 rounded-full transition-colors ${
            isDarkMode
              ? 'hover:bg-white/10 text-gray-300'
              : 'hover:bg-black/10 text-gray-600'
          }`}
          title="Clear chat"
        >
          <RotateCcw className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            onClose();
          }}
          className={`p-2 rounded-full transition-colors ${
            isDarkMode
              ? 'hover:bg-white/10 text-gray-300'
              : 'hover:bg-black/10 text-gray-600'
          }`}
          title="Close chat"
        >
          <X className="h-5 w-5 transition-transform duration-200 hover:scale-110" />
        </button>
      </div>
    </div>
  );
}