import React from 'react';
// MessageList.tsx

import { Bot, User } from 'lucide-react';
import { MessageListProps } from './types';
import { formatUrlsAsHtml, formatSourcesAsHtml } from '../utils.js';

export function MessageList({
  messages,
  isBotResponding,
  isDarkMode,
  lastBotMessageRef,
}: MessageListProps) {
  return (
    <div className="space-y-6">
      {messages.map((message, index) => {
        const isLastBotMessage = message.isBot && index === messages.length - 1;
        const isUser = !message.isBot;

        return (
          <div
            key={message.id}
            ref={isLastBotMessage ? lastBotMessageRef : null}
            className={`flex items-start gap-3 ${
              isUser ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {/* Avatar */}
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isUser
                  ? 'bg-primary-100'
                  : isDarkMode
                    ? 'bg-gray-700'
                    : 'bg-gray-200'
              }`}
            >
              {isUser ? (
                <User className="h-5 w-5 text-primary-600" />
              ) : (
                <Bot
                  className={`h-5 w-5 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                />
              )}
            </div>

            {/* Message Bubble & Content */}
            {/* --- CHANGED: Reduced max-width and moved bubble "tail" to the top --- */}
            <div
              className={`max-w-[75%] p-3 rounded-xl message-container ${
                isUser
                  ? 'bg-primary-600 text-white rounded-tr-none'
                  : isDarkMode
                    ? 'bg-gray-700 text-gray-100 rounded-tl-none'
                    : 'bg-gray-100 text-gray-900 rounded-tl-none'
              }`}
            >
              <div
                className="text-sm whitespace-pre-line chat-message"
                dangerouslySetInnerHTML={{
                  __html: formatUrlsAsHtml(message.text),
                }}
              />
              {message.isBot &&
                message.sources &&
                !message.text
                  .toLowerCase()
                  .includes(
                    'i cannot answer the question with the information given'
                  ) && (
                  <div
                    className={`text-xs mt-3 p-2 rounded border-l-2 w-full message-container ${
                      isDarkMode
                        ? 'bg-gray-800/50 border-gray-500 text-gray-300'
                        : 'bg-gray-50 border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className="font-medium mb-1">Sources:</div>
                    <div
                      className="chat-sources"
                      dangerouslySetInnerHTML={{
                        __html: formatSourcesAsHtml(
                          message.sources,
                          message.links
                        ),
                      }}
                    />
                  </div>
                )}
            </div>
          </div>
        );
      })}

      {isBotResponding && (
        <div className="flex items-start gap-3">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
            }`}
          >
            <Bot
              className={`h-5 w-5 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}
            />
          </div>
          {/* --- CHANGED: Also updated the typing indicator bubble --- */}
          <div
            className={`p-3 rounded-xl rounded-tl-none ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center space-x-1.5">
              <div
                className={`h-2 w-2 rounded-full animate-bounce ${
                  isDarkMode ? 'bg-gray-300' : 'bg-gray-400'
                }`}
              />
              <div
                className={`h-2 w-2 rounded-full animate-bounce ${
                  isDarkMode ? 'bg-gray-300' : 'bg-gray-400'
                }`}
                style={{ animationDelay: '0.1s' }}
              />
              <div
                className={`h-2 w-2 rounded-full animate-bounce ${
                  isDarkMode ? 'bg-gray-300' : 'bg-gray-400'
                }`}
                style={{ animationDelay: '0.2s' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}