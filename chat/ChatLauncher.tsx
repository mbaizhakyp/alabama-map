import React from 'react';
import { MessageCircle } from 'lucide-react';

interface ChatLauncherProps {
  onClick: () => void;
}

export const ChatLauncher: React.FC<ChatLauncherProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 bg-primary-600 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg hover:bg-primary-700 transition-colors"
      title="Open Chat"
    >
      <MessageCircle className="h-8 w-8" />
    </button>
  );
};
