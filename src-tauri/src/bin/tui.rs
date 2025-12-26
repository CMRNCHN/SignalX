// SignalX TUI Binary
// Terminal User Interface for keyboard-driven messaging

use app_lib::tui::TuiApp;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut app = TuiApp::new();
    app.run().await?;
    Ok(())
}

