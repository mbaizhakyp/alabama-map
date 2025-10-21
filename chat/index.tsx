import React from 'react';
import ReactDOM from 'react-dom';
import ChatPanel from './ChatPanel';
import { DarkModeProvider } from './DarkModeProvider';

ReactDOM.render(
  <DarkModeProvider>
    <ChatPanel />
  </DarkModeProvider>,
  document.getElementById('chat-root')
);
