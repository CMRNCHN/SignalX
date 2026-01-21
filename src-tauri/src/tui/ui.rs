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
    // Show help screen if requested
    if app.show_help {
        draw_help(f, f.area());
        return;
    }

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
            Span::styled("?", Style::default().fg(Color::Yellow)),
            Span::raw(": help | "),
            Span::styled("/", Style::default().fg(Color::Yellow)),
            Span::raw(": search | "),
            Span::styled(":", Style::default().fg(Color::Yellow)),
            Span::raw(": commands | "),
            Span::styled("m/`'`", Style::default().fg(Color::Yellow)),
            Span::raw(": bookmarks | "),
            Span::styled("q", Style::default().fg(Color::Yellow)),
            Span::raw(": quit"),
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
        .skip(app.message_scroll)
        .map(|m| {
            let highlight = if !app.search_query.is_empty() && 
                (m.content.to_lowercase().contains(&app.search_query.to_lowercase()) ||
                 m.sender.to_lowercase().contains(&app.search_query.to_lowercase())) {
                Style::default().bg(Color::DarkGray)
            } else {
                Style::default()
            };
            
            Line::from(vec![
                Span::styled(&m.timestamp, Style::default().fg(Color::DarkGray)),
                Span::raw(" "),
                Span::styled(&m.sender, Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)),
                Span::raw(": "),
                Span::styled(&m.content, highlight),
            ])
        })
        .collect();

    let title = if app.message_scroll > 0 {
        format!("Messages (scroll: {})", app.message_scroll)
    } else {
        "Messages (PgUp/PgDn to scroll)".to_string()
    };

    let messages_widget = Paragraph::new(messages)
        .block(Block::default()
            .title(title)
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)));

    f.render_widget(messages_widget, area);
}

fn draw_input(f: &mut Frame, app: &TuiApp, area: Rect) {
    let (msg, style) = if app.command_mode {
        (
            vec![
                Span::styled(":", Style::default().fg(Color::Blue).add_modifier(Modifier::BOLD)),
                Span::raw(&app.command_input),
                Span::raw(" "),
                Span::styled("[Esc to cancel, Enter to execute]", Style::default().fg(Color::DarkGray)),
            ],
            Style::default().fg(Color::Blue),
        )
    } else if app.search_mode {
        (
            vec![
                Span::styled("Search: ", Style::default().fg(Color::Magenta).add_modifier(Modifier::BOLD)),
                Span::raw(&app.search_query),
                Span::raw(" "),
                Span::styled("[Esc to cancel, Enter to search]", Style::default().fg(Color::DarkGray)),
            ],
            Style::default().fg(Color::Magenta),
        )
    } else {
        match app.input_mode {
            InputMode::Normal => (
                vec![
                    Span::styled(&app.status_message, Style::default().fg(Color::Cyan)),
                    Span::raw(" | Press "),
                    Span::styled("?", Style::default().fg(Color::Yellow)),
                    Span::raw(" for help"),
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
        }
    };

    let input_widget = Paragraph::new(Line::from(msg))
        .style(style)
        .block(Block::default().borders(Borders::ALL).border_style(Style::default().fg(Color::DarkGray)));

    f.render_widget(input_widget, area);
}

fn draw_help(f: &mut Frame, area: Rect) {
    let help_text = vec![
        Line::from(""),
        Line::from(vec![
            Span::styled("SignalX TUI - Keyboard Shortcuts", 
                Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Navigation", Style::default().fg(Color::Yellow).add_modifier(Modifier::UNDERLINED)),
        ]),
        Line::from(vec![
            Span::styled("  j/k or ↓/↑", Style::default().fg(Color::Green)),
            Span::raw("     Navigate threads"),
        ]),
        Line::from(vec![
            Span::styled("  g g", Style::default().fg(Color::Green)),
            Span::raw("              Jump to top"),
        ]),
        Line::from(vec![
            Span::styled("  G", Style::default().fg(Color::Green)),
            Span::raw("                Jump to bottom"),
        ]),
        Line::from(vec![
            Span::styled("  1-9", Style::default().fg(Color::Green)),
            Span::raw("              Quick jump to thread N"),
        ]),
        Line::from(vec![
            Span::styled("  PgUp/PgDn", Style::default().fg(Color::Green)),
            Span::raw("        Scroll messages"),
        ]),
        Line::from(vec![
            Span::styled("  Enter", Style::default().fg(Color::Green)),
            Span::raw("             Load selected thread"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Bookmarks", Style::default().fg(Color::Yellow).add_modifier(Modifier::UNDERLINED)),
        ]),
        Line::from(vec![
            Span::styled("  m + letter", Style::default().fg(Color::Green)),
            Span::raw("       Set bookmark (e.g., m a)"),
        ]),
        Line::from(vec![
            Span::styled("  ' + letter", Style::default().fg(Color::Green)),
            Span::raw("       Jump to bookmark (e.g., ' a)"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Messaging", Style::default().fg(Color::Yellow).add_modifier(Modifier::UNDERLINED)),
        ]),
        Line::from(vec![
            Span::styled("  i", Style::default().fg(Color::Green)),
            Span::raw("                 Enter compose mode"),
        ]),
        Line::from(vec![
            Span::styled("  c", Style::default().fg(Color::Green)),
            Span::raw("                 New message"),
        ]),
        Line::from(vec![
            Span::styled("  y y", Style::default().fg(Color::Green)),
            Span::raw("              Copy current message"),
        ]),
        Line::from(vec![
            Span::styled("  Enter", Style::default().fg(Color::Green)),
            Span::raw("             Send message (while composing)"),
        ]),
        Line::from(vec![
            Span::styled("  Esc", Style::default().fg(Color::Green)),
            Span::raw("               Exit compose mode"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Command Mode", Style::default().fg(Color::Yellow).add_modifier(Modifier::UNDERLINED)),
        ]),
        Line::from(vec![
            Span::styled("  :", Style::default().fg(Color::Green)),
            Span::raw("                 Enter command mode"),
        ]),
        Line::from(vec![
            Span::raw("  Commands: "),
            Span::styled(":quit, :refresh, :search, :export, :help", Style::default().fg(Color::Cyan)),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Other", Style::default().fg(Color::Yellow).add_modifier(Modifier::UNDERLINED)),
        ]),
        Line::from(vec![
            Span::styled("  /", Style::default().fg(Color::Green)),
            Span::raw("                 Search messages"),
        ]),
        Line::from(vec![
            Span::styled("  r", Style::default().fg(Color::Green)),
            Span::raw("                 Refresh threads"),
        ]),
        Line::from(vec![
            Span::styled("  ?", Style::default().fg(Color::Green)),
            Span::raw("                 Toggle this help screen"),
        ]),
        Line::from(vec![
            Span::styled("  q", Style::default().fg(Color::Green)),
            Span::raw("                 Quit application"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("Press ? or Esc to close this help screen", 
                Style::default().fg(Color::DarkGray).add_modifier(Modifier::ITALIC)),
        ]),
    ];

    let help_widget = Paragraph::new(help_text)
        .block(Block::default()
            .title("Help")
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::Cyan)));

    // Center the help dialog
    let area = centered_rect(60, 70, area);
    
    // Draw background
    let clear_block = Block::default()
        .style(Style::default().bg(Color::Black));
    f.render_widget(clear_block, area);
    
    f.render_widget(help_widget, area);
}

// Helper function to create a centered rectangle
fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

