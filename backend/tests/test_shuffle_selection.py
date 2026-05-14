from app.augmentation.shuffle import (
    _build_shuffle_combos,
    _select_shuffle_combos,
)


def _all_combos() -> list[tuple[int, int, int, int]]:
    return _build_shuffle_combos(part0_size=4, part1_size=6)


def test_select_shuffle_combos_can_preserve_legacy_order() -> None:
    combos = _all_combos()

    selected = _select_shuffle_combos(
        combos,
        count=5,
        randomize=False,
        seed=999,
    )

    assert selected == [
        (0, 1, 0, 1),
        (0, 1, 0, 2),
        (0, 1, 0, 3),
        (0, 1, 0, 4),
        (0, 1, 0, 5),
    ]


def test_select_shuffle_combos_reuses_seeded_random_order() -> None:
    combos = _all_combos()

    first = _select_shuffle_combos(combos, count=5, seed=42)
    second = _select_shuffle_combos(combos, count=5, seed=42)

    assert first == second


def test_select_shuffle_combos_changes_with_different_seed() -> None:
    combos = _all_combos()

    first = _select_shuffle_combos(combos, count=5, seed=1)
    second = _select_shuffle_combos(combos, count=5, seed=2)

    assert first != second


def test_select_shuffle_combos_has_no_duplicates() -> None:
    selected = _select_shuffle_combos(_all_combos(), count=50, seed=123)

    assert len(selected) == len(set(selected))


def test_select_shuffle_combos_can_select_all_combos_once() -> None:
    combos = _all_combos()

    selected = _select_shuffle_combos(combos, count=90, seed=123)

    assert len(selected) == 90
    assert set(selected) == set(combos)
