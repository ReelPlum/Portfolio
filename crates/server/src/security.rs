//! Security headers added to every response.

use axum::Router;
use axum::http::{HeaderName, HeaderValue, header};
use tower_http::set_header::SetResponseHeaderLayer;

/// Content Security Policy: only our own scripts, styles, fonts and images.
/// `style-src-attr` allows inline `style="…"` attributes (KaTeX uses them for
/// layout) but not `<style>` elements or any inline script.
pub const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self'; \
style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; \
connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; \
frame-ancestors 'none'";

/// The same policy for pages with Mermaid diagrams, which need inline
/// `<style>` elements. Scripts stay locked down.
pub const CSP_WITH_INLINE_STYLES: &str = "default-src 'self'; script-src 'self'; \
style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; \
connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; \
frame-ancestors 'none'";

pub fn headers() -> Vec<(HeaderName, &'static str)> {
    vec![
        (header::CONTENT_SECURITY_POLICY, CSP),
        (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        (header::REFERRER_POLICY, "strict-origin-when-cross-origin"),
        (header::X_FRAME_OPTIONS, "DENY"),
        (
            HeaderName::from_static("permissions-policy"),
            "camera=(), microphone=(), geolocation=(), interest-cohort=()",
        ),
        (
            HeaderName::from_static("cross-origin-opener-policy"),
            "same-origin",
        ),
        // HSTS is only honoured over HTTPS, which Caddy provides in production.
        (
            header::STRICT_TRANSPORT_SECURITY,
            "max-age=31536000; includeSubDomains",
        ),
    ]
}

pub fn apply<S: Clone + Send + Sync + 'static>(mut router: Router<S>) -> Router<S> {
    for (name, value) in headers() {
        router = router.layer(SetResponseHeaderLayer::if_not_present(
            name,
            HeaderValue::from_static(value),
        ));
    }
    router
}
