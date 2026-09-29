"""Loopback-only TTS comparison lab; never imported by the Directo server."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

MAX_TEXT = 500
MODELS_DIR = Path('/models')
DEFAULT_PIPER_VOICE = 'es_ES-davefx-medium'
VOICE_PATTERN = re.compile(r'^es-[A-Z]{2}-[A-Za-z]+Neural$')
PIPER_VOICE_PATTERN = re.compile(r'^es_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$')
ESPEAK_VOICES = {'es', 'es-419', 'ca', 'eu', 'ja', 'pt'}


def validate_request(data):
    if not isinstance(data, dict):
        raise ValueError('Se necesita un objeto JSON.')
    engine = data.get('engine')
    text = data.get('text')
    if engine not in ('edge', 'piper', 'espeak') or not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise ValueError('Selecciona motor y escribe de 1 a 500 caracteres.')
    pitch = data.get('pitch_hz', 0)
    if isinstance(pitch, bool) or not isinstance(pitch, int) or not -100 <= pitch <= 100:
        raise ValueError('El tono debe estar entre -100 y +100 Hz.')
    if engine == 'piper' and pitch != 0:
        raise ValueError('Piper no admite tono independiente en esta prueba; usa Edge.')
    if engine == 'espeak' and pitch != 0:
        raise ValueError('Este motor no usa el control de tono en Hz; usa Edge solo para la comparación.')
    default_voice = {'edge': 'es-ES-ElviraNeural', 'piper': DEFAULT_PIPER_VOICE, 'espeak': 'es'}
    voice = data.get('voice', default_voice[engine])
    if engine == 'edge' and (not isinstance(voice, str) or not VOICE_PATTERN.fullmatch(voice)):
        raise ValueError('Selecciona una voz española válida de Edge.')
    if engine == 'piper' and (not isinstance(voice, str) or not PIPER_VOICE_PATTERN.fullmatch(voice)):
        raise ValueError('Selecciona una voz española válida de Piper.')
    if engine == 'espeak' and (not isinstance(voice, str) or voice not in ESPEAK_VOICES):
        raise ValueError('Selecciona una voz válida de eSpeak NG.')
    return {'engine': engine, 'text': text.strip(), 'pitch_hz': pitch, 'voice': voice}


def build_command(request, output):
    if request['engine'] == 'edge':
        return ['edge-tts', '--voice', request['voice'], '--text', request['text'],
                f"--pitch={request['pitch_hz']:+d}Hz", '--rate=+0%', '--write-media', output]
    if request['engine'] == 'espeak':
        return ['espeak-ng', '-v', request['voice'], '-w', output, '--stdin']
    return ['python', '-m', 'piper', '-m', str(piper_model(request)), '-f', output]


def piper_model(request):
    return MODELS_DIR / f"{request['voice']}.onnx"


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type='text/plain; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != '/':
            return self.respond(404, b'No encontrado')
        self.respond(200, Path(__file__).with_name('index.html').read_bytes(), 'text/html; charset=utf-8')

    def do_POST(self):
        if self.path != '/synthesize':
            return self.respond(404, b'No encontrado')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 1 or size > 4096 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                raise ValueError('Solicitud JSON demasiado grande o no válida.')
            request = validate_request(json.loads(self.rfile.read(size)))
            if request['engine'] == 'piper' and not piper_model(request).is_file():
                raise ValueError(f"Falta el modelo {request['voice']}.onnx en models/.")
            extension = '.mp3' if request['engine'] == 'edge' else '.wav'
            with tempfile.TemporaryDirectory() as folder:
                output = str(Path(folder) / ('voice' + extension))
                subprocess.run(build_command(request, output), check=True, timeout=45,
                               input=request['text'] if request['engine'] in ('piper', 'espeak') else None,
                               text=request['engine'] in ('piper', 'espeak'),
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                audio = Path(output).read_bytes()
            self.respond(200, audio, 'audio/mpeg' if extension == '.mp3' else 'audio/wav')
        except (ValueError, json.JSONDecodeError) as error:
            self.respond(400, str(error).encode('utf-8'))
        except (subprocess.SubprocessError, OSError):
            self.respond(502, 'El motor TTS no pudo generar audio.'.encode('utf-8'))


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8765), Handler).serve_forever()
