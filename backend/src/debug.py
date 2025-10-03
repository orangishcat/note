"""
For debugging purposes only
"""

from pathlib import Path

from app.scoring import *


if __name__ == "__main__":
    scores_dir = Path(__file__).parent.parent / "resources" / "scores"
    file = scores_dir / "gymnopedia.scoredata"

    with open(file, "rb") as f:
        (notes := NoteList()).ParseFromString(f.read())

    print(set(p.page for p in notes.notes))
