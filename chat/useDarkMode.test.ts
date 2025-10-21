import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DarkModeProvider } from './DarkModeProvider';
import { useDarkMode } from './useDarkMode';

const wrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(DarkModeProvider, { children });
};

describe('useDarkMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset localStorage mock
    (window.localStorage.getItem as any).mockReturnValue(null);
    (window.localStorage.setItem as any).mockClear();
    
    // Reset matchMedia mock
    (window.matchMedia as any).mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  it('should initialize with system preference when no saved preference', () => {
    (window.localStorage.getItem as any).mockReturnValue(null);
    (window.matchMedia as any).mockReturnValue({
      matches: true, // Simulate dark mode preference
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });

    const { result } = renderHook(() => useDarkMode(), { wrapper });
    
    expect(result.current.isDarkMode).toBe(true);
    expect(window.localStorage.getItem).toHaveBeenCalledWith('ciroh-dark-mode');
  });

  it('should initialize with saved preference when available', () => {
    (window.localStorage.getItem as any).mockReturnValue('false');
    
    const { result } = renderHook(() => useDarkMode(), { wrapper });
    
    expect(result.current.isDarkMode).toBe(false);
  });

  it('should toggle dark mode', () => {
    (window.localStorage.getItem as any).mockReturnValue('false');
    
    const { result } = renderHook(() => useDarkMode(), { wrapper });
    
    expect(result.current.isDarkMode).toBe(false);
    
    act(() => {
      result.current.toggleDarkMode();
    });
    
    expect(result.current.isDarkMode).toBe(true);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('ciroh-dark-mode', 'true');
  });

  it('should save preference to localStorage when toggled', () => {
    (window.localStorage.getItem as any).mockReturnValue('true');
    
    const { result } = renderHook(() => useDarkMode(), { wrapper });
    
    act(() => {
      result.current.toggleDarkMode();
    });
    
    expect(window.localStorage.setItem).toHaveBeenCalledWith('ciroh-dark-mode', 'false');
  });

  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => useDarkMode());
    }).toThrow('useDarkMode must be used within a DarkModeProvider');
    
    consoleSpy.mockRestore();
  });
});
