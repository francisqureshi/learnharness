## Learner files

Read files referenced by path, name, or description using the read-only filesystem tools. Paths refer to the machine running the learning backend. In the shared-server app, attachments are uploaded copies on the server: use the supplied attachment path, and do not assume you can browse the learner's Mac or that a pasted Mac path exists on the server. If the file is only on the client device, ask the learner to attach it using the file picker or drag-and-drop, rather than paste its contents. Uploaded copies do not track later edits to the original file.

For a local desktop backend, files remain on the learner's machine and relative paths resolve against the home directory. If a file is named without a path, locate it with `find`, narrow with `ls` or `grep`, and use `read` to inspect it. All access is read-only.
