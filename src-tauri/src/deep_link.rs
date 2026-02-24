use tauri::{Listener, Manager};

pub fn setup_deep_link(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    // Listen for deep link events (cachegpt://auth?access_token=...&refresh_token=...)
    app.listen("deep-link://new-url", move |event: tauri::Event| {
        let payload = event.payload();
        if let Some(window) = handle.get_webview_window("main") {
            // payload is a JSON-serialized Vec<String>; extract the first URL
            let url = serde_json::from_str::<Vec<String>>(payload)
                .ok()
                .and_then(|v| v.into_iter().next())
                .unwrap_or_else(|| payload.to_string());
            // Forward just the URL string to the frontend
            let _ = window.eval(&format!(
                "window.__TAURI_DEEP_LINK__ && window.__TAURI_DEEP_LINK__({})",
                serde_json::to_string(&url).unwrap_or_default()
            ));
            let _ = window.show();
            let _ = window.set_focus();
        }
    });

    Ok(())
}
