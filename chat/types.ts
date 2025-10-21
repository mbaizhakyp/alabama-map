export interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
  sources?: string | string[];
  links?: string | string[];
}

export interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ExampleQuestion {
  category: string;
  questions: string[];
}

export interface MessageListProps {
  messages: Message[];
  isBotResponding: boolean;
  isDarkMode: boolean;
  lastBotMessageRef?: React.RefObject<HTMLDivElement>;
}

export interface ExampleQuestionsProps {
  questions: ExampleQuestion[];
  expandedCategories: Set<number>;
  isBotResponding: boolean;
  onToggleCategory: (index: number) => void;
  onQuestionClick: (question: string) => void;
  isDarkMode: boolean;
}

export interface ChatHeaderProps {
  showExamples: boolean;
  onShowExamples: () => void;
  onShowChat: () => void;
  onClearChat: () => void;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

export interface ChatInputProps {
  inputValue: string;
  isBotResponding: boolean;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  isDarkMode: boolean;
}
