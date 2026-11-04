"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import AppBar from "@mui/material/AppBar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tabs from "@mui/material/Tabs";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import RefreshIcon from "@mui/icons-material/Refresh";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SyncIcon from "@mui/icons-material/Sync";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  clearLocalImportFolderHandle,
  clearImportFolder,
  getImportFolderFiles,
  loadImportFolder,
  saveImportFolder,
  saveImportFolderName,
  type ImportDirectoryHandle,
} from "@/lib/import-folder";

type DocumentStatus = "check" | "verified" | "error" | "imported";
type QueueTab = "queue" | "imported" | "errors";
type ImportDestination = "assigned" | "doctor-inbox" | "patient-file";
type StoreLocation = "Correspondence" | "Investigations";

const documentCategories = [
  "Admissions summary",
  "Advance care planning",
  "Allied health letter",
  "Certificate",
  "Clinical notes",
  "Clinical photograph",
  "Consent form",
  "DAS21",
  "Discharge summary",
  "ECG",
  "Email",
  "Form",
  "Immunisation",
  "Indigenous PIP",
  "Letter",
  "Medical imaging report",
  "MyHealth registration",
  "New PT registration form",
  "Pathology results",
  "Patient consent",
  "Record request",
  "Referral letter",
  "Workcover",
  "Workcover consent",
] as const;

const doctorReviewCategories = new Set<string>([
  "Admissions summary",
  "Advance care planning",
  "Allied health letter",
  "Clinical notes",
  "Discharge summary",
  "ECG",
  "Letter",
  "Medical imaging report",
  "Pathology results",
  "Referral letter",
]);

interface DocumentItem {
  id: string;
  name: string;
  status: DocumentStatus;
  inbox: string;
  patient: string;
  fileSize: number;
  fileLastModified: number;
  reportDate: string;
  subject: string;
  contact: string;
  storeIn: StoreLocation;
  assignedUser: string;
  category: string;
  mimeType?: string;
  previewUrl?: string;
}

interface DocumentWorkspaceProps {
  email: string;
  userId: string;
  errorMessage: string;
  onSignOut: () => void;
}

const statusInfo: Record<
  DocumentStatus,
  { label: string; color: "warning" | "success" | "error" | "info" }
> = {
  check: { label: "Check", color: "warning" },
  verified: { label: "Verified", color: "success" },
  error: { label: "Error", color: "error" },
  imported: { label: "Imported", color: "info" },
};

export function DocumentWorkspace({
  email,
  userId,
  errorMessage,
  onSignOut,
}: DocumentWorkspaceProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [folderHandle, setFolderHandle] = useState<ImportDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState("");
  const [patientOptions, setPatientOptions] = useState<string[]>([]);
  const [newPatientDialogOpen, setNewPatientDialogOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [activeTab, setActiveTab] = useState<QueueTab>("queue");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importDestination, setImportDestination] = useState<ImportDestination>("assigned");
  const [bulkImportCount, setBulkImportCount] = useState<number | null>(null);
  const [isCountingFolder, setIsCountingFolder] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    let isActive = true;

    void loadImportFolder(userId)
      .then(({ handle, folderName: savedFolderName }) => {
        if (isActive) {
          setFolderHandle(handle);
          setFolderName(savedFolderName);
        }
      })
      .catch(() => {
        if (isActive) {
          setNotice("Could not load the saved import folder from your account");
        }
      });

    return () => {
      isActive = false;
    };
  }, [userId]);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  const queueDocuments = documents.filter(
    (document) => document.status === "check" || document.status === "verified",
  );
  const importedDocuments = documents.filter(
    (document) => document.status === "imported",
  );
  const errorDocuments = documents.filter((document) => document.status === "error");
  const visibleDocuments =
    activeTab === "queue"
      ? queueDocuments
      : activeTab === "imported"
        ? importedDocuments
        : errorDocuments;
  const selectedDocument = documents.find(
    (document) => document.id === selectedDocumentId,
  );
  const selectedDocumentPosition = visibleDocuments.findIndex(
    (document) => document.id === selectedDocumentId,
  );
  const selectedCount = selectedIds.size;
  const dataReviewIssues = selectedDocument
    ? [
        !selectedDocument.patient && "Patient not found in database",
        !selectedDocument.assignedUser && "User not found in database",
      ].filter((issue): issue is string => Boolean(issue))
    : [];
  const availablePatients = Array.from(
    new Set([
      ...patientOptions,
      ...documents.map((document) => document.patient).filter(Boolean),
    ]),
  ).filter((patient) => patient !== "Not Found");
  const needsFolderAccess = Boolean(
    folderName && !folderHandle && folderFiles.length === 0,
  );

  function showNotice(message: string) {
    setNotice(message);
  }

  function createDocumentItems(files: File[]): DocumentItem[] {
    const addedDocuments = files.map((file, index): DocumentItem => {
      let previewUrl: string | undefined;
      let status: DocumentStatus = "check";

      try {
        if (file.size === 0) {
          throw new Error("The file is empty");
        }
        previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
      } catch {
        status = "error";
      }

      return {
        id: `file-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        status,
        inbox: "Doctor's Inbox",
        patient: "",
        fileSize: file.size,
        fileLastModified: file.lastModified,
        reportDate: new Date(file.lastModified || Date.now()).toISOString().slice(0, 10),
        subject: "",
        contact: "",
        storeIn: "Correspondence",
        assignedUser: "",
        category: "",
        mimeType: file.type,
        previewUrl,
      };
    });
    return addedDocuments;
  }

  function updateDocument(documentId: string, updates: Partial<DocumentItem>) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === documentId ? { ...document, ...updates } : document,
      ),
    );
  }

  function handleCategoryChange(document: DocumentItem, category: string) {
    const needsDoctorReview = doctorReviewCategories.has(category);
    updateDocument(document.id, {
      category,
      storeIn: needsDoctorReview ? "Investigations" : "Correspondence",
    });
  }

  function handleCreatePatient() {
    const name = newPatientName.trim();
    if (!name || !selectedDocument) return;

    setPatientOptions((current) =>
      current.includes(name) ? current : [...current, name],
    );
    updateDocument(selectedDocument.id, { patient: name });
    setNewPatientName("");
    setNewPatientDialogOpen(false);
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const addedDocuments = createDocumentItems(files);

    setDocuments((current) => [...addedDocuments, ...current]);
    const failedCount = addedDocuments.filter((document) => document.status === "error").length;
    setActiveTab(failedCount > 0 ? "errors" : "queue");
    setSelectedDocumentId(null);
    showNotice(
      failedCount > 0
        ? `${failedCount} file${failedCount === 1 ? "" : "s"} could not be added and moved to Errors`
        : `${files.length} file${files.length === 1 ? "" : "s"} added to Queue`,
    );
    event.target.value = "";
  }

  async function handleChooseFolder() {
    const picker = (window as Window & {
      showDirectoryPicker?: (options?: { mode: "read" }) => Promise<ImportDirectoryHandle>;
    }).showDirectoryPicker;

    if (!picker) {
      folderInput.current?.click();
      return;
    }

    try {
      const handle = await picker.call(window, { mode: "read" });
      await saveImportFolder(userId, handle);
      setFolderHandle(handle);
      setFolderName(handle.name);
      setSettingsOpen(false);
      showNotice(`${handle.name} saved to your account`);
      setIsCountingFolder(true);
      try {
        const files = await getImportFolderFiles(handle);
        setBulkImportCount(queueDocuments.length + files.length);
      } catch {
        setBulkImportCount(null);
      } finally {
        setIsCountingFolder(false);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showNotice(
        error instanceof Error ? error.message : "Unable to save the import folder",
      );
    }
  }

  async function handleFallbackFolderSelection(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      showNotice("The selected folder contains no files");
      return;
    }

    const selectedFolder = files[0].webkitRelativePath.split("/")[0] || "Selected folder";
    try {
      await saveImportFolderName(userId, selectedFolder);
      await clearLocalImportFolderHandle(userId);
      setFolderHandle(null);
      setFolderFiles(files);
      setFolderName(selectedFolder);
      setBulkImportCount(queueDocuments.length + files.length);
      setSettingsOpen(false);
      showNotice(`${selectedFolder} saved to your account`);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Unable to save the import folder",
      );
    }
  }

  async function handleClearFolder() {
    try {
      await clearImportFolder(userId);
      setFolderHandle(null);
      setFolderName("");
      showNotice("Saved import folder cleared");
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Unable to clear the import folder",
      );
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelectedIds(new Set(visibleDocuments.map((document) => document.id)));
  }

  function updateSelectedStatus(status: DocumentStatus, message: string) {
    if (selectedCount === 0) return;
    setDocuments((current) =>
      current.map((document) =>
        selectedIds.has(document.id) ? { ...document, status } : document,
      ),
    );
    setSelectedIds(new Set());
    setSelectedDocumentId(null);
    showNotice(message);
  }

  function handleDeleteSelected() {
    if (selectedCount === 0) return;
    const removed = documents.filter((document) => selectedIds.has(document.id));
    removed.forEach((document) => {
      if (document.previewUrl) {
        URL.revokeObjectURL(document.previewUrl);
        previewUrls.current.delete(document.previewUrl);
      }
    });
    setDocuments((current) =>
      current.filter((document) => !selectedIds.has(document.id)),
    );
    setSelectedIds(new Set());
    setSelectedDocumentId(null);
    showNotice(`${removed.length} file${removed.length === 1 ? "" : "s"} removed`);
  }

  function handleDownloadSelected() {
    const selected = documents.filter((document) => selectedIds.has(document.id));
    if (selected.length === 0) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "selected-documents.json";
    link.click();
    URL.revokeObjectURL(downloadUrl);
    showNotice("Document list downloaded");
  }

  async function handleOpenBulkImport() {
    setImportDialogOpen(true);
    setBulkImportCount(
      (folderName && !folderHandle && folderFiles.length === 0) ||
        (folderHandle && folderFiles.length === 0)
        ? null
        : queueDocuments.length + folderFiles.length,
    );

    if (!folderHandle) return;

    setIsCountingFolder(true);
    try {
      if (await folderHandle.queryPermission({ mode: "read" }) === "granted") {
        const files = await getImportFolderFiles(folderHandle);
        setBulkImportCount(queueDocuments.length + files.length);
      } else {
        setBulkImportCount(null);
      }
    } catch {
      setBulkImportCount(null);
    } finally {
      setIsCountingFolder(false);
    }
  }

  async function handleGrantFolderAccessAndCount() {
    if (!folderHandle) {
      await handleChooseFolder();
      return;
    }

    setIsCountingFolder(true);
    try {
      const permission = await folderHandle.requestPermission({ mode: "read" });
      if (permission !== "granted") {
        throw new Error("Folder access was not granted");
      }

      const files = await getImportFolderFiles(folderHandle);
      setBulkImportCount(queueDocuments.length + files.length);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Unable to read the selected folder",
      );
      setBulkImportCount(null);
    } finally {
      setIsCountingFolder(false);
    }
  }

  async function handleConfirmBulkImport() {
    if (isImporting) return;
    if (folderName && !folderHandle && folderFiles.length === 0) {
      setImportDialogOpen(false);
      void handleChooseFolder();
      return;
    }
    setIsImporting(true);
    setImportDialogOpen(false);

    const applyDestination = (document: DocumentItem): DocumentItem => ({
      ...document,
      inbox:
        importDestination === "doctor-inbox"
          ? "Doctor's Inbox"
          : importDestination === "patient-file"
            ? "Patient's File"
            : document.inbox,
    });

    let folderDocuments: DocumentItem[] = [];
    if (folderHandle) {
      try {
        let permission = await folderHandle.queryPermission({ mode: "read" });
        if (permission !== "granted") {
          permission = await folderHandle.requestPermission({ mode: "read" });
        }
        if (permission !== "granted") {
          throw new Error("Folder access was not granted");
        }

        const files = await getImportFolderFiles(folderHandle);
        folderDocuments = createDocumentItems(files).map((document) =>
          document.status === "error"
            ? document
            : { ...applyDestination(document), status: "verified" as const },
        );
      } catch {
        folderDocuments = [
          {
            id: `folder-error-${Date.now()}`,
            name: `${folderName} (folder import failed)`,
            status: "error",
            inbox: "Doctor's Inbox",
            patient: "Not Found",
            fileSize: 0,
            fileLastModified: Date.now(),
            reportDate: new Date().toISOString().slice(0, 10),
            subject: "",
            contact: "",
            storeIn: "Investigations",
            assignedUser: "",
            category: "",
          },
        ];
      }
    } else if (folderFiles.length > 0) {
      folderDocuments = createDocumentItems(folderFiles).map((document) =>
        document.status === "error"
          ? document
          : { ...applyDestination(document), status: "verified" as const },
      );
    }

    const failedCount = folderDocuments.filter((document) => document.status === "error").length;
    const successfulCount = queueDocuments.length + folderDocuments.length - failedCount;

    if (queueDocuments.length === 0 && folderDocuments.length === 0) {
      showNotice(folderHandle ? `No files found in ${folderName}` : "No files to import");
      setIsImporting(false);
      return;
    }

    setDocuments((current) => [
      ...folderDocuments,
      ...current.map((document) =>
        document.status === "check"
          ? { ...applyDestination(document), status: "verified" as const }
          : document,
      ),
    ]);
    setActiveTab(failedCount > 0 ? "errors" : "queue");
    setSelectedIds(new Set());
    setSelectedDocumentId(null);
    setIsImporting(false);
    showNotice(
      `${successfulCount} file${successfulCount === 1 ? "" : "s"} added to Queue${failedCount ? `; ${failedCount} failed and moved to Errors` : ""}${folderDocuments.length && failedCount === 0 ? ` from ${folderName}` : ""}`,
    );
  }

  function handleClearQueue() {
    const queueIds = new Set(queueDocuments.map((document) => document.id));
    setDocuments((current) =>
      current.filter((document) => !queueIds.has(document.id)),
    );
    setSelectedIds(new Set());
    setSelectedDocumentId(null);
    setMenuAnchor(null);
    showNotice("Import queue cleared");
  }

  function refreshQueue(scope: "all" | "selected") {
    showNotice(scope === "all" ? "Queue refreshed" : "Selection refreshed");
  }

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "#f6f8fa",
        color: "#27313d",
      }}
    >
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{
          borderBottom: "1px solid #dfe7ec",
          bgcolor: "#f5fafc",
          color: "text.primary",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            minHeight: 56,
            px: { xs: 1.5, sm: 3 },
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
          <Tooltip title="Import settings">
            <IconButton
              aria-label="Import settings"
              onClick={() => setSettingsOpen(true)}
              size="small"
            >
              <SettingsOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" noWrap sx={{ maxWidth: "60vw", fontWeight: 600 }}>
            {email}
          </Typography>
          <Tooltip title="Sign out">
            <IconButton aria-label="Sign out" onClick={onSignOut} size="small">
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            lg: selectedDocument
              ? expanded
                ? "minmax(320px, 0.9fr) minmax(380px, 1.3fr) minmax(340px, 1fr)"
                : "minmax(360px, 31%) minmax(0, 38%) minmax(360px, 31%)"
              : expanded
                ? "minmax(360px, 0.8fr) minmax(0, 1.2fr)"
                : "minmax(360px, 31%) minmax(0, 69%)",
          },
          gridTemplateRows: {
            xs: selectedDocument
              ? "minmax(520px, 68vh) minmax(480px, 70vh) minmax(640px, 1fr)"
              : "minmax(520px, 68vh) minmax(480px, 70vh)",
            lg: "1fr",
          },
          height: { xs: "auto", lg: "calc(100dvh - 56px)" },
        }}
      >
        <Box
          component="section"
          aria-label="Document import queue"
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
            borderRight: { lg: "1px solid #e0e5e9" },
            borderBottom: { xs: "1px solid #e0e5e9", lg: 0 },
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{
              px: 1.5,
              py: 1.25,
              borderBottom: "1px solid #edf0f2",
              alignItems: "center",
            }}
          >
            <Button
              variant="contained"
              startIcon={<CloudUploadOutlinedIcon />}
              onClick={() => uploadInput.current?.click()}
              sx={{ whiteSpace: "nowrap" }}
            >
              Upload
            </Button>
            <input
              ref={uploadInput}
              type="file"
              multiple
              hidden
              onChange={handleUpload}
              aria-label="Choose documents to upload"
            />
            <Button
              variant="contained"
              color="info"
              startIcon={<AutoAwesomeIcon />}
              onClick={handleOpenBulkImport}
              disabled={(queueDocuments.length === 0 && !folderName && !folderHandle && folderFiles.length === 0) || isImporting}
              sx={{ whiteSpace: "nowrap", flex: 1 }}
            >
              {isImporting ? <CircularProgress size={20} color="inherit" /> : "Auto Bulk Import"}
            </Button>
            <input
              ref={folderInput}
              type="file"
              multiple
              hidden
              onChange={handleFallbackFolderSelection}
              aria-label="Choose import folder"
              {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            />
            <Tooltip title={expanded ? "Reduce queue width" : "Expand queue"}>
              <IconButton
                aria-label={expanded ? "Reduce queue width" : "Expand queue"}
                onClick={() => setExpanded((value) => !value)}
                sx={{ border: "1px solid #dce2e7", borderRadius: 1.5 }}
              >
                <OpenInFullIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          <Tabs
            value={activeTab}
            onChange={(_, value: QueueTab) => {
              setActiveTab(value);
              setSelectedIds(new Set());
              setSelectedDocumentId(null);
            }}
            variant="fullWidth"
            sx={{ minHeight: 44, borderBottom: "1px solid #e6eaed" }}
          >
            <Tab
              value="queue"
              label={<TabLabel label="Queue" count={queueDocuments.length} />}
              sx={{ minHeight: 44, py: 0 }}
            />
            <Tab
              value="imported"
              label={<TabLabel label="Imported" count={importedDocuments.length} />}
              sx={{ minHeight: 44, py: 0 }}
            />
            <Tab
              value="errors"
              label={<TabLabel label="Errors" count={errorDocuments.length} />}
              sx={{ minHeight: 44, py: 0 }}
            />
          </Tabs>

          <Paper
            variant="outlined"
            sx={{ mx: 1.25, mt: 1.25, p: 1.5, borderColor: "#e2e7eb", borderRadius: 2 }}
          >
            <Stack
              direction="row"
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.3 }}>
                {activeTab === "queue" ? "IMPORT QUEUE" : activeTab.toUpperCase()}
              </Typography>
              <Chip
                size="small"
                label={`${visibleDocuments.length} ${visibleDocuments.length === 1 ? "FILE" : "FILES"}`}
                sx={{ bgcolor: "#eef3fb", color: "#436294", fontWeight: 700 }}
              />
            </Stack>

            <Stack direction="row" sx={{ mt: 1.25, flexWrap: "wrap", gap: 0.75 }}>
              <QueueActionButton label="Refresh all" icon={<RefreshIcon fontSize="small" />} onClick={() => refreshQueue("all")} />
              <QueueActionButton
                label="Refresh selected"
                icon={<SyncIcon fontSize="small" />}
                onClick={() => refreshQueue("selected")}
                disabled={selectedCount === 0}
              />
              <QueueActionButton
                label="Delete from queue"
                icon={<DeleteIcon fontSize="small" />}
                onClick={handleDeleteSelected}
                disabled={selectedCount === 0}
              />
              <QueueActionButton
                label="Select all"
                icon={<DoneAllIcon fontSize="small" />}
                onClick={selectVisible}
                disabled={visibleDocuments.length === 0}
              />
              <QueueActionButton
                label="Clear selection"
                icon={<ClearAllIcon fontSize="small" />}
                onClick={() => setSelectedIds(new Set())}
                disabled={selectedCount === 0}
              />
              <QueueActionButton
                label="Mark selected verified"
                icon={<MoveToInboxIcon fontSize="small" />}
                onClick={() => updateSelectedStatus("verified", "Selected files remain in Queue as verified")}
                disabled={selectedCount === 0}
              />
              <QueueActionButton
                label="Flag selected as error"
                icon={<FlagOutlinedIcon fontSize="small" />}
                onClick={() => updateSelectedStatus("error", "Selected files moved to errors")}
                disabled={selectedCount === 0}
              />
              <QueueActionButton
                label="Download selected list"
                icon={<DownloadOutlinedIcon fontSize="small" />}
                onClick={handleDownloadSelected}
                disabled={selectedCount === 0}
              />
              <Tooltip title="More queue actions">
                <IconButton
                  aria-label="More queue actions"
                  size="small"
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  sx={{
                    width: 38,
                    height: 38,
                    border: "1px solid",
                    borderColor: "grey.300",
                    borderRadius: 1.5,
                  }}
                >
                  <MoreHorizIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
            >
              <MenuItem onClick={handleClearQueue}>Clear import queue</MenuItem>
            </Menu>

            <Dialog
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle>Import settings</DialogTitle>
              <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    The folder name is saved to your account. Browser access stays on this device and may need permission again after sign-out.
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
                    <Stack spacing={0.75}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Import folder
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {folderName
                          ? `${folderName} · ${folderHandle ? "linked on this device" : folderFiles.length ? `${folderFiles.length} files ready` : "select again on this device"}`
                          : "No folder selected"}
                      </Typography>
                    </Stack>
                  </Paper>
                  <Button
                    variant="outlined"
                    startIcon={<FolderOpenOutlinedIcon />}
                    onClick={handleChooseFolder}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Choose folder
                  </Button>
                </Stack>
              </DialogContent>
              <DialogActions>
                {folderName && (
                  <Button
                    color="inherit"
                    onClick={handleClearFolder}
                  >
                    Clear folder
                  </Button>
                )}
                <Button onClick={() => setSettingsOpen(false)}>Done</Button>
              </DialogActions>
            </Dialog>

            <Dialog
              open={importDialogOpen}
              onClose={() => setImportDialogOpen(false)}
              fullWidth
              maxWidth="sm"
            >
              <DialogTitle sx={{ pb: 1 }}>
                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Autonomous Mode is{" "}
                    <Box component="span" sx={{ color: "success.main", fontWeight: 700 }}>
                      On
                    </Box>
                  </Typography>
                  <Typography
                    variant="overline"
                    color="info.main"
                    sx={{ fontWeight: 800, letterSpacing: 3, lineHeight: 1.5 }}
                  >
                    Bulk Import Ready
                  </Typography>
                  <Typography component="h2" variant="h4" sx={{ fontWeight: 750 }}>
                    {bulkImportCount === null
                      ? isCountingFolder
                        ? "Counting documents..."
                        : needsFolderAccess
                          ? "Folder access required"
                          : "Grant access to count documents"
                      : bulkImportCount === 0
                        ? "No documents to import"
                        : `${bulkImportCount} document${bulkImportCount === 1 ? "" : "s"} selected`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Destination: {importDestination === "assigned"
                      ? "Each Document's Setting"
                      : importDestination === "doctor-inbox"
                        ? "Doctor's Inbox"
                        : "Patient's File"}
                  </Typography>
                </Stack>
              </DialogTitle>
              <DialogContent>
                <RadioGroup
                  value={importDestination}
                  onChange={(_, value) => setImportDestination(value as ImportDestination)}
                  aria-label="Import destination"
                >
                  <FormControlLabel
                    value="assigned"
                    control={<Radio />}
                    label="Each document's assigned Inbox Type"
                  />
                  <FormControlLabel
                    value="doctor-inbox"
                    control={<Radio />}
                    label="Doctor's Inbox"
                  />
                  <FormControlLabel
                    value="patient-file"
                    control={<Radio />}
                    label="Patient's File"
                  />
                </RadioGroup>
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Before You Continue
                  </Typography>
                  Confirm the destination before allocating these documents.
                </Alert>
                {bulkImportCount === null && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    {needsFolderAccess
                      ? `Select ${folderName} on this device to count and import its files.`
                      : "Grant read access to the selected folder to count its files."}
                  </Alert>
                )}
                {bulkImportCount === null && (
                  <Button
                    variant="outlined"
                    startIcon={
                      isCountingFolder ? (
                        <CircularProgress size={16} />
                      ) : (
                        <FolderOpenOutlinedIcon />
                      )
                    }
                    onClick={handleGrantFolderAccessAndCount}
                    disabled={isCountingFolder}
                    sx={{ mt: 1, alignSelf: "flex-start" }}
                  >
                    {needsFolderAccess ? "Choose folder and count files" : "Grant access and count files"}
                  </Button>
                )}
              </DialogContent>
              <DialogActions sx={{ px: 3, pb: 2.5 }}>
                <Button onClick={() => setImportDialogOpen(false)}>Back</Button>
                <Button
                  variant="contained"
                  startIcon={<MoveToInboxIcon />}
                  onClick={handleConfirmBulkImport}
                  disabled={isImporting || bulkImportCount === null || bulkImportCount === 0}
                >
                  {isImporting ? "Allocating..." : "Confirm & Allocate"}
                </Button>
              </DialogActions>
            </Dialog>
          </Paper>

          <Box sx={{ px: 1.5, py: 1.25, minHeight: 48 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {visibleDocuments.length === 0
                ? "No documents"
                : `1-${visibleDocuments.length} of ${visibleDocuments.length} documents`}
            </Typography>
          </Box>

          <TableContainer sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <Table
              stickyHeader
              size="small"
              aria-label={`${activeTab} documents`}
              sx={{ width: "100%", tableLayout: "fixed" }}
            >
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ width: { xs: 30, sm: 36 }, px: { xs: 0.25, sm: 0.5 } }}>
                    <Checkbox
                      size="small"
                      checked={visibleDocuments.length > 0 && selectedCount === visibleDocuments.length}
                      indeterminate={selectedCount > 0 && selectedCount < visibleDocuments.length}
                      onChange={(event) =>
                        event.target.checked ? selectVisible() : setSelectedIds(new Set())
                      }
                      slotProps={{ input: { "aria-label": "Select all visible documents" } }}
                    />
                  </TableCell>
                  <TableCell sx={{ width: { xs: 28, sm: 36 }, px: { xs: 0.5, sm: 0.75 }, fontWeight: 700 }}>#</TableCell>
                  <TableCell sx={{ width: { xs: 72, sm: 100 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>STATUS</TableCell>
                  <TableCell sx={{ width: { xs: 68, sm: 95 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>INBOX</TableCell>
                  <TableCell sx={{ width: { xs: 74, sm: 90 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>PATIENT</TableCell>
                  <TableCell sx={{ width: { xs: 90, sm: 130 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>USER</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleDocuments.map((document, index) => (
                  <TableRow
                    key={document.id}
                    hover
                    selected={document.id === selectedDocumentId}
                    onClick={() => setSelectedDocumentId(document.id)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell padding="checkbox" sx={{ px: { xs: 0.25, sm: 0.5 } }} onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={selectedIds.has(document.id)}
                        onChange={() => toggleSelected(document.id)}
                        slotProps={{ input: { "aria-label": `Select ${document.name}` } }}
                      />
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.5, sm: 0.5 } }}>{index + 1}</TableCell>
                    <TableCell>
                      <StatusChip status={document.status} />
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.25, sm: 0.5 }, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {document.inbox}
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.25, sm: 0.5 }, overflow: "hidden", textOverflow: "ellipsis", color: document.patient === "Not Found" ? "error.dark" : "primary.main" }}>
                      {document.patient}
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.25, sm: 0.5 }, overflow: "hidden" }}>
                      <Typography variant="body2" noWrap title={email}>
                        {email || "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Box
          component="section"
          aria-label="Document preview"
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            borderRight: { lg: "1px solid #e0e5e9" },
            borderBottom: { xs: "1px solid #e0e5e9", lg: 0 },
            bgcolor: "#edf1f4",
          }}
        >
          {selectedDocument?.previewUrl && isPdfDocument(selectedDocument) ? (
            <Box
              component="iframe"
              src={selectedDocument.previewUrl}
              title={`PDF preview of ${selectedDocument.name}`}
              sx={{ width: "100%", height: "100%", minHeight: 480, border: 0, bgcolor: "#fff" }}
            />
          ) : selectedDocument?.previewUrl && selectedDocument.mimeType?.startsWith("image/") ? (
            <Box
              component="img"
              src={selectedDocument.previewUrl}
              alt={`Preview of ${selectedDocument.name}`}
              sx={{ display: "block", maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : selectedDocument?.previewUrl && isDocxDocument(selectedDocument) ? (
            <DocxPreview key={selectedDocument.id} document={selectedDocument} />
          ) : (
            <Stack spacing={1} sx={{ p: 3, textAlign: "center", alignItems: "center" }}>
              <DescriptionOutlinedIcon sx={{ fontSize: 44, color: "text.secondary" }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {selectedDocument ? "Preview unavailable" : "No Document Selected"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedDocument
                  ? "Preview is available for PDF, DOCX, and image files."
                  : "Select a document from the queue to view it here."}
              </Typography>
            </Stack>
          )}
        </Box>

        <Box
          component="section"
          aria-label="Document information"
          sx={{
            minWidth: 0,
            minHeight: 0,
            display: selectedDocument ? "flex" : "none",
            alignItems: "center",
            justifyContent: "center",
            p: { xs: 2, sm: 3 },
            bgcolor: "#fff",
          }}
        >
          {selectedDocument ? (
            <Paper
              variant="outlined"
              sx={{
                width: "100%",
                height: "100%",
                p: { xs: 2, sm: 2.5 },
                borderRadius: 2,
                overflow: "auto",
              }}
            >
              <Stack spacing={2.25}>
                <Box>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography component="h2" variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
                      Document Information
                    </Typography>
                    <Tooltip title="Previous document">
                      <span>
                        <IconButton
                          aria-label="Previous document"
                          disabled={selectedDocumentPosition <= 0}
                          onClick={() => setSelectedDocumentId(visibleDocuments[selectedDocumentPosition - 1]?.id ?? null)}
                          size="small"
                        >
                          <KeyboardArrowLeftIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Next document">
                      <span>
                        <IconButton
                          aria-label="Next document"
                          disabled={selectedDocumentPosition < 0 || selectedDocumentPosition >= visibleDocuments.length - 1}
                          onClick={() => setSelectedDocumentId(visibleDocuments[selectedDocumentPosition + 1]?.id ?? null)}
                          size="small"
                        >
                          <KeyboardArrowRightIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "center" }}>
                    <DescriptionOutlinedIcon fontSize="small" color="action" />
                    <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: 600 }} title={selectedDocument.name}>
                      {selectedDocument.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatFileSize(selectedDocument.fileSize)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    File date (last modified): {new Date(selectedDocument.fileLastModified).toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {selectedDocumentPosition >= 0 ? `${selectedDocumentPosition + 1} of ${visibleDocuments.length}` : ""}
                  </Typography>
                </Box>

                {dataReviewIssues.length > 0 && (
                  <Alert severity="warning" icon={<WarningAmberIcon />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Data Review Needed
                    </Typography>
                    <Box component="ul" sx={{ my: 0.5, pl: 2 }}>
                      {dataReviewIssues.map((issue) => <li key={issue}>{issue}</li>)}
                    </Box>
                  </Alert>
                )}

                {selectedDocument.status === "error" && (
                  <Alert severity="warning">
                    Review this document before filing. Check the required information below.
                  </Alert>
                )}

                <Divider />

                <Stack spacing={2}>
                  <Box>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Inbox Type
                      </Typography>
                      <RadioGroup
                        row
                        value={selectedDocument.inbox || "Doctor's Inbox"}
                        onChange={(_, inbox) =>
                          updateDocument(selectedDocument.id, { inbox })
                        }
                        aria-label="Inbox Type"
                      >
                        <FormControlLabel
                          value="Doctor's Inbox"
                          control={<Radio size="small" />}
                          label="Doctor's Inbox"
                        />
                        <FormControlLabel
                          value="Patient's File"
                          control={<Radio size="small" />}
                          label="Patient's File"
                        />
                      </RadioGroup>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      Defaults to Doctor&apos;s Inbox. Change this when the document belongs in the patient&apos;s file.
                    </Typography>
                  </Box>

                  <Autocomplete
                    options={availablePatients}
                    value={selectedDocument.patient || null}
                    onChange={(_, patient) => updateDocument(selectedDocument.id, { patient: patient ?? "" })}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Patient"
                        placeholder="Search for a patient..."
                        required
                      />
                    )}
                    noOptionsText="No patients available"
                  />
                  <Button
                    variant="outlined"
                    onClick={() => setNewPatientDialogOpen(true)}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Create New Patient
                  </Button>

                  <TextField
                    select
                    label="Category"
                    value={selectedDocument.category}
                    onChange={(event) => handleCategoryChange(selectedDocument, event.target.value)}
                    required
                    fullWidth
                  >
                    <MenuItem value=""><em>Select category</em></MenuItem>
                    {documentCategories.map((category) => (
                      <MenuItem key={category} value={category}>{category}</MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Date of report"
                    type="date"
                    value={selectedDocument.reportDate}
                    onChange={(event) => updateDocument(selectedDocument.id, { reportDate: event.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                    fullWidth
                  />

                  <TextField
                    label="Subject"
                    placeholder="e.g. Ultrasound of left foot"
                    value={selectedDocument.subject}
                    onChange={(event) => updateDocument(selectedDocument.id, { subject: event.target.value })}
                    required
                    fullWidth
                  />

                  <TextField
                    label="Contact of source"
                    placeholder="e.g. Lakes Radiology"
                    value={selectedDocument.contact}
                    onChange={(event) => updateDocument(selectedDocument.id, { contact: event.target.value })}
                    fullWidth
                  />

                  <TextField
                    select
                    label="Store in"
                    value={selectedDocument.storeIn}
                    onChange={(event) => updateDocument(selectedDocument.id, { storeIn: event.target.value as StoreLocation })}
                    required
                    fullWidth
                  >
                    <MenuItem value="Correspondence">Correspondence</MenuItem>
                    <MenuItem value="Investigations">Investigations</MenuItem>
                  </TextField>

                  <TextField
                    label="User (GP Doctor)"
                    placeholder="e.g. Dr Smith"
                    value={selectedDocument.assignedUser}
                    onChange={(event) => updateDocument(selectedDocument.id, { assignedUser: event.target.value })}
                    helperText="Enter the GP doctor responsible for review, not the reporting specialist."
                    fullWidth
                  />
                </Stack>
              </Stack>
            </Paper>
          ) : (
            <Stack spacing={1.5} sx={{ maxWidth: 480, textAlign: "center", alignItems: "center" }}>
              <Box
                sx={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  bgcolor: "#f1f4f6",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <DescriptionOutlinedIcon sx={{ fontSize: 30, color: "text.secondary" }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No Documents Selected
              </Typography>
              <Typography color="text.secondary">
                Upload or drag a document, or select one from the import queue.
              </Typography>
              <Button
                variant="contained"
                startIcon={<CloudUploadOutlinedIcon />}
                onClick={() => uploadInput.current?.click()}
                sx={{ mt: 1 }}
              >
                Upload Documents
              </Button>
            </Stack>
          )}
        </Box>
      </Box>

      <Dialog
        open={newPatientDialogOpen}
        onClose={() => setNewPatientDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Create New Patient</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Patient name"
            value={newPatientName}
            onChange={(event) => setNewPatientName(event.target.value)}
            required
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewPatientDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreatePatient} variant="contained" disabled={!newPatientName.trim()}>
            Create patient
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={2600}
        onClose={() => setNotice("")}
        message={notice}
      />
    </Box>
  );
}

function TabLabel({ label, count }: { label: string; count: number }) {
  return (
    <Badge
      badgeContent={count}
      color={count > 0 ? "primary" : "default"}
      sx={{ "& .MuiBadge-badge": { right: -14, top: 4, fontSize: 10 } }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    </Badge>
  );
}

function StatusChip({ status }: { status: DocumentStatus }) {
  const { label, color } = statusInfo[status];
  return (
    <Chip
      size="small"
      label={label}
      color={color}
      sx={{
        maxWidth: "100%",
        fontWeight: 700,
        fontSize: { xs: "0.65rem", sm: "0.8125rem" },
        "& .MuiChip-label": { px: 0.75, overflow: "hidden", textOverflow: "ellipsis" },
      }}
    />
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isPdfDocument(document: DocumentItem): boolean {
  return document.mimeType === "application/pdf" || document.name.toLowerCase().endsWith(".pdf");
}

function isDocxDocument(document: DocumentItem): boolean {
  return (
    document.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    document.name.toLowerCase().endsWith(".docx")
  );
}

function DocxPreview({ document }: { document: DocumentItem }) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const previewElement = previewRef.current;
    if (!previewElement || !document.previewUrl) return;

    let isActive = true;

    async function renderDocument() {
      try {
        const response = await fetch(document.previewUrl!);
        if (!response.ok) throw new Error("Unable to read the selected DOCX file");
        const blob = await response.blob();
        const { renderAsync } = await import("docx-preview");
        if (!isActive) return;

        await renderAsync(blob, previewElement!, previewElement!, {
          className: "docx",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreLastRenderedPageBreak: false,
          breakPages: true,
        });
      } catch {
        if (isActive) setHasError(true);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void renderDocument();
    return () => {
      isActive = false;
      previewElement.replaceChildren();
    };
  }, [document.id, document.previewUrl]);

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%", minHeight: 480, overflow: "auto", bgcolor: "#edf1f4" }}>
      <Box
        ref={previewRef}
        sx={{ minHeight: "100%" }}
      />
      {isLoading && !hasError && (
        <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", bgcolor: "rgba(237, 241, 244, 0.8)" }}>
          <CircularProgress aria-label="Rendering Word document" />
        </Box>
      )}
      {hasError && (
        <Alert severity="error" sx={{ position: "sticky", bottom: 12, mx: 2 }}>
          Could not render this DOCX file.
        </Alert>
      )}
    </Box>
  );
}

function QueueActionButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          size="small"
          sx={{
            width: 38,
            height: 38,
            border: "1px solid",
            borderColor: disabled ? "divider" : "grey.300",
            borderRadius: 1.5,
            color: disabled ? "text.disabled" : "text.secondary",
            bgcolor: disabled ? "grey.50" : "background.paper",
          }}
        >
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );
}