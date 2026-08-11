# kokoro-sidecar

A tiny standalone HTTP server wrapping [kokoro-en](https://github.com/pguso/kokoro)
(Apache-2.0), bundled into Stream Composer Suite as a Tauri `externalBin`
sidecar so the Chat + TTS Overlay can offer a fully local/offline voice
option — no AWS key, no relay, no per-character cost.

See `src/main.rs`'s header comment for the full architecture (why this is
a separate HTTP server rather than a Tauri command, why it's spawned
detached from the editor app's lifetime).

## Why this binary is committed to git despite its size (~66MB)

This project's normal rule is "don't commit build outputs" — installers
go to GitHub Releases, `Tests/` is gitignored, etc. This is a deliberate
exception: `externalBin` requires the compiled binary to already exist
on disk *before* `npm run tauri build` runs — it isn't something Cargo
fetches/builds automatically as part of the main app's build, the way a
normal dependency would be. Without committing it, cloning this repo
fresh would leave the app unbuildable until someone redoes the full
native-toolchain setup below. That's a worse outcome than a large binary
in git history. Revisit this if a CI-based rebuild pipeline gets set up
later.

## Rebuilding it (needed if this crate's code changes)

This crate has a heavier native build chain than the rest of this
project, because of `espeak-rs-sys` (a transitive dependency, used as a
phoneme fallback for out-of-dictionary words). Real prerequisites hit
and fixed while first building this, in order:

1. **LLVM/clang** (`winget install --id LLVM.LLVM`) — needed for
   `bindgen` to generate FFI bindings. Set `LIBCLANG_PATH` to its `bin`
   folder (e.g. `C:\Program Files\LLVM\bin`).
2. **CMake** (`winget install --id Kitware.CMake`) — needed to build
   `espeak-ng` from source. On this machine, CMake's Visual Studio
   generator auto-detection picked a generator name
   (`"Visual Studio 18 2026"`) that CMake itself doesn't recognize as a
   real generator — force it explicitly instead:
   `CMAKE_GENERATOR="Visual Studio 17 2022"` (matching whatever VS
   Build Tools instance `vswhere.exe -all` actually shows as
   `isComplete: true` — check that instead of guessing).
3. **Windows `MAX_PATH` (260 char) limit** — this repo's own path is
   already long (`...\Stream-Composer\stream-composer\kokoro-sidecar\`),
   and CMake's own generated temp-file paths during `espeak-ng`'s build
   push well past 260 characters, failing with an
   `MSB4018`/"exceeds the OS max path limit" error. Fixed without
   touching Windows' system-wide long-path registry setting — just point
   `CARGO_TARGET_DIR` somewhere short, e.g. `C:\kbuild`.

Full known-working build command from this crate's folder (Git Bash):

```bash
export LIBCLANG_PATH="C:\Program Files\LLVM\bin"
export CMAKE_GENERATOR="Visual Studio 17 2022"
export CARGO_TARGET_DIR="C:\kbuild"
cargo build --release
```

Then copy the result into place for Tauri's `externalBin` to find:

```bash
cp "C:/kbuild/release/kokoro-sidecar.exe" \
   "../src-tauri/binaries/kokoro-sidecar-x86_64-pc-windows-msvc.exe"
```

(The `-x86_64-pc-windows-msvc` suffix is Tauri's required target-triple
naming for `externalBin` — get the exact string for a different machine
via `rustc --print host-tuple`, don't assume it's always this one.)

## Testing it standalone (no Tauri app needed)

The model/voices aren't bundled anywhere in this repo (~92MB+, downloaded
on first use by the main app instead — see `kokoro_download_model` in
`src-tauri/src/lib.rs`). To test the sidecar directly:

```bash
mkdir -p test-model/voices
curl -sL -o test-model/model_quantized.onnx \
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx"
curl -sL -o test-model/voices/af_heart.bin \
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/af_heart.bin"

./target/release/kokoro-sidecar.exe \
  "$(pwd)/test-model/model_quantized.onnx" "$(pwd)/test-model/voices" 5757

# In another terminal:
curl http://127.0.0.1:5757/health
curl -X POST http://127.0.0.1:5757/synthesize \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voice":"af_heart"}' \
  -o test.wav
```

Confirmed working 2026-08-11: real model loaded, fell back gracefully
CUDA → DirectML → CPU on this machine (no GPU execution provider could
actually run the model here), and produced a genuine 24kHz WAV file from
real text — not a stub/mock. `test-model/` is gitignored, re-download it
per-machine rather than committing model weights.
