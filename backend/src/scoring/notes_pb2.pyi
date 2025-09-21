from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

BASS: Clef
DELETE: EditOperation
DESCRIPTOR: _descriptor.FileDescriptor
INSERT: EditOperation
SUBSTITUTE: EditOperation
TREBLE: Clef
UNKNOWN: Clef

class Edit(_message.Message):
    __slots__ = ["operation", "pos", "s_char", "t_char", "t_pos"]
    OPERATION_FIELD_NUMBER: _ClassVar[int]
    POS_FIELD_NUMBER: _ClassVar[int]
    S_CHAR_FIELD_NUMBER: _ClassVar[int]
    T_CHAR_FIELD_NUMBER: _ClassVar[int]
    T_POS_FIELD_NUMBER: _ClassVar[int]
    operation: EditOperation
    pos: int
    s_char: Note
    t_char: Note
    t_pos: int
    def __init__(self, operation: _Optional[_Union[EditOperation, str]] = ..., pos: _Optional[int] = ..., s_char: _Optional[_Union[Note, _Mapping]] = ..., t_char: _Optional[_Union[Note, _Mapping]] = ..., t_pos: _Optional[int] = ...) -> None: ...

class Line(_message.Message):
    __slots__ = ["bbox", "clefs", "group", "page"]
    BBOX_FIELD_NUMBER: _ClassVar[int]
    CLEFS_FIELD_NUMBER: _ClassVar[int]
    GROUP_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    bbox: _containers.RepeatedScalarFieldContainer[int]
    clefs: _containers.RepeatedScalarFieldContainer[Clef]
    group: int
    page: int
    def __init__(self, clefs: _Optional[_Iterable[_Union[Clef, str]]] = ..., group: _Optional[int] = ..., bbox: _Optional[_Iterable[int]] = ..., page: _Optional[int] = ...) -> None: ...

class Note(_message.Message):
    __slots__ = ["bbox", "confidence", "duration", "id", "page", "pitch", "start_time", "track", "velocity"]
    BBOX_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    DURATION_FIELD_NUMBER: _ClassVar[int]
    ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    PITCH_FIELD_NUMBER: _ClassVar[int]
    START_TIME_FIELD_NUMBER: _ClassVar[int]
    TRACK_FIELD_NUMBER: _ClassVar[int]
    VELOCITY_FIELD_NUMBER: _ClassVar[int]
    bbox: _containers.RepeatedScalarFieldContainer[int]
    confidence: int
    duration: float
    id: int
    page: int
    pitch: int
    start_time: float
    track: int
    velocity: float
    def __init__(self, pitch: _Optional[int] = ..., start_time: _Optional[float] = ..., duration: _Optional[float] = ..., velocity: _Optional[float] = ..., page: _Optional[int] = ..., track: _Optional[int] = ..., bbox: _Optional[_Iterable[int]] = ..., confidence: _Optional[int] = ..., id: _Optional[int] = ...) -> None: ...

class NoteList(_message.Message):
    __slots__ = ["lines", "notes", "size", "voices"]
    LINES_FIELD_NUMBER: _ClassVar[int]
    NOTES_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    VOICES_FIELD_NUMBER: _ClassVar[int]
    lines: _containers.RepeatedCompositeFieldContainer[Line]
    notes: _containers.RepeatedCompositeFieldContainer[Note]
    size: _containers.RepeatedScalarFieldContainer[int]
    voices: _containers.RepeatedCompositeFieldContainer[Voice]
    def __init__(self, notes: _Optional[_Iterable[_Union[Note, _Mapping]]] = ..., size: _Optional[_Iterable[int]] = ..., voices: _Optional[_Iterable[_Union[Voice, _Mapping]]] = ..., lines: _Optional[_Iterable[_Union[Line, _Mapping]]] = ...) -> None: ...

class ScoringResult(_message.Message):
    __slots__ = ["edits", "size", "tempo_sections", "unstable_rate"]
    EDITS_FIELD_NUMBER: _ClassVar[int]
    SIZE_FIELD_NUMBER: _ClassVar[int]
    TEMPO_SECTIONS_FIELD_NUMBER: _ClassVar[int]
    UNSTABLE_RATE_FIELD_NUMBER: _ClassVar[int]
    edits: _containers.RepeatedCompositeFieldContainer[Edit]
    size: _containers.RepeatedScalarFieldContainer[int]
    tempo_sections: _containers.RepeatedCompositeFieldContainer[TempoSection]
    unstable_rate: float
    def __init__(self, edits: _Optional[_Iterable[_Union[Edit, _Mapping]]] = ..., size: _Optional[_Iterable[int]] = ..., unstable_rate: _Optional[float] = ..., tempo_sections: _Optional[_Iterable[_Union[TempoSection, _Mapping]]] = ...) -> None: ...

class TempoSection(_message.Message):
    __slots__ = ["end_index", "start_index", "tempo"]
    END_INDEX_FIELD_NUMBER: _ClassVar[int]
    START_INDEX_FIELD_NUMBER: _ClassVar[int]
    TEMPO_FIELD_NUMBER: _ClassVar[int]
    end_index: int
    start_index: int
    tempo: float
    def __init__(self, start_index: _Optional[int] = ..., end_index: _Optional[int] = ..., tempo: _Optional[float] = ...) -> None: ...

class Voice(_message.Message):
    __slots__ = ["bbox", "clef", "group", "page", "track"]
    BBOX_FIELD_NUMBER: _ClassVar[int]
    CLEF_FIELD_NUMBER: _ClassVar[int]
    GROUP_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    TRACK_FIELD_NUMBER: _ClassVar[int]
    bbox: _containers.RepeatedScalarFieldContainer[int]
    clef: Clef
    group: int
    page: int
    track: int
    def __init__(self, clef: _Optional[_Union[Clef, str]] = ..., track: _Optional[int] = ..., group: _Optional[int] = ..., bbox: _Optional[_Iterable[int]] = ..., page: _Optional[int] = ...) -> None: ...

class EditOperation(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = []

class Clef(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = []
