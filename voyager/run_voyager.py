import os
import requests

from voyager import Voyager


os.chdir(os.path.dirname(os.path.abspath(__file__)))


def prewarm_ollama(model: str = "gemma4:26b"):
    payload = {
        "model": model,
        "prompt": "Reply with: ready",
        "stream": False,
        "options": {"num_predict": 8},
    }
    requests.post("http://localhost:11434/api/generate", json=payload, timeout=1800)


prewarm_ollama("gemma4:26b")

voyager = Voyager(
    mc_port=54321,
    openai_api_request_timeout=1800,
)

voyager.inference(
    sub_goals=[
        "Mine 4 wood logs",
        "Craft a crafting table",
    ],
)
