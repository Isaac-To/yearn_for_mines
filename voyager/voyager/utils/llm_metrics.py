import json
import os
import time


_ACTIVE_TASK = "UNSET"


def set_active_task(task: str):
    global _ACTIVE_TASK
    _ACTIVE_TASK = task or "UNSET"


def clear_active_task():
    global _ACTIVE_TASK
    _ACTIVE_TASK = "UNSET"


def _as_int(value):
    if value is None:
        return None
    try:
        return int(value)
    except Exception:
        return None


def _extract_usage(ai_message):
    prompt_tokens = None
    completion_tokens = None
    total_tokens = None

    candidates = []
    usage_metadata = getattr(ai_message, "usage_metadata", None)
    if isinstance(usage_metadata, dict):
        candidates.append(usage_metadata)

    response_metadata = getattr(ai_message, "response_metadata", None)
    if isinstance(response_metadata, dict):
        candidates.append(response_metadata)
        for key in ("token_usage", "usage", "usage_metadata"):
            nested = response_metadata.get(key)
            if isinstance(nested, dict):
                candidates.append(nested)

    additional_kwargs = getattr(ai_message, "additional_kwargs", None)
    if isinstance(additional_kwargs, dict):
        candidates.append(additional_kwargs)
        for key in ("token_usage", "usage", "usage_metadata"):
            nested = additional_kwargs.get(key)
            if isinstance(nested, dict):
                candidates.append(nested)

    for usage in candidates:
        if prompt_tokens is None:
            prompt_tokens = _as_int(
                usage.get("prompt_tokens")
                or usage.get("input_tokens")
                or usage.get("prompt_eval_count")
            )
        if completion_tokens is None:
            completion_tokens = _as_int(
                usage.get("completion_tokens")
                or usage.get("output_tokens")
                or usage.get("eval_count")
            )
        if total_tokens is None:
            total_tokens = _as_int(usage.get("total_tokens"))

    if total_tokens is None and (
        prompt_tokens is not None or completion_tokens is not None
    ):
        total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)

    return {
        "prompt_tokens": prompt_tokens or 0,
        "completion_tokens": completion_tokens or 0,
        "total_tokens": total_tokens or 0,
    }


def log_llm_call(*, agent: str, phase: str, ai_message, elapsed_sec: float, ckpt_dir: str):
    usage = _extract_usage(ai_message)
    record = {
        "ts": time.time(),
        "task": _ACTIVE_TASK,
        "agent": agent,
        "phase": phase,
        "elapsed_sec": round(float(elapsed_sec), 4),
        "prompt_tokens": usage["prompt_tokens"],
        "completion_tokens": usage["completion_tokens"],
        "total_tokens": usage["total_tokens"],
    }

    os.makedirs(ckpt_dir, exist_ok=True)
    path = os.path.join(ckpt_dir, "llm_metrics.jsonl")
    with open(path, "a", encoding="utf-8") as fp:
        fp.write(json.dumps(record, ensure_ascii=True) + "\n")

    print(
        "[LLM_METRICS] "
        f"task={record['task']} agent={agent} phase={phase} "
        f"prompt_tokens={record['prompt_tokens']} "
        f"completion_tokens={record['completion_tokens']} "
        f"total_tokens={record['total_tokens']} elapsed_sec={record['elapsed_sec']}"
    )
