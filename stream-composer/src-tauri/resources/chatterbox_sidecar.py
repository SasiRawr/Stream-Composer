# ============================================================================
# CHATTERBOX SIDECAR - a tiny standalone HTTP server wrapping the
# chatterbox-tts PyPI package (Resemble AI, MIT license - both the code
# and the published model weights on HuggingFace are MIT), bundled into
# Stream Composer Suite as a fourth local Chat + TTS Overlay voice
# provider, alongside Kokoro (kokoro-sidecar/, a Rust binary).
#
# WHY PYTHON, UNLIKE KOKORO'S RUST SIDECAR: Chatterbox has no ONNX export
# and no Rust crate - it only runs via PyTorch. Real feasibility-checked
# before committing to this (2026-08-11): pip install works cleanly,
# real CPU inference produces genuine audio in a few seconds for a short
# sentence. The real cost is size - PyTorch + this package's dependency
# tree is roughly 1-3GB installed, versus Kokoro's ~66MB binary + ~110MB
# model. Harvey explicitly approved this tradeoff ("build it anyway,
# opt-in heavy download, same pattern as Kokoro's model").
#
# NOTE ON "TURBO": the installed PyPI package (chatterbox-tts 0.1.7) only
# exposes a `ChatterboxTTS` class - no separate `ChatterboxTurboTTS`.
# The "Turbo" variant referenced in earlier research appears to exist on
# the project's GitHub main branch but isn't in the published PyPI
# release used here. This sidecar uses the standard model, not
# specifically confirmed as "Turbo" - worth re-checking if a Turbo
# checkpoint becomes available via a stable install path later.
#
# ARCHITECTURE: identical contract to kokoro-sidecar - GET /health,
# POST /synthesize ({text, ...}) -> audio/wav bytes. Runs on port 5758
# (Kokoro uses 5757) so both can run simultaneously without conflict,
# letting Harvey A/B them directly. Spawned DETACHED from the editor app
# for the same reason as Kokoro's sidecar - see kokoro-sidecar/src/main.rs's
# header comment for the full lifecycle reasoning, identical here.
#
# Uses FastAPI + uvicorn - NOT a new dependency, both are already pulled
# in transitively by chatterbox-tts itself (for its own demo UI), so this
# adds no extra install weight.
# ============================================================================

import io
import sys

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, PlainTextResponse

app = FastAPI()
# Permissive CORS is deliberate, not an oversight - this only ever binds
# to 127.0.0.1, so the exposure is "anything already running on this
# machine," same reasoning as kokoro-sidecar's identical CORS setup.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_model = None


def get_model():
    global _model
    if _model is None:
        from chatterbox.tts import ChatterboxTTS
        print("chatterbox-sidecar: loading model (first call only)...", file=sys.stderr)
        _model = ChatterboxTTS.from_pretrained(device="cpu")
        print("chatterbox-sidecar: model loaded", file=sys.stderr)
    return _model


@app.get("/health")
def health():
    return PlainTextResponse("ok")


@app.post("/synthesize")
async def synthesize(request: Request):
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return Response(content='{"error":"text must not be empty"}', status_code=400, media_type="application/json")

    try:
        model = get_model()
        wav = model.generate(text)
        samples = wav.squeeze(0).cpu().numpy().astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, samples, model.sr, format="WAV")
        return Response(content=buf.getvalue(), media_type="audio/wav")
    except Exception as e:
        print(f"chatterbox-sidecar: synth failed: {e}", file=sys.stderr)
        return Response(content='{"error":"synthesis failed"}', status_code=500, media_type="application/json")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5758
    # Load the model eagerly at startup (not lazily on first request) so
    # the first real chat message doesn't eat a ~10-20s model-load delay
    # on top of synthesis - same reasoning as Kokoro's sidecar loading its
    # model before binding the HTTP listener.
    get_model()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
