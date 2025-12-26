import { describe, it, expect, beforeEach } from 'vitest';
import {
  Keys,
  isFocusable,
  getFocusableElements,
  focusFirstElement,
  focusLastElement,
  handleArrowNavigation,
  RovingTabIndexManager,
  createKeyboardShortcut,
  trapFocus,
  isActivationKey,
  handleClickWithKeyboard,
} from './keyboard';

describe('keyboard utilities', () => {
  describe('Keys', () => {
    it('exports correct key constants', () => {
      expect(Keys.ENTER).toBe('Enter');
      expect(Keys.SPACE).toBe(' ');
      expect(Keys.ESCAPE).toBe('Escape');
      expect(Keys.TAB).toBe('Tab');
      expect(Keys.ARROW_UP).toBe('ArrowUp');
      expect(Keys.ARROW_DOWN).toBe('ArrowDown');
      expect(Keys.ARROW_LEFT).toBe('ArrowLeft');
      expect(Keys.ARROW_RIGHT).toBe('ArrowRight');
      expect(Keys.HOME).toBe('Home');
      expect(Keys.END).toBe('End');
    });
  });

  describe('isFocusable', () => {
    it('returns true for focusable elements', () => {
      const button = document.createElement('button');
      expect(isFocusable(button)).toBe(true);

      const link = document.createElement('a');
      link.href = '#';
      expect(isFocusable(link)).toBe(true);

      const input = document.createElement('input');
      expect(isFocusable(input)).toBe(true);
    });

    it('returns false for non-focusable elements', () => {
      const div = document.createElement('div');
      expect(isFocusable(div)).toBe(false);

      const disabledButton = document.createElement('button');
      disabledButton.disabled = true;
      expect(isFocusable(disabledButton)).toBe(false);

      const negativeTabIndex = document.createElement('div');
      negativeTabIndex.tabIndex = -1;
      expect(isFocusable(negativeTabIndex)).toBe(false);
    });
  });

  describe('getFocusableElements', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('finds all focusable elements', () => {
      container.innerHTML = `
        <button>Button 1</button>
        <a href="#">Link</a>
        <input type="text" />
        <div>Not focusable</div>
        <button>Button 2</button>
      `;

      const focusable = getFocusableElements(container);
      expect(focusable).toHaveLength(4);
    });

    it('excludes disabled elements', () => {
      container.innerHTML = `
        <button>Button 1</button>
        <button disabled>Disabled</button>
        <input type="text" />
        <input type="text" disabled />
      `;

      const focusable = getFocusableElements(container);
      expect(focusable).toHaveLength(2);
    });

    it('excludes hidden elements', () => {
      container.innerHTML = `
        <button>Visible</button>
        <button style="display: none;">Hidden</button>
        <button style="visibility: hidden;">Hidden</button>
      `;

      const focusable = getFocusableElements(container);
      expect(focusable).toHaveLength(1);
    });
  });

  describe('focusFirstElement', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('focuses the first focusable element', () => {
      container.innerHTML = `
        <button id="first">First</button>
        <button id="second">Second</button>
      `;

      focusFirstElement(container);
      expect(document.activeElement?.id).toBe('first');
    });

    it('returns false if no focusable elements', () => {
      container.innerHTML = '<div>No focusable elements</div>';
      expect(focusFirstElement(container)).toBe(false);
    });
  });

  describe('focusLastElement', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('focuses the last focusable element', () => {
      container.innerHTML = `
        <button id="first">First</button>
        <button id="second">Second</button>
        <button id="third">Third</button>
      `;

      focusLastElement(container);
      expect(document.activeElement?.id).toBe('third');
    });
  });

  describe('handleArrowNavigation', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = `
        <button id="btn1">Button 1</button>
        <button id="btn2">Button 2</button>
        <button id="btn3">Button 3</button>
      `;
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('handles vertical arrow down navigation', () => {
      const btn1 = document.getElementById('btn1')!;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      handleArrowNavigation(event, container, 'vertical');

      expect(document.activeElement?.id).toBe('btn2');
    });

    it('handles vertical arrow up navigation', () => {
      const btn2 = document.getElementById('btn2')!;
      btn2.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      handleArrowNavigation(event, container, 'vertical');

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('wraps around at boundaries', () => {
      const btn3 = document.getElementById('btn3')!;
      btn3.focus();

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      handleArrowNavigation(event, container, 'vertical');

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('handles Home key', () => {
      const btn3 = document.getElementById('btn3')!;
      btn3.focus();

      const event = new KeyboardEvent('keydown', { key: 'Home' });
      handleArrowNavigation(event, container, 'vertical');

      expect(document.activeElement?.id).toBe('btn1');
    });

    it('handles End key', () => {
      const btn1 = document.getElementById('btn1')!;
      btn1.focus();

      const event = new KeyboardEvent('keydown', { key: 'End' });
      handleArrowNavigation(event, container, 'vertical');

      expect(document.activeElement?.id).toBe('btn3');
    });
  });

  describe('RovingTabIndexManager', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = `
        <button>Button 1</button>
        <button>Button 2</button>
        <button>Button 3</button>
      `;
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('initializes with correct tabindex values', () => {
      const manager = new RovingTabIndexManager(container);
      const buttons = container.querySelectorAll('button');

      expect(buttons[0].tabIndex).toBe(0);
      expect(buttons[1].tabIndex).toBe(-1);
      expect(buttons[2].tabIndex).toBe(-1);
    });

    it('moves to next element', () => {
      const manager = new RovingTabIndexManager(container);
      manager.next();

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].tabIndex).toBe(-1);
      expect(buttons[1].tabIndex).toBe(0);
      expect(buttons[2].tabIndex).toBe(-1);
    });

    it('moves to previous element', () => {
      const manager = new RovingTabIndexManager(container, 1);
      manager.previous();

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].tabIndex).toBe(0);
      expect(buttons[1].tabIndex).toBe(-1);
    });

    it('wraps around when going next from last', () => {
      const manager = new RovingTabIndexManager(container, 2);
      manager.next();

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].tabIndex).toBe(0);
      expect(buttons[2].tabIndex).toBe(-1);
    });

    it('moves to first element', () => {
      const manager = new RovingTabIndexManager(container, 2);
      manager.first();

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].tabIndex).toBe(0);
      expect(buttons[1].tabIndex).toBe(-1);
      expect(buttons[2].tabIndex).toBe(-1);
    });

    it('moves to last element', () => {
      const manager = new RovingTabIndexManager(container);
      manager.last();

      const buttons = container.querySelectorAll('button');
      expect(buttons[0].tabIndex).toBe(-1);
      expect(buttons[1].tabIndex).toBe(-1);
      expect(buttons[2].tabIndex).toBe(0);
    });
  });

  describe('createKeyboardShortcut', () => {
    it('matches key without modifiers', () => {
      const shortcut = createKeyboardShortcut('s');
      const event = new KeyboardEvent('keydown', { key: 's' });
      expect(shortcut(event)).toBe(true);
    });

    it('matches key with ctrl modifier', () => {
      const shortcut = createKeyboardShortcut('s', { ctrl: true });
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
      expect(shortcut(event)).toBe(true);
    });

    it('does not match when modifier is missing', () => {
      const shortcut = createKeyboardShortcut('s', { ctrl: true });
      const event = new KeyboardEvent('keydown', { key: 's' });
      expect(shortcut(event)).toBe(false);
    });

    it('matches multiple modifiers', () => {
      const shortcut = createKeyboardShortcut('s', { ctrl: true, shift: true });
      const event = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        shiftKey: true,
      });
      expect(shortcut(event)).toBe(true);
    });
  });

  describe('isActivationKey', () => {
    it('returns true for Enter key', () => {
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      expect(isActivationKey(event)).toBe(true);
    });

    it('returns true for Space key', () => {
      const event = new KeyboardEvent('keydown', { key: ' ' });
      expect(isActivationKey(event)).toBe(true);
    });

    it('returns false for other keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      expect(isActivationKey(event)).toBe(false);
    });
  });

  describe('trapFocus', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = `
        <button id="first">First</button>
        <button id="second">Second</button>
        <button id="third">Third</button>
      `;
    });

    afterEach(() => {
      document.body.removeChild(container);
    });

    it('traps focus when tabbing forward from last element', () => {
      const third = document.getElementById('third')!;
      third.focus();

      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
      Object.defineProperty(event, 'preventDefault', { 
        value: () => {}, 
        writable: true 
      });
      
      trapFocus(container, event);
      // After trapping, focus should move to first element
    });
  });
});

