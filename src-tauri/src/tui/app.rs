// TUI Application state and main loop
use std::io;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};

pub struct TuiApp {
    pub should_quit: bool,
    pub selected_thread: usize,
    pub threads: Vec<ThreadInfo>,
    pub messages: Vec<MessageInfo>,
    pub input: String,
    pub input_mode: InputMode,
}

#[derive(Clone)]
pub struct ThreadInfo {
    pub id: String,
    pub name: String,
    pub preview: String,
    pub unread: usize,
}

#[derive(Clone)]
pub struct MessageInfo {
    pub sender: String,
    pub content: String,
    pub timestamp: String,
}

pub enum InputMode {
    Normal,
    Editing,
}

impl TuiApp {
    pub fn new() -> Self {
        Self {
            should_quit: false,
            selected_thread: 0,
            threads: vec![
                ThreadInfo {
                    id: "1".to_string(),
                    name: "Loading threads...".to_string(),
                    preview: "Please wait".to_string(),
                    unread: 0,
                }
            ],
            messages: vec![],
            input: String::new(),
            input_mode: InputMode::Normal,
        }
    }

    pub async fn run(&mut self) -> io::Result<()> {
        // Setup terminal
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        // Main loop
        while !self.should_quit {
            terminal.draw(|f| super::ui::draw(f, self))?;
            self.handle_events().await?;
        }

        // Cleanup
        disable_raw_mode()?;
        execute!(
            terminal.backend_mut(),
            LeaveAlternateScreen,
            DisableMouseCapture
        )?;
        terminal.show_cursor()?;

        Ok(())
    }

    async fn handle_events(&mut self) -> io::Result<()> {
        if event::poll(std::time::Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                match self.input_mode {
                    InputMode::Normal => match key.code {
                        KeyCode::Char('q') => self.should_quit = true,
                        KeyCode::Char('i') => self.input_mode = InputMode::Editing,
                        KeyCode::Char('j') | KeyCode::Down => {
                            if self.selected_thread < self.threads.len().saturating_sub(1) {
                                self.selected_thread += 1;
                                self.load_messages();
                            }
                        }
                        KeyCode::Char('k') | KeyCode::Up => {
                            if self.selected_thread > 0 {
                                self.selected_thread -= 1;
                                self.load_messages();
                            }
                        }
                        KeyCode::Enter => {
                            self.load_messages();
                        }
                        _ => {}
                    },
                    InputMode::Editing => match key.code {
                        KeyCode::Enter => {
                            // TODO: Send message
                            self.input.clear();
                        }
                        KeyCode::Char(c) => {
                            if key.modifiers.contains(KeyModifiers::CONTROL) && c == 'c' {
                                self.input_mode = InputMode::Normal;
                            } else {
                                self.input.push(c);
                            }
                        }
                        KeyCode::Backspace => {
                            self.input.pop();
                        }
                        KeyCode::Esc => {
                            self.input_mode = InputMode::Normal;
                        }
                        _ => {}
                    },
                }
            }
        }
        Ok(())
    }

    fn load_messages(&mut self) {
        // TODO: Load actual messages from backend
        if let Some(thread) = self.threads.get(self.selected_thread) {
            self.messages = vec![
                MessageInfo {
                    sender: "System".to_string(),
                    content: format!("Loaded thread: {}", thread.name),
                    timestamp: "now".to_string(),
                }
            ];
        }
    }
}

