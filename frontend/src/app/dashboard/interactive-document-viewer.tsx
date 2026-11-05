"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import HighlightIcon from "@mui/icons-material/Highlight";
import CloseIcon from "@mui/icons-material/Close";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import * as pdfjsLib from "pdfjs-dist";
import type { DocumentHighlight } from "@/lib/document-processing";

if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface ViewerDocument {
  id: string;
  name: string;
  previewUrl?: string;
  mimeType?: string;
  patient?: string;
  dateOfBirth?: string;
  category?: string;
  reportDate?: string;
  subject?: string;
  contact?: string;
  storeIn?: string;
  assignedUser?: string;
  inbox?: string;
  highlights?: DocumentHighlight[];
}

export interface InteractiveDocumentViewerProps {
  document: ViewerDocument;
  activeField: string | null;
  onSelectField: (fieldName: string) => void;
  onClearActiveField?: () => void;
}

interface PageRenderInfo {
  pageNumber: number;
  width: number;
  height: number;
}

const FIELD_LABELS: Record<string, string> = {
  patient: "Patient Name",
  dateOfBirth: "Date of Birth",
  category: "Category",
  reportDate: "Date of Report",
  subject: "Subject",
  contact: "Contact of Source",
  storeIn: "Store Location",
  assignedUser: "GP Doctor",
  inbox: "Inbox Type",
};

export function InteractiveDocumentViewer({
  document: doc,
  activeField,
  onSelectField,
  onClearActiveField,
}: InteractiveDocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1.15);
  const [numPages, setNumPages] = useState<number>(0);
  const [pagesInfo, setPagesInfo] = useState<PageRenderInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showHighlights, setShowHighlights] = useState<boolean>(true);
  const [fallbackHighlights, setFallbackHighlights] = useState<DocumentHighlight[]>([]);

  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const isPdf = Boolean(
    doc.mimeType === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf"),
  );
  const isImage = Boolean(
    doc.mimeType?.startsWith("image/") ||
      /\.(jpe?g|png|webp|gif|bmp)$/i.test(doc.name),
  );

  // Combine backend-provided highlights with client-extracted fallback highlights
  const mergedHighlights = useMemo(() => {
    const backendHls = doc.highlights ?? [];
    const map = new Map<string, DocumentHighlight>();

    for (const hl of backendHls) {
      if (hl.bbox && hl.bbox.width > 0 && hl.bbox.height > 0) {
        // Normalize field names
        const fieldName =
          hl.fieldName === "gpDoctor"
            ? "assignedUser"
            : hl.fieldName === "patientName"
              ? "patient"
              : hl.fieldName;
        map.set(`${fieldName}-${hl.pageNumber}`, { ...hl, fieldName });
      }
    }

    // Add fallback highlights for any fields that don't have a backend highlight
    for (const fb of fallbackHighlights) {
      const fieldName =
        fb.fieldName === "gpDoctor"
          ? "assignedUser"
          : fb.fieldName === "patientName"
            ? "patient"
            : fb.fieldName;
      const key = `${fieldName}-${fb.pageNumber}`;
      if (!map.has(key)) {
        map.set(key, { ...fb, fieldName });
      }
    }

    return Array.from(map.values());
  }, [doc.highlights, fallbackHighlights]);

  // Client-side fallback text search if backend highlights are missing
  const searchFallbackHighlights = useCallback(
    async (pdfDoc: pdfjsLib.PDFDocumentProxy) => {
      const targets = [
        { fieldName: "patient", fieldLabel: "Patient Name", value: doc.patient ?? "" },
        { fieldName: "dateOfBirth", fieldLabel: "Date of Birth", value: doc.dateOfBirth ?? "" },
        { fieldName: "category", fieldLabel: "Category", value: doc.category ?? "" },
        { fieldName: "reportDate", fieldLabel: "Date of Report", value: doc.reportDate ?? "" },
        { fieldName: "subject", fieldLabel: "Subject", value: doc.subject ?? "" },
        { fieldName: "contact", fieldLabel: "Contact", value: doc.contact ?? "" },
        { fieldName: "assignedUser", fieldLabel: "GP Doctor", value: doc.assignedUser ?? "" },
      ].filter((t) => t.value.trim().length >= 2);

      if (targets.length === 0) return;

      const results: DocumentHighlight[] = [];

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });
          const textContent = await page.getTextContent();
          const items = (textContent.items ?? []) as Array<any>;
          if (items.length === 0) continue;

          for (const target of targets) {
            if (results.some((r) => r.fieldName === target.fieldName)) continue;

            const targetVal = target.value.trim().toLowerCase();

            // 1. Check individual item
            for (const item of items) {
              const str = (item.str ?? "").trim().toLowerCase();
              if (!str) continue;

              const isMatch =
                str === targetVal ||
                (targetVal.length >= 4 && str.includes(targetVal)) ||
                (str.length >= 5 && targetVal.includes(str));

              if (isMatch) {
                const tx = item.transform[4];
                const ty = item.transform[5];
                const itW = item.width || 50;
                const itH = item.height || Math.abs(item.transform[0]) || 12;

                const x = Math.max(0, Math.min(1, tx / viewport.width));
                const y = Math.max(
                  0,
                  Math.min(1, (viewport.height - ty - itH) / viewport.height),
                );
                const width = Math.max(0.01, Math.min(1 - x, itW / viewport.width));
                const height = Math.max(0.01, Math.min(1 - y, (itH * 1.3) / viewport.height));

                results.push({
                  id: `fallback-${target.fieldName}-${pageNum}`,
                  fieldName: target.fieldName,
                  fieldLabel: target.fieldLabel,
                  pageNumber: pageNum,
                  text: item.str,
                  bbox: { x, y, width, height },
                });
                break;
              }
            }

            // 2. Check multi-item sequence (e.g. "Jane" + "Doe")
            if (!results.some((r) => r.fieldName === target.fieldName)) {
              for (let i = 0; i < items.length; i++) {
                let joined = "";
                for (let j = i; j < Math.min(items.length, i + 8); j++) {
                  joined += (joined ? " " : "") + (items[j].str ?? "").trim();
                  if (joined.toLowerCase().includes(targetVal)) {
                    const matchedSlice = items.slice(i, j + 1);
                    let minX = Infinity;
                    let maxX = -Infinity;
                    let minY = Infinity;
                    let maxY = -Infinity;

                    for (const it of matchedSlice) {
                      const tx = it.transform[4];
                      const ty = it.transform[5];
                      const itW = it.width || 30;
                      const itH = it.height || Math.abs(it.transform[0]) || 12;
                      minX = Math.min(minX, tx);
                      maxX = Math.max(maxX, tx + itW);
                      minY = Math.min(minY, viewport.height - ty - itH);
                      maxY = Math.max(maxY, viewport.height - ty);
                    }

                    results.push({
                      id: `fallback-multi-${target.fieldName}-${pageNum}`,
                      fieldName: target.fieldName,
                      fieldLabel: target.fieldLabel,
                      pageNumber: pageNum,
                      text: joined,
                      bbox: {
                        x: Math.max(0, minX / viewport.width),
                        y: Math.max(0, minY / viewport.height),
                        width: Math.min(1, (maxX - minX) / viewport.width),
                        height: Math.min(1, (maxY - minY) / viewport.height),
                      },
                    });
                    break;
                  }
                }
                if (results.some((r) => r.fieldName === target.fieldName)) break;
              }
            }
          }
        } catch {
          // Ignore page text extraction errors
        }
      }

      setFallbackHighlights(results);
    },
    [doc.patient, doc.dateOfBirth, doc.category, doc.reportDate, doc.subject, doc.contact, doc.assignedUser],
  );

  // Load PDF Document
  useEffect(() => {
    if (!doc.previewUrl || !isPdf) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setLoadError(null);

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: doc.previewUrl,
          cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/",
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        if (isCancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);

        const pages: PageRenderInfo[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          pages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
          });
        }

        if (!isCancelled) {
          setPagesInfo(pages);
          setIsLoading(false);
          // If no backend highlights or missing some, search text content
          void searchFallbackHighlights(pdf);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Failed to load PDF:", err);
          setLoadError(err instanceof Error ? err.message : "Failed to load PDF preview");
          setIsLoading(false);
        }
      }
    };

    void loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [doc.previewUrl, doc.id, isPdf, searchFallbackHighlights]);

  // Render PDF pages on canvas
  useEffect(() => {
    if (!pdfDocRef.current || pagesInfo.length === 0 || !isPdf) return;

    const pdf = pdfDocRef.current;
    let isCancelled = false;

    // Cancel any running render tasks
    renderTasksRef.current.forEach((task) => {
      try {
        task.cancel();
      } catch {
        // ignore
      }
    });
    renderTasksRef.current.clear();

    const renderPages = async () => {
      for (const info of pagesInfo) {
        if (isCancelled) break;
        const canvas = canvasRefs.current.get(info.pageNumber);
        if (!canvas) continue;

        try {
          const page = await pdf.getPage(info.pageNumber);
          if (isCancelled) break;

          const viewport = page.getViewport({ scale });
          const dpr = window.devicePixelRatio || 1;

          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) continue;

          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(dpr, dpr);

          const renderContext = {
            canvasContext: ctx,
            viewport,
          };

          const task = page.render(renderContext);
          renderTasksRef.current.set(info.pageNumber, task);
          await task.promise;
        } catch (err: any) {
          if (err?.name !== "RenderingCancelledException") {
            console.error(`Error rendering page ${info.pageNumber}:`, err);
          }
        }
      }
    };

    void renderPages();

    return () => {
      isCancelled = true;
      renderTasksRef.current.forEach((task) => {
        try {
          task.cancel();
        } catch {
          // ignore
        }
      });
      renderTasksRef.current.clear();
    };
  }, [pagesInfo, scale, isPdf]);

  // Auto-scroll to active highlight
  useEffect(() => {
    if (!activeField) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`doc-highlight-${activeField}`);
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [activeField]);

  // Zoom controls
  const handleZoomIn = () => setScale((prev) => Math.min(2.5, Math.round((prev + 0.15) * 100) / 100));
  const handleZoomOut = () => setScale((prev) => Math.max(0.5, Math.round((prev - 0.15) * 100) / 100));
  const handleResetZoom = () => setScale(1.0);
  const handleFitWidth = () => {
    if (!containerRef.current || pagesInfo.length === 0) return;
    const containerWidth = containerRef.current.clientWidth - 48; // padding
    const firstPageWidth = pagesInfo[0]?.width || 612;
    const computedScale = Math.max(0.5, Math.min(2.0, containerWidth / firstPageWidth));
    setScale(Math.round(computedScale * 100) / 100);
  };

  const activeLabel = activeField ? FIELD_LABELS[activeField] ?? activeField : null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        bgcolor: "#edf1f4",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Sticky Top Toolbar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          bgcolor: "#ffffff",
          borderBottom: "1px solid #e0e5e9",
          zIndex: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Tooltip title="Zoom out">
            <span>
              <IconButton aria-label="Zoom out" size="small" onClick={handleZoomOut} disabled={scale <= 0.5}>
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              minWidth: 44,
              textAlign: "center",
              userSelect: "none",
              color: "text.secondary",
            }}
          >
            {Math.round(scale * 100)}%
          </Typography>
          <Tooltip title="Zoom in">
            <span>
              <IconButton aria-label="Zoom in" size="small" onClick={handleZoomIn} disabled={scale >= 2.5}>
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Fit width">
            <IconButton size="small" onClick={handleFitWidth}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset zoom (100%)">
            <IconButton size="small" onClick={handleResetZoom}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Box sx={{ width: 1, height: 20, bgcolor: "#e0e5e9", mx: 0.5 }} />
          <Tooltip title={showHighlights ? "Hide highlights" : "Show highlights"}>
            <IconButton
              size="small"
              onClick={() => setShowHighlights(!showHighlights)}
              color={showHighlights ? "primary" : "default"}
            >
              <HighlightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {numPages > 0 && (
            <Chip
              label={`${numPages} page${numPages === 1 ? "" : "s"}`}
              size="small"
              variant="outlined"
              sx={{ height: 24, fontSize: "11px", fontWeight: 600 }}
            />
          )}
        </Stack>

        {activeField && (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip
              size="small"
              color="primary"
              variant="filled"
              label={`Selected: ${activeLabel}`}
              onDelete={onClearActiveField}
              deleteIcon={<CloseIcon fontSize="small" />}
              sx={{ fontWeight: 600, fontSize: "12px" }}
            />
          </Stack>
        )}
      </Box>

      {/* Main Scrollable Canvas Area */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 3,
        }}
      >
        {isLoading && (
          <Stack spacing={2} sx={{ alignItems: "center", my: "auto" }}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary">
              Rendering document preview...
            </Typography>
          </Stack>
        )}

        {loadError && (
          <Alert severity="error" sx={{ maxWidth: 480, my: "auto" }}>
            {loadError}
          </Alert>
        )}

        {!isLoading && !loadError && isPdf && (
          pagesInfo.map((info) => {
            const pageWidth = Math.floor(info.width * scale);
            const pageHeight = Math.floor(info.height * scale);
            const pageHighlights = mergedHighlights.filter(
              (hl) => hl.pageNumber === info.pageNumber,
            );

            return (
              <Box
                key={info.pageNumber}
                sx={{
                  position: "relative",
                  width: pageWidth,
                  height: pageHeight,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  borderRadius: 1,
                  bgcolor: "#ffffff",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {/* PDF Page Canvas */}
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(info.pageNumber, el);
                    else canvasRefs.current.delete(info.pageNumber);
                  }}
                  style={{
                    display: "block",
                    width: pageWidth,
                    height: pageHeight,
                  }}
                />

                {/* Highlights Overlay Layer */}
                {showHighlights && (
                  <Box
                    sx={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  >
                    {pageHighlights.map((hl) => {
                      const isActive = activeField === hl.fieldName;
                      const label = FIELD_LABELS[hl.fieldName] || hl.fieldLabel || hl.fieldName;

                      return (
                        <Box
                          key={hl.id}
                          id={`doc-highlight-${hl.fieldName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectField(hl.fieldName);
                          }}
                          sx={{
                            position: "absolute",
                            left: `${hl.bbox.x * 100}%`,
                            top: `${hl.bbox.y * 100}%`,
                            width: `${hl.bbox.width * 100}%`,
                            height: `${hl.bbox.height * 100}%`,
                            pointerEvents: "auto",
                            cursor: "pointer",
                            borderRadius: "3px",
                            bgcolor: isActive
                              ? "rgba(37, 99, 235, 0.32)"
                              : "rgba(250, 204, 21, 0.38)",
                            border: isActive
                              ? "2px solid #2563eb"
                              : "1.5px solid rgba(217, 119, 6, 0.8)",
                            boxShadow: isActive
                              ? "0 0 0 4px rgba(37, 99, 235, 0.28), 0 4px 12px rgba(37, 99, 235, 0.35)"
                              : "0 1px 2px rgba(0,0,0,0.08)",
                            zIndex: isActive ? 15 : 5,
                            transition: "all 0.18s ease-in-out",
                            "&:hover": {
                              bgcolor: isActive
                                ? "rgba(37, 99, 235, 0.42)"
                                : "rgba(250, 204, 21, 0.6)",
                              border: isActive
                                ? "2px solid #1d4ed8"
                                : "1.5px solid #b45309",
                              transform: "scale(1.01)",
                            },
                          }}
                          title={`Click to edit ${label}: "${hl.text}"`}
                        >
                          {/* Floating Pill Label for Active Highlight */}
                          {isActive && (
                            <Box
                              sx={{
                                position: "absolute",
                                bottom: "calc(100% + 4px)",
                                left: 0,
                                bgcolor: "#1d4ed8",
                                color: "#ffffff",
                                fontSize: "11px",
                                fontWeight: 700,
                                px: 1,
                                py: 0.35,
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                                boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                                pointerEvents: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: 0.5,
                                zIndex: 25,
                              }}
                            >
                              <span>{label}</span>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {/* Page Number Badge */}
                {numPages > 1 && (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 8,
                      right: 8,
                      bgcolor: "rgba(0,0,0,0.5)",
                      color: "#fff",
                      fontSize: "11px",
                      px: 0.75,
                      py: 0.25,
                      borderRadius: 1,
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    Page {info.pageNumber} of {numPages}
                  </Box>
                )}
              </Box>
            );
          })
        )}

        {/* Image Preview Support */}
        {!isLoading && !loadError && isImage && doc.previewUrl && (
          <Box
            sx={{
              position: "relative",
              maxWidth: "100%",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: "#fff",
              transform: `scale(${scale})`,
              transformOrigin: "top center",
              transition: "transform 0.15s ease",
            }}
          >
            <Box
              component="img"
              src={doc.previewUrl}
              alt={doc.name}
              sx={{
                display: "block",
                maxWidth: "100%",
                maxHeight: "80vh",
                objectFit: "contain",
              }}
            />

            {/* Image Highlights Overlay */}
            {showHighlights && (
              <Box
                sx={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {mergedHighlights.map((hl) => {
                  const isActive = activeField === hl.fieldName;
                  const label = FIELD_LABELS[hl.fieldName] || hl.fieldLabel || hl.fieldName;

                  return (
                    <Box
                      key={hl.id}
                      id={`doc-highlight-${hl.fieldName}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectField(hl.fieldName);
                      }}
                      sx={{
                        position: "absolute",
                        left: `${hl.bbox.x * 100}%`,
                        top: `${hl.bbox.y * 100}%`,
                        width: `${hl.bbox.width * 100}%`,
                        height: `${hl.bbox.height * 100}%`,
                        pointerEvents: "auto",
                        cursor: "pointer",
                        borderRadius: "3px",
                        bgcolor: isActive
                          ? "rgba(37, 99, 235, 0.32)"
                          : "rgba(250, 204, 21, 0.38)",
                        border: isActive
                          ? "2px solid #2563eb"
                          : "1.5px solid rgba(217, 119, 6, 0.8)",
                        boxShadow: isActive
                          ? "0 0 0 4px rgba(37, 99, 235, 0.28)"
                          : "none",
                        zIndex: isActive ? 15 : 5,
                        "&:hover": {
                          bgcolor: isActive
                            ? "rgba(37, 99, 235, 0.42)"
                            : "rgba(250, 204, 21, 0.6)",
                        },
                      }}
                      title={`Click to edit ${label}: "${hl.text}"`}
                    >
                      {isActive && (
                        <Box
                          sx={{
                            position: "absolute",
                            bottom: "calc(100% + 4px)",
                            left: 0,
                            bgcolor: "#1d4ed8",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: 700,
                            px: 1,
                            py: 0.35,
                            borderRadius: "4px",
                            whiteSpace: "nowrap",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                            pointerEvents: "none",
                          }}
                        >
                          {label}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

