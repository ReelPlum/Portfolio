//! Portfolio Studio: the Mac app for writing and managing posts.

#[cfg(target_os = "macos")]
mod ui;

#[cfg(target_os = "macos")]
fn main() {
    ui::run();
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("Portfolio Studio is a Mac app; build it on macOS.");
}
