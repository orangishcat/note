# AGENTS.md

For agents like OpenAI's Codex and more.

- Respect `.editorconfig` while making changes.
- Fix all eslint warnings and errors from `next lint` if modifying frontend code.
- Prefer `numpy` over pure Python, but only if the code can be optimized clearly
  and in an easily readable way.
- Since the entire Next.js project is in the `frontend` directory, ensure to
  `cd frontend` before running npm commands.
- Use `notes_patch` for the protobuf types.
- Appwrite database collection attributes:
  - Folder collection:
    - name: `String`
    - files: `String[]`
  - Score collection:
    - user_id: `String`
    - file_id: `String`
    - name: `String`
    - subtitle: `String`
    - starred_users: `String[]`
    - preview_id: `String`
    - audio_file_id: `String`
    - notes_id: `String`
    - mime_type: `String`
  - Recordings collection:
    - user_id: `String`
    - file_id: `String`
