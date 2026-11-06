//! The main view: login screen, post list, editor with preview, and the
//! authors panel.
//!
//! All network calls run on a background thread (`Studio::background`), and
//! their results come back to the view on the main thread.

use std::path::PathBuf;

use api::{AuthorDto, AuthorInput, PostDetail, PostSummary};
use gpui_kit::component::button::{Button, ButtonVariants};
use gpui_kit::component::checkbox::Checkbox;
use gpui_kit::component::input::{Editor, EditorState, Input, InputEvent, InputState};
use gpui_kit::component::text::TextView;
use gpui_kit::component::{ActiveTheme, h_flex, v_flex};
use gpui_kit::{
    AnyElement, AppContext, Context, Entity, FontWeight, InteractiveElement, IntoElement,
    ParentElement, Render, SharedString, StatefulInteractiveElement, Styled, Subscription, Window,
    div, prelude::FluentBuilder, px,
};
use studio::draft::Draft;
use studio::post_list::{self, Filter};
use studio::settings::Settings;
use studio::{Client, ClientError};

use super::{NewPost, OpenOnSite, Publish, Save, TogglePreview, keychain};

#[derive(Clone, PartialEq)]
enum Screen {
    Login,
    Main,
}

/// A message in the status bar.
#[derive(Clone)]
struct Status {
    text: SharedString,
    error: bool,
}

/// Where to go once unsaved changes are dealt with.
#[derive(Clone)]
enum Pending {
    Open(String),
    New,
}

/// The fields of the author form.
struct AuthorForm {
    editing: Option<String>,
    name: Entity<InputState>,
    email: Entity<InputState>,
    linkedin: Entity<InputState>,
    bio: Entity<InputState>,
}

pub struct Studio {
    settings: Settings,
    settings_path: Option<PathBuf>,
    client: Option<Client>,
    screen: Screen,
    status: Option<Status>,
    busy: bool,

    url_input: Entity<InputState>,
    password_input: Entity<InputState>,

    posts: Vec<PostSummary>,
    authors: Vec<AuthorDto>,
    filter: Filter,
    search_input: Entity<InputState>,

    draft: Option<Draft>,
    title_input: Entity<InputState>,
    slug_input: Entity<InputState>,
    tags_input: Entity<InputState>,
    summary_input: Entity<InputState>,
    body: Entity<EditorState>,
    show_preview: bool,
    pending: Option<Pending>,
    confirm_delete: bool,

    authors_open: bool,
    author_form: AuthorForm,

    _subscriptions: Vec<Subscription>,
}

impl Studio {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let settings_path = Settings::default_path();
        let settings = settings_path
            .as_deref()
            .map(Settings::load)
            .unwrap_or_default();

        let input = |placeholder: &str, window: &mut Window, cx: &mut Context<Self>| {
            let placeholder = placeholder.to_owned();
            cx.new(|cx| InputState::new(window, cx).placeholder(placeholder))
        };
        let url_input = input("https://example.com", window, cx);
        url_input.update(cx, |s, cx| {
            s.set_value(settings.site_url.clone(), window, cx)
        });
        let password_input = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Password")
                .masked(true)
        });
        let search_input = input("Search posts", window, cx);
        let title_input = input("Title", window, cx);
        let slug_input = input("slug-in-the-address", window, cx);
        let tags_input = input("Tags, separated by commas", window, cx);
        let summary_input = input("One-sentence summary for previews (optional)", window, cx);
        let body = cx.new(|cx| EditorState::new(window, cx).language("markdown"));
        let author_form = AuthorForm {
            editing: None,
            name: input("Name", window, cx),
            email: input("Email (optional)", window, cx),
            linkedin: input("LinkedIn URL (optional)", window, cx),
            bio: input("Short bio (optional)", window, cx),
        };

        let mut subs = Vec::new();
        subs.push(
            cx.subscribe_in(&password_input, window, |this, _, e: &InputEvent, w, cx| {
                if let InputEvent::PressEnter { .. } = e {
                    this.login(w, cx);
                }
            }),
        );
        subs.push(
            cx.subscribe_in(&search_input, window, |_, _, e: &InputEvent, _, cx| {
                if let InputEvent::Change = e {
                    cx.notify();
                }
            }),
        );
        subs.push(
            cx.subscribe_in(&title_input, window, |this, s, e: &InputEvent, w, cx| {
                if let InputEvent::Change = e {
                    let value = s.read(cx).value().to_string();
                    let Some(d) = this.draft.as_mut() else { return };
                    if d.fields.title == value {
                        return;
                    }
                    d.set_title(&value);
                    let slug = d.fields.slug.clone();
                    this.slug_input.update(cx, |s, cx| {
                        if s.value() != slug.as_str() {
                            s.set_value(slug, w, cx);
                        }
                    });
                    cx.notify();
                }
            }),
        );
        subs.push(
            cx.subscribe_in(&slug_input, window, |this, s, e: &InputEvent, _, cx| {
                if let InputEvent::Change = e {
                    let value = s.read(cx).value().to_string();
                    // Ignore the change we made ourselves when the title moved.
                    if let Some(d) = this.draft.as_mut()
                        && d.fields.slug != value
                    {
                        d.set_slug(&value);
                        cx.notify();
                    }
                }
            }),
        );
        subs.push(
            cx.subscribe_in(&tags_input, window, |this, s, e: &InputEvent, _, cx| {
                if let InputEvent::Change = e {
                    let value = s.read(cx).value().to_string();
                    if let Some(d) = this.draft.as_mut() {
                        d.fields.tags = value;
                        cx.notify();
                    }
                }
            }),
        );
        subs.push(
            cx.subscribe_in(&summary_input, window, |this, s, e: &InputEvent, _, cx| {
                if let InputEvent::Change = e {
                    let value = s.read(cx).value().to_string();
                    if let Some(d) = this.draft.as_mut() {
                        d.fields.summary = value;
                        cx.notify();
                    }
                }
            }),
        );
        subs.push(
            cx.subscribe_in(&body, window, |this, s, e: &InputEvent, _, cx| {
                if let InputEvent::Change = e {
                    let value = s.read(cx).value().to_string();
                    if let Some(d) = this.draft.as_mut() {
                        d.fields.markdown = value;
                        cx.notify();
                    }
                }
            }),
        );

        let mut this = Self {
            settings,
            settings_path,
            client: None,
            screen: Screen::Login,
            status: None,
            busy: false,
            url_input,
            password_input,
            posts: Vec::new(),
            authors: Vec::new(),
            filter: Filter::All,
            search_input,
            draft: None,
            title_input,
            slug_input,
            tags_input,
            summary_input,
            body,
            show_preview: true,
            pending: None,
            confirm_delete: false,
            authors_open: false,
            author_form,
            _subscriptions: subs,
        };
        this.resume_session(window, cx);
        this
    }

    // ------------------------------------------------------------ helpers

    fn set_status(&mut self, text: impl Into<SharedString>, error: bool) {
        self.status = Some(Status {
            text: text.into(),
            error,
        });
    }

    fn save_settings(&mut self) {
        if let Some(path) = &self.settings_path
            && let Err(e) = self.settings.save(path)
        {
            self.set_status(format!("Could not save settings: {e}"), true);
        }
    }

    /// Runs `job` with the API client on a background thread, then `done`
    /// with its result back on the main thread. An expired login sends the
    /// user back to the login screen.
    fn background<R: Send + 'static>(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        job: impl FnOnce(&mut Client) -> Result<R, ClientError> + Send + 'static,
        done: impl FnOnce(&mut Self, R, &mut Window, &mut Context<Self>) + 'static,
    ) {
        let Some(mut client) = self.client.clone() else {
            self.screen = Screen::Login;
            cx.notify();
            return;
        };
        self.busy = true;
        cx.notify();
        let task = cx
            .background_executor()
            .spawn(async move { job(&mut client) });
        cx.spawn_in(window, async move |this, cx| {
            let result = task.await;
            let _ = this.update_in(cx, |this, window, cx| {
                this.busy = false;
                match result {
                    Ok(value) => done(this, value, window, cx),
                    Err(ClientError::Unauthorized) => {
                        this.signed_out("Your login expired. Please log in again.", window, cx)
                    }
                    Err(e) => this.set_status(e.to_string(), true),
                }
                cx.notify();
            });
        })
        .detach();
    }

    // ------------------------------------------------------------ login

    fn resume_session(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let url = self.settings.site_url.clone();
        if url.is_empty() {
            return;
        }
        let Some(token) = keychain::load(&url) else {
            return;
        };
        match Client::new(&url) {
            Ok(client) => {
                self.client = Some(client.with_token(token));
                self.screen = Screen::Main;
                self.reload(window, cx);
            }
            Err(e) => self.set_status(e.to_string(), true),
        }
    }

    fn login(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        let url = self.url_input.read(cx).value().to_string();
        let password = self.password_input.read(cx).value().to_string();
        if password.is_empty() {
            self.set_status("Enter your password.", true);
            cx.notify();
            return;
        }
        let client = match Client::new(&url) {
            Ok(c) => c,
            Err(e) => {
                self.set_status(e.to_string(), true);
                cx.notify();
                return;
            }
        };
        let site = client.base_url().to_owned();
        self.client = Some(client);
        self.background(
            window,
            cx,
            move |c| {
                c.login(&password)?;
                Ok(c.clone())
            },
            move |this, client, window, cx| {
                if let Some(token) = client.token()
                    && let Err(e) = keychain::store(&site, token)
                {
                    this.set_status(e, true);
                }
                this.client = Some(client);
                this.settings.site_url = site;
                this.save_settings();
                this.password_input
                    .update(cx, |s, cx| s.set_value("", window, cx));
                this.screen = Screen::Main;
                this.set_status("Logged in.", false);
                this.reload(window, cx);
            },
        );
    }

    fn logout(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let site = self.settings.site_url.clone();
        keychain::forget(&site);
        if let Some(mut client) = self.client.take() {
            // Revoke the token on the server too; nothing to do if it fails.
            cx.background_executor()
                .spawn(async move {
                    let _ = client.logout();
                })
                .detach();
        }
        self.signed_out("Logged out.", window, cx);
    }

    fn signed_out(&mut self, message: &str, _window: &mut Window, cx: &mut Context<Self>) {
        keychain::forget(&self.settings.site_url);
        self.client = None;
        self.screen = Screen::Login;
        self.posts.clear();
        self.authors.clear();
        self.draft = None;
        self.set_status(message.to_owned(), false);
        cx.notify();
    }

    // ------------------------------------------------------------ loading

    fn reload(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.background(
            window,
            cx,
            |c| Ok((c.list_posts()?, c.list_authors()?)),
            |this, (posts, authors), _, _| {
                this.posts = posts;
                this.authors = authors;
                // Forget default authors that no longer exist.
                let known: Vec<String> = this.authors.iter().map(|a| a.id.clone()).collect();
                this.settings
                    .default_author_ids
                    .retain(|id| known.contains(id));
            },
        );
    }

    fn reload_posts(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.background(
            window,
            cx,
            |c| c.list_posts(),
            |this, posts, _, _| this.posts = posts,
        );
    }

    /// Asks before leaving a post with unsaved changes.
    fn go(&mut self, target: Pending, window: &mut Window, cx: &mut Context<Self>) {
        if self.draft.as_ref().is_some_and(Draft::is_dirty) {
            self.pending = Some(target);
            cx.notify();
            return;
        }
        self.pending = None;
        match target {
            Pending::Open(id) => self.open_post(id, window, cx),
            Pending::New => self.new_post(window, cx),
        }
    }

    fn discard_and_continue(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(target) = self.pending.take() {
            self.draft = None;
            self.go(target, window, cx);
        }
    }

    fn open_post(&mut self, id: String, window: &mut Window, cx: &mut Context<Self>) {
        self.authors_open = false;
        self.background(
            window,
            cx,
            move |c| c.get_post(&id),
            |this, post, window, cx| this.show_draft(Draft::from_detail(&post), window, cx),
        );
    }

    fn new_post(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.authors_open = false;
        let mut authors = self.settings.default_author_ids.clone();
        if authors.is_empty() && self.authors.len() == 1 {
            authors.push(self.authors[0].id.clone());
        }
        self.show_draft(Draft::new(authors), window, cx);
        self.title_input.update(cx, |s, cx| s.focus(window, cx));
    }

    /// Puts a draft into the editor and fills the inputs from it.
    fn show_draft(&mut self, draft: Draft, window: &mut Window, cx: &mut Context<Self>) {
        let f = draft.fields.clone();
        self.draft = Some(draft);
        self.confirm_delete = false;
        self.title_input
            .update(cx, |s, cx| s.set_value(f.title, window, cx));
        self.slug_input
            .update(cx, |s, cx| s.set_value(f.slug, window, cx));
        self.tags_input
            .update(cx, |s, cx| s.set_value(f.tags, window, cx));
        self.summary_input
            .update(cx, |s, cx| s.set_value(f.summary, window, cx));
        self.body
            .update(cx, |s, cx| s.set_value(f.markdown, window, cx));
        cx.notify();
    }

    /// Updates inputs whose text differs from the draft, leaving the others
    /// (and their cursors) alone.
    fn sync_inputs(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(f) = self.draft.as_ref().map(|d| d.fields.clone()) else {
            return;
        };
        for (input, value) in [
            (&self.title_input, f.title),
            (&self.slug_input, f.slug),
            (&self.tags_input, f.tags),
            (&self.summary_input, f.summary),
        ] {
            input.update(cx, |s, cx| {
                if s.value() != value.as_str() {
                    s.set_value(value, window, cx);
                }
            });
        }
        self.body.update(cx, |s, cx| {
            if s.value() != f.markdown.as_str() {
                s.set_value(f.markdown, window, cx);
            }
        });
    }

    // ------------------------------------------------------------ editing

    fn save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(draft) = self.draft.as_ref() else {
            return;
        };
        if self.busy {
            return;
        }
        let problems = draft.problems();
        if !problems.is_empty() {
            self.set_status(problems.join(" "), true);
            cx.notify();
            return;
        }
        let sent = draft.fields.clone();
        let input = draft.to_input();
        let id = draft.id.clone();
        self.background(
            window,
            cx,
            move |c| match id {
                Some(id) => c.update_post(&id, &input),
                None => c.create_post(&input),
            },
            move |this, post: PostDetail, window, cx| {
                if let Some(d) = this.draft.as_mut() {
                    d.mark_saved(&sent, &post);
                }
                // Show the server's cleaned-up values (e.g. lowercase tags).
                this.sync_inputs(window, cx);
                this.set_status("Saved.", false);
                this.reload_posts(window, cx);
            },
        );
    }

    fn toggle_publish(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(draft) = self.draft.as_ref() else {
            return;
        };
        let Some(id) = draft.id.clone() else {
            self.set_status("Save the post before publishing it.", true);
            cx.notify();
            return;
        };
        if draft.is_dirty() {
            self.set_status("Save your changes before publishing.", true);
            cx.notify();
            return;
        }
        let publish = !draft.published;
        self.background(
            window,
            cx,
            move |c| {
                if publish {
                    c.publish_post(&id)
                } else {
                    c.unpublish_post(&id)
                }
            },
            move |this, post, window, cx| {
                if let Some(d) = this.draft.as_mut() {
                    d.mark_published(&post);
                }
                this.set_status(
                    if publish {
                        "Published. It's live on the site."
                    } else {
                        "Unpublished. It's a draft again."
                    },
                    false,
                );
                this.reload_posts(window, cx);
            },
        );
    }

    fn delete(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(draft) = self.draft.as_ref() else {
            return;
        };
        let Some(id) = draft.id.clone() else {
            // Never saved: just close it.
            self.draft = None;
            cx.notify();
            return;
        };
        if !self.confirm_delete {
            self.confirm_delete = true;
            cx.notify();
            return;
        }
        self.background(
            window,
            cx,
            move |c| c.delete_post(&id),
            |this, (), window, cx| {
                this.draft = None;
                this.confirm_delete = false;
                this.set_status("Post deleted.", false);
                this.reload_posts(window, cx);
            },
        );
    }

    fn open_on_site(&mut self, cx: &mut Context<Self>) {
        if let Some(d) = &self.draft
            && d.published
        {
            cx.open_url(&format!("{}{}", self.settings.site_url, d.public_path()));
        }
    }

    // ------------------------------------------------------------ authors

    fn edit_author(
        &mut self,
        author: Option<AuthorDto>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let a = author.clone().unwrap_or(AuthorDto {
            id: String::new(),
            slug: String::new(),
            name: String::new(),
            bio: String::new(),
            avatar: None,
            email: None,
            linkedin: None,
        });
        self.author_form.editing = author.map(|a| a.id);
        let f = &self.author_form;
        f.name.update(cx, |s, cx| s.set_value(a.name, window, cx));
        f.email.update(cx, |s, cx| {
            s.set_value(a.email.unwrap_or_default(), window, cx)
        });
        f.linkedin.update(cx, |s, cx| {
            s.set_value(a.linkedin.unwrap_or_default(), window, cx)
        });
        f.bio.update(cx, |s, cx| s.set_value(a.bio, window, cx));
        cx.notify();
    }

    fn save_author(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let f = &self.author_form;
        let opt = |e: &Entity<InputState>, cx: &Context<Self>| {
            let v = e.read(cx).value().trim().to_owned();
            (!v.is_empty()).then_some(v)
        };
        let input = AuthorInput {
            name: f.name.read(cx).value().to_string(),
            slug: String::new(),
            bio: f.bio.read(cx).value().to_string(),
            avatar: None,
            email: opt(&f.email, cx),
            linkedin: opt(&f.linkedin, cx),
        };
        if input.name.trim().is_empty() {
            self.set_status("The author needs a name.", true);
            cx.notify();
            return;
        }
        let editing = f.editing.clone();
        self.background(
            window,
            cx,
            move |c| match editing {
                Some(id) => c.update_author(&id, &input),
                None => c.create_author(&input),
            },
            |this, author, window, cx| {
                this.set_status(format!("Saved {}.", author.name), false);
                this.edit_author(None, window, cx);
                this.reload(window, cx);
            },
        );
    }

    fn toggle_default_author(&mut self, id: &str) {
        let ids = &mut self.settings.default_author_ids;
        if let Some(i) = ids.iter().position(|a| a == id) {
            ids.remove(i);
        } else {
            ids.push(id.to_owned());
        }
        self.save_settings();
    }

    // ------------------------------------------------------------ views

    fn render_login(&mut self, cx: &mut Context<Self>) -> AnyElement {
        v_flex()
            .size_full()
            .items_center()
            .justify_center()
            .child(
                v_flex()
                    .w(px(380.))
                    .gap_3()
                    .child(
                        div()
                            .text_2xl()
                            .font_weight(FontWeight::BOLD)
                            .child("Portfolio Studio"),
                    )
                    .child(
                        div()
                            .text_color(cx.theme().muted_foreground)
                            .child("Log in to your site to write and publish posts."),
                    )
                    .child(Input::new(&self.url_input))
                    .child(Input::new(&self.password_input))
                    .child(
                        Button::new("login")
                            .primary()
                            .label("Log in")
                            .loading(self.busy)
                            .on_click(cx.listener(|this, _, w, cx| this.login(w, cx))),
                    )
                    .children(self.render_status(cx)),
            )
            .into_any_element()
    }

    fn render_status(&self, cx: &Context<Self>) -> Option<AnyElement> {
        let s = self.status.as_ref()?;
        let color = if s.error {
            cx.theme().danger
        } else {
            cx.theme().muted_foreground
        };
        Some(
            div()
                .text_sm()
                .text_color(color)
                .child(s.text.clone())
                .into_any_element(),
        )
    }

    fn render_sidebar(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let search = self.search_input.read(cx).value().to_string();
        let selected = self.draft.as_ref().and_then(|d| d.id.clone());
        let rows: Vec<AnyElement> =
            post_list::visible(&self.posts, self.filter, &search)
                .into_iter()
                .map(|p| {
                    let id = p.id.clone();
                    let active = selected.as_deref() == Some(p.id.as_str());
                    div()
                        .id(SharedString::from(format!("post-{}", p.id)))
                        .px_3()
                        .py_2()
                        .rounded_md()
                        .cursor_pointer()
                        .when(active, |d| d.bg(cx.theme().accent))
                        .hover(|d| d.bg(cx.theme().accent))
                        .on_click(cx.listener(move |this, _, w, cx| {
                            this.go(Pending::Open(id.clone()), w, cx)
                        }))
                        .child(div().font_weight(FontWeight::MEDIUM).child(p.title.clone()))
                        .child(
                            div()
                                .text_xs()
                                .text_color(cx.theme().muted_foreground)
                                .child(post_list::status_line(p)),
                        )
                        .into_any_element()
                })
                .collect();

        v_flex()
            .w(px(280.))
            .h_full()
            .border_r_1()
            .border_color(cx.theme().border)
            .p_3()
            .gap_2()
            .child(
                Button::new("new-post")
                    .primary()
                    .label("New post")
                    .on_click(cx.listener(|this, _, w, cx| this.go(Pending::New, w, cx))),
            )
            .child(Input::new(&self.search_input))
            .child(h_flex().gap_1().children(Filter::ALL.map(|f| {
                let button = Button::new(SharedString::from(format!("filter-{}", f.label())))
                    .label(f.label())
                    .compact()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.filter = f;
                        cx.notify();
                    }));
                if self.filter == f {
                    button.primary()
                } else {
                    button.ghost()
                }
            })))
            .child(
                div()
                    .id("post-list")
                    .flex_1()
                    .overflow_y_scroll()
                    .children(rows),
            )
            .child(
                h_flex()
                    .gap_2()
                    .child(
                        Button::new("authors")
                            .label("Authors")
                            .ghost()
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.authors_open = !this.authors_open;
                                cx.notify();
                            })),
                    )
                    .child(
                        Button::new("logout")
                            .label("Log out")
                            .ghost()
                            .on_click(cx.listener(|this, _, w, cx| this.logout(w, cx))),
                    ),
            )
            .into_any_element()
    }

    fn render_editor(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let Some(draft) = self.draft.as_ref() else {
            return v_flex()
                .flex_1()
                .items_center()
                .justify_center()
                .text_color(cx.theme().muted_foreground)
                .child("Pick a post on the left, or press ⌘N for a new one.")
                .into_any_element();
        };
        let dirty = draft.is_dirty();
        let published = draft.published;
        let is_new = draft.is_new();
        let state = match (published, dirty) {
            (_, true) => "Unsaved changes",
            (true, false) => "Published",
            (false, false) if is_new => "New draft",
            (false, false) => "Draft, saved",
        };

        let author_boxes: Vec<AnyElement> = self
            .authors
            .iter()
            .map(|a| {
                let id = a.id.clone();
                Checkbox::new(SharedString::from(format!("author-{}", a.id)))
                    .label(a.name.clone())
                    .checked(draft.has_author(&a.id))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Some(d) = this.draft.as_mut() {
                            d.toggle_author(&id);
                            cx.notify();
                        }
                    }))
                    .into_any_element()
            })
            .collect();

        let toolbar = h_flex()
            .gap_2()
            .items_center()
            .child(
                div()
                    .text_sm()
                    .text_color(cx.theme().muted_foreground)
                    .child(state),
            )
            .child(div().flex_1())
            .child(
                Button::new("preview")
                    .label(if self.show_preview {
                        "Hide preview"
                    } else {
                        "Show preview"
                    })
                    .ghost()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.show_preview = !this.show_preview;
                        cx.notify();
                    })),
            )
            .when(published, |t| {
                t.child(
                    Button::new("open-site")
                        .label("Open on site")
                        .ghost()
                        .on_click(cx.listener(|this, _, _, cx| this.open_on_site(cx))),
                )
            })
            .child(
                Button::new("delete")
                    .label(if self.confirm_delete {
                        "Click again to delete"
                    } else {
                        "Delete"
                    })
                    .danger()
                    .on_click(cx.listener(|this, _, w, cx| this.delete(w, cx))),
            )
            .child(
                Button::new("publish")
                    .label(if published { "Unpublish" } else { "Publish" })
                    .outline()
                    .on_click(cx.listener(|this, _, w, cx| this.toggle_publish(w, cx))),
            )
            .child(
                Button::new("save")
                    .primary()
                    .label("Save")
                    .loading(self.busy)
                    .on_click(cx.listener(|this, _, w, cx| this.save(w, cx))),
            );

        let preview = self.show_preview.then(|| {
            div()
                .id("preview")
                .flex_1()
                .min_w_0()
                .h_full()
                .overflow_y_scroll()
                .p_4()
                .border_l_1()
                .border_color(cx.theme().border)
                .child(TextView::markdown(
                    "preview-text",
                    draft.fields.markdown.clone(),
                ))
        });

        v_flex()
            .flex_1()
            .min_w_0()
            .h_full()
            .p_3()
            .gap_2()
            .child(toolbar)
            .when_some(self.pending.clone(), |el, _| {
                el.child(
                    h_flex()
                        .gap_2()
                        .p_2()
                        .rounded_md()
                        .bg(cx.theme().secondary)
                        .items_center()
                        .child("This post has unsaved changes.")
                        .child(div().flex_1())
                        .child(
                            Button::new("discard")
                                .label("Discard changes")
                                .danger()
                                .on_click(
                                    cx.listener(|this, _, w, cx| this.discard_and_continue(w, cx)),
                                ),
                        )
                        .child(
                            Button::new("keep")
                                .label("Keep editing")
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.pending = None;
                                    cx.notify();
                                })),
                        ),
                )
            })
            .child(Input::new(&self.title_input))
            .child(
                h_flex()
                    .gap_2()
                    .child(div().w(px(260.)).child(Input::new(&self.slug_input)))
                    .child(div().flex_1().child(Input::new(&self.tags_input))),
            )
            .child(Input::new(&self.summary_input))
            .child(
                h_flex()
                    .gap_3()
                    .flex_wrap()
                    .child(
                        div()
                            .text_sm()
                            .text_color(cx.theme().muted_foreground)
                            .child("Authors:"),
                    )
                    .children(author_boxes),
            )
            .child(
                // Editor and preview share the width equally; `min_w_0` stops a
                // wide preview from pushing the editor out of view.
                h_flex()
                    .flex_1()
                    .min_w_0()
                    .min_h(px(200.))
                    .overflow_hidden()
                    .border_1()
                    .border_color(cx.theme().border)
                    .rounded_md()
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .h_full()
                            .child(Editor::new(&self.body).h_full()),
                    )
                    .children(preview),
            )
            .children(self.render_status(cx))
            .into_any_element()
    }

    fn render_authors(&mut self, cx: &mut Context<Self>) -> AnyElement {
        let rows: Vec<AnyElement> = self
            .authors
            .iter()
            .map(|a| {
                let author = a.clone();
                let id = a.id.clone();
                let is_default = self.settings.default_author_ids.contains(&a.id);
                h_flex()
                    .gap_3()
                    .py_2()
                    .border_b_1()
                    .border_color(cx.theme().border)
                    .child(
                        v_flex()
                            .flex_1()
                            .child(div().font_weight(FontWeight::MEDIUM).child(a.name.clone()))
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(cx.theme().muted_foreground)
                                    .child(a.email.clone().unwrap_or_default()),
                            ),
                    )
                    .child(
                        Checkbox::new(SharedString::from(format!("default-{}", a.id)))
                            .label("On new posts")
                            .checked(is_default)
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.toggle_default_author(&id);
                                cx.notify();
                            })),
                    )
                    .child(
                        Button::new(SharedString::from(format!("edit-{}", a.id)))
                            .label("Edit")
                            .ghost()
                            .on_click(cx.listener(move |this, _, w, cx| {
                                this.edit_author(Some(author.clone()), w, cx)
                            })),
                    )
                    .into_any_element()
            })
            .collect();
        let editing = self.author_form.editing.is_some();
        let f = &self.author_form;

        v_flex()
            .flex_1()
            .h_full()
            .p_4()
            .gap_3()
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::BOLD)
                    .child("Authors"),
            )
            .child(
                div()
                    .text_sm()
                    .text_color(cx.theme().muted_foreground)
                    .child("People credited on posts. Each gets a profile page on the site."),
            )
            .child(
                div()
                    .id("author-list")
                    .overflow_y_scroll()
                    .max_h(px(320.))
                    .children(rows),
            )
            .child(div().font_weight(FontWeight::MEDIUM).child(if editing {
                "Edit author"
            } else {
                "Add an author"
            }))
            .child(Input::new(&f.name))
            .child(Input::new(&f.email))
            .child(Input::new(&f.linkedin))
            .child(Input::new(&f.bio))
            .child(
                h_flex()
                    .gap_2()
                    .child(
                        Button::new("save-author")
                            .primary()
                            .label(if editing { "Save author" } else { "Add author" })
                            .on_click(cx.listener(|this, _, w, cx| this.save_author(w, cx))),
                    )
                    .when(editing, |el| {
                        el.child(
                            Button::new("cancel-author")
                                .label("Cancel")
                                .ghost()
                                .on_click(
                                    cx.listener(|this, _, w, cx| this.edit_author(None, w, cx)),
                                ),
                        )
                    }),
            )
            .children(self.render_status(cx))
            .into_any_element()
    }
}

impl Render for Studio {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let _ = window;
        let body = match self.screen {
            Screen::Login => self.render_login(cx),
            Screen::Main => {
                let main = if self.authors_open {
                    self.render_authors(cx)
                } else {
                    self.render_editor(cx)
                };
                h_flex()
                    .size_full()
                    .child(self.render_sidebar(cx))
                    .child(main)
                    .into_any_element()
            }
        };
        div()
            .size_full()
            .bg(cx.theme().background)
            .text_color(cx.theme().foreground)
            .on_action(cx.listener(|this, _: &Save, w, cx| this.save(w, cx)))
            .on_action(cx.listener(|this, _: &NewPost, w, cx| {
                if this.screen == Screen::Main {
                    this.go(Pending::New, w, cx)
                }
            }))
            .on_action(cx.listener(|this, _: &TogglePreview, _, cx| {
                this.show_preview = !this.show_preview;
                cx.notify();
            }))
            .on_action(cx.listener(|this, _: &Publish, w, cx| this.toggle_publish(w, cx)))
            .on_action(cx.listener(|this, _: &OpenOnSite, _, cx| this.open_on_site(cx)))
            .child(body)
    }
}
