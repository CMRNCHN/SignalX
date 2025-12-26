// TUI rendering logic
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

use super::app::{TuiApp, InputMode};

pub fn draw(f: &mut Frame, app: &TuiApp) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),      // Header
            Constraint::Min(0),          // Main content
            Constraint::Length(3),       // Input/Status
        ])
        .split(f.area());

    // Header
    draw_header(f, chunks[0]);

    // Main content area - split into threads and messages
    let content_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(30),  // Thread list
            Constraint::Percentage(70),  // Messages
        ])
        .split(chunks[1]);

    draw_threads(f, app, content_chunks[0]);
    draw_messages(f, app, content_chunks[1]);

    // Input/Status bar
    draw_input(f, app, chunks[2]);
}

fn draw_header(f: &mut Frame, area: Rect) {
    let header = Paragraph::new(vec![
        Line::from(vec![
            Span::styled("SignalX TUI", Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Span::raw(" | "),
            Span::styled("q", Style::default().fg(Color::Yellow)),
            Span::raw(": quit | "),
            Span::styled("j/k", Style::default().fg(Color::Yellow)),
            Span::raw(": navigate | "),
            Span::styled("i", Style::default().fg(Color::Yellow)),
            Span::raw(": compose | "),
            Span::styled("Enter", Style::default().fg(Color::Yellow)),
            Span::raw(": select"),
        ])
    ])
    .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));
    
    f.render_widget(header, area);
}

fn draw_threads(f: &mut Frame, app: &TuiApp, area: Rect) {
    let threads: Vec<ListItem> = app
        .threads
        .iter()
        .enumerate()
        .map(|(i, t)| {
            let style = if i == app.selected_thread {
                Style::default().bg(Color::DarkGray).fg(Color::White).add_modifier(Modifier::BOLD)
            } else {
                Style::default()
            };
            
            let unread = if t.unread > 0 {
                format!(" ({})", t.unread)
            } else {
                String::new()
            };
            
            let content = Line::from(vec![
                Span::styled(&t.name, style),
                Span::styled(unread, Style::default().fg(Color::Yellow)),
            ]);
            
            ListItem::new(content).style(style)
        })
        .collect();

    let threads_widget = List::new(threads)
        .block(Block::default()
            .title("Threads")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)));

    f.render_widget(threads_widget, area);
}

fn draw_messages(f: &mut Frame, app: &TuiApp, area: Rect) {
    let messages: Vec<Line> = app
        .messages
        .iter()
        .map(|m| {
            Line::from(vec![
                Span::styled(&m.timestamp, Style::default().fg(Color::DarkGray)),
                Span::raw(" "),
                Span::styled(&m.sender, Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw(": "),
                Span::raw(&m.content),
            ])
        })
        .collect();

    let messages_widget = Paragraph::new(messages)
        .block(Block::default()
            .title("Messages")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)));

    f.render_widget(messages_widget, area);
}

fn draw_input(f: &mut Frame, app: &TuiApp, area: Rect) {
    let (msg, style) = match app.input_mode {
        InputMode::Normal => (
            vec![
                Span::styled(&app.status_message, Style::default().fg(Color::Cyan)),
                Span::raw(" | "),
                Span::raw("Press "),
                Span::styled("i", Style::default().fg(Color::Yellow)),
                Span::raw(" to compose, "),
                Span::styled("q", Style::default().fg(Color::Yellow)),
                Span::raw(" to quit"),
            ],
            Style::default(),
        ),
        InputMode::Editing => (
            vec![
                Span::styled(">> ", Style::default().fg(Color::Green)),
                Span::raw(&app.input),
                Span::raw(" "),
                Span::styled("[Esc to cancel, Enter to send]", Style::default().fg(Color::DarkGray)),
            ],
            Style::default().fg(Color::Yellow),
        ),
    };

    let input_widget = Paragraph::new(Line::from(msg))
        .style(style)
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));

    f.render_widget(input_widget, area);
}

