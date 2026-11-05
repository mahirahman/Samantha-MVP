"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { getPdfPageCount, mergePdfs, splitPdf, type SplitRange } from "@/lib/pdf-operations";
import { InteractiveDocumentViewer, type ViewerDocument } from "./interactive-document-viewer";

export interface PdfOperation { mode: "split" | "merge"; sources: ViewerDocument[] }

export function PdfOperationsDialog({ operation, onClose, onSave }: {
  operation: PdfOperation;
  onClose: () => void;
  onSave: (files: File[]) => Promise<void>;
}) {
  const [sources, setSources] = useState(operation.sources);
  const [bytes, setBytes] = useState(new Map<string, ArrayBuffer>());
  const [pageCount, setPageCount] = useState(0);
  const [ranges, setRanges] = useState<SplitRange[]>([]);
  const [name, setName] = useState("Merged document.pdf");
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all(operation.sources.map(async (source) => {
      if (!source.previewUrl) throw new Error(`The file for ${source.name} is unavailable.`);
      const response = await fetch(source.previewUrl);
      if (!response.ok) throw new Error(`Could not read ${source.name}.`);
      return [source.id, await response.arrayBuffer()] as const;
    })).then(async (entries) => {
      const count = await getPdfPageCount(entries[0][1]);
      if (!active) return;
      setBytes(new Map(entries));
      setPageCount(count);
      const base = operation.sources[0].name.replace(/\.pdf$/i, "");
      const midpoint = Math.max(1, Math.floor(count / 2));
      setRanges([
        { name: `${base} - A.pdf`, start: 1, end: midpoint },
        { name: `${base} - B.pdf`, start: midpoint + 1, end: count },
      ]);
      if (operation.mode === "split" && count < 2) setError("A single-page PDF cannot be split into separate documents.");
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load PDFs."); });
    return () => { active = false; };
  }, [operation]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function move(index: number, delta: number) {
    const next = [...sources];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setSources(next);
    setPreview(null);
  }

  async function buildPreview() {
    setBusy(true);
    setError("");
    try {
      const file = await mergePdfs(sources.map((source) => bytes.get(source.id)!), name);
      setPreview({ file, url: URL.createObjectURL(file) });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not merge PDFs."); }
    finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const files = operation.mode === "split"
        ? await splitPdf(bytes.get(sources[0].id)!, ranges)
        : [preview?.file ?? await mergePdfs(sources.map((source) => bytes.get(source.id)!), name)];
      await onSave(files);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save documents."); }
    finally { setBusy(false); }
  }

  const loaded = bytes.size === sources.length;
  return <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
    <DialogTitle>{operation.mode === "split" ? "Split PDF into documents" : "Merge PDFs"}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        {!loaded && !error && <Typography>Loading PDFs…</Typography>}
        <Alert severity="info">Each new document will be processed independently. Originals move to the recycle bin in this app after the new files are saved. Files on your computer remain unchanged.</Alert>
        {operation.mode === "split" ? <>
          <Typography>{sources[0].name} · {pageCount} pages. Include every page once across at least two ranges.</Typography>
          {ranges.map((range, index) => <Stack key={index} direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField label={`Document ${index + 1} filename`} value={range.name} disabled={busy} onChange={(event) => setRanges(ranges.map((r, i) => i === index ? { ...r, name: event.target.value } : r))} fullWidth />
            <TextField label="From page" type="number" value={range.start} disabled={busy} onChange={(event) => setRanges(ranges.map((r, i) => i === index ? { ...r, start: Number(event.target.value) } : r))} slotProps={{ htmlInput: { min: 1, max: pageCount } }} />
            <TextField label="To page" type="number" value={range.end} disabled={busy} onChange={(event) => setRanges(ranges.map((r, i) => i === index ? { ...r, end: Number(event.target.value) } : r))} slotProps={{ htmlInput: { min: 1, max: pageCount } }} />
            <Button disabled={busy || ranges.length <= 2} onClick={() => setRanges(ranges.filter((_, i) => i !== index))}>Remove</Button>
          </Stack>)}
          <Button disabled={busy || !loaded || ranges.length >= pageCount} onClick={() => setRanges([...ranges, { name: `Split document ${ranges.length + 1}.pdf`, start: Math.min(pageCount, ranges[ranges.length - 1].end + 1), end: pageCount }])}>Add another document</Button>
        </> : <>
          <Typography>Pages will be merged in the order below. Use the arrows to change the order.</Typography>
          {sources.map((source, index) => <Stack key={source.id} direction="row" sx={{ alignItems: "center" }} spacing={1}>
            <Typography sx={{ flex: 1 }}>{index + 1}. {source.name}</Typography>
            <IconButton aria-label={`Move ${source.name} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}><ArrowUpwardIcon /></IconButton>
            <IconButton aria-label={`Move ${source.name} down`} disabled={busy || index === sources.length - 1} onClick={() => move(index, 1)}><ArrowDownwardIcon /></IconButton>
          </Stack>)}
          <TextField label="Merged filename" value={name} disabled={busy} onChange={(event) => { setName(event.target.value); setPreview(null); }} />
          <Button onClick={buildPreview} disabled={busy || !loaded || !name.trim()}>Preview merged PDF</Button>
          {preview && <Box sx={{ height: 500, overflow: "auto" }}><InteractiveDocumentViewer key={preview.url} document={{ id: preview.url, name: preview.file.name, mimeType: "application/pdf", previewUrl: preview.url }} activeField={null} onSelectField={() => {}} /></Box>}
        </>}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="contained" onClick={save} disabled={busy || !loaded || (operation.mode === "merge" ? !name.trim() || sources.length < 2 : pageCount < 2)}>{busy ? "Processing and saving…" : operation.mode === "split" ? "Split and process" : "Save and process merged PDF"}</Button>
    </DialogActions>
  </Dialog>;
}
