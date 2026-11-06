//! Portfolio Studio: the Mac app for writing and managing posts.
//!
//! This is the starting point. It opens a window; the editor, post list,
//! publishing and statistics views come next. Build it on a Mac with
//! `cargo run -p app`.

#[cfg(target_os = "macos")]
fn main() {
    use gpui::{
        App, Application, Bounds, Context, SharedString, Window, WindowBounds, WindowOptions, div,
        prelude::*, px, rgb, size,
    };

    struct Studio {
        title: SharedString,
    }

    impl Render for Studio {
        fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
            div()
                .flex()
                .size_full()
                .justify_center()
                .items_center()
                .bg(rgb(0x1e1e1e))
                .text_color(rgb(0xffffff))
                .text_xl()
                .child(self.title.clone())
        }
    }

    Application::new().run(|cx: &mut App| {
        let bounds = Bounds::centered(None, size(px(1100.), px(720.)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_, cx| {
                cx.new(|_| Studio {
                    title: "Portfolio Studio".into(),
                })
            },
        )
        .expect("failed to open the window");
        cx.activate(true);
    });
}

#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("Portfolio Studio is a Mac app; build it on macOS.");
}
