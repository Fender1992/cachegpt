mod tray;
mod deep_link;

use tauri::Manager;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Set up system tray
            tray::create_tray(app)?;

            // Set up deep link handler
            deep_link::setup_deep_link(app)?;

            // Register global shortcut (Cmd/Ctrl+Shift+C) to toggle window
            let app_handle = app.handle().clone();
            let shortcut = if cfg!(target_os = "macos") {
                "CommandOrControl+Shift+C"
            } else {
                "Ctrl+Shift+C"
            };

            use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};
            app.global_shortcut().on_shortcut(
                shortcut.parse::<Shortcut>().unwrap(),
                move |_app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                },
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CacheGPT Desktop");
}
