import os
import sys
import types
import warnings

import numpy as np
import pytest

from app.augmentation import glm_ocr


class FakeInputs(dict):
    def to(self, device: str):
        self["moved_to"] = device
        return self


class FakeNoGrad:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return False


def install_fake_transformers(monkeypatch, *, cuda_available=True, generated_text=" z9 "):
    calls = {
        "processor_from_pretrained": [],
        "model_from_pretrained": [],
        "messages": [],
        "generate": [],
        "model_to": [],
    }

    fake_torch = types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: cuda_available),
        float16="fake-float16",
        bfloat16="fake-bfloat16",
        no_grad=lambda: FakeNoGrad(),
    )

    class FakeProcessor:
        @classmethod
        def from_pretrained(cls, model_id_or_path, **kwargs):
            calls["processor_from_pretrained"].append((model_id_or_path, kwargs))
            return cls()

        def apply_chat_template(self, messages, **kwargs):
            calls["messages"].append((messages, kwargs))
            return FakeInputs(input_ids=[[1, 2, 3]], attention_mask=[[1, 1, 1]])

        def batch_decode(self, generated_ids, **kwargs):
            return [generated_text]

    class FakeModel:
        @classmethod
        def from_pretrained(cls, model_id_or_path, **kwargs):
            calls["model_from_pretrained"].append((model_id_or_path, kwargs))
            return cls()

        def to(self, device):
            calls["model_to"].append(device)
            return self

        def eval(self):
            return self

        def generate(self, **kwargs):
            calls["generate"].append(kwargs)
            return [[1, 2, 3, 4]]

    fake_transformers = types.SimpleNamespace(
        AutoProcessor=FakeProcessor,
        AutoModelForImageTextToText=FakeModel,
    )
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "transformers", fake_transformers)
    return calls


def test_previous_daemon_reader_api_is_removed():
    old_reader_name = "Ol" + "lamaGlmReader"
    old_factory_name = "get_" + "ol" + "lama" + "_glm_reader"
    assert not hasattr(glm_ocr, old_reader_name)
    assert not hasattr(glm_ocr, old_factory_name)


def test_factory_uses_new_signature_and_caches_by_configuration(monkeypatch):
    install_fake_transformers(monkeypatch)
    glm_ocr.get_craft_glm_reader.cache_clear()

    first = glm_ocr.get_craft_glm_reader(
        model_id_or_path="/models/glm-ocr",
        device="cuda",
        dtype="float16",
        local_files_only=True,
    )
    second = glm_ocr.get_craft_glm_reader(
        model_id_or_path="/models/glm-ocr",
        device="cuda",
        dtype="float16",
        local_files_only=True,
    )

    assert first is second
    assert first._glm_backend is None


def test_read_crop_uses_transformers_chat_template(monkeypatch):
    calls = install_fake_transformers(monkeypatch, generated_text=" z9 ")
    reader = glm_ocr.CraftGlmReader(
        model_id_or_path="/models/glm-ocr",
        device="cuda",
        dtype="float16",
        local_files_only=True,
    )

    result = reader._read_crop(np.zeros((8, 8, 3), dtype=np.uint8))

    assert result == "Z"
    assert calls["processor_from_pretrained"] == [
        ("/models/glm-ocr", {"local_files_only": True})
    ]
    assert calls["model_from_pretrained"] == [
        (
            "/models/glm-ocr",
            {"local_files_only": True, "torch_dtype": "fake-float16"},
        )
    ]
    assert calls["model_to"] == ["cuda"]
    messages, template_kwargs = calls["messages"][0]
    assert messages[0]["role"] == "user"
    assert messages[0]["content"][0]["type"] == "image"
    assert messages[0]["content"][1]["type"] == "text"
    assert template_kwargs["add_generation_prompt"] is True
    assert template_kwargs["tokenize"] is True
    assert template_kwargs["return_dict"] is True
    assert template_kwargs["return_tensors"] == "pt"
    assert calls["generate"][0]["do_sample"] is False
    assert calls["generate"][0]["max_new_tokens"] == 8


def test_cuda_request_falls_back_to_cpu_when_unavailable(monkeypatch):
    calls = install_fake_transformers(monkeypatch, cuda_available=False)
    reader = glm_ocr.CraftGlmReader(device="cuda")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        assert reader._read_crop(np.zeros((8, 8, 3), dtype=np.uint8)) == "Z"

    assert calls["model_to"] == ["cpu"]
    assert any("CUDA" in str(item.message) and "CPU" in str(item.message) for item in caught)


def test_model_load_failure_is_not_swallowed(monkeypatch):
    fake_torch = types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: True),
        no_grad=lambda: FakeNoGrad(),
    )

    class FakeProcessor:
        @classmethod
        def from_pretrained(cls, model_id_or_path, **kwargs):
            return cls()

    class FailingModel:
        @classmethod
        def from_pretrained(cls, model_id_or_path, **kwargs):
            raise RuntimeError("model unavailable")

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(
        sys.modules,
        "transformers",
        types.SimpleNamespace(
            AutoProcessor=FakeProcessor,
            AutoModelForImageTextToText=FailingModel,
        ),
    )
    reader = glm_ocr.CraftGlmReader()

    with pytest.raises(RuntimeError, match="model unavailable"):
        reader._read_crop(np.zeros((8, 8, 3), dtype=np.uint8))


def test_crop_inference_failure_returns_empty_character(monkeypatch):
    install_fake_transformers(monkeypatch)

    def fail_generate(**kwargs):
        raise RuntimeError("generation failed")

    reader = glm_ocr.CraftGlmReader()
    backend = reader._get_glm_backend()
    backend._model.generate = fail_generate

    assert reader._read_crop(np.zeros((8, 8, 3), dtype=np.uint8)) == ""


@pytest.mark.skipif(
    os.environ.get("BACKEND_RUN_REAL_MODEL_TESTS") != "1",
    reason="real GLM-OCR test requires opt-in model download/cache",
)
def test_real_glm_ocr_crop_reader_contract():
    glm_ocr.get_craft_glm_reader.cache_clear()
    reader = glm_ocr.get_craft_glm_reader()

    result = reader._read_crop(np.full((32, 32, 3), 255, dtype=np.uint8))

    assert isinstance(result, str)
    assert len(result) <= 1
