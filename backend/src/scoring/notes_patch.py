import os


def note_copy(self, other):
    self.pitch = other.pitch
    self.start_time = other.start_time
    self.duration = other.duration
    self.velocity = other.velocity
    self.page = other.page
    self.track = other.track
    self.bbox = other.bbox
    self.confidence = other.confidence
    self.id = other.id


if os.environ.get("DEBUG") == "not true":
    try:
        from .notes import *

        NoteList.ParseFromString = NoteList.parse
        ScoringResult.ParseFromString = ScoringResult.parse
        Note.CopyFrom = note_copy
    except ImportError:
        try:
            from notes import *

            NoteList.ParseFromString = NoteList.parse
            ScoringResult.ParseFromString = ScoringResult.parse
            Note.CopyFrom = note_copy
        except ImportError:
            try:
                from .notes_pb2 import *
            except ImportError:
                from notes_pb2 import *
            Note.CopyFrom = note_copy
else:
    try:
        from .notes_pb2 import *
    except ImportError:
        from notes_pb2 import *
    Note.CopyFrom = note_copy

clef_offset = 21


def transpose(note):
    if note.track == 0:  # treble clef
        return note.pitch - clef_offset
    elif note.track == 1:  # bass clef
        return note.pitch + clef_offset
    else:
        return note.pitch


def note_equals(self, other) -> bool:
    if other is None:
        return False
    return abs(self.pitch - other.pitch) < 2


def note_str(self):
    note_list = [" C", "Db", " D", "Eb", " E", " F", "F#", " G", "Ab", " A", "Bb", " B"]
    return f"{note_list[self.pitch % 12]}{self.pitch // 12 - 1}|{self.start_time:.2f}|{self.page}"


def edit_str(self):
    operations = {0: "INSERT", 1: "SUBSTITUTE", 2: "DELETE"}
    op_name = operations.get(self.operation, f"UNKNOWN({self.operation})")

    if self.operation == 0:  # INSERT
        return f"{op_name} {self.t_char} at {self.pos}"
    elif self.operation == 1:  # SUBSTITUTE
        return f"{op_name} {self.s_char} → {self.t_char} at {self.pos}"
    elif self.operation == 2:  # DELETE
        return f"{op_name} {self.s_char} at {self.pos}"
    else:
        return f"Unknown operation {self.operation}"


# monkey patch
Note.__eq__ = note_equals
Note.__str__ = note_str
Note.__repr__ = note_str
Edit.__str__ = edit_str
Edit.__repr__ = edit_str
