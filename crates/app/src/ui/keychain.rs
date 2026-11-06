//! Keeps the login token in the macOS Keychain, one entry per site.

const SERVICE: &str = "Portfolio Studio";

pub fn load(site_url: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, site_url)
        .ok()?
        .get_password()
        .ok()
}

pub fn store(site_url: &str, token: &str) -> Result<(), String> {
    keyring::Entry::new(SERVICE, site_url)
        .and_then(|e| e.set_password(token))
        .map_err(|e| format!("Could not save the login in the Keychain: {e}"))
}

pub fn forget(site_url: &str) {
    if let Ok(entry) = keyring::Entry::new(SERVICE, site_url) {
        let _ = entry.delete_credential();
    }
}
