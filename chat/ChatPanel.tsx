import React, { useState } from 'react';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ExampleQuestions } from './ExampleQuestions';
import { useChat } from './useChat';
import { useDarkMode } from './useDarkMode';
import { usePanelResize } from './usePanelResize';
import { exampleQuestions } from './data';
import { ChatLauncher } from './ChatLauncher';

const ChatPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const {
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
  } = useChat();

  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { panelStyle, handleMouseDown, handleResizeMouseDown } = usePanelResize();

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
  };

  if (!isOpen) {
    return <ChatLauncher onClick={handleOpen} />;
  }

  return (
    <div
      style={{ ...panelStyle, position: 'fixed' }}
      onMouseDown={handleMouseDown}
      className={`flex flex-col shadow-2xl rounded-lg border ${isDarkMode ? 'border-white/10 bg-black/80' : 'border-black/10 bg-white/80'} backdrop-blur-md`}>
      <ChatHeader
        showExamples={showExamples}
        onShowExamples={handleShowExamples}
        onShowChat={handleShowChat}
        onClearChat={handleClearChat}
        onClose={handleClose}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {showExamples ? (
          <ExampleQuestions
            questions={exampleQuestions}
            expandedCategories={expandedCategories}
            isBotResponding={isBotResponding}
            onToggleCategory={handleToggleCategory}
            onQuestionClick={handleSendMessage}
            isDarkMode={isDarkMode}
          />
        ) : (
          <MessageList
            messages={messages}
            isBotResponding={isBotResponding}
            isDarkMode={isDarkMode}
            lastBotMessageRef={lastBotMessageRef}
          />
        )}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput
        inputValue={inputValue}
        isBotResponding={isBotResponding}
        onInputChange={setInputValue}
        onSendMessage={handleSendMessage}
        isDarkMode={isDarkMode}
      />
      <div onMouseDown={handleResizeMouseDown} style={{ cursor: 'nwse-resize', position: 'absolute', width: '10px', height: '10px', left: 0, top: 0, zIndex: 10, backgroundColor: 'rgba(128, 128, 128, 0.5)' }}></div>
    </div>
  );
};

export default ChatPanel;