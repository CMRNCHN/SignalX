// TUI Application state and main loop
use std::io;
use std::path::PathBuf;
use std::fs;
use serde::{Deserialize, Serialize};
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};

// Match main.rs structures
#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadData {
    id: String,
    participants: Vec<String>,
    last_message_timestamp: i64,
    unread_count: u32,
    messages: Vec<Message>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct Message {
    id: String,
    thread_id: String,
    timestamp: i64,
    sender: Option<String>,
    content: String,
    direction: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ThreadState {
    version: u32,
    threads: std::collections::HashMap<String, ThreadData>,
    #[serde(default)]
    pending_replies: std::collections::HashMap<String, Vec<serde_json::Value>>,
}

pub struct TuiApp {
    pub should_quit: bool,
    pub selected_thread: usize,
    pub threads: Vec<ThreadInfo>,
    pub messages: Vec<MessageInfo>,
    pub input: String,
    pub input_mode: InputMode,
    pub status_message: String,
    pub account_id: Option<String>,
    pub data_dir: PathBuf,
    pub show_help: bool,
    pub message_scroll: usize,
    pub search_mode: bool,
    pub search_query: String,
    pub bookmarks: std::collections::HashMap<char, usize>,
    pub mark_mode: bool,
    pub jump_mode: bool,
    pub command_mode: bool,
    pub command_input: String,
    pub clipboard_content: Option<String>,
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
        // Get data directory
        let data_dir = dirs_next::data_dir()
            .map(|d| d.join("SignalX"))
            .unwrap_or_else(|| PathBuf::from("./data"));

        // Try to load Signal number from environment
        let account_id = std::env::var("SIGNALX_NUMBER").ok();

        let mut app = Self {
            should_quit: false,
            selected_thread: 0,
            threads: vec![],
            messages: vec![],
            input: String::new(),
            input_mode: InputMode::Normal,
            status_message: "Loading... Press ? for help".to_string(),
            account_id: account_id.clone(),
            data_dir: data_dir.clone(),
            show_help: false,
            message_scroll: 0,
            search_mode: false,
            search_query: String::new(),
            bookmarks: std::collections::HashMap::new(),
            mark_mode: false,
            jump_mode: false,
            command_mode: false,
            command_input: String::new(),
            clipboard_content: None,
        };

        // Load bookmarks from disk
        app.load_bookmarks();

        // Load threads
        if let Some(ref acc_id) = account_id {
            app.load_threads_from_disk(acc_id);
        } else {
            app.status_message = "Error: SIGNALX_NUMBER not set".to_string();
            app.threads = vec![ThreadInfo {
                id: "error".to_string(),
                name: "No SIGNALX_NUMBER configured".to_string(),
                preview: "Set SIGNALX_NUMBER environment variable".to_string(),
                unread: 0,
            }];
        }

        app
    }

    fn load_threads_from_disk(&mut self, account_id: &str) {
        let thread_file = self.data_dir.join("threads").join(format!("_{}.json", account_id.replace("+", "")));
        
        match fs::read_to_string(&thread_file) {
            Ok(content) => {
                match serde_json::from_str::<ThreadState>(&content) {
                    Ok(state) => {
                        let mut threads: Vec<ThreadInfo> = state.threads.values().map(|t| {
                            let name = if t.participants.is_empty() {
                                "Unknown".to_string()
                            } else {
                                t.participants.join(", ")
                            };
                            
                            let preview = t.messages.last()
                                .map(|m| {
                                    let content = &m.content;
                                    if content.len() > 50 {
                                        format!("{}...", &content[..50])
                                    } else {
                                        content.clone()
                                    }
                                })
                                .unwrap_or_else(|| "No messages".to_string());

                            ThreadInfo {
                                id: t.id.clone(),
                                name,
                                preview,
                                unread: t.unread_count as usize,
                            }
                        }).collect();

                        threads.sort_by(|a, b| b.unread.cmp(&a.unread));
                        
                        self.threads = threads;
                        self.status_message = format!("Loaded {} threads", self.threads.len());
                    }
                    Err(e) => {
                        self.status_message = format!("Error parsing threads: {}", e);
                        self.threads = vec![ThreadInfo {
                            id: "error".to_string(),
                            name: "Failed to parse thread data".to_string(),
                            preview: e.to_string(),
                            unread: 0,
                        }];
                    }
                }
            }
            Err(e) => {
                self.status_message = format!("No thread data found: {}", e);
                self.threads = vec![ThreadInfo {
                    id: "none".to_string(),
                    name: "No threads found".to_string(),
                    preview: format!("Looking in: {:?}", thread_file),
                    unread: 0,
                }];
            }
        }
    }

    fn load_thread_messages(&mut self, thread_id: &str) -> Result<(), String> {
        if let Some(ref account_id) = self.account_id {
            let thread_file = self.data_dir.join("threads").join(format!("_{}.json", account_id.replace("+", "")));
            
            let content = fs::read_to_string(&thread_file)
                .map_err(|e| format!("Failed to read thread file: {}", e))?;
            
            let state: ThreadState = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse thread state: {}", e))?;
            
            if let Some(thread) = state.threads.get(thread_id) {
                self.messages = thread.messages.iter().map(|m| {
                    let sender = m.sender.clone().unwrap_or_else(|| "You".to_string());
                    let timestamp = format!("{}", chrono::DateTime::from_timestamp(m.timestamp / 1000, 0)
                        .map(|dt| dt.format("%H:%M:%S").to_string())
                        .unwrap_or_else(|| "Unknown".to_string()));
                    
                    MessageInfo {
                        sender,
                        content: m.content.clone(),
                        timestamp,
                    }
                }).collect();
                
                self.status_message = format!("Loaded {} messages", self.messages.len());
                Ok(())
            } else {
                Err(format!("Thread {} not found", thread_id))
            }
        } else {
            Err("No account configured".to_string())
        }
    }

    // Bookmark management
    fn load_bookmarks(&mut self) {
        let bookmark_file = self.data_dir.join("tui-bookmarks.json");
        if let Ok(content) = fs::read_to_string(&bookmark_file) {
            if let Ok(bookmarks) = serde_json::from_str(&content) {
                self.bookmarks = bookmarks;
            }
        }
    }

    fn save_bookmarks(&self) {
        let bookmark_file = self.data_dir.join("tui-bookmarks.json");
        if let Ok(json) = serde_json::to_string_pretty(&self.bookmarks) {
            let _ = fs::write(&bookmark_file, json);
        }
    }

    fn set_bookmark(&mut self, letter: char) {
        self.bookmarks.insert(letter, self.selected_thread);
        self.save_bookmarks();
        self.status_message = format!("Bookmark '{}' set to thread {}", letter, self.selected_thread + 1);
    }

    fn jump_to_bookmark(&mut self, letter: char) {
        if let Some(&index) = self.bookmarks.get(&letter) {
            if index < self.threads.len() {
                self.selected_thread = index;
                self.load_messages();
                self.status_message = format!("Jumped to bookmark '{}'", letter);
            } else {
                self.status_message = format!("Bookmark '{}' invalid (thread no longer exists)", letter);
            }
        } else {
            self.status_message = format!("No bookmark set for '{}'", letter);
        }
    }

    // Clipboard operations
    fn copy_current_message(&mut self) {
        if !self.messages.is_empty() && self.message_scroll < self.messages.len() {
            let msg = &self.messages[self.message_scroll];
            self.clipboard_content = Some(msg.content.clone());
            self.status_message = "Message copied to clipboard".to_string();
        }
    }

    // Command mode
    fn execute_command(&mut self, cmd: &str) {
        let parts: Vec<&str> = cmd.trim().split_whitespace().collect();
        if parts.is_empty() {
            return;
        }

        match parts[0] {
            "quit" | "q" => {
                self.should_quit = true;
            }
            "refresh" | "r" => {
                if let Some(ref acc) = self.account_id.clone() {
                    self.load_threads_from_disk(&acc);
                    self.load_messages();
                    self.status_message = "Refreshed".to_string();
                }
            }
            "search" | "s" => {
                if parts.len() > 1 {
                    self.search_query = parts[1..].join(" ");
                    self.status_message = format!("Searching for: {}", self.search_query);
                } else {
                    self.search_mode = true;
                }
            }
            "export" => {
                let format = if parts.len() > 1 { parts[1] } else { "txt" };
                self.status_message = format!("Export to {} - feature coming soon", format);
            }
            "new" => {
                self.status_message = "New message - press 'c' in normal mode".to_string();
            }
            "help" => {
                self.show_help = true;
            }
            "clear" => {
                self.status_message = "Screen cleared".to_string();
            }
            _ => {
                self.status_message = format!("Unknown command: {}. Type :help for list", parts[0]);
            }
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
                // Help screen takes priority
                if self.show_help {
                    match key.code {
                        KeyCode::Char('?') | KeyCode::Esc | KeyCode::Char('q') => {
                            self.show_help = false;
                        }
                        _ => {}
                    }
                    return Ok(());
                }

                // Command mode
                if self.command_mode {
                    match key.code {
                        KeyCode::Esc => {
                            self.command_mode = false;
                            self.command_input.clear();
                        }
                        KeyCode::Enter => {
                            let cmd = self.command_input.clone();
                            self.command_mode = false;
                            self.command_input.clear();
                            self.execute_command(&cmd);
                        }
                        KeyCode::Char(c) => {
                            self.command_input.push(c);
                        }
                        KeyCode::Backspace => {
                            self.command_input.pop();
                        }
                        _ => {}
                    }
                    return Ok(());
                }

                // Mark mode (setting bookmarks)
                if self.mark_mode {
                    if let KeyCode::Char(c) = key.code {
                        if c.is_alphabetic() {
                            self.set_bookmark(c);
                        }
                    }
                    self.mark_mode = false;
                    return Ok(());
                }

                // Jump mode (jumping to bookmarks)
                if self.jump_mode {
                    if let KeyCode::Char(c) = key.code {
                        if c.is_alphabetic() {
                            self.jump_to_bookmark(c);
                        }
                    }
                    self.jump_mode = false;
                    return Ok(());
                }

                // Search mode
                if self.search_mode {
                    match key.code {
                        KeyCode::Esc => {
                            self.search_mode = false;
                            self.search_query.clear();
                        }
                        KeyCode::Enter => {
                            self.search_mode = false;
                            // Perform search
                            self.status_message = format!("Searching for: {}", self.search_query);
                        }
                        KeyCode::Char(c) => {
                            self.search_query.push(c);
                        }
                        KeyCode::Backspace => {
                            self.search_query.pop();
                        }
                        _ => {}
                    }
                    return Ok(());
                }

                match self.input_mode {
                    InputMode::Normal => match key.code {
                        KeyCode::Char('q') => self.should_quit = true,
                        KeyCode::Char('?') => self.show_help = true,
                        KeyCode::Char('/') => {
                            self.search_mode = true;
                            self.search_query.clear();
                        }
                        KeyCode::Char(':') => {
                            self.command_mode = true;
                            self.command_input.clear();
                        }
                        KeyCode::Char('m') => {
                            self.mark_mode = true;
                            self.status_message = "Press letter to set bookmark...".to_string();
                        }
                        KeyCode::Char('\'') => {
                            self.jump_mode = true;
                            self.status_message = "Press letter to jump to bookmark...".to_string();
                        }
                        KeyCode::Char('y') => {
                            // Check for double-y (yy)
                            if event::poll(std::time::Duration::from_millis(500))? {
                                if let Event::Key(second_key) = event::read()? {
                                    if let KeyCode::Char('y') = second_key.code {
                                        self.copy_current_message();
                                    }
                                }
                            }
                        }
                        KeyCode::Char('c') => {
                            self.status_message = "New message mode - feature coming soon".to_string();
                        }
                        KeyCode::Char('i') => self.input_mode = InputMode::Editing,
                        KeyCode::Char('r') => {
                            // Refresh threads
                            if let Some(ref acc) = self.account_id.clone() {
                                self.load_threads_from_disk(&acc);
                                self.load_messages();
                            }
                        }
                        KeyCode::Char('g') => {
                            // Check for gg (jump to top) or g+number
                            if event::poll(std::time::Duration::from_millis(500))? {
                                if let Event::Key(second_key) = event::read()? {
                                    match second_key.code {
                                        KeyCode::Char('g') => {
                                            // Jump to top
                                            self.selected_thread = 0;
                                            self.load_messages();
                                            self.message_scroll = 0;
                                        }
                                        KeyCode::Char(n) if n.is_numeric() => {
                                            // Jump to thread n
                                            if let Some(num) = n.to_digit(10) {
                                                let index = (num as usize).saturating_sub(1);
                                                if index < self.threads.len() {
                                                    self.selected_thread = index;
                                                    self.load_messages();
                                                    self.message_scroll = 0;
                                                }
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        KeyCode::Char('G') => {
                            // Jump to bottom
                            if !self.threads.is_empty() {
                                self.selected_thread = self.threads.len() - 1;
                                self.load_messages();
                                self.message_scroll = 0;
                            }
                        }
                        KeyCode::Char(n) if n.is_numeric() => {
                            // Quick jump to thread 1-9
                            if let Some(num) = n.to_digit(10) {
                                let index = (num as usize).saturating_sub(1);
                                if index < self.threads.len() {
                                    self.selected_thread = index;
                                    self.load_messages();
                                    self.message_scroll = 0;
                                }
                            }
                        }
                        KeyCode::Char('j') | KeyCode::Down => {
                            if self.selected_thread < self.threads.len().saturating_sub(1) {
                                self.selected_thread += 1;
                                self.load_messages();
                                self.message_scroll = 0;
                            }
                        }
                        KeyCode::Char('k') | KeyCode::Up => {
                            if self.selected_thread > 0 {
                                self.selected_thread -= 1;
                                self.load_messages();
                                self.message_scroll = 0;
                            }
                        }
                        KeyCode::PageDown => {
                            self.message_scroll = self.message_scroll.saturating_add(10);
                        }
                        KeyCode::PageUp => {
                            self.message_scroll = self.message_scroll.saturating_sub(10);
                        }
                        KeyCode::Enter => {
                            self.load_messages();
                        }
                        _ => {}
                    },
                    InputMode::Editing => match key.code {
                        KeyCode::Enter => {
                            // Send message asynchronously
                            let result = self.send_message().await;
                            if let Err(e) = result {
                                self.status_message = format!("Send failed: {}", e);
                            } else {
                                // Reload messages after successful send
                                if let Some(ref acc) = self.account_id.clone() {
                                    self.load_threads_from_disk(&acc);
                                    self.load_messages();
                                }
                            }
                            self.input_mode = InputMode::Normal;
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
        if let Some(thread) = self.threads.get(self.selected_thread).cloned() {
            match self.load_thread_messages(&thread.id) {
                Ok(()) => {
                    // Messages loaded successfully
                }
                Err(e) => {
                    self.status_message = format!("Error loading messages: {}", e);
                    self.messages = vec![
                        MessageInfo {
                            sender: "System".to_string(),
                            content: e,
                            timestamp: "error".to_string(),
                        }
                    ];
                }
            }
        }
    }

    async fn send_message(&mut self) -> Result<(), String> {
        if self.input.trim().is_empty() {
            return Ok(());
        }

        if let Some(thread) = self.threads.get(self.selected_thread) {
            let recipient = &thread.name; // Simplified - in reality would need actual phone number
            let message = self.input.clone();
            
            // Get Signal CLI binary path
            let signal_cli_bin = std::env::var("SIGNALX_SIGNALCLI_BIN")
                .unwrap_or_else(|_| "signal-cli".to_string());
            
            let config = std::env::var("SIGNALX_SIGNALCLI_CONFIG")
                .unwrap_or_else(|_| dirs_next::data_local_dir()
                    .unwrap_or_default()
                    .join("signal-cli")
                    .to_string_lossy()
                    .to_string());
            
            let account = self.account_id.as_ref()
                .ok_or_else(|| "No account configured".to_string())?;

            // Execute signal-cli send
            let output = tokio::process::Command::new(&signal_cli_bin)
                .args(&[
                    "--config", &config,
                    "-u", account,
                    "send",
                    "-m", &message,
                    recipient,
                ])
                .output()
                .await
                .map_err(|e| format!("Failed to execute signal-cli: {}", e))?;

            if output.status.success() {
                self.status_message = "Message sent!".to_string();
                self.input.clear();
                Ok(())
            } else {
                let error = String::from_utf8_lossy(&output.stderr);
                Err(format!("Failed to send: {}", error))
            }
        } else {
            Err("No thread selected".to_string())
        }
    }
}

