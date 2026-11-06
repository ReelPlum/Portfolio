//! The parts of Portfolio Studio that don't depend on the window system:
//! editing state, the post list, and settings. They are tested on every
//! platform; the GPUI window code in `ui/` builds on macOS only.

pub mod draft;
pub mod post_list;
pub mod settings;

pub use client::{Client, Error as ClientError};
