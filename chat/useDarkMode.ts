import { useContext } from 'react';
import { DarkModeContext } from './DarkModeProvider';

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export function useDarkMode() {
  const context = useContext(DarkModeContext) as DarkModeContextType;
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider');
  }
  return context;
}
