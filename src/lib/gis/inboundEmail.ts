import { cloudConfigured, cloudDataRequest } from "@/lib/cloud";

export interface ProjectEmailAlias {
  id: string;
  ownerId: string;
  projectId: string | null;
  localPart: string;
}

export interface InboundEmailAttachment {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  storagePath: string | null;
  status: "processing" | "ready" | "skipped" | "error";
  errorMessage: string | null;
}

export interface InboundProjectEmail {
  id: string;
  projectId: string | null;
  fromAddress: string;
  toAddresses: string[];
  subject: string;
  textBody: string | null;
  rawStoragePath: string | null;
  status: "processing" | "ready" | "partial" | "error";
  errorMessage: string | null;
  receivedAt: number;
  importedAt: number | null;
  importedProjectId: string | null;
  attachments: InboundEmailAttachment[];
}

interface AliasRow {
  id: string;
  owner_id: string;
  project_id: string | null;
  local_part: string;
}

interface AttachmentRow {
  id: string;
  file_name: string;
  content_type: string;
  byte_size: number;
  storage_path: string | null;
  status: InboundEmailAttachment["status"];
  error_message: string | null;
}

interface EmailRow {
  id: string;
  project_id: string | null;
  from_address: string;
  to_addresses: string[];
  subject: string;
  text_body: string | null;
  raw_storage_path: string | null;
  status: InboundProjectEmail["status"];
  error_message: string | null;
  received_at: string;
  imported_at: string | null;
  imported_project_id: string | null;
  project_inbound_attachments?: AttachmentRow[];
}

const aliasFromRow = (row: AliasRow): ProjectEmailAlias => ({
  id: row.id,
  ownerId: row.owner_id,
  projectId: row.project_id,
  localPart: row.local_part,
});

const emailFromRow = (row: EmailRow): InboundProjectEmail => ({
  id: row.id,
  projectId: row.project_id,
  fromAddress: row.from_address,
  toAddresses: row.to_addresses ?? [],
  subject: row.subject,
  textBody: row.text_body,
  rawStoragePath: row.raw_storage_path,
  status: row.status,
  errorMessage: row.error_message,
  receivedAt: new Date(row.received_at).getTime(),
  importedAt: row.imported_at ? new Date(row.imported_at).getTime() : null,
  importedProjectId: row.imported_project_id,
  attachments: (row.project_inbound_attachments ?? []).map((attachment) => ({
    id: attachment.id,
    fileName: attachment.file_name,
    contentType: attachment.content_type,
    byteSize: Number(attachment.byte_size),
    storagePath: attachment.storage_path,
    status: attachment.status,
    errorMessage: attachment.error_message,
  })),
});

const requireCloud = () => {
  if (!cloudConfigured) throw new Error("Cloud accounts are required for project email intake");
};

export async function ensureProjectEmailAlias(projectId: string): Promise<ProjectEmailAlias> {
  requireCloud();
  const rows = await cloudDataRequest<AliasRow[]>("/rest/v1/rpc/ensure_project_email_alias", {
    method: "POST",
    body: JSON.stringify({ p_project_id: projectId }),
  });
  if (!rows[0]) throw new Error("A project intake address could not be created");
  return aliasFromRow(rows[0]);
}

export async function ensureAccountEmailAlias(): Promise<ProjectEmailAlias> {
  requireCloud();
  const rows = await cloudDataRequest<AliasRow[]>("/rest/v1/rpc/ensure_account_email_alias", {
    method: "POST",
    body: "{}",
  });
  if (!rows[0]) throw new Error("An account intake address could not be created");
  return aliasFromRow(rows[0]);
}

const emailSelect =
  "id,project_id,from_address,to_addresses,subject,text_body,raw_storage_path,status,error_message,received_at,imported_at,imported_project_id,project_inbound_attachments(id,file_name,content_type,byte_size,storage_path,status,error_message)";

export async function listInboundProjectEmails(projectId: string): Promise<InboundProjectEmail[]> {
  requireCloud();
  const filter = `or=(project_id.eq.${projectId},project_id.is.null)`;
  const rows = await cloudDataRequest<EmailRow[]>(
    `/rest/v1/project_inbound_emails?select=${encodeURIComponent(emailSelect)}&${filter}&order=received_at.desc&limit=100`,
  );
  return rows.map(emailFromRow);
}

export async function assignInboundEmail(emailId: string, projectId: string): Promise<void> {
  requireCloud();
  await cloudDataRequest("/rest/v1/rpc/assign_inbound_email", {
    method: "POST",
    body: JSON.stringify({ p_email_id: emailId, p_project_id: projectId }),
  });
}

export async function markInboundEmailImported(emailId: string, projectId: string): Promise<void> {
  requireCloud();
  await cloudDataRequest("/rest/v1/rpc/mark_inbound_email_imported", {
    method: "POST",
    body: JSON.stringify({ p_email_id: emailId, p_project_id: projectId }),
  });
}
