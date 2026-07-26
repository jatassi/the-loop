//! Dependency-free loopback static HTTP server for release fixtures.
//!
//! Serves files under a root directory over `127.0.0.1` using only `std` — no
//! HTTP crate, no async runtime. [`serve`] binds `TcpListener` to
//! `127.0.0.1:0` so the OS picks a free port (discovered from the listener
//! after bind, never hardcoded) and returns a [`Handle`] whose `base_url()`
//! and `request_count()` a test can poll. Dropping the `Handle` stops the
//! background thread and frees the port — no explicit shutdown call needed.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

/// How long the accept loop sleeps between nonblocking `accept()` polls while
/// waiting for either a connection or the stop signal.
const POLL_INTERVAL: Duration = Duration::from_millis(5);

/// A running loopback file server plus the counters a test needs to drive it.
///
/// Dropping the handle stops the serving thread and closes the listening
/// socket; there is no separate shutdown method.
pub struct Handle {
    base_url: String,
    request_count: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Handle {
    /// `http://127.0.0.1:<port>` for the bound listener.
    #[must_use]
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Number of requests the server has answered so far.
    #[must_use]
    pub fn request_count(&self) -> usize {
        self.request_count.load(Ordering::SeqCst)
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            // Join synchronously so that by the time `drop` returns the
            // listener (owned by the thread's closure) has already been
            // dropped and the port is free.
            let _ = thread.join();
        }
    }
}

/// Start serving files under `root` on an OS-assigned loopback port.
///
/// The returned [`Handle`] stays live (and the port stays bound) for as long
/// as it is held; drop it to stop the server.
#[must_use]
pub fn serve(root: impl Into<PathBuf>) -> Handle {
    let root = root.into();
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback listener");
    listener
        .set_nonblocking(true)
        .expect("set listener nonblocking");
    let port = listener
        .local_addr()
        .expect("read bound listener address")
        .port();

    let stop = Arc::new(AtomicBool::new(false));
    let request_count = Arc::new(AtomicUsize::new(0));

    let thread_stop = Arc::clone(&stop);
    let thread_count = Arc::clone(&request_count);
    let thread = thread::spawn(move || {
        while !thread_stop.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => handle_connection(stream, &root, &thread_count),
                Err(ref err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(POLL_INTERVAL);
                }
                Err(_) => break,
            }
        }
    });

    Handle {
        base_url: format!("http://127.0.0.1:{port}"),
        request_count,
        stop,
        thread: Some(thread),
    }
}

/// Read one HTTP/1.x request off `stream`, answer it, and count it.
fn handle_connection(mut stream: TcpStream, root: &Path, request_count: &Arc<AtomicUsize>) {
    // The listener is nonblocking so its accept loop can poll the stop flag;
    // the per-connection socket goes back to blocking reads/writes.
    if stream.set_nonblocking(false).is_err() {
        return;
    }
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

    let Ok(cloned) = stream.try_clone() else {
        return;
    };
    let mut reader = BufReader::new(cloned);

    let mut request_line = String::new();
    if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
        return;
    }

    // Drain the remaining header lines; this server is GET-only and static,
    // so headers carry nothing it needs.
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) if line == "\r\n" || line == "\n" => break,
            Ok(_) => {}
        }
    }

    let body = requested_path(&request_line).and_then(|path| read_under_root(root, &path));
    request_count.fetch_add(1, Ordering::SeqCst);

    let response = body.map_or_else(
        || response_bytes(404, "Not Found", &[]),
        |bytes| response_bytes(200, "OK", &bytes),
    );
    let _ = stream.write_all(&response);
    let _ = stream.flush();
}

/// Pull the requested path (with the leading `/` stripped) out of a GET
/// request line; anything else (bad method, malformed line) yields `None`,
/// which the caller turns into a 404.
fn requested_path(request_line: &str) -> Option<String> {
    let mut parts = request_line.split_whitespace();
    if parts.next()? != "GET" {
        return None;
    }
    let raw_path = parts.next()?;
    Some(raw_path.trim_start_matches('/').to_string())
}

/// Read `relative` under `root`, refusing empty paths and `..` segments.
fn read_under_root(root: &Path, relative: &str) -> Option<Vec<u8>> {
    if relative.is_empty() || relative.split('/').any(|segment| segment == "..") {
        return None;
    }
    std::fs::read(root.join(relative)).ok()
}

/// Render a minimal `HTTP/1.1` response with an exact `Content-Length`.
fn response_bytes(status: u16, reason: &str, body: &[u8]) -> Vec<u8> {
    let mut response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    response.extend_from_slice(body);
    response
}
