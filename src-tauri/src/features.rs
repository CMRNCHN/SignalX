use serde_json::Value;
use std::path::PathBuf;
use std::fs;

pub fn get_features_path() -> PathBuf {
    // Try repo-local first
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let repo_root = PathBuf::from(manifest_dir).parent().unwrap().to_path_buf();
        let repo_path = repo_root.join(".signalx").join("features.json");
        if repo_path.is_file() {
            return repo_path;
        }
    }

    // Fall back to app data directory
    if let Some(data_dir) = dirs_next::data_dir() {
        let app_path = data_dir.join("com.signalx.desktop").join("features.json");
        if app_path.is_file() {
            return app_path;
        }
    }

    // Default location (will create if needed)
    dirs_next::data_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap())
        .join("com.signalx.desktop")
        .join("features.json")
}

pub fn load_features() -> std::collections::HashMap<String, bool> {
    let path = get_features_path();
    if !path.is_file() {
        return get_default_features();
    }

    match fs::read_to_string(&path) {
        Ok(content) => {
            match serde_json::from_str::<Value>(&content) {
                Ok(json) => {
                    let mut features = get_default_features();
                    if let Value::Object(map) = json {
                        for (key, value) in map {
                            if let Value::Bool(b) = value {
                                features.insert(key, b);
                            }
                        }
                    }
                    features
                }
                Err(_) => get_default_features(),
            }
        }
        Err(_) => get_default_features(),
    }
}

fn get_default_features() -> std::collections::HashMap<String, bool> {
    let mut features = std::collections::HashMap::new();
    features.insert("storage.sqlite".to_string(), true);
    features.insert("auth.enabled".to_string(), false); // OFF in dev
    features.insert("automation.rules".to_string(), false);
    features.insert("automation.send_enabled".to_string(), false);
    features.insert("headless.enabled".to_string(), true);
    features.insert("ui.panel.ai".to_string(), true);
    features.insert("ui.modal.diagnostics".to_string(), true);
    features.insert("ai.drafting".to_string(), true);
    features.insert("ai.send_auto".to_string(), false);
    features
}

pub fn is_feature_enabled(feature: &str) -> bool {
    let features = load_features();
    features.get(feature).copied().unwrap_or(false)
}

pub fn save_features(flags: &std::collections::HashMap<String, bool>) -> Result<(), String> {
    let path = get_features_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create features directory: {}", e))?;
    }
    
    let json = serde_json::to_string_pretty(flags)
        .map_err(|e| format!("Failed to serialize features: {}", e))?;
    
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write features file: {}", e))?;
    
    Ok(())
}
