import { useMemo, useRef, useState } from "react";
import {
  Archive,
  Clock3,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderPlus,
  Mail,
  NotebookPen,
  Paperclip,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useMapRef } from "@/lib/gis/mapRef";
import {
  deleteProjectAsset,
  downloadProjectAsset,
  extractEmailAttachments,
  parseEmailFile,
  projectAssetBlob,
  uploadProjectAsset,
} from "@/lib/gis/projectRecords";
import { useWorkbench } from "@/lib/gis/store";
import type { ProjectDocument, ProjectEventType, ProjectRecords } from "@/lib/gis/types";
import { cn } from "@/lib/utils";

type Tab = "notes" | "files" | "activity" | "email" | "summary";

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "notes", label: "Notes", icon: <NotebookPen /> },
  { id: "files", label: "Files", icon: <Folder /> },
  { id: "activity", label: "Activity", icon: <Clock3 /> },
  { id: "email", label: "Email", icon: <Mail /> },
  { id: "summary", label: "Summary", icon: <Archive /> },
];

const eventTypes: Array<{ value: "all" | ProjectEventType; label: string }> = [
  { value: "all", label: "All events" },
  { value: "note", label: "Notes" },
  { value: "upload", label: "Uploads" },
  { value: "email", label: "Email" },
  { value: "map", label: "Maps and layers" },
  { value: "import", label: "File imports" },
  { value: "public-data", label: "Public data" },
  { value: "remote-change", label: "Remote user changes" },
  { value: "project", label: "Project changes" },
];

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character] ?? character;
  });

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
};

const fileDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export function ProjectRecordsPanel() {
  const wb = useWorkbench();
  const auth = useAuth();
  const { setRecordsOpen } = useMapRef();
  const [tab, setTab] = useState<Tab>("notes");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [folderId, setFolderId] = useState("general");
  const [newFolder, setNewFolder] = useState("");
  const [eventType, setEventType] = useState<"all" | ProjectEventType>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const records = wb.records;

  const update = (patch: Partial<ProjectRecords>) => wb.setProjectRecords({ ...records, ...patch });

  const folderPath = (id: string) => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current = records.folders.find((folder) => folder.id === id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(current.name);
      current = records.folders.find((folder) => folder.id === current?.parentId);
    }
    return names.join(" / ") || "General";
  };

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return records.events.filter(
      (event) =>
        (eventType === "all" || event.type === eventType) &&
        (!needle ||
          `${event.title} ${event.detail} ${event.actor} ${event.projectName}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [eventType, query, records.events]);

  const addNote = () => {
    const body = noteBody.trim();
    if (!body) {
      toast.error("Enter a note");
      return;
    }
    const now = Date.now();
    const id = window.crypto.randomUUID();
    update({
      notes: [
        {
          id,
          title: noteTitle.trim() || "Project note",
          body,
          createdAt: now,
          updatedAt: now,
          author: auth.user?.name || auth.user?.email || "LandDraft user",
          includeInPacket: true,
        },
        ...records.notes,
      ],
    });
    wb.addProjectEvent({
      type: "note",
      title: noteTitle.trim() || "Added project note",
      detail: body.slice(0, 180),
      relatedId: id,
    });
    setNoteTitle("");
    setNoteBody("");
    toast.success("Note added to this project");
  };

  const createFolder = () => {
    const name = newFolder.trim();
    if (!name) return;
    const id = window.crypto.randomUUID();
    update({
      folders: [
        ...records.folders,
        { id, name, parentId: folderId || null, createdAt: Date.now() },
      ],
    });
    wb.addProjectEvent({ type: "project", title: `Created folder ${name}` });
    setNewFolder("");
    setFolderId(id);
  };

  const uploadFiles = async (files: FileList | null, forceEmail = false) => {
    if (!files?.length || !auth.user) return;
    setBusy(true);
    try {
      const added: ProjectDocument[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} is larger than the 50 MB project-file limit`);
          continue;
        }
        const email = await parseEmailFile(file);
        const attachments = email ? await extractEmailAttachments(file) : [];
        added.push(
          await uploadProjectAsset({
            userId: auth.user.id,
            projectId: wb.projectId,
            folderId: forceEmail || email ? "email" : folderId,
            fileName: file.name,
            data: file,
            source: forceEmail || email ? "email" : "upload",
            uploadedBy: auth.user.name || auth.user.email,
            ...(email ? { email } : {}),
          }),
        );
        for (const attachment of attachments) {
          if (attachment.size > 50 * 1024 * 1024) continue;
          added.push(
            await uploadProjectAsset({
              userId: auth.user.id,
              projectId: wb.projectId,
              folderId: "email",
              fileName: attachment.name,
              data: attachment,
              source: "email",
              uploadedBy: auth.user.name || auth.user.email,
            }),
          );
        }
      }
      if (added.length) {
        update({ documents: [...added, ...records.documents] });
        for (const item of added)
          wb.addProjectEvent({
            type: item.source === "email" ? "email" : "upload",
            title: `${item.source === "email" ? "Added email" : "Uploaded"} ${item.name}`,
            detail: `${formatBytes(item.size)} · ${folderPath(item.folderId)}`,
            relatedId: item.id,
          });
        toast.success(`${added.length} project file${added.length === 1 ? "" : "s"} stored`);
      }
    } catch (error) {
      toast.error("Project file could not be stored", {
        description: error instanceof Error ? error.message : "Cloud storage is unavailable",
      });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      if (emailInput.current) emailInput.current.value = "";
    }
  };

  const removeDocument = async (document: ProjectDocument) => {
    setBusy(true);
    try {
      await deleteProjectAsset(document);
      update({ documents: records.documents.filter((item) => item.id !== document.id) });
      wb.addProjectEvent({ type: "project", title: `Removed ${document.name}` });
    } catch (error) {
      toast.error("File could not be removed", {
        description: error instanceof Error ? error.message : "Cloud storage is unavailable",
      });
    } finally {
      setBusy(false);
    }
  };

  const packetHtml = async () => {
    const notes = records.notes.filter((note) => note.includeInPacket);
    const documents = records.documents.filter((document) => document.includeInPacket);
    const renderedDocuments: string[] = [];
    for (const document of documents) {
      let content = "";
      if (document.email?.preview) {
        content = `<dl><dt>From</dt><dd>${escapeHtml(document.email.from ?? "")}</dd><dt>To</dt><dd>${escapeHtml(document.email.to ?? "")}</dd><dt>Subject</dt><dd>${escapeHtml(document.email.subject ?? document.name)}</dd></dl><pre>${escapeHtml(document.email.preview)}</pre>`;
      } else if (document.mimeType.startsWith("image/")) {
        const source = await fileDataUrl(await projectAssetBlob(document));
        content = `<img src="${source}" alt="${escapeHtml(document.name)}" />`;
      } else {
        content = `<p class="attachment">Attached file: ${escapeHtml(document.name)} (${formatBytes(document.size)}). The original is included in the downloadable packet.</p>`;
      }
      renderedDocuments.push(
        `<section class="page"><h2>${escapeHtml(document.name)}</h2><p class="meta">${escapeHtml(folderPath(document.folderId))} · ${new Date(document.createdAt).toLocaleString()}</p>${content}</section>`,
      );
    }
    return `<!doctype html><html><head><title>${escapeHtml(wb.projectName)} packet</title><style>@page{margin:.65in}body{font:12pt Arial,sans-serif;color:#173328}h1,h2{color:#1f7044}.cover,.page{break-after:page}.meta{color:#647067;font-size:9pt}article{white-space:pre-wrap;line-height:1.5}img{max-width:100%;max-height:8in;object-fit:contain}pre{white-space:pre-wrap;font:10pt Arial;line-height:1.45}dl{display:grid;grid-template-columns:70px 1fr;gap:4px}dt{font-weight:bold}.attachment{border:1px solid #ccd4ce;padding:16px;border-radius:8px}</style></head><body><section class="cover"><h1>${escapeHtml(wb.projectName)}</h1><p>${escapeHtml(records.summary || "Project records packet")}</p><p class="meta">Created ${new Date().toLocaleString()} · ${notes.length} notes · ${documents.length} files</p></section>${notes.map((note) => `<section class="page"><h2>${escapeHtml(note.title)}</h2><p class="meta">${escapeHtml(note.author)} · ${new Date(note.createdAt).toLocaleString()}</p><article>${escapeHtml(note.body)}</article></section>`).join("")}${renderedDocuments.join("")}</body></html>`;
  };

  const printPacket = async () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      toast.error("Allow pop-ups to print a project packet");
      return;
    }
    popup.document.write("<p style='font-family:sans-serif'>Preparing project packet…</p>");
    try {
      const html = await packetHtml();
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      window.setTimeout(() => popup.print(), 500);
    } catch (error) {
      popup.close();
      toast.error("Packet could not be prepared", {
        description: error instanceof Error ? error.message : "Project files are unavailable",
      });
    }
  };

  const downloadPacket = async () => {
    setBusy(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("packet.html", await packetHtml());
      for (const document of records.documents.filter((item) => item.includeInPacket))
        zip.file(
          `files/${folderPath(document.folderId)}/${document.name}`,
          await projectAssetBlob(document),
        );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${wb.projectName.replace(/[^a-z0-9_-]+/gi, "_")}_records_packet.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
    } catch (error) {
      toast.error("Packet could not be downloaded", {
        description: error instanceof Error ? error.message : "Project files are unavailable",
      });
    } finally {
      setBusy(false);
    }
  };

  const inboundDomain = (import.meta.env as Record<string, string | undefined>)[
    "VITE_INBOUND_EMAIL_DOMAIN"
  ];
  const inboundAddress = inboundDomain
    ? `project-${wb.projectId.slice(0, 8)}@${inboundDomain}`
    : null;

  return (
    <div className="app-overlay-viewport fixed inset-0 z-[95] flex justify-end bg-foreground/20 backdrop-blur-[2px]">
      <section className="flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-float">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Archive className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold">Project records</h2>
            <p className="truncate text-[10px] text-muted-foreground">{wb.projectName}</p>
          </div>
          <select
            value={wb.projectId}
            onChange={(event) => void wb.openProject(event.target.value)}
            className="hidden max-w-48 rounded-xl border border-border bg-secondary px-2 py-1.5 text-xs sm:block"
            aria-label="Filter records by project"
          >
            {wb.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setRecordsOpen(false)}
            className="rounded-xl p-2 hover:bg-accent"
            aria-label="Close project records"
          >
            <X className="size-4" />
          </button>
        </header>

        <nav className="flex shrink-0 overflow-x-auto border-b border-border p-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold",
                tab === item.id ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <span className="[&>svg]:size-3.5">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "notes" && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-border bg-secondary/40 p-3">
                <input
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="Note title (optional)"
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <textarea
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Add a project note…"
                  rows={4}
                  className="mt-2 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={addNote}
                  className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="size-3.5" /> Add note
                </button>
              </section>
              {records.notes.map((note) => (
                <article key={note.id} className="rounded-2xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{note.title}</h3>
                      <p className="text-[10px] text-muted-foreground">
                        {note.author} · {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <label className="flex items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={note.includeInPacket}
                        onChange={(event) =>
                          update({
                            notes: records.notes.map((item) =>
                              item.id === note.id
                                ? { ...item, includeInPacket: event.target.checked }
                                : item,
                            ),
                          })
                        }
                        className="accent-primary"
                      />{" "}
                      Packet
                    </label>
                    <button
                      onClick={() =>
                        update({ notes: records.notes.filter((item) => item.id !== note.id) })
                      }
                      className="p-1 text-destructive"
                      aria-label={`Delete ${note.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{note.body}</p>
                </article>
              ))}
              {!records.notes.length && (
                <Empty text="No notes yet. Notes can be included on maps and in project packets." />
              )}
            </div>
          )}

          {tab === "files" && (
            <div className="space-y-4">
              <section className="grid gap-2 rounded-2xl border border-border bg-secondary/40 p-3 sm:grid-cols-[1fr_auto]">
                <select
                  value={folderId}
                  onChange={(event) => setFolderId(event.target.value)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-xs"
                >
                  {records.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folderPath(folder.id)}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Upload className="size-3.5" /> Upload files
                </button>
                <input
                  value={newFolder}
                  onChange={(event) => setNewFolder(event.target.value)}
                  placeholder="New folder or subfolder"
                  className="rounded-xl border border-border bg-card px-3 py-2 text-xs"
                />
                <button
                  onClick={createFolder}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold"
                >
                  <FolderPlus className="size-3.5" /> Create folder
                </button>
              </section>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                accept="*/*,.eml,message/rfc822"
                onChange={(event) => void uploadFiles(event.target.files)}
              />
              {records.documents
                .filter((document) => folderId === "all" || document.folderId === folderId)
                .map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center gap-3 rounded-2xl border border-border p-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                      {document.source === "email" ? (
                        <Mail className="size-4" />
                      ) : document.source === "map" ? (
                        <FileText className="size-4" />
                      ) : (
                        <Paperclip className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{document.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {folderPath(document.folderId)} · {formatBytes(document.size)} ·{" "}
                        {new Date(document.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <label className="flex items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={document.includeInPacket}
                        onChange={(event) =>
                          update({
                            documents: records.documents.map((item) =>
                              item.id === document.id
                                ? { ...item, includeInPacket: event.target.checked }
                                : item,
                            ),
                          })
                        }
                        className="accent-primary"
                      />{" "}
                      Packet
                    </label>
                    <button
                      onClick={() => void downloadProjectAsset(document)}
                      className="rounded-lg p-2 hover:bg-accent"
                      aria-label={`Download ${document.name}`}
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void removeDocument(document)}
                      className="rounded-lg p-2 text-destructive hover:bg-destructive/10"
                      aria-label={`Delete ${document.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              {!records.documents.length && (
                <Empty text="Store project documents, photos, PDFs, email files, and saved maps here." />
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
                <select
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value as typeof eventType)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-xs"
                >
                  {eventTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-border px-3">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter activity"
                    className="min-w-0 flex-1 py-2 text-xs outline-none"
                  />
                </label>
              </div>
              {filteredEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold uppercase">
                      {event.type.replace("-", " ")}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-xs font-semibold">{event.title}</p>
                    <time className="text-[9px] text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </time>
                  </div>
                  {event.detail && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{event.detail}</p>
                  )}
                  <p className="mt-1 text-[9px] text-muted-foreground">
                    {event.actor} · {event.projectName}
                  </p>
                </div>
              ))}
              {!filteredEvents.length && (
                <Empty text="Project events will appear here with timestamps and the person who made the change." />
              )}
            </div>
          )}

          {tab === "email" && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-border bg-secondary/40 p-4">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Project email intake</h3>
                </div>
                {inboundAddress ? (
                  <>
                    <p className="mt-2 text-xs text-muted-foreground">
                      BCC or forward project email to this private intake address:
                    </p>
                    <button
                      onClick={() => void navigator.clipboard.writeText(inboundAddress)}
                      className="num mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-semibold"
                    >
                      {inboundAddress}
                    </button>
                  </>
                ) : (
                  <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    The secure inbox workflow is ready for a receiving domain, but inbound mail
                    routing is not connected yet. Until it is configured, upload exported .eml files
                    below; they are parsed, searchable, and packet-ready.
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() => emailInput.current?.click()}
                  className="mt-3 flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <Upload className="size-3.5" /> Import .eml email
                </button>
                <input
                  ref={emailInput}
                  type="file"
                  multiple
                  accept=".eml,message/rfc822"
                  className="hidden"
                  onChange={(event) => void uploadFiles(event.target.files, true)}
                />
              </section>
              {records.documents
                .filter((item) => item.source === "email")
                .map((document) => (
                  <article key={document.id} className="rounded-2xl border border-border p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-xs font-semibold">
                          {document.email?.subject || document.name}
                        </h3>
                        <p className="truncate text-[10px] text-muted-foreground">
                          From {document.email?.from || "email file"}
                        </p>
                      </div>
                      <button onClick={() => void downloadProjectAsset(document)} className="p-2">
                        <Download className="size-3.5" />
                      </button>
                    </div>
                    {document.email?.preview && (
                      <p className="mt-2 line-clamp-5 text-[10px] leading-relaxed">
                        {document.email.preview}
                      </p>
                    )}
                  </article>
                ))}
            </div>
          )}

          {tab === "summary" && (
            <div className="space-y-4">
              <section className="rounded-2xl border border-border bg-secondary/40 p-4">
                <h3 className="text-sm font-semibold">Project summary</h3>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Capture the purpose, findings, decisions, and next steps. This becomes the source
                  brief for the future AI presentation builder.
                </p>
                <textarea
                  value={records.summary}
                  onChange={(event) => update({ summary: event.target.value })}
                  rows={12}
                  placeholder="Purpose, audience, key findings, decisions, risks, and recommended next steps…"
                  className="mt-3 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                />
              </section>
              <section className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                <strong className="text-foreground">Presentation module foundation</strong>
                <p className="mt-1">
                  The summary, selected notes, maps, emails, and documents are now organized as
                  presentation-ready sources. PowerPoint/PDF/Canva generation can build from this
                  repository without changing the map project.
                </p>
              </section>
            </div>
          )}
        </main>

        <footer className="grid shrink-0 grid-cols-2 gap-2 border-t border-border p-3">
          <button
            onClick={() => void printPacket()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2.5 text-xs font-semibold"
          >
            <Printer className="size-3.5" /> Print packet
          </button>
          <button
            disabled={busy}
            onClick={() => void downloadPacket()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            <FileArchive className="size-3.5" /> Download packet
          </button>
        </footer>
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
