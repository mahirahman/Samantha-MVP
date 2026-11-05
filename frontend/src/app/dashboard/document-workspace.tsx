"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
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
import LinearProgress from "@mui/material/LinearProgress";
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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import ClearAllIcon from "@mui/icons-material/ClearAll";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import MergeIcon from "@mui/icons-material/Merge";
import { PdfOperationsDialog, type PdfOperation } from "./pdf-operations-dialog";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
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
import { listWorkspaceDocuments, saveWorkspaceDocument, deleteWorkspaceDocumentsFromDb, restoreWorkspaceDocumentFromDb, type DocumentItem as StoredDocumentItem } from "@/lib/documents";
import { processDocumentFile } from "@/lib/document-processing";
import { InteractiveDocumentViewer } from "./interactive-document-viewer";
import {
  createPatient,
  emptyNewPatientInput,
  getPatientById,
  listPatients,
  matchPatientIdentifiers,
  type FullPatientRecord,
  type NewPatientInput,
  type PatientRecord,
} from "@/lib/patients";
import {
  listDoctors,
  matchDoctorByName,
  type DoctorRecord,
} from "@/lib/doctors";

type DocumentStatus = StoredDocumentItem["status"];
type QueueTab = "queue" | "imported" | "errors" | "recycle";
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

type DocumentItem = StoredDocumentItem & {
  demographics: NewPatientInput;
  fileLastModified: number;
};

interface DocumentWorkspaceProps {
  email: string;
  userId: string;
  errorMessage: string;
  onSignOut: () => void;
}

interface ProcessingProgress {
  total: number;
  completed: number;
  currentFileName: string;
}

const statusInfo: Record<
  DocumentStatus,
  { label: string; color: "warning" | "success" | "error" | "info" }
> = {
  check: { label: "Check", color: "warning" },
  verified: { label: "Verified", color: "success" },
  error: { label: "Error", color: "error" },
  imported: { label: "Imported", color: "info" },
  deleted: { label: "Recycled", color: "info" },
};

export function isDocumentVerified(document: {
  inbox: string;
  patientVerified: boolean;
  userVerified: boolean;
}): boolean {
  if (!document.patientVerified) {
    return false;
  }
  if (document.inbox === "Patient's File") {
    return true;
  }
  return document.userVerified;
}

export function getDocumentStatus(document: DocumentItem): DocumentStatus {
  if (document.status === "deleted") return "deleted";
  if (document.status === "imported") return "imported";
  if (document.status === "error") return "error";
  if (isDocumentVerified(document)) return "verified";
  return "check";
}

export function DocumentWorkspace({
  email,
  userId,
  errorMessage,
  onSignOut,
}: DocumentWorkspaceProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const documentsLoaded = loadedUserId === userId;
  const persistedDocuments = useRef(new Map<string, DocumentItem>());
  const persistenceQueue = useRef<Promise<void>>(Promise.resolve());
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [folderHandle, setFolderHandle] = useState<ImportDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState("");
  const [patientRecords, setPatientRecords] = useState<PatientRecord[]>([]);
  const [doctorRecords, setDoctorRecords] = useState<DoctorRecord[]>([]);
  const doctorRecordsRef = useRef<DoctorRecord[]>([]);
  const [rightPanelMode, setRightPanelMode] = useState<
    "document-info" | "show-patient" | "create-patient"
  >("document-info");
  const [newPatientForm, setNewPatientForm] = useState<NewPatientInput>(emptyNewPatientInput());
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [viewedPatientRecord, setViewedPatientRecord] = useState<FullPatientRecord | null>(null);
  const [isLoadingPatientRecord, setIsLoadingPatientRecord] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<QueueTab>("queue");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [activeHighlightField, setActiveHighlightField] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [reportErrorDialogOpen, setReportErrorDialogOpen] = useState(false);
  const [reportErrorMessage, setReportErrorMessage] = useState("");
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [importDestination, setImportDestination] = useState<ImportDestination>("assigned");
  const [bulkImportCount, setBulkImportCount] = useState<number | null>(null);
  const [isCountingFolder, setIsCountingFolder] = useState(false);
  const [pdfOperation, setPdfOperation] = useState<PdfOperation | null>(null);
  const [isRecycling, setIsRecycling] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    void listWorkspaceDocuments(userId, true).then((records) => {
      if (!active) return;
      const loaded = records.map((record) => ({
        ...record,
        demographics: record.demographics ?? emptyNewPatientInput(),
        fileLastModified: record.fileLastModified ?? 0,
      }));
      persistedDocuments.current = new Map(loaded.map((doc) => [doc.id, doc]));
      setDocuments(loaded);
      setLoadedUserId(userId);
    }).catch(() => {
      if (active) setNotice("Could not load workspace documents. Refresh to retry.");
    });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!documentsLoaded) return;
    const previous = persistedDocuments.current;
    const next = new Map(documents.map((doc) => [doc.id, doc]));
    const changed = documents.filter((doc) => previous.get(doc.id) !== doc);
    const removed = [...previous.keys()].filter((id) => !next.has(id));
    persistedDocuments.current = next;
    persistenceQueue.current = persistenceQueue.current.then(async () => {
      for (const doc of changed) await saveWorkspaceDocument(doc, userId);
      if (removed.length) await deleteWorkspaceDocumentsFromDb(removed, userId);
    }).catch(() => {
      setNotice("Could not save workspace changes to the database. Please retry before refreshing.");
    });
  }, [documents, documentsLoaded, userId]);

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

  useEffect(() => {
    let isActive = true;

    void listPatients()
      .then((records) => {
        if (isActive) setPatientRecords(records);
      })
      .catch(() => {
        if (isActive) {
          setNotice("Could not load patients from the database");
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    void listDoctors()
      .then((records) => {
        if (isActive) {
          setDoctorRecords(records);
          doctorRecordsRef.current = records;
        }
      })
      .catch(() => {
        if (isActive) {
          setNotice("Could not load doctors from the database");
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );

  useEffect(() => {
    setRightPanelMode("document-info");
    setViewedPatientRecord(null);
    setActiveHighlightField(null);
  }, [selectedDocumentId]);

  const handleSelectHighlightField = useCallback((fieldName: string) => {
    setActiveHighlightField(fieldName);
    setRightPanelMode("document-info");
    const wrapper = window.document.getElementById(`field-wrapper-${fieldName}`);
    if (wrapper) {
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      const input = wrapper.querySelector("input, select, textarea") as HTMLElement | null;
      if (input) {
        input.focus();
      }
    }
  }, []);

  const queueDocuments = documents.filter((document) => {
    const s = getDocumentStatus(document);
    return s === "check" || s === "verified";
  });
  const importedDocuments = documents.filter(
    (document) => getDocumentStatus(document) === "imported",
  );
  const errorDocuments = documents.filter(
    (document) => getDocumentStatus(document) === "error",
  );
  const recycledDocuments = documents.filter((document) => document.status === "deleted");
  const visibleDocuments =
    activeTab === "queue"
      ? queueDocuments
      : activeTab === "imported"
        ? importedDocuments
        : activeTab === "errors" ? errorDocuments : recycledDocuments;
  const selectedDocument = documents.find(
    (document) => document.id === selectedDocumentId,
  );
  const selectedDocumentPosition = visibleDocuments.findIndex(
    (document) => document.id === selectedDocumentId,
  );
  const selectedCount = selectedIds.size;
  const dataReviewIssues = selectedDocument
    ? [
        !selectedDocument.patientVerified && "Patient not found in database",
        selectedDocument.inbox !== "Patient's File" &&
          !selectedDocument.userVerified &&
          "User not found in database",
      ].filter((issue): issue is string => Boolean(issue))
    : [];
  const availablePatients = Array.from(
    new Set([
      ...patientRecords.map((patient) => patient.fullName),
      ...documents.map((document) => document.patient).filter(Boolean),
    ]),
  );
  const availableDoctors = Array.from(
    new Set([
      ...doctorRecords.map((doctor) => doctor.fullName),
      ...documents.map((document) => document.assignedUser).filter(Boolean),
    ]),
  );
  const needsFolderAccess = Boolean(
    folderName && !folderHandle && folderFiles.length === 0,
  );

  function showNotice(message: string) {
    setNotice(message);
  }

  function createDocumentItems(files: File[]): DocumentItem[] {
    const addedDocuments = files.map((file): DocumentItem => {
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
        id: crypto.randomUUID(),
        name: file.name,
        status,
        inbox: "Doctor's Inbox",
        patient: "",
        dateOfBirth: "",
        patientVerified: false,
        matchedIdentifierCount: 0,
        demographics: emptyNewPatientInput(),
        fileSize: file.size,
        fileLastModified: file.lastModified,
        reportDate: new Date(file.lastModified || Date.now()).toISOString().slice(0, 10),
        subject: "",
        contact: "",
        storeIn: "Correspondence",
        assignedUser: "",
        doctorId: undefined,
        userVerified: false,
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

  function handleOpenCreatePatientDialog() {
    if (!selectedDocument) return;

    const demographics = selectedDocument.demographics ?? emptyNewPatientInput();
    let { firstName, lastName } = demographics;
    if (!firstName && !lastName && selectedDocument.patient) {
      const split = splitFullName(selectedDocument.patient);
      firstName = split.firstName;
      lastName = split.lastName;
    }

    setNewPatientForm({
      ...demographics,
      firstName,
      lastName,
      dateOfBirth: demographics.dateOfBirth || selectedDocument.dateOfBirth || "",
    });
    setRightPanelMode("create-patient");
  }

  function updateNewPatientField(field: keyof NewPatientInput, value: string) {
    setNewPatientForm((current) => ({ ...current, [field]: value }));
  }

  async function handleShowPatientRecord() {
    if (!selectedDocument?.patientId) return;

    setRightPanelMode("show-patient");
    setIsLoadingPatientRecord(true);
    try {
      const record = await getPatientById(selectedDocument.patientId);
      setViewedPatientRecord(record);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Unable to load the patient record",
      );
      setRightPanelMode("document-info");
    } finally {
      setIsLoadingPatientRecord(false);
    }
  }

  async function handleCreatePatient() {
    const firstName = (newPatientForm.firstName ?? "").trim();
    const lastName = (newPatientForm.lastName ?? "").trim();
    const dateOfBirth = (newPatientForm.dateOfBirth ?? "").trim();
    if (!firstName || !lastName || !dateOfBirth || !selectedDocument) return;

    setIsCreatingPatient(true);
    try {
      const patient = await createPatient(newPatientForm);
      setPatientRecords((current) => [...current, patient].sort(
        (a, b) => a.fullName.localeCompare(b.fullName),
      ));
      const isVerified = isDocumentVerified({
        inbox: selectedDocument.inbox,
        patientVerified: true,
        userVerified: selectedDocument.userVerified,
      });
      updateDocument(selectedDocument.id, {
        patient: patient.fullName,
        patientId: patient.id,
        dateOfBirth: patient.dateOfBirth,
        patientVerified: true,
        matchedIdentifierCount: 2,
        status: isVerified ? "verified" : "check",
      });
      setNewPatientForm(emptyNewPatientInput());
      setRightPanelMode("document-info");
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Unable to create the patient",
      );
    } finally {
      setIsCreatingPatient(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const allFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (allFiles.length === 0 || !documentsLoaded || isImporting) return;

    // Reject any files that already exist in documents (queue, imported, or errors) or duplicates in current batch
    const existingNames = new Set(documents.filter((d) => d.status !== "deleted").map((d) => d.name.toLowerCase().trim()));
    const seenInBatch = new Set<string>();
    const files: File[] = [];
    const skippedFiles: string[] = [];

    for (const file of allFiles) {
      const normalized = file.name.toLowerCase().trim();
      if (existingNames.has(normalized) || seenInBatch.has(normalized)) {
        skippedFiles.push(file.name);
        continue;
      }
      seenInBatch.add(normalized);
      files.push(file);
    }

    if (files.length === 0) {
      const existingDoc = documents.find(
        (d) => d.status !== "deleted" && d.name.toLowerCase().trim() === allFiles[0].name.toLowerCase().trim(),
      );
      const tabName =
        existingDoc?.status === "imported"
          ? "Imported tab"
          : existingDoc?.status === "error"
            ? "Errors tab"
            : "Queue";
      showNotice(
        allFiles.length === 1
          ? `"${allFiles[0].name}" already exists in ${tabName} and cannot be imported again.`
          : `All ${allFiles.length} selected files already exist in the workspace and were skipped.`,
      );
      return;
    }

    if (skippedFiles.length > 0) {
      showNotice(
        `${skippedFiles.length} duplicate file${
          skippedFiles.length === 1 ? "" : "s"
        } already in the workspace ${skippedFiles.length === 1 ? "was" : "were"} skipped.`,
      );
    }

    const addedDocuments = createDocumentItems(files);
    setSelectedDocumentId(null);

    setIsImporting(true);
    setProcessingProgress({ total: addedDocuments.length, completed: 0, currentFileName: "" });
    let failedCount = 0;
    let successfulCount = 0;
    const processedDocuments: DocumentItem[] = [];

    try {
      for (const [index, document] of addedDocuments.entries()) {
        setProcessingProgress((current) =>
          current ? { ...current, currentFileName: document.name } : current,
        );
        // Reserve the filename in the database before OCR/Gemini starts.
        await saveWorkspaceDocument({ ...document, status: "error", processingError: "Import interrupted before processing completed. Reprocess to retry." }, userId, files[index]);
        let processedDocument = document;

        if (document.status !== "error") {
          try {
            const result = await processDocumentFile(files[index]);
            processedDocument = await mapExtraction(document, result);
            successfulCount += 1;
          } catch (error) {
            processedDocument = {
              ...document,
              status: "error",
              processingError:
                error instanceof Error ? error.message : "Document processing failed",
            };
            failedCount += 1;
          }
        } else {
          failedCount += 1;
        }

        await saveWorkspaceDocument(processedDocument, userId);
        processedDocuments.push(processedDocument);
        setProcessingProgress((current) =>
          current ? { ...current, completed: current.completed + 1 } : current,
        );
      }
    } catch (error) {
      setDocuments((current) => [...processedDocuments, ...current]);
      showNotice(error instanceof Error ? error.message : "Import could not be saved. Please refresh before retrying.");
      return;
    } finally {
      setIsImporting(false);
      setProcessingProgress(null);
    }

    // Documents only enter the Queue/Errors tables once every file has
    // finished OCR + extraction, so the modal's progress bar is the sole
    // indicator while processing is in flight.
    setDocuments((current) => [...processedDocuments, ...current]);
    setActiveTab(failedCount > 0 ? "errors" : "queue");
    showNotice(
      `${successfulCount} file${successfulCount === 1 ? "" : "s"} processed${failedCount ? `; ${failedCount} failed and moved to Errors` : " and added to Queue"}`,
    );
  }

  function getNewFolderFiles(files: File[]): File[] {
    const seen = new Set(documents.filter((doc) => doc.status !== "deleted").map((doc) => doc.name.toLowerCase().trim()));
    return files.filter((file) => {
      const name = file.name.toLowerCase().trim();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
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
        setBulkImportCount(getNewFolderFiles(files).length);
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

    const newFiles = getNewFolderFiles(files);
    const skippedCount = files.length - newFiles.length;

    const selectedFolder = files[0].webkitRelativePath.split("/")[0] || "Selected folder";
    try {
      await saveImportFolderName(userId, selectedFolder);
      await clearLocalImportFolderHandle(userId);
      setFolderHandle(null);
      setFolderFiles(files);
      setFolderName(selectedFolder);
      setBulkImportCount(newFiles.length);
      setSettingsOpen(false);
      showNotice(
        skippedCount > 0
          ? `${selectedFolder} saved. ${newFiles.length} new files ready (${skippedCount} existing files skipped).`
          : `${selectedFolder} saved to your account (${newFiles.length} files ready)`,
      );
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

  function commitSavedDocuments(next: DocumentItem[]) {
    persistedDocuments.current = new Map(next.map((doc) => [doc.id, doc]));
    setDocuments(next);
  }

  async function reloadSavedDocuments() {
    const records = await listWorkspaceDocuments(userId, true);
    commitSavedDocuments(records.map((doc) => ({
      ...doc, demographics: doc.demographics ?? emptyNewPatientInput(), fileLastModified: doc.fileLastModified ?? 0,
    })));
  }

  async function handleDeleteSelected() {
    if (selectedCount === 0 || isImporting || isRecycling) return;
    setIsRecycling(true);
    try {
      await persistenceQueue.current;
      await deleteWorkspaceDocumentsFromDb([...selectedIds], userId);
      commitSavedDocuments(documents.map((doc) => selectedIds.has(doc.id)
        ? { ...doc, previousStatus: doc.status, status: "deleted", deletedAt: new Date().toISOString() } : doc));
      setSelectedIds(new Set());
      setSelectedDocumentId(null);
      showNotice("Selected documents moved to the recycle bin");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Could not recycle documents");
    } finally { setIsRecycling(false); }
  }

  async function handleRestoreSelected() {
    if (selectedCount === 0 || isImporting || isRecycling) return;
    setIsRecycling(true);
    try {
      await persistenceQueue.current;
      const restored: DocumentItem[] = [];
      for (const doc of recycledDocuments.filter((item) => selectedIds.has(item.id))) {
        const status = doc.previousStatus && doc.previousStatus !== "deleted" ? doc.previousStatus : "check";
        await restoreWorkspaceDocumentFromDb(doc.id, status);
        restored.push({ ...doc, status, deletedAt: undefined });
      }
      commitSavedDocuments(documents.map((doc) => restored.find((item) => item.id === doc.id) ?? doc));
      setSelectedIds(new Set());
      setSelectedDocumentId(null);
      showNotice("Documents restored to their previous tabs");
    } catch (error) {
      try { await reloadSavedDocuments(); } catch { /* Keep current documents if the database is unavailable. */ }
      showNotice(error instanceof Error ? error.message : "Could not restore documents");
    } finally { setIsRecycling(false); }
  }

  function openPdfOperation(mode: "split" | "merge") {
    const sources = mode === "split" && selectedIds.size === 0 && selectedDocument
      ? [selectedDocument] : documents.filter((doc) => selectedIds.has(doc.id));
    if (sources.some((doc) => !["check", "verified"].includes(doc.status) || !(doc.mimeType === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf")))) {
      showNotice("Select PDFs from the Queue to split or merge.");
      return;
    }
    if ((mode === "split" && sources.length !== 1) || (mode === "merge" && sources.length < 2)) return;
    setPdfOperation({ mode, sources });
  }

  async function savePdfOperation(files: File[]) {
    if (!pdfOperation) return;
    const names = new Set(documents.filter((doc) => doc.status !== "deleted").map((doc) => doc.name.toLowerCase().trim()));
    for (const file of files) {
      const key = file.name.toLowerCase().trim();
      if (names.has(key)) throw new Error(`"${file.name}" already exists. Choose a different filename.`);
      names.add(key);
    }
    setIsImporting(true);
    const saved: DocumentItem[] = [];
    try {
      await persistenceQueue.current;
      for (const file of files) {
        const [document] = createDocumentItems([file]);
        // Persist each new PDF before processing; preserve originals on any save failure.
        await saveWorkspaceDocument({ ...document, status: "error", processingError: "Processing was interrupted. Reprocess to retry." }, userId, file);
        saved.push(document);
        let processed: DocumentItem;
        try { processed = await mapExtraction(document, await processDocumentFile(file)); }
        catch (error) { processed = { ...document, status: "error", processingError: error instanceof Error ? error.message : "Document processing failed" }; }
        await saveWorkspaceDocument(processed, userId);
        saved[saved.length - 1] = processed;
      }
      const originalIds = new Set(pdfOperation.sources.map((doc) => doc.id));
      await deleteWorkspaceDocumentsFromDb([...originalIds], userId);
      commitSavedDocuments([...saved, ...documents.map((doc) => originalIds.has(doc.id)
        ? { ...doc, status: "deleted" as const, previousStatus: doc.status, deletedAt: new Date().toISOString() } : doc)]);
      setSelectedIds(new Set());
      setSelectedDocumentId(saved[0]?.id ?? null);
      setActiveTab(saved.some((doc) => doc.status === "error") ? "errors" : "queue");
      showNotice(`${saved.length} new document${saved.length === 1 ? "" : "s"} created; originals moved to the recycle bin`);
    } catch (error) {
      // Keep successfully written output records visible, without removing originals.
      try { await reloadSavedDocuments(); } catch { /* Keep current documents if the database is unavailable. */ }
      throw error;
    } finally { setIsImporting(false); }
  }

  async function handleOpenBulkImport() {
    setImportDialogOpen(true);
    const newFolderFiles = getNewFolderFiles(folderFiles);
    setBulkImportCount(
      (folderName && !folderHandle && folderFiles.length === 0) ||
        (folderHandle && folderFiles.length === 0)
        ? null
        : newFolderFiles.length,
    );

    if (!folderHandle) return;

    setIsCountingFolder(true);
    try {
      if ((await folderHandle.queryPermission({ mode: "read" })) === "granted") {
        const files = await getImportFolderFiles(folderHandle);
        const newFiles = getNewFolderFiles(files);
        setBulkImportCount(newFiles.length);
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
      const newFiles = getNewFolderFiles(files);
      setBulkImportCount(newFiles.length);
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
    if (isImporting || !documentsLoaded) return;
    if (folderName && !folderHandle && folderFiles.length === 0) {
      setImportDialogOpen(false);
      void handleChooseFolder();
      return;
    }
    setIsImporting(true);
    setImportDialogOpen(false);
    setProcessingProgress({ total: 0, completed: 0, currentFileName: "" });

    try {
      let filesToProcess = folderFiles;
      let folderReadError = "";
      if (folderHandle) {
        try {
          let permission = await folderHandle.queryPermission({ mode: "read" });
          if (permission !== "granted") {
            permission = await folderHandle.requestPermission({ mode: "read" });
          }
          if (permission !== "granted") {
            throw new Error("Folder access was not granted");
          }

          filesToProcess = await getImportFolderFiles(folderHandle);
        } catch (error) {
          folderReadError = error instanceof Error ? error.message : "Unable to read the selected folder";
        }
      }

      // Filter out files that already exist in documents (queue, imported, or errors)
      const existingNames = new Set(documents.filter((d) => d.status !== "deleted").map((d) => d.name.toLowerCase().trim()));
      const seenNames = new Set<string>();
      const newFilesToProcess: File[] = [];
      let duplicateCount = 0;

      for (const file of filesToProcess) {
        const key = file.name.toLowerCase().trim();
        if (existingNames.has(key) || seenNames.has(key)) {
          duplicateCount += 1;
          continue;
        }
        seenNames.add(key);
        newFilesToProcess.push(file);
      }

      setProcessingProgress({
        total: newFilesToProcess.length,
        completed: 0,
        currentFileName: "",
      });

      const folderDocuments: DocumentItem[] = [];
      for (const file of newFilesToProcess) {
        setProcessingProgress((current) =>
          current ? { ...current, currentFileName: file.name } : current,
        );
        const [document] = createDocumentItems([file]);
        await saveWorkspaceDocument({ ...document, status: "error", processingError: "Import interrupted before processing completed. Reprocess to retry." }, userId, file);
        if (document.status === "error") {
          await saveWorkspaceDocument(document, userId);
          folderDocuments.push(document);
          setProcessingProgress((current) =>
            current ? { ...current, completed: current.completed + 1 } : current,
          );
          continue;
        }

        try {
          const processed = await processDocumentFile(file);
          folderDocuments.push(await mapExtraction(document, processed));
        } catch (error) {
          folderDocuments.push({
            ...document,
            status: "error",
            processingError: error instanceof Error ? error.message : "Document processing failed",
          });
        }
        await saveWorkspaceDocument(folderDocuments[folderDocuments.length - 1], userId);
        setProcessingProgress((current) =>
          current ? { ...current, completed: current.completed + 1 } : current,
        );
      }

      if (folderReadError) {
        const [folderErrorDocument] = createDocumentItems([
          new File([], `${folderName} (folder import failed)`),
        ]);
        folderDocuments.push({
          ...folderErrorDocument,
          status: "error",
          processingError: folderReadError,
        });
      }

      const failedCount = folderDocuments.filter((document) => document.status === "error").length;
      const successfulCount = folderDocuments.length - failedCount;

      if (folderDocuments.length === 0) {
        if (duplicateCount > 0) {
          showNotice(
            `All ${duplicateCount} documents in ${folderName} already exist in the workspace and were skipped.`,
          );
        } else {
          showNotice(folderHandle ? `No files found in ${folderName}` : "No new files to process");
        }
        return;
      }

      // Reveal processed folder documents together after the batch completes.
      setDocuments((current) => [
        ...folderDocuments,
        ...current,
      ]);
      setActiveTab(failedCount > 0 ? "errors" : "queue");
      setSelectedIds(new Set());
      setSelectedDocumentId(null);
      const duplicateNotice =
        duplicateCount > 0
          ? ` (${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped)`
          : "";
      showNotice(
        `${successfulCount} file${successfulCount === 1 ? "" : "s"} added to Queue${failedCount ? `; ${failedCount} failed and moved to Errors` : ""}${duplicateNotice}${folderDocuments.length && failedCount === 0 ? ` from ${folderName}` : ""}`,
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Import could not be saved. Please refresh before retrying.");
    } finally {
      setIsImporting(false);
      setProcessingProgress(null);
    }
  }

  async function mapExtraction(
    document: DocumentItem,
    result: Awaited<ReturnType<typeof processDocumentFile>>,
  ): Promise<DocumentItem> {
    const extraction = result.extraction;
    const inbox = importDestination === "doctor-inbox"
      ? "Doctor's Inbox"
      : importDestination === "patient-file"
        ? "Patient's File"
        : extraction.inboxType || "Doctor's Inbox";

    let patientVerified = false;
    let patientId: string | undefined;
    let matchedIdentifierCount = 0;
    try {
      const match = await matchPatientIdentifiers(extraction.patientName, extraction.patientDateOfBirth);
      patientVerified = Boolean(match);
      patientId = match?.patient.id;
      matchedIdentifierCount = match?.matchedIdentifierCount ?? 0;
    } catch {
      patientVerified = false;
    }

    const demographics: NewPatientInput = {
      title: extraction.patientTitle,
      firstName: extraction.patientFirstName,
      lastName: extraction.patientLastName,
      middleName: extraction.patientMiddleName,
      preferredName: extraction.patientPreferredName,
      dateOfBirth: extraction.patientDateOfBirth,
      gender: extraction.patientGender,
      addressLine1: extraction.patientAddressLine1,
      addressLine2: extraction.patientAddressLine2,
      city: extraction.patientCity,
      postcode: extraction.patientPostcode,
      postalAddress: extraction.patientPostalAddress,
      postalCity: extraction.patientPostalCity,
      postalPostcode: extraction.patientPostalPostcode,
      medicareNumber: extraction.patientMedicareNumber,
      medicareIrn: extraction.patientMedicareIrn,
      medicareExpiry: extraction.patientMedicareExpiry,
      mobileNumber: extraction.patientMobileNumber,
      homePhone: extraction.patientHomePhone,
      workPhone: extraction.patientWorkPhone,
      email: extraction.patientEmail,
      pensionTypeCode: extraction.patientPensionTypeCode,
      pensionNumber: extraction.patientPensionNumber,
      pensionExpiry: extraction.patientPensionExpiry,
      dvaTypeCode: extraction.patientDvaTypeCode,
      dvaNumber: extraction.patientDvaNumber,
      externalId: extraction.patientExternalId,
    };

    let userVerified = false;
    let doctorId: string | undefined;
    let assignedUser = "";

    if (inbox !== "Patient's File") {
      const rawDoctor = extraction.gpDoctor?.trim() || "";
      const currentDoctors =
        doctorRecordsRef.current.length > 0
          ? doctorRecordsRef.current
          : await listDoctors().catch(() => []);
      const matchedDoctor = matchDoctorByName(rawDoctor, currentDoctors);
      if (matchedDoctor) {
        userVerified = true;
        doctorId = matchedDoctor.id;
        assignedUser = matchedDoctor.fullName;
      } else {
        userVerified = false;
        assignedUser = rawDoctor;
      }
    }

    const isVerified = isDocumentVerified({
      inbox,
      patientVerified,
      userVerified,
    });

    return {
      ...document,
      status: isVerified ? "verified" : "check",
      patient: extraction.patientName,
      patientId,
      dateOfBirth: extraction.patientDateOfBirth,
      patientVerified,
      matchedIdentifierCount,
      demographics,
      reportDate: extraction.reportDate || document.reportDate,
      subject: extraction.subject,
      contact: extraction.sourceContact,
      inbox,
      storeIn: extraction.storeIn || document.storeIn,
      assignedUser,
      doctorId,
      userVerified,
      category: extraction.category,
      ocrCharacterCount: result.ocrCharacterCount,
      processingError: undefined,
      highlights: result.highlights ?? [],
    };
  }

  /**
   * Re-checks whether a document's patient name + date of birth match an
   * existing database record, and promotes/demotes the document between
   * "check" and "verified" accordingly. Used both after automatic extraction
   * and after manual edits to the patient or date of birth fields.
   */
  async function verifyPatientMatch(
    documentId: string,
    fullName: string,
    dateOfBirth: string,
  ) {
    try {
      const match = await matchPatientIdentifiers(fullName, dateOfBirth);
      const patientVerified = Boolean(match);
      setDocuments((current) =>
        current.map((item) => {
          if (item.id !== documentId) return item;
          const isVerified = isDocumentVerified({
            inbox: item.inbox,
            patientVerified,
            userVerified: item.userVerified,
          });
          return {
            ...item,
            patientVerified,
            patientId: match?.patient.id ?? item.patientId,
            matchedIdentifierCount: match?.matchedIdentifierCount ?? (patientVerified ? 2 : 0),
            status: item.status === "imported" ? "imported" : item.status === "error" ? "error" : isVerified ? "verified" : "check",
          };
        }),
      );
    } catch {
      showNotice("Could not verify the patient against the database");
    }
  }

  function handleDoctorChange(documentId: string, doctorName: string) {
    const trimmed = (doctorName ?? "").trim();
    const currentDoctors =
      doctorRecordsRef.current.length > 0 ? doctorRecordsRef.current : doctorRecords;
    const matchedDoctor = matchDoctorByName(trimmed, currentDoctors);
    const userVerified = Boolean(matchedDoctor);
    const doctorId = matchedDoctor?.id;
    const assignedUser = matchedDoctor ? matchedDoctor.fullName : trimmed;

    setDocuments((current) =>
      current.map((item) => {
        if (item.id !== documentId) return item;
        const isVerified = isDocumentVerified({
          inbox: item.inbox,
          patientVerified: item.patientVerified,
          userVerified,
        });
        return {
          ...item,
          assignedUser,
          doctorId,
          userVerified,
          status: item.status === "imported" ? "imported" : item.status === "error" ? "error" : isVerified ? "verified" : "check",
        };
      }),
    );
  }

  function refreshQueue(scope: "all" | "selected") {
    showNotice(scope === "all" ? "Queue refreshed" : "Selection refreshed");
  }

  function handleOpenReportErrorDialog() {
    if (!selectedDocument) return;
    setReportErrorMessage(selectedDocument.processingError || "");
    setReportErrorDialogOpen(true);
  }

  function handleConfirmReportError() {
    if (!selectedDocument) return;
    const msg = reportErrorMessage.trim() || "Flagged as error by user";
    updateDocument(selectedDocument.id, {
      status: "error",
      processingError: msg,
    });
    setReportErrorDialogOpen(false);
    setReportErrorMessage("");
    setActiveTab("errors");
    showNotice(`"${selectedDocument.name}" flagged as error and moved to Errors tab`);
  }

  function handleResetDocumentToDefault() {
    if (!selectedDocument) return;

    const defaultReportDate = selectedDocument.fileLastModified
      ? new Date(selectedDocument.fileLastModified).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    updateDocument(selectedDocument.id, {
      patient: "",
      patientId: undefined,
      dateOfBirth: "",
      patientVerified: false,
      matchedIdentifierCount: 0,
      demographics: emptyNewPatientInput(),
      category: "",
      reportDate: defaultReportDate,
      subject: "",
      contact: "",
      storeIn: "Correspondence",
      inbox: "Doctor's Inbox",
      assignedUser: "",
      doctorId: undefined,
      userVerified: false,
      status: "check",
      processingError: undefined,
      highlights: [],
    });

    setActiveHighlightField(null);
    if (activeTab !== "queue") {
      setActiveTab("queue");
    }
    showNotice(`All fields reset for "${selectedDocument.name}"`);
  }

  async function handleReprocessDocument() {
    if (!selectedDocument || isReprocessing) return;
    if (!selectedDocument.previewUrl) {
      showNotice("The document preview file is unavailable for reprocessing");
      return;
    }

    setIsReprocessing(true);
    try {
      const fileResponse = await fetch(selectedDocument.previewUrl);
      if (!fileResponse.ok) {
        throw new Error("Could not read document file");
      }
      const blob = await fileResponse.blob();
      const file = new File([blob], selectedDocument.name, {
        type: selectedDocument.mimeType || blob.type,
        lastModified: selectedDocument.fileLastModified,
      });

      const processed = await processDocumentFile(file);
      const updated = await mapExtraction(selectedDocument, processed);

      setDocuments((current) =>
        current.map((item) => (item.id === selectedDocument.id ? updated : item)),
      );
      setActiveHighlightField(null);
      if (activeTab !== "queue") {
        setActiveTab("queue");
      }
      showNotice(`"${selectedDocument.name}" reprocessed successfully`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Reprocessing failed";
      updateDocument(selectedDocument.id, {
        status: "error",
        processingError: errorMsg,
      });
      if (activeTab !== "errors") {
        setActiveTab("errors");
      }
      showNotice(`Reprocessing failed for "${selectedDocument.name}": ${errorMsg}`);
    } finally {
      setIsReprocessing(false);
    }
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
              disabled={!documentsLoaded || isImporting}
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
              disabled={!documentsLoaded || (!folderName && !folderHandle && folderFiles.length === 0) || isImporting}
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
            <Tab value="recycle" label={<TabLabel label="Recycle bin" count={recycledDocuments.length} />} sx={{ minHeight: 44, py: 0 }} />
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
                {activeTab === "queue" ? "IMPORT QUEUE" : activeTab === "recycle" ? "RECYCLE BIN" : activeTab.toUpperCase()}
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
                label={activeTab === "recycle" ? "Restore selected" : "Move to recycle bin"}
                icon={activeTab === "recycle" ? <RestoreFromTrashIcon fontSize="small" /> : <DeleteIcon fontSize="small" />}
                onClick={activeTab === "recycle" ? handleRestoreSelected : handleDeleteSelected}
                disabled={selectedCount === 0 || isImporting || isRecycling}
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
              {activeTab === "queue" && <>
                <QueueActionButton label="Split PDF" icon={<ContentCutIcon fontSize="small" />} onClick={() => openPdfOperation("split")} disabled={isImporting || isRecycling || !(selectedCount === 1 || (selectedCount === 0 && selectedDocument))} />
                <QueueActionButton label="Merge PDFs" icon={<MergeIcon fontSize="small" />} onClick={() => openPdfOperation("merge")} disabled={isImporting || isRecycling || selectedCount < 2} />
              </>}
            </Stack>
            {activeTab === "recycle" && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Documents are retained in this app. Restore returns them to their previous tabs. Files on your computer remain unchanged.</Typography>}
            {pdfOperation && <PdfOperationsDialog operation={pdfOperation} onClose={() => setPdfOperation(null)} onSave={savePdfOperation} />}

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
                        ? "No new documents to import"
                        : `${bulkImportCount} new document${bulkImportCount === 1 ? "" : "s"} selected`}
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
                  <TableCell sx={{ width: { xs: 110, sm: 160 }, fontWeight: 700 }}>FILE</TableCell>
                  <TableCell sx={{ width: { xs: 68, sm: 90 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>STATUS</TableCell>
                  <TableCell sx={{ width: { xs: 68, sm: 90 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>INBOX</TableCell>
                  <TableCell sx={{ width: { xs: 80, sm: 110 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>PATIENT</TableCell>
                  <TableCell sx={{ width: { xs: 85, sm: 120 }, px: { xs: 0.25, sm: 0.5 }, fontWeight: 700 }}>USER</TableCell>
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
                    <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis" }} title={document.name}>
                      <Typography variant="body2" noWrap>{document.name}</Typography>
                      {activeTab === "recycle" && document.deletedAt && <Typography variant="caption" color="text.secondary">{new Date(document.deletedAt).toLocaleDateString()}</Typography>}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={getDocumentStatus(document)} />
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.25, sm: 0.5 }, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {document.inbox}
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.25, sm: 0.5 }, overflow: "hidden" }}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
                        {document.patientVerified && (
                          <CheckIcon
                            sx={{ color: "success.main", fontSize: 16, flexShrink: 0 }}
                            titleAccess="Patient verified"
                          />
                        )}
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            color: document.patientVerified ? "primary.main" : "error.dark",
                            fontWeight: document.patientVerified ? 500 : 400,
                          }}
                          title={document.patient || "Not Found"}
                        >
                          {document.patient || "Not Found"}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ px: { xs: 0.25, sm: 0.5 }, overflow: "hidden" }}>
                      {document.inbox === "Patient's File" ? (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          —
                        </Typography>
                      ) : (
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
                          {document.userVerified && (
                            <CheckIcon
                              sx={{ color: "success.main", fontSize: 16, flexShrink: 0 }}
                              titleAccess="User verified"
                            />
                          )}
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              color: document.userVerified
                                ? "primary.main"
                                : document.assignedUser
                                  ? "error.dark"
                                  : "text.secondary",
                              fontWeight: document.userVerified ? 500 : 400,
                            }}
                            title={document.assignedUser || "Not Found"}
                          >
                            {document.assignedUser || "Not Found"}
                          </Typography>
                        </Stack>
                      )}
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
          {selectedDocument?.previewUrl &&
          (isPdfDocument(selectedDocument) || selectedDocument.mimeType?.startsWith("image/")) ? (
            <InteractiveDocumentViewer
              document={selectedDocument}
              activeField={activeHighlightField}
              onSelectField={handleSelectHighlightField}
              onClearActiveField={() => setActiveHighlightField(null)}
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
          {selectedDocument && selectedDocument.status !== "deleted" ? (
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
              {rightPanelMode === "create-patient" ? (
                <Stack spacing={2.25}>
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => setRightPanelMode("document-info")}
                      >
                        Back
                      </Button>
                      <Typography component="h2" variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
                        Create New Patient
                      </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Fill in the patient details to register in the database.
                    </Typography>
                  </Box>

                  <Divider />

                  <Stack spacing={2.5}>
                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Personal Details
                      </Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                        <TextField
                          size="small"
                          label="Title"
                          value={newPatientForm.title}
                          onChange={(event) => updateNewPatientField("title", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Gender"
                          value={newPatientForm.gender}
                          onChange={(event) => updateNewPatientField("gender", event.target.value)}
                        />
                        <TextField
                          size="small"
                          autoFocus
                          label="First Name"
                          value={newPatientForm.firstName}
                          onChange={(event) => updateNewPatientField("firstName", event.target.value)}
                          required
                        />
                        <TextField
                          size="small"
                          label="Last Name"
                          value={newPatientForm.lastName}
                          onChange={(event) => updateNewPatientField("lastName", event.target.value)}
                          required
                        />
                        <TextField
                          size="small"
                          label="Middle Name"
                          value={newPatientForm.middleName}
                          onChange={(event) => updateNewPatientField("middleName", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Preferred Name"
                          value={newPatientForm.preferredName}
                          onChange={(event) => updateNewPatientField("preferredName", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Date of Birth"
                          type="date"
                          value={newPatientForm.dateOfBirth}
                          onChange={(event) => updateNewPatientField("dateOfBirth", event.target.value)}
                          slotProps={{ inputLabel: { shrink: true } }}
                          required
                        />
                      </Box>
                    </Stack>

                    <Divider />

                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Address
                      </Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                        <TextField
                          size="small"
                          label="Address"
                          value={newPatientForm.addressLine1}
                          onChange={(event) => updateNewPatientField("addressLine1", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Address Line 2"
                          value={newPatientForm.addressLine2}
                          onChange={(event) => updateNewPatientField("addressLine2", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="City"
                          value={newPatientForm.city}
                          onChange={(event) => updateNewPatientField("city", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Postcode"
                          value={newPatientForm.postcode}
                          onChange={(event) => updateNewPatientField("postcode", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Postal Address"
                          value={newPatientForm.postalAddress}
                          onChange={(event) => updateNewPatientField("postalAddress", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Postal City"
                          value={newPatientForm.postalCity}
                          onChange={(event) => updateNewPatientField("postalCity", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Postal Postcode"
                          value={newPatientForm.postalPostcode}
                          onChange={(event) => updateNewPatientField("postalPostcode", event.target.value)}
                        />
                      </Box>
                    </Stack>

                    <Divider />

                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Medicare
                      </Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                        <TextField
                          size="small"
                          label="Medicare Number"
                          value={newPatientForm.medicareNumber}
                          onChange={(event) => updateNewPatientField("medicareNumber", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Medicare IRN (Line No)"
                          value={newPatientForm.medicareIrn}
                          onChange={(event) => updateNewPatientField("medicareIrn", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Medicare Expiry"
                          placeholder="MM/YYYY"
                          value={newPatientForm.medicareExpiry}
                          onChange={(event) => updateNewPatientField("medicareExpiry", event.target.value)}
                        />
                      </Box>
                    </Stack>

                    <Divider />

                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Contact
                      </Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                        <TextField
                          size="small"
                          label="Mobile Number"
                          value={newPatientForm.mobileNumber}
                          onChange={(event) => updateNewPatientField("mobileNumber", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Home Phone"
                          value={newPatientForm.homePhone}
                          onChange={(event) => updateNewPatientField("homePhone", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Work Phone"
                          value={newPatientForm.workPhone}
                          onChange={(event) => updateNewPatientField("workPhone", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Email"
                          type="email"
                          value={newPatientForm.email}
                          onChange={(event) => updateNewPatientField("email", event.target.value)}
                        />
                      </Box>
                    </Stack>

                    <Divider />

                    <Stack spacing={1.5}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Pension &amp; DVA
                      </Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                        <TextField
                          size="small"
                          label="Pension Type Code"
                          value={newPatientForm.pensionTypeCode}
                          onChange={(event) => updateNewPatientField("pensionTypeCode", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Pension/HCC Number"
                          value={newPatientForm.pensionNumber}
                          onChange={(event) => updateNewPatientField("pensionNumber", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="Pension Expiry"
                          placeholder="MM/YYYY"
                          value={newPatientForm.pensionExpiry}
                          onChange={(event) => updateNewPatientField("pensionExpiry", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="DVA Type Code"
                          value={newPatientForm.dvaTypeCode}
                          onChange={(event) => updateNewPatientField("dvaTypeCode", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="DVA Number"
                          value={newPatientForm.dvaNumber}
                          onChange={(event) => updateNewPatientField("dvaNumber", event.target.value)}
                        />
                        <TextField
                          size="small"
                          label="External ID"
                          value={newPatientForm.externalId}
                          onChange={(event) => updateNewPatientField("externalId", event.target.value)}
                        />
                      </Box>
                    </Stack>

                    <Divider />

                    <Stack direction="row" spacing={1.5} sx={{ justifyContent: "flex-end", pt: 1, pb: 1 }}>
                      <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => setRightPanelMode("document-info")}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleCreatePatient}
                        variant="contained"
                        disabled={
                          !(newPatientForm.firstName ?? "").trim() ||
                          !(newPatientForm.lastName ?? "").trim() ||
                          !(newPatientForm.dateOfBirth ?? "").trim() ||
                          isCreatingPatient
                        }
                      >
                        {isCreatingPatient ? "Creating..." : "Create New Patient"}
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              ) : rightPanelMode === "show-patient" ? (
                <Stack spacing={2.25}>
                  <Box>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => {
                          setRightPanelMode("document-info");
                          setViewedPatientRecord(null);
                        }}
                      >
                        Back
                      </Button>
                      <Typography component="h2" variant="h6" sx={{ flex: 1, fontWeight: 700 }} noWrap>
                        Patient Record
                      </Typography>
                    </Stack>
                    {viewedPatientRecord?.fullName && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>
                        {viewedPatientRecord.fullName}
                      </Typography>
                    )}
                  </Box>

                  <Divider />

                  {isLoadingPatientRecord ? (
                    <Stack sx={{ alignItems: "center", py: 6 }}>
                      <CircularProgress />
                    </Stack>
                  ) : viewedPatientRecord ? (
                    <Stack spacing={2.5}>
                      <PatientRecordSection
                        title="Personal Details"
                        fields={[
                          ["Full Name", viewedPatientRecord.fullName],
                          ["Title", viewedPatientRecord.title],
                          ["First Name", viewedPatientRecord.firstName || splitFullName(viewedPatientRecord.fullName).firstName],
                          ["Last Name", viewedPatientRecord.lastName || splitFullName(viewedPatientRecord.fullName).lastName],
                          ["Middle Name", viewedPatientRecord.middleName],
                          ["Preferred Name", viewedPatientRecord.preferredName],
                          ["Date of Birth", viewedPatientRecord.dateOfBirth],
                          ["Gender", viewedPatientRecord.gender],
                          ["Medical Record Number", viewedPatientRecord.medicalRecordNumber],
                        ]}
                      />
                      <Divider />
                      <PatientRecordSection
                        title="Address"
                        fields={[
                          ["Address", viewedPatientRecord.addressLine1],
                          ["Address Line 2", viewedPatientRecord.addressLine2],
                          ["City", viewedPatientRecord.city],
                          ["Postcode", viewedPatientRecord.postcode],
                          ["Postal Address", viewedPatientRecord.postalAddress],
                          ["Postal City", viewedPatientRecord.postalCity],
                          ["Postal Postcode", viewedPatientRecord.postalPostcode],
                        ]}
                      />
                      <Divider />
                      <PatientRecordSection
                        title="Medicare"
                        fields={[
                          ["Medicare Number", viewedPatientRecord.medicareNumber],
                          ["Medicare IRN (Line No)", viewedPatientRecord.medicareIrn],
                          ["Medicare Expiry", viewedPatientRecord.medicareExpiry],
                        ]}
                      />
                      <Divider />
                      <PatientRecordSection
                        title="Contact"
                        fields={[
                          ["Mobile Number", viewedPatientRecord.mobileNumber],
                          ["Home Phone", viewedPatientRecord.homePhone],
                          ["Work Phone", viewedPatientRecord.workPhone],
                          ["Email", viewedPatientRecord.email],
                        ]}
                      />
                      <Divider />
                      <PatientRecordSection
                        title="Pension & DVA"
                        fields={[
                          ["Pension Type Code", viewedPatientRecord.pensionTypeCode],
                          ["Pension/HCC Number", viewedPatientRecord.pensionNumber],
                          ["Pension Expiry", viewedPatientRecord.pensionExpiry],
                          ["DVA Type Code", viewedPatientRecord.dvaTypeCode],
                          ["DVA Number", viewedPatientRecord.dvaNumber],
                          ["External ID", viewedPatientRecord.externalId],
                        ]}
                      />
                      <Divider />
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No record details available.
                    </Typography>
                  )}
                </Stack>
              ) : (
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
                  <Alert severity="error">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Reported Error / Issue
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.25 }}>
                      {selectedDocument.processingError || "Review this document before filing. Check the required information below."}
                    </Typography>
                  </Alert>
                )}

                <Divider />

                <Stack spacing={2}>
                  <Box
                    id="field-wrapper-inbox"
                    onClick={() => setActiveHighlightField("inbox")}
                  >
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        Inbox Type
                      </Typography>
                      <RadioGroup
                        row
                        value={selectedDocument.inbox || "Doctor's Inbox"}
                        onChange={(_, value) => {
                          const inbox = value === "Patient's File" ? "Patient's File" : "Doctor's Inbox";
                          const isDoctorRequired = inbox !== "Patient's File";
                          const assignedUser = inbox === "Patient's File" ? "" : selectedDocument.assignedUser;
                          const currentDoctors =
                            doctorRecordsRef.current.length > 0 ? doctorRecordsRef.current : doctorRecords;
                          const matched = isDoctorRequired ? matchDoctorByName(assignedUser, currentDoctors) : null;
                          const userVerified = Boolean(matched);
                          const doctorId = matched?.id;
                          const isVerified = isDocumentVerified({
                            inbox,
                            patientVerified: selectedDocument.patientVerified,
                            userVerified,
                          });

                          updateDocument(selectedDocument.id, {
                            inbox,
                            assignedUser: matched ? matched.fullName : assignedUser,
                            doctorId,
                            userVerified,
                            status: selectedDocument.status === "imported" ? "imported" : selectedDocument.status === "error" ? "error" : isVerified ? "verified" : "check",
                          });
                        }}
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
                  </Box>

                  <Box
                    id="field-wrapper-patient"
                    onClick={() => setActiveHighlightField("patient")}
                  >
                    <Autocomplete
                      options={availablePatients}
                      value={selectedDocument.patient || null}
                      onFocus={() => setActiveHighlightField("patient")}
                      onChange={(_, patient) => {
                        const fullName = patient ?? "";
                        const matchedRecord = patientRecords.find(
                          (record) => record.fullName === fullName,
                        );
                        const dateOfBirth = matchedRecord?.dateOfBirth ?? selectedDocument.dateOfBirth;
                        const patientVerified = Boolean(matchedRecord) || Boolean(fullName.trim());
                        const isVerified = isDocumentVerified({
                          inbox: selectedDocument.inbox,
                          patientVerified,
                          userVerified: selectedDocument.userVerified,
                        });

                        updateDocument(selectedDocument.id, {
                          patient: fullName,
                          patientId: matchedRecord?.id ?? selectedDocument.patientId,
                          dateOfBirth,
                          patientVerified,
                          matchedIdentifierCount: matchedRecord ? 2 : (selectedDocument.matchedIdentifierCount || 1),
                          status:
                            selectedDocument.status === "imported"
                              ? "imported"
                              : selectedDocument.status === "error"
                                ? "error"
                                : isVerified
                                  ? "verified"
                                  : "check",
                        });
                        void verifyPatientMatch(selectedDocument.id, fullName, dateOfBirth);
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Patient"
                          placeholder="Search for a patient..."
                          required
                          onFocus={() => setActiveHighlightField("patient")}
                        />
                      )}
                      noOptionsText="No patients available"
                    />
                  </Box>

                  <Box
                    id="field-wrapper-dateOfBirth"
                    onClick={() => setActiveHighlightField("dateOfBirth")}
                  >
                    <TextField
                      label="Date of birth"
                      type="date"
                      fullWidth
                      value={selectedDocument.dateOfBirth}
                      onFocus={() => setActiveHighlightField("dateOfBirth")}
                      onChange={(event) => {
                        const dateOfBirth = event.target.value;
                        updateDocument(selectedDocument.id, { dateOfBirth });
                        void verifyPatientMatch(selectedDocument.id, selectedDocument.patient, dateOfBirth);
                      }}
                      slotProps={{ inputLabel: { shrink: true } }}
                      required
                    />
                  </Box>

                  {selectedDocument.patientVerified ? (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: "center", justifyContent: "space-between" }}
                    >
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                          {selectedDocument.matchedIdentifierCount} identifier
                          {selectedDocument.matchedIdentifierCount === 1 ? "" : "s"} verified
                        </Typography>
                      </Stack>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleShowPatientRecord}
                        disabled={!selectedDocument.patientId}
                      >
                        Show Patient Record
                      </Button>
                    </Stack>
                  ) : (
                    <Button
                      variant="outlined"
                      onClick={handleOpenCreatePatientDialog}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Create New Patient
                    </Button>
                  )}

                  <Box
                    id="field-wrapper-category"
                    onClick={() => setActiveHighlightField("category")}
                  >
                    <TextField
                      select
                      label="Category"
                      value={selectedDocument.category}
                      onFocus={() => setActiveHighlightField("category")}
                      onChange={(event) => handleCategoryChange(selectedDocument, event.target.value)}
                      required
                      fullWidth
                    >
                      <MenuItem value=""><em>Select category</em></MenuItem>
                      {documentCategories.map((category) => (
                        <MenuItem key={category} value={category}>{category}</MenuItem>
                      ))}
                    </TextField>
                  </Box>

                  <Box
                    id="field-wrapper-reportDate"
                    onClick={() => setActiveHighlightField("reportDate")}
                  >
                    <TextField
                      label="Date of report"
                      type="date"
                      value={selectedDocument.reportDate}
                      onFocus={() => setActiveHighlightField("reportDate")}
                      onChange={(event) => updateDocument(selectedDocument.id, { reportDate: event.target.value })}
                      slotProps={{ inputLabel: { shrink: true } }}
                      required
                      fullWidth
                    />
                  </Box>

                  <Box
                    id="field-wrapper-subject"
                    onClick={() => setActiveHighlightField("subject")}
                  >
                    <TextField
                      label="Subject"
                      placeholder="e.g. Ultrasound of left foot"
                      value={selectedDocument.subject}
                      onFocus={() => setActiveHighlightField("subject")}
                      onChange={(event) => updateDocument(selectedDocument.id, { subject: event.target.value })}
                      required
                      fullWidth
                    />
                  </Box>

                  <Box
                    id="field-wrapper-contact"
                    onClick={() => setActiveHighlightField("contact")}
                  >
                    <TextField
                      label="Contact of source"
                      placeholder="e.g. Lakes Radiology"
                      value={selectedDocument.contact}
                      onFocus={() => setActiveHighlightField("contact")}
                      onChange={(event) => updateDocument(selectedDocument.id, { contact: event.target.value })}
                      fullWidth
                    />
                  </Box>

                  <Box
                    id="field-wrapper-storeIn"
                    onClick={() => setActiveHighlightField("storeIn")}
                  >
                    <TextField
                      select
                      label="Store in"
                      value={selectedDocument.storeIn}
                      onFocus={() => setActiveHighlightField("storeIn")}
                      onChange={(event) => updateDocument(selectedDocument.id, { storeIn: event.target.value as StoreLocation })}
                      required
                      fullWidth
                    >
                      <MenuItem value="Correspondence">Correspondence</MenuItem>
                      <MenuItem value="Investigations">Investigations</MenuItem>
                    </TextField>
                  </Box>

                  <Box
                    id="field-wrapper-assignedUser"
                    onClick={() => setActiveHighlightField("assignedUser")}
                  >
                    {selectedDocument.inbox === "Patient's File" ? (
                      <TextField
                        label="User (GP Doctor)"
                        value="None"
                        helperText="No GP review is required for Patient's File documents."
                        fullWidth
                        onFocus={() => setActiveHighlightField("assignedUser")}
                        slotProps={{ input: { readOnly: true } }}
                      />
                    ) : (
                      <Stack spacing={0.75}>
                        <Autocomplete
                          freeSolo
                          options={availableDoctors}
                          value={selectedDocument.assignedUser || null}
                          onFocus={() => setActiveHighlightField("assignedUser")}
                          onChange={(_, value) => {
                            const doctorName = typeof value === "string" ? value : value ?? "";
                            handleDoctorChange(selectedDocument.id, doctorName);
                          }}
                          onInputChange={(_, newInputValue, reason) => {
                            if (reason === "input") {
                              handleDoctorChange(selectedDocument.id, newInputValue);
                            }
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label="User (GP Doctor)"
                              placeholder="Select or search for a GP doctor..."
                              helperText="Select the GP doctor responsible for review, not the reporting specialist."
                              required
                              fullWidth
                              onFocus={() => setActiveHighlightField("assignedUser")}
                            />
                          )}
                          noOptionsText="No doctors available in database"
                        />
                        {selectedDocument.userVerified ? (
                          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                            <CheckIcon sx={{ color: "success.main", fontSize: 16 }} />
                            <Typography variant="body2" color="text.secondary">
                              Doctor verified in database
                            </Typography>
                          </Stack>
                        ) : selectedDocument.assignedUser ? (
                          <Typography variant="caption" color="error.dark">
                            Doctor not found in database
                          </Typography>
                        ) : null}
                      </Stack>
                    )}
                  </Box>
                </Stack>

                <Divider sx={{ my: 1.5 }} />

                <Box sx={{ pt: 0.5 }}>
                  <Button
                    variant="contained"
                    color={selectedDocument.status === "imported" ? "info" : "primary"}
                    fullWidth
                    size="medium"
                    disabled={getDocumentStatus(selectedDocument) !== "verified"}
                    startIcon={selectedDocument.status === "imported" ? <CheckIcon /> : <MoveToInboxIcon />}
                    onClick={() => {
                      if (getDocumentStatus(selectedDocument) !== "verified") return;
                      updateDocument(selectedDocument.id, { status: "imported" });
                      showNotice(`"${selectedDocument.name}" moved to Imported tab`);
                    }}
                    sx={{
                      py: 1.25,
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      textTransform: "none",
                      borderRadius: 1.5,
                      boxShadow:
                        getDocumentStatus(selectedDocument) === "verified"
                          ? "0 4px 14px rgba(37, 99, 235, 0.35)"
                          : "none",
                    }}
                  >
                    {selectedDocument.status === "imported" ? "Imported" : "Import Document"}
                  </Button>
                  {selectedDocument.status === "imported" ? (
                    <Typography
                      variant="caption"
                      color="success.main"
                      sx={{ display: "block", textAlign: "center", mt: 0.75, fontWeight: 600 }}
                    >
                      Document imported successfully
                    </Typography>
                  ) : getDocumentStatus(selectedDocument) === "error" ? (
                    <Typography
                      variant="caption"
                      color="error.main"
                      sx={{ display: "block", textAlign: "center", mt: 0.75, fontWeight: 500 }}
                    >
                      Resolve the error or reprocess document to enable import
                    </Typography>
                  ) : getDocumentStatus(selectedDocument) !== "verified" ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", textAlign: "center", mt: 0.75 }}
                    >
                      {selectedDocument.inbox === "Patient's File"
                        ? "Verify the patient to enable import"
                        : !selectedDocument.patientVerified && !selectedDocument.userVerified
                          ? "Verify patient and doctor to enable import"
                          : !selectedDocument.patientVerified
                            ? "Verify the patient to enable import"
                            : "Verify the GP doctor to enable import"}
                    </Typography>
                  ) : null}
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Stack spacing={1}>
                  <Button
                    variant="outlined"
                    color="primary"
                    fullWidth
                    size="medium"
                    startIcon={
                      isReprocessing ? (
                        <CircularProgress size={16} color="inherit" />
                      ) : (
                        <RefreshIcon />
                      )
                    }
                    disabled={isReprocessing}
                    onClick={handleReprocessDocument}
                    sx={{
                      py: 0.9,
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      textTransform: "none",
                      borderRadius: 1.5,
                    }}
                  >
                    {isReprocessing ? "Reprocessing Document..." : "Reprocess Document"}
                  </Button>

                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      variant="outlined"
                      color="inherit"
                      fullWidth
                      size="medium"
                      startIcon={<RestartAltIcon />}
                      disabled={isReprocessing}
                      onClick={handleResetDocumentToDefault}
                      sx={{
                        py: 0.85,
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textTransform: "none",
                        borderRadius: 1.5,
                        borderColor: "divider",
                        color: "text.primary",
                        "&:hover": {
                          borderColor: "text.secondary",
                          bgcolor: "action.hover",
                        },
                      }}
                    >
                      Reset to Default
                    </Button>

                    <Button
                      variant="outlined"
                      color="error"
                      fullWidth
                      size="medium"
                      startIcon={<FlagOutlinedIcon />}
                      disabled={isReprocessing}
                      onClick={handleOpenReportErrorDialog}
                      sx={{
                        py: 0.85,
                        fontWeight: 600,
                        fontSize: "0.85rem",
                        textTransform: "none",
                        borderRadius: 1.5,
                      }}
                    >
                      Report Error
                    </Button>
                  </Stack>
                </Stack>
              </Stack>
            )}
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
                disabled={!documentsLoaded || isImporting}
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
        open={Boolean(processingProgress)}
        maxWidth="xs"
        fullWidth
        onClose={() => {}}
        slotProps={{ backdrop: { sx: { pointerEvents: "none" } } }}
      >
        <DialogTitle>Processing Documents</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Running OCR and extraction before adding these documents to the
              Queue. This may take a moment.
            </Typography>
            <LinearProgress
              variant="determinate"
              value={
                processingProgress && processingProgress.total > 0
                  ? (processingProgress.completed / processingProgress.total) * 100
                  : 0
              }
            />
            <Typography variant="caption" color="text.secondary" noWrap>
              {processingProgress
                ? `${processingProgress.completed} of ${processingProgress.total} processed${
                    processingProgress.currentFileName
                      ? ` — ${processingProgress.currentFileName}`
                      : ""
                  }`
                : ""}
            </Typography>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reportErrorDialogOpen}
        onClose={() => setReportErrorDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Report Document Error
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Report an issue with <strong>{selectedDocument?.name}</strong>. Entering an error message or reason helps track why this document was flagged and moves it to the <strong>Errors</strong> tab.
            </Typography>
            <TextField
              autoFocus
              label="Error message / reason"
              placeholder="e.g. Unreadable handwriting, incorrect document format, missing patient details..."
              value={reportErrorMessage}
              onChange={(e) => setReportErrorMessage(e.target.value)}
              multiline
              rows={4}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setReportErrorDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<FlagOutlinedIcon />}
            onClick={handleConfirmReportError}
          >
            Move to Errors
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

/**
 * Best-effort split of a single full-name string into first/last name parts,
 * used as a display/prefill fallback when a patient record predates the
 * dedicated first_name/last_name columns (e.g. legacy or seeded data).
 */
function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function PatientRecordSection({
  title,
  fields,
}: {
  title: string;
  fields: [string, string][];
}) {
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
        {fields.map(([label, value]) => (
          <Box key={label}>
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="body2">{value || "—"}</Typography>
          </Box>
        ))}
      </Box>
    </Stack>
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