import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronRight,
  Clock3,
  Download,
  FileArchive,
  FileText,
  Folder,
  FolderPlus,
  Layers3,
  Mail,
  NotebookPen,
  Paperclip,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Save,
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
import {
  assignInboundEmail,
  ensureAccountEmailAlias,
  ensureProjectEmailAlias,
  listInboundProjectEmails,
  markInboundEmailImported,
  type InboundProjectEmail,
  type ProjectEmailAlias,
} from "@/lib/gis/inboundEmail";
import type {
  ProjectDocument,
  ProjectEventType,
  ProjectNote,
  ProjectRecords,
} from "@/lib/gis/types";
import { cn } from "@/lib/utils";

type Tab = "notes" | "layer-notes" | "files" | "activity" | "email" | "summary";

const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "notes", label: "Notes", icon: <NotebookPen /> },
  { id: "layer-notes", label: "Layer notes", icon: <Layers3 /> },
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

const dateTimeInputValue = (timestamp: number) => {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
};

export function ProjectRecordsPanel() {
  const wb = useWorkbench();
  const auth = useAuth();
  const { setRecordsOpen } = useMapRef();
  const [tab, setTab] = useState<Tab>("notes");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteEditor, setNoteEditor] = useState<ProjectNote | null>(null);
  const [selectedLayerNoteId, setSelectedLayerNoteId] = useState<string | null>(null);
  const [layerNoteDrafts, setLayerNoteDrafts] = useState<Record<string, string>>({});
  const [folderId, setFolderId] = useState("general");
  const [newFolder, setNewFolder] = useState("");
  const [eventType, setEventType] = useState<"all" | ProjectEventType>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [layerAttachmentBusyId, setLayerAttachmentBusyId] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailSetupError, setEmailSetupError] = useState("");
  const [projectEmailAlias, setProjectEmailAlias] = useState<ProjectEmailAlias | null>(null);
  const [accountEmailAlias, setAccountEmailAlias] = useState<ProjectEmailAlias | null>(null);
  const [inboundEmails, setInboundEmails] = useState<InboundProjectEmail[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const records = wb.records;
  const layersWithAttachments = new Set(
    records.documents.flatMap((document) => (document.layerId ? [document.layerId] : [])),
  );
  const layerNotes = wb.layers
    .map((layer, index) => ({ layer, order: index + 1 }))
    .filter(({ layer }) => Boolean(layer.note?.trim()) || layersWithAttachments.has(layer.id));
  const attachmentsForLayer = (layerId: string) =>
    records.documents.filter((document) => document.layerId === layerId);

  const refreshInboundEmail = async () => {
    if (!auth.user || !auth.cloudEnabled) return;
    setEmailBusy(true);
    setEmailSetupError("");
    try {
      const [projectAlias, accountAlias, messages] = await Promise.all([
        ensureProjectEmailAlias(wb.projectId),
        ensureAccountEmailAlias(),
        listInboundProjectEmails(wb.projectId),
      ]);
      setProjectEmailAlias(projectAlias);
      setAccountEmailAlias(accountAlias);
      setInboundEmails(messages);
    } catch (error) {
      setEmailSetupError(
        error instanceof Error ? error.message : "Project email intake is unavailable",
      );
    } finally {
      setEmailBusy(false);
    }
  };

  useEffect(() => {
    if (tab !== "email") return;
    void refreshInboundEmail();
    // Project changes recreate the scoped intake address and message list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, tab, wb.projectId]);

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
    const note: ProjectNote = {
      id,
      title: noteTitle.trim() || "Project note",
      body,
      createdAt: now,
      updatedAt: now,
      author: auth.user?.name || auth.user?.email || "LandDraft user",
      includeInPacket: true,
    };
    update({ notes: [note, ...records.notes] });
    wb.addProjectEvent({
      type: "note",
      title: noteTitle.trim() || "Added project note",
      detail: body.slice(0, 180),
      relatedId: id,
    });
    setNoteTitle("");
    setNoteBody("");
    setNoteEditor(note);
    toast.success("Note added to this project");
  };

  const saveEditedNote = () => {
    if (!noteEditor) return;
    const title = noteEditor.title.trim() || "Project note";
    const body = noteEditor.body.trim();
    if (!body) {
      toast.error("Enter a note");
      return;
    }
    const updatedNote = { ...noteEditor, title, body, updatedAt: Date.now() };
    update({
      notes: records.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note)),
    });
    setNoteEditor(updatedNote);
    wb.addProjectEvent({
      type: "note",
      title: `Updated note: ${title}`,
      detail: body.slice(0, 180),
      relatedId: updatedNote.id,
    });
    toast.success("Note changes saved");
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

  const uploadLayerAttachments = async (layerId: string, files: FileList | null) => {
    if (!files?.length) return;
    if (!auth.user) {
      toast.error("Sign in before attaching files to a layer note");
      return;
    }
    const layer = wb.layers.find((item) => item.id === layerId);
    if (!layer) return;
    setLayerAttachmentBusyId(layerId);
    try {
      const added: ProjectDocument[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} is larger than the 50 MB project-file limit`);
          continue;
        }
        added.push(
          await uploadProjectAsset({
            userId: auth.user.id,
            projectId: wb.projectId,
            folderId: "general",
            fileName: file.name,
            data: file,
            source: "upload",
            uploadedBy: auth.user.name || auth.user.email,
            layerId,
          }),
        );
      }
      if (!added.length) return;
      update({ documents: [...added, ...records.documents] });
      for (const document of added)
        wb.addProjectEvent({
          type: "upload",
          title: `Attached ${document.name} to ${layer.name}`,
          detail: `${formatBytes(document.size)} · Layer note attachment`,
          relatedId: layer.id,
        });
      toast.success(
        `${added.length} attachment${added.length === 1 ? "" : "s"} added to ${layer.name}`,
      );
    } catch (error) {
      toast.error("Layer attachment could not be stored", {
        description: error instanceof Error ? error.message : "Cloud storage is unavailable",
      });
    } finally {
      setLayerAttachmentBusyId(null);
    }
  };

  const removeDocument = async (document: ProjectDocument) => {
    setBusy(true);
    try {
      await deleteProjectAsset(document);
      update({ documents: records.documents.filter((item) => item.id !== document.id) });
      const layer = document.layerId
        ? wb.layers.find((item) => item.id === document.layerId)
        : undefined;
      wb.addProjectEvent({
        type: "project",
        title: `Removed ${document.name}`,
        ...(layer ? { detail: `Removed from layer note: ${layer.name}`, relatedId: layer.id } : {}),
      });
      toast.success(layer ? "Layer attachment removed" : "Project file removed");
    } catch (error) {
      toast.error("File could not be removed", {
        description: error instanceof Error ? error.message : "Cloud storage is unavailable",
      });
    } finally {
      setBusy(false);
    }
  };

  const addInboundEmailToProject = async (email: InboundProjectEmail) => {
    if (!auth.user) return;
    setEmailBusy(true);
    try {
      if (!email.projectId) await assignInboundEmail(email.id, wb.projectId);
      const createdAt = email.receivedAt || Date.now();
      const uploadedBy = email.fromAddress || "Inbound email";
      const candidates: ProjectDocument[] = [];
      if (email.rawStoragePath)
        candidates.push({
          id: `inbound-email-${email.id}`,
          name: `${email.subject || "Email"}.eml`.replace(/[\\/:*?"<>|]+/g, "_"),
          storagePath: email.rawStoragePath,
          mimeType: "message/rfc822",
          size: 0,
          folderId: "email",
          source: "email",
          createdAt,
          uploadedBy,
          includeInPacket: true,
          email: {
            from: email.fromAddress,
            to: email.toAddresses.join(", "),
            subject: email.subject,
            sentAt: new Date(createdAt).toISOString(),
            ...(email.textBody ? { preview: email.textBody.slice(0, 4_000) } : {}),
          },
        });
      for (const attachment of email.attachments) {
        if (attachment.status !== "ready" || !attachment.storagePath) continue;
        candidates.push({
          id: `inbound-attachment-${attachment.id}`,
          name: attachment.fileName,
          storagePath: attachment.storagePath,
          mimeType: attachment.contentType,
          size: attachment.byteSize,
          folderId: "email",
          source: "email",
          createdAt,
          uploadedBy,
          includeInPacket: true,
        });
      }
      const existingPaths = new Set(records.documents.map((document) => document.storagePath));
      const additions = candidates.filter((document) => !existingPaths.has(document.storagePath));
      if (additions.length) update({ documents: [...additions, ...records.documents] });
      await markInboundEmailImported(email.id, wb.projectId);
      wb.addProjectEvent({
        type: "email",
        title: `Added email: ${email.subject}`,
        detail: `${email.fromAddress || "Unknown sender"} · ${additions.length} stored file${additions.length === 1 ? "" : "s"}`,
        relatedId: email.id,
      });
      toast.success("Email added to this project's records");
      await refreshInboundEmail();
    } catch (error) {
      toast.error("Email could not be added", {
        description: error instanceof Error ? error.message : "Cloud email intake is unavailable",
      });
    } finally {
      setEmailBusy(false);
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
        `<section class="page"><h2>${escapeHtml(document.name)}</h2><p class="meta">${escapeHtml(folderPath(document.folderId))}${document.layerId ? ` · Layer: ${escapeHtml(wb.layers.find((layer) => layer.id === document.layerId)?.name ?? "Removed layer")}` : ""} · ${new Date(document.createdAt).toLocaleString()}</p>${content}</section>`,
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

  const inboundDomain =
    (import.meta.env as Record<string, string | undefined>)["VITE_INBOUND_EMAIL_DOMAIN"]?.trim() ||
    "inbound.landdraft.net";
  const projectInboundAddress =
    inboundDomain && projectEmailAlias ? `${projectEmailAlias.localPart}@${inboundDomain}` : null;
  const accountInboundAddress =
    inboundDomain && accountEmailAlias ? `${accountEmailAlias.localPart}@${inboundDomain}` : null;

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
                <label htmlFor="new-note-subject" className="text-[10px] font-semibold">
                  Subject
                </label>
                <input
                  id="new-note-subject"
                  value={noteTitle}
                  onChange={(event) => setNoteTitle(event.target.value)}
                  placeholder="What is this note about?"
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <label htmlFor="new-note-body" className="mt-2 block text-[10px] font-semibold">
                  Note
                </label>
                <textarea
                  id="new-note-body"
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Add a project note…"
                  rows={4}
                  className="mt-1 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={addNote}
                  className="mt-2 flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="size-3.5" /> Add note
                </button>
              </section>

              {layerNotes.length > 0 && (
                <section className="rounded-2xl border border-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Layers3 className="size-4 text-primary" />
                    <div>
                      <h3 className="text-xs font-semibold">Layer notes</h3>
                      <p className="text-[9px] text-muted-foreground">
                        Saved notes listed in current layer order
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {layerNotes.map(({ layer, order }) => (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => {
                          setSelectedLayerNoteId(layer.id);
                          setLayerNoteDrafts((current) => ({
                            ...current,
                            [layer.id]: layer.note ?? "",
                          }));
                          setTab("layer-notes");
                        }}
                        className="flex w-full items-center gap-2 rounded-xl bg-secondary px-2.5 py-2 text-left hover:bg-accent"
                      >
                        <span className="num flex size-6 shrink-0 items-center justify-center rounded-lg bg-card text-[9px] font-semibold">
                          {order}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold">
                            {layer.name}
                          </span>
                          <span className="block truncate text-[9px] text-muted-foreground">
                            {layer.note?.trim() ||
                              `${attachmentsForLayer(layer.id).length} layer attachment${attachmentsForLayer(layer.id).length === 1 ? "" : "s"}`}
                          </span>
                        </span>
                        <ChevronRight className="size-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-border p-3">
                <h3 className="mb-2 text-xs font-semibold">Project notes</h3>
                <div className="space-y-1">
                  {records.notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setNoteEditor({ ...note })}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left hover:bg-accent",
                        noteEditor?.id === note.id
                          ? "bg-accent ring-1 ring-primary"
                          : "bg-secondary",
                      )}
                    >
                      <NotebookPen className="size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-semibold">
                          {note.title}
                        </span>
                        <span className="block truncate text-[9px] text-muted-foreground">
                          {note.author} · {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </span>
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                  {!records.notes.length && (
                    <Empty text="No project notes yet. Notes can be included on maps and in project packets." />
                  )}
                </div>
              </section>

              {noteEditor && (
                <section className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">Edit note</h3>
                    <button
                      type="button"
                      onClick={() => setNoteEditor(null)}
                      className="rounded-lg p-1 hover:bg-accent"
                      aria-label="Close note editor"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                  <label className="mt-2 block text-[10px] font-semibold">
                    Subject
                    <input
                      value={noteEditor.title}
                      onChange={(event) =>
                        setNoteEditor((current) =>
                          current ? { ...current, title: event.target.value } : current,
                        )
                      }
                      className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                  </label>
                  <label className="mt-2 block text-[10px] font-semibold">
                    Note
                    <textarea
                      value={noteEditor.body}
                      onChange={(event) =>
                        setNoteEditor((current) =>
                          current ? { ...current, body: event.target.value } : current,
                        )
                      }
                      rows={5}
                      className="mt-1 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-xs leading-relaxed outline-none focus:border-primary"
                    />
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-[10px] font-semibold">
                      Date and time
                      <input
                        type="datetime-local"
                        value={dateTimeInputValue(noteEditor.createdAt)}
                        onChange={(event) => {
                          const timestamp = new Date(event.target.value).getTime();
                          if (Number.isFinite(timestamp))
                            setNoteEditor((current) =>
                              current ? { ...current, createdAt: timestamp } : current,
                            );
                        }}
                        className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-2 text-[10px]"
                      />
                    </label>
                    <label className="text-[10px] font-semibold">
                      Author or source
                      <input
                        value={noteEditor.author}
                        onChange={(event) =>
                          setNoteEditor((current) =>
                            current ? { ...current, author: event.target.value } : current,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-border bg-card px-2 py-2 text-[10px]"
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={saveEditedNote}
                      className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[10px] font-semibold text-primary-foreground"
                    >
                      <Save className="size-3.5" /> Save changes
                    </button>
                    <label className="flex items-center gap-1 text-[10px]">
                      <input
                        type="checkbox"
                        checked={noteEditor.includeInPacket}
                        onChange={(event) =>
                          setNoteEditor((current) =>
                            current
                              ? { ...current, includeInPacket: event.target.checked }
                              : current,
                          )
                        }
                        className="accent-primary"
                      />
                      Include in packet
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Delete “${noteEditor.title}”?`)) return;
                        update({
                          notes: records.notes.filter((note) => note.id !== noteEditor.id),
                        });
                        setNoteEditor(null);
                        toast.success("Note deleted");
                      }}
                      className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" /> Delete
                    </button>
                  </div>
                  <p className="mt-2 text-[9px] text-muted-foreground">
                    Last edited {new Date(noteEditor.updatedAt).toLocaleString()}
                  </p>
                </section>
              )}
            </div>
          )}

          {tab === "layer-notes" && (
            <div className="space-y-3">
              <section className="rounded-2xl border border-border bg-secondary/40 p-3">
                <div className="flex items-center gap-2">
                  <Layers3 className="size-4 text-primary" />
                  <div>
                    <h3 className="text-xs font-semibold">Notes attached to map layers</h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      Notes and their files, listed front to back in the same order as the Layers
                      panel.
                    </p>
                  </div>
                </div>
              </section>
              {layerNotes.map(({ layer, order }) => {
                const group = wb.groups.find((item) => item.id === layer.groupId);
                const attachments = attachmentsForLayer(layer.id);
                return (
                  <article
                    key={layer.id}
                    className={cn(
                      "rounded-2xl border border-border p-3",
                      selectedLayerNoteId === layer.id && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="num flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-[10px] font-semibold">
                        {order}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-xs font-semibold">{layer.name}</h3>
                        <p className="text-[9px] text-muted-foreground">
                          {group?.name ?? "Layer group"}
                          {layer.noteUpdatedAt
                            ? ` · Updated ${new Date(layer.noteUpdatedAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <textarea
                      value={layerNoteDrafts[layer.id] ?? layer.note ?? ""}
                      onChange={(event) =>
                        setLayerNoteDrafts((current) => ({
                          ...current,
                          [layer.id]: event.target.value,
                        }))
                      }
                      rows={4}
                      aria-label={`Note for ${layer.name}`}
                      className="mt-2 w-full resize-y rounded-xl border border-border bg-card px-3 py-2 text-xs leading-relaxed outline-none focus:border-primary"
                    />
                    <section className="mt-2 rounded-xl border border-border bg-secondary/40 p-2">
                      <div className="flex items-center gap-2">
                        <Paperclip className="size-3.5 text-primary" />
                        <p className="min-w-0 flex-1 text-[10px] font-semibold">
                          Attachments {attachments.length > 0 && `(${attachments.length})`}
                        </p>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-1 rounded-lg bg-card px-2 py-1.5 text-[10px] font-semibold hover:bg-accent",
                            layerAttachmentBusyId === layer.id && "pointer-events-none opacity-50",
                          )}
                        >
                          <Plus className="size-3" /> Add files
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            disabled={layerAttachmentBusyId === layer.id}
                            onChange={(event) => {
                              void uploadLayerAttachments(layer.id, event.target.files);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {attachments.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {attachments.map((document) => (
                            <div
                              key={document.id}
                              className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5"
                            >
                              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[10px] font-semibold">
                                  {document.name}
                                </span>
                                <span className="block text-[9px] text-muted-foreground">
                                  {formatBytes(document.size)} ·{" "}
                                  {new Date(document.createdAt).toLocaleDateString()}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => void downloadProjectAsset(document)}
                                className="rounded-md p-1 hover:bg-accent"
                                aria-label={`Download ${document.name}`}
                                title="Download attachment"
                              >
                                <Download className="size-3" />
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void removeDocument(document)}
                                className="rounded-md p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                aria-label={`Remove ${document.name} from ${layer.name}`}
                                title="Remove attachment"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[9px] text-muted-foreground">
                          Add photos, documents, emails, or other files for this layer.
                        </p>
                      )}
                    </section>
                    <div className="mt-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const note = layerNoteDrafts[layer.id] ?? layer.note ?? "";
                          wb.setLayerNote(layer.id, note);
                          setLayerNoteDrafts((current) => ({
                            ...current,
                            [layer.id]: note.trim(),
                          }));
                          toast.success("Layer note saved");
                        }}
                        className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground"
                      >
                        <Save className="size-3" /> Save changes
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          wb.setLayerNote(layer.id, "");
                          setLayerNoteDrafts((current) => ({
                            ...current,
                            [layer.id]: "",
                          }));
                          toast.success("Layer note removed");
                        }}
                        className="rounded-lg px-2.5 py-1.5 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
                      >
                        Remove note
                      </button>
                    </div>
                  </article>
                );
              })}
              {!layerNotes.length && (
                <Empty text="No layer notes or attachments yet. Expand a layer in the Layers panel and use its note button to add them." />
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
                        {document.layerId && (
                          <>
                            {" "}
                            · Layer:{" "}
                            {wb.layers.find((layer) => layer.id === document.layerId)?.name ??
                              "Removed layer"}
                          </>
                        )}
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
                  <h3 className="min-w-0 flex-1 text-sm font-semibold">Project email intake</h3>
                  {auth.cloudEnabled && (
                    <button
                      type="button"
                      disabled={emailBusy}
                      onClick={() => void refreshInboundEmail()}
                      className="rounded-lg p-2 hover:bg-accent disabled:opacity-50"
                      aria-label="Refresh project email"
                      title="Refresh project email"
                    >
                      <RefreshCw className={cn("size-3.5", emailBusy && "animate-spin")} />
                    </button>
                  )}
                </div>
                {projectInboundAddress && accountInboundAddress ? (
                  <div className="mt-3 grid gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Send directly to this project
                      </p>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(projectInboundAddress);
                          toast.success("Project intake address copied");
                        }}
                        className="num mt-1 w-full break-all rounded-xl border border-border bg-card px-3 py-2 text-left text-xs font-semibold"
                      >
                        {projectInboundAddress}
                      </button>
                    </div>
                    <details className="rounded-xl border border-border bg-card px-3 py-2">
                      <summary className="cursor-pointer text-xs font-semibold">
                        Account inbox for sorting later
                      </summary>
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Email this address when you have not chosen a project. Messages can be added
                        to the current project below.
                      </p>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(accountInboundAddress);
                          toast.success("Account inbox address copied");
                        }}
                        className="num mt-2 w-full break-all rounded-lg bg-secondary px-2 py-2 text-left text-[10px] font-semibold"
                      >
                        {accountInboundAddress}
                      </button>
                    </details>
                  </div>
                ) : (
                  <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    {emailSetupError
                      ? `Production intake setup is not complete yet: ${emailSetupError}`
                      : "The secure inbox is being connected to its receiving domain. Until it is live, upload exported .eml files below; they remain searchable and packet-ready."}
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

              {!!inboundEmails.length && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <h3 className="text-xs font-semibold">Received email</h3>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px]">
                      {inboundEmails.length} recent
                    </span>
                  </div>
                  {inboundEmails.map((email) => {
                    const importedHere = email.importedProjectId === wb.projectId;
                    return (
                      <article key={email.id} className="rounded-2xl border border-border p-3">
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              "mt-1 size-2 shrink-0 rounded-full",
                              email.status === "ready"
                                ? "bg-emerald-500"
                                : email.status === "processing"
                                  ? "bg-amber-500"
                                  : "bg-red-500",
                            )}
                            title={`Intake status: ${email.status}`}
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-xs font-semibold">{email.subject}</h4>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {email.projectId ? "Project inbox" : "Account inbox"} · From{" "}
                              {email.fromAddress || "unknown sender"}
                            </p>
                            <p className="text-[9px] text-muted-foreground">
                              {new Date(email.receivedAt).toLocaleString()} ·{" "}
                              {email.attachments.filter((item) => item.status === "ready").length}{" "}
                              attachment
                              {email.attachments.filter((item) => item.status === "ready")
                                .length === 1
                                ? ""
                                : "s"}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={emailBusy || importedHere || email.status === "processing"}
                            onClick={() => void addInboundEmailToProject(email)}
                            className="shrink-0 rounded-xl bg-primary px-3 py-2 text-[10px] font-semibold text-primary-foreground disabled:bg-secondary disabled:text-muted-foreground"
                          >
                            {importedHere ? "Added" : "Add to this project"}
                          </button>
                        </div>
                        {email.textBody && (
                          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[10px] leading-relaxed">
                            {email.textBody}
                          </p>
                        )}
                        {email.errorMessage && (
                          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[9px] text-amber-900">
                            {email.errorMessage}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </section>
              )}

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
