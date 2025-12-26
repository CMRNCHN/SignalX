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
            status_message: "Loading...".to_string(),
            account_id: account_id.clone(),
            data_dir,
        };

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
                            // Send message asynchronously
                            let result = self.send_message().await;
                            if let Err(e) = result {
                                self.status_message = format!("Send failed: {}", e);
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

