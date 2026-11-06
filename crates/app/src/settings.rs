//! Settings kept between launches. The login token is not stored here but
//! in the macOS Keychain (see `ui::keychain`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    /// The site's address, e.g. `https://example.com`.
    #[serde(default)]
    pub site_url: String,
    /// Authors ticked on new posts.
    #[serde(default)]
    pub default_author_ids: Vec<String>,
}

impl Settings {
    /// `~/Library/Application Support/Portfolio Studio/settings.json` on a Mac.
    pub fn default_path() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join("Portfolio Studio").join("settings.json"))
    }

    /// Reads the settings, or the defaults if the file is missing or broken.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = serde_json::to_string_pretty(self).map_err(std::io::Error::other)?;
        // Write to a temporary file first so a crash never leaves half a file.
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, text)?;
        std::fs::rename(tmp, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("settings.json");
        let s = Settings {
            site_url: "https://example.com".into(),
            default_author_ids: vec!["a".into()],
        };
        s.save(&path).unwrap();
        assert_eq!(Settings::load(&path), s);
    }

    #[test]
    fn missing_or_broken_files_give_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(Settings::load(&path), Settings::default());
        std::fs::write(&path, "{ not json").unwrap();
        assert_eq!(Settings::load(&path), Settings::default());
    }
}
