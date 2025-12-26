use std::env;
use std::path::Path;
use std::process;
use std::process::Command;

// Get signal-cli path (same logic as main.rs)
fn get_signal_cli_path() -> String {
    if let Ok(bin) = env::var("SIGNALX_SIGNALCLI_BIN") {
        return bin;
    }
    let default_path = "/opt/homebrew/bin/signal-cli";
    if Path::new(default_path).exists() {
        return default_path.to_string();
    }
    "signal-cli".to_string()
}

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        eprintln!("Usage: signalx-headless <command> [args...]");
        eprintln!("Commands:");
        eprintln!("  start          - Start headless receive loop");
        eprintln!("  send --to <number> --text <message>  - Send a message");
        eprintln!("  rules list     - List automation rules");
        eprintln!("  rules run      - Run rules once");
        process::exit(1);
    }

    let command = &args[1];
    
    match command.as_str() {
        "start" => {
            eprintln!("Headless mode: Starting receive loop...");

            // Get configuration
            let signal_config = env::var("SIGNALX_SIGNALCLI_CONFIG")
                .or_else(|_| env::var("SIGNAL_CLI_CONFIG"))
                .unwrap_or_else(|_| "~/.local/share/signal-cli".to_string());

            let signal_number = env::var("SIGNALX_NUMBER")
                .or_else(|_| env::var("SIGNAL_CLI_NUMBER"))
                .expect("SIGNALX_NUMBER or SIGNAL_CLI_NUMBER environment variable must be set");

            let receive_timeout = env::var("SIGNALX_RECEIVE_TIMEOUT")
                .unwrap_or_else(|_| "2".to_string());

            let max_messages = env::var("SIGNALX_MAX_MESSAGES")
                .unwrap_or_else(|_| "50".to_string());

            eprintln!("Configuration:");
            eprintln!("  Config: {}", signal_config);
            eprintln!("  Number: {}", signal_number);
            eprintln!("  Timeout: {}s", receive_timeout);
            eprintln!("  Max messages: {}", max_messages);

            loop {
                eprintln!("Checking for new messages...");

                let signal_cli_path = get_signal_cli_path();
                let output = Command::new(&signal_cli_path)
                    .arg("--config")
                    .arg(&signal_config)
                    .arg("-o")
                    .arg("json")
                    .arg("-u")
                    .arg(&signal_number)
                    .arg("receive")
                    .arg("--timeout")
                    .arg(&receive_timeout)
                    .arg("--max-messages")
                    .arg(&max_messages)
                    .output();

                match output {
                    Ok(result) => {
                        if result.status.success() {
                            let stdout = String::from_utf8_lossy(&result.stdout);
                            if !stdout.trim().is_empty() {
                                eprintln!("Received messages:");
                                for line in stdout.lines() {
                                    if !line.trim().is_empty() {
                                        eprintln!("  {}", line);
                                    }
                                }
                                // Here you would process messages and run rules
                                eprintln!("Processing messages with rules engine...");
                            } else {
                                eprintln!("No new messages");
                            }
                        } else {
                            eprintln!("signal-cli receive failed:");
                            eprintln!("stderr: {}", String::from_utf8_lossy(&result.stderr));
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to execute signal-cli: {}", e);
                        process::exit(1);
                    }
                }

                // Sleep for a bit before checking again
                std::thread::sleep(std::time::Duration::from_secs(30));
            }
        }
        "send" => {
            let mut to = None;
            let mut text = None;
            let mut i = 2;
            while i < args.len() {
                match args[i].as_str() {
                    "--to" => {
                        if i + 1 < args.len() {
                            to = Some(args[i + 1].clone());
                            i += 2;
                        } else {
                            eprintln!("Error: --to requires a phone number");
                            process::exit(1);
                        }
                    }
                    "--text" => {
                        if i + 1 < args.len() {
                            text = Some(args[i + 1].clone());
                            i += 2;
                        } else {
                            eprintln!("Error: --text requires a message");
                            process::exit(1);
                        }
                    }
                    _ => {
                        eprintln!("Unknown argument: {}", args[i]);
                        process::exit(1);
                    }
                }
            }
            
            if to.is_none() || text.is_none() {
                eprintln!("Error: --to and --text are required");
                process::exit(1);
            }
            
            let to_number = to.as_ref().unwrap();
            let message_text = text.as_ref().unwrap();

            eprintln!("Sending message to {}: {}", to_number, message_text);

            // Get signal-cli configuration
            let signal_config = env::var("SIGNALX_SIGNALCLI_CONFIG")
                .or_else(|_| env::var("SIGNAL_CLI_CONFIG"))
                .unwrap_or_else(|_| {
                    let default = format!("{}/.local/share/signal-cli", env::var("HOME").unwrap_or_else(|_| "~".to_string()));
                    eprintln!("Warning: Using default config path: {}", default);
                    default
                });

            let signal_number = env::var("SIGNALX_NUMBER")
                .or_else(|_| env::var("SIGNAL_CLI_NUMBER"))
                .unwrap_or_else(|_| {
                    eprintln!("Error: SIGNALX_NUMBER or SIGNAL_CLI_NUMBER environment variable must be set");
                    eprintln!("Example: export SIGNALX_NUMBER=+1234567890");
                    process::exit(1);
                });

            // Execute signal-cli send command (match main.rs pattern)
            // Format: signal-cli --config <config> -o json -u <number> send -m "<message>" <recipient>
            let signal_cli_path = get_signal_cli_path();
            
            eprintln!("Executing: {} --config {} -o json -u {} send -m \"{}\" {}", 
                signal_cli_path, signal_config, signal_number, message_text, to_number);
            
            let output = Command::new(&signal_cli_path)
                .arg("--config")
                .arg(&signal_config)
                .arg("-o")
                .arg("json")
                .arg("-u")
                .arg(&signal_number)
                .arg("send")
                .arg("-m")
                .arg(message_text)
                .arg(to_number)
                .output();

            match output {
                Ok(result) => {
                    if result.status.success() {
                        eprintln!("Message sent successfully");
                        if !result.stdout.is_empty() {
                            eprintln!("Output: {}", String::from_utf8_lossy(&result.stdout));
                        }
                    } else {
                        eprintln!("Failed to send message (exit code: {})", result.status.code().unwrap_or(-1));
                        if !result.stderr.is_empty() {
                            eprintln!("Error: {}", String::from_utf8_lossy(&result.stderr));
                        }
                        if !result.stdout.is_empty() {
                            eprintln!("Output: {}", String::from_utf8_lossy(&result.stdout));
                        }
                        process::exit(1);
                    }
                }
                Err(e) => {
                    eprintln!("Failed to execute signal-cli: {}", e);
                    eprintln!("Make sure signal-cli is installed and in PATH, or set SIGNALX_SIGNALCLI_BIN");
                    process::exit(1);
                }
            }
        }
        "rules" => {
            if args.len() < 3 {
                eprintln!("Usage: signalx-headless rules <list|run>");
                process::exit(1);
            }
            let subcommand = &args[2];
            match subcommand.as_str() {
                "list" => {
                    eprintln!("Listing rules...");

                    // Get account ID from environment
                    let account_id = env::var("SIGNALX_NUMBER")
                        .or_else(|_| env::var("SIGNAL_CLI_NUMBER"))
                        .unwrap_or_else(|_| {
                            eprintln!("Warning: No SIGNALX_NUMBER set, showing all rules");
                            "".to_string()
                        });

                    // For now, just show a placeholder
                    eprintln!("Rules for account: {}", account_id);
                    eprintln!("(Database integration would list actual rules here)");
                    eprintln!("Example rules:");
                    eprintln!("  1. Auto-reply to 'ping' with 'pong' (enabled)");
                    eprintln!("  2. Label contacts from support emails (disabled)");
                }
                "run" => {
                    eprintln!("Running rules once...");

                    // Get account ID
                    let account_id = env::var("SIGNALX_NUMBER")
                        .or_else(|_| env::var("SIGNAL_CLI_NUMBER"))
                        .unwrap_or_else(|_| {
                            eprintln!("Error: SIGNALX_NUMBER not set");
                            process::exit(1);
                        });

                    eprintln!("Running automation rules for account: {}", account_id);
                    eprintln!("(Rules engine integration would process pending messages here)");
                    eprintln!("Processed 0 messages (no messages to process)");
                }
                _ => {
                    eprintln!("Unknown rules command: {}", subcommand);
                    process::exit(1);
                }
            }
        }
        _ => {
            eprintln!("Unknown command: {}", command);
            process::exit(1);
        }
    }
}

