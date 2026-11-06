//! The app window (macOS, GPUI).

mod keychain;
mod studio;

use gpui_kit::component::Theme;
use gpui_kit::{
    App, AppContext, Bounds, KeyBinding, Menu, MenuItem, WindowBounds, WindowOptions, px, size,
};

gpui_kit::actions!(
    studio,
    [Quit, Save, NewPost, TogglePreview, Publish, OpenOnSite]
);

pub fn run() {
    gpui_kit::application().run(|cx: &mut App| {
        gpui_kit::init(cx);

        cx.bind_keys([
            KeyBinding::new("cmd-q", Quit, None),
            KeyBinding::new("cmd-s", Save, None),
            KeyBinding::new("cmd-n", NewPost, None),
            KeyBinding::new("cmd-shift-p", TogglePreview, None),
            KeyBinding::new("cmd-shift-u", Publish, None),
            KeyBinding::new("cmd-shift-o", OpenOnSite, None),
        ]);
        cx.on_action(|_: &Quit, cx| cx.quit());
        cx.set_menus(vec![
            Menu {
                name: "Portfolio Studio".into(),
                items: vec![MenuItem::action("Quit Portfolio Studio", Quit)],
                disabled: false,
            },
            Menu {
                name: "Post".into(),
                items: vec![
                    MenuItem::action("New Post", NewPost),
                    MenuItem::action("Save", Save),
                    MenuItem::separator(),
                    MenuItem::action("Publish / Unpublish", Publish),
                    MenuItem::action("Show / Hide Preview", TogglePreview),
                    MenuItem::action("Open on Website", OpenOnSite),
                ],
                disabled: false,
            },
        ]);

        let bounds = Bounds::centered(None, size(px(1280.), px(820.)), cx);
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            cx,
            |window, cx| {
                // Light or dark, following the system setting.
                Theme::sync_system_appearance(Some(window), cx);
                cx.new(|cx| studio::Studio::new(window, cx))
            },
        )
        .expect("failed to open the window");
        cx.activate(true);
    });
}
