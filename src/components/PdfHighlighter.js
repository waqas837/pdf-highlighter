"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  FileUp,
  Hand,
  Maximize2,
  Pencil,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 3.5;
const ZOOM_STEP = 1.12;

function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

const COLORS = [
  "#FFEB3B",
  "#76FF03",
  "#40C4FF",
  "#FF4081",
  "#FF9800",
  "#E040FB",
  "#FFFFFF",
  "#212121",
];

let pdfjsPromise;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      const v = pdfjs.version || "4.8.69";
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function pointInRect(px, py, x, y, w, h) {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function pointInEllipse(px, py, x, y, w, h, pad = 0) {
  if (w <= 0 || h <= 0) return false;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(w / 2 + pad, 0.001);
  const ry = Math.max(h / 2 + pad, 0.001);
  const nx = (px - cx) / rx;
  const ny = (py - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function hitShape(px, py, shapes, pad = 0) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.type === "rect" || s.type === "roundRect") {
      if (
        pointInRect(px, py, s.x - pad, s.y - pad, s.w + pad * 2, s.h + pad * 2)
      ) {
        return s;
      }
    } else if (s.type === "ellipse") {
      if (pointInEllipse(px, py, s.x, s.y, s.w, s.h, pad)) return s;
    }
  }
  return null;
}

const HANDLE_RADIUS = 26;

function selectionBounds(s) {
  const rw = Math.abs(s.w);
  const rh = Math.abs(s.h);
  const sbx = s.w < 0 ? s.x + s.w : s.x;
  const sby = s.h < 0 ? s.y + s.h : s.y;
  return { sbx, sby, srw: rw, srh: rh };
}

function hitResizeHandle(px, py, s) {
  const { sbx: x, sby: y, srw: w, srh: h } = selectionBounds(s);
  const xm = x + w / 2;
  const ym = y + h / 2;
  const pts = [
    { handle: "nw", hx: x, hy: y },
    { handle: "n", hx: xm, hy: y },
    { handle: "ne", hx: x + w, hy: y },
    { handle: "e", hx: x + w, hy: ym },
    { handle: "se", hx: x + w, hy: y + h },
    { handle: "s", hx: xm, hy: y + h },
    { handle: "sw", hx: x, hy: y + h },
    { handle: "w", hx: x, hy: ym },
  ];
  for (const p of pts) {
    if (Math.hypot(px - p.hx, py - p.hy) <= HANDLE_RADIUS) {
      return p.handle;
    }
  }
  return null;
}

function hitShapeResizeTarget(px, py, shapes) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const h = hitResizeHandle(px, py, s);
    if (h) return { shape: s, handle: h };
  }
  return null;
}

function applyResize(handle, s0, px, py, minW = 20, minH = 20) {
  const right = s0.x + s0.w;
  const bottom = s0.y + s0.h;
  let x = s0.x;
  let y = s0.y;
  let w = s0.w;
  let h = s0.h;
  switch (handle) {
    case "e":
      w = Math.max(minW, px - s0.x);
      break;
    case "s":
      h = Math.max(minH, py - s0.y);
      break;
    case "w":
      w = Math.max(minW, right - px);
      x = right - w;
      break;
    case "n":
      h = Math.max(minH, bottom - py);
      y = bottom - h;
      break;
    case "se":
      w = Math.max(minW, px - s0.x);
      h = Math.max(minH, py - s0.y);
      break;
    case "sw":
      w = Math.max(minW, right - px);
      h = Math.max(minH, py - s0.y);
      x = right - w;
      break;
    case "ne":
      w = Math.max(minW, px - s0.x);
      h = Math.max(minH, bottom - py);
      y = bottom - h;
      break;
    case "nw":
      w = Math.max(minW, right - px);
      h = Math.max(minH, bottom - py);
      x = right - w;
      y = bottom - h;
      break;
    default:
      break;
  }
  return { x, y, w, h };
}

function cursorForResizeHandle(handle) {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    default:
      return "crosshair";
  }
}

function splitStrokeByEraser(stroke, ex, ey, r) {
  const r2 = r * r;
  const out = [];
  let cur = [];
  for (const p of stroke.points) {
    const d2 = (p.x - ex) ** 2 + (p.y - ey) ** 2;
    if (d2 <= r2) {
      if (cur.length >= 2) {
        out.push({ ...stroke, id: uid(), points: [...cur] });
      }
      cur = [];
    } else {
      cur.push(p);
    }
  }
  if (cur.length >= 2) {
    out.push({ ...stroke, id: uid(), points: cur });
  }
  return out;
}

function drawSmoothStroke(ctx, points, color, lineWidth) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawShape(ctx, shape) {
  const { type, x, y, w, h, fill } = shape;
  ctx.fillStyle = fill;
  const rw = Math.abs(w);
  const rh = Math.abs(h);
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  if (type === "rect") {
    ctx.fillRect(sx, sy, rw, rh);
  } else if (type === "roundRect") {
    const rad = Math.min(16, rw / 4, rh / 4);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(sx, sy, rw, rh, rad);
    } else {
      ctx.rect(sx, sy, rw, rh);
    }
    ctx.fill();
  } else if (type === "ellipse") {
    const cx = sx + rw / 2;
    const cy = sy + rh / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function strokeShapeOutline(ctx, shape) {
  const { type, x, y, w, h } = shape;
  const rw = Math.abs(w);
  const rh = Math.abs(h);
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  ctx.beginPath();
  if (type === "ellipse") {
    const cx = sx + rw / 2;
    const cy = sy + rh / 2;
    ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
  } else if (type === "roundRect") {
    const rad = Math.min(16, rw / 4, rh / 4);
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(sx, sy, rw, rh, rad);
    } else {
      ctx.rect(sx, sy, rw, rh);
    }
  } else {
    ctx.rect(sx, sy, rw, rh);
  }
  ctx.stroke();
}

function hexToRgba(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function parseFillToHex(fill) {
  const m = String(fill).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return null;
  const hx = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${hx(m[1])}${hx(m[2])}${hx(m[3])}`;
}

function shapeBaseHex(s) {
  if (s.hexColor && /^#/.test(s.hexColor)) return s.hexColor;
  return parseFillToHex(s.fill) || "#FFEB3B";
}

function readShapeOpacity(s) {
  if (typeof s.opacity === "number" && !Number.isNaN(s.opacity)) {
    return s.opacity;
  }
  const m = String(s.fill).match(/,\s*([\d.]+)\s*\)/);
  if (m) return Number(m[1]);
  return 0.38;
}

function clampShapeOpacity(a) {
  return Math.min(0.92, Math.max(0.08, a));
}

function clampGlobalFillOpacity(a) {
  return Math.min(0.7, Math.max(0.15, a));
}

function withShapeOpacity(s, alpha) {
  const a = clampShapeOpacity(alpha);
  const hex = shapeBaseHex(s);
  return { ...s, hexColor: hex, opacity: a, fill: hexToRgba(hex, a) };
}

function getShapeHandleCenters(s) {
  const { sbx: sx, sby: sy, srw: rw, srh: rh } = selectionBounds(s);
  const xm = sx + rw / 2;
  const ym = sy + rh / 2;
  return [
    { x: sx, y: sy },
    { x: xm, y: sy },
    { x: sx + rw, y: sy },
    { x: sx + rw, y: ym },
    { x: sx + rw, y: sy + rh },
    { x: xm, y: sy + rh },
    { x: sx, y: sy + rh },
    { x: sx, y: ym },
  ];
}

function drawSelectionHandles(ctx, s) {
  for (const p of getShapeHandleCenters(s)) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
}

const emptyPage = () => ({ shapes: [], strokes: [] });

export default function PdfHighlighter() {
  const wrapRef = useRef(null);
  const pdfCanvasRef = useRef(null);
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [tool, setTool] = useState("select");
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [color, setColor] = useState(COLORS[0]);
  const [penSize, setPenSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(24);
  const [fillOpacity, setFillOpacity] = useState(0.38);
  const [status, setStatus] = useState("Open a PDF to start.");
  const [byPage, setByPage] = useState({});
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [activeResizeHandle, setActiveResizeHandle] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [compact, setCompact] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const draftRef = useRef(null);
  const moveRef = useRef(null);
  const resizeRef = useRef(null);
  const penPointsRef = useRef(null);
  const eraserActiveRef = useRef(false);
  const zoomRef = useRef(1);
  const zoomViewportRef = useRef(null);
  const pinchRef = useRef(null);

  const pageKey = pageNum;

  const selectedShape = useMemo(() => {
    const L = byPage[pageKey] || emptyPage();
    return L.shapes.find((s) => s.id === selectedShapeId) ?? null;
  }, [byPage, pageKey, selectedShapeId]);

  zoomRef.current = zoom;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    setZoom(1);
  }, [pageKey]);

  const setLayer = useCallback((updater) => {
    setByPage((prev) => {
      const cur = prev[pageKey] || emptyPage();
      const next =
        typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [pageKey]: next };
    });
  }, [pageKey]);

  const redrawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const pdfCanvas = pdfCanvasRef.current;
    if (!canvas || !pdfCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    const cssW = pdfCanvas.clientWidth;
    const cssH = pdfCanvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const L = byPageRef.current[pageKey] || emptyPage();
    for (const s of L.shapes) {
      drawShape(ctx, s);
    }
    for (const st of L.strokes) {
      drawSmoothStroke(ctx, st.points, st.color, st.width);
    }
    if (tool === "select" && selectedShapeId) {
      const sel = L.shapes.find((s) => s.id === selectedShapeId);
      if (sel) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(56, 189, 248, 0.95)";
        ctx.lineWidth = 2.5;
        strokeShapeOutline(ctx, sel);
        ctx.setLineDash([]);
        drawSelectionHandles(ctx, sel);
        ctx.restore();
      }
    }

    const d = draftRef.current;
    if (d && d.type === "shape") {
      drawShape(ctx, { ...d.shape, fill: d.shape.fill });
    }
    if (d && d.type === "penPreview" && d.points?.length >= 2) {
      drawSmoothStroke(ctx, d.points, d.color, d.width);
    }
  }, [pageKey, cssSize.w, cssSize.h, selectedShapeId, tool]);

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay, byPage, pageKey, cssSize]);

  const renderPdfPage = useCallback(async (doc, num) => {
    const pdfCanvas = pdfCanvasRef.current;
    const overlay = overlayRef.current;
    const wrap = wrapRef.current;
    if (!pdfCanvas || !overlay || !doc) return;

    try {
      const pdfjs = await loadPdfjs();
      const page = await doc.getPage(num);
      const base = page.getViewport({ scale: 1 });
      const maxW = Math.max(
        120,
        (wrap?.clientWidth || window.innerWidth) - 24,
      );
      const scale = Math.max(0.5, Math.min(maxW / base.width, 4));
      const viewport = page.getViewport({ scale });

      const dpr = window.devicePixelRatio || 1;
      const cssW = viewport.width;
      const cssH = viewport.height;

      pdfCanvas.width = Math.floor(cssW * dpr);
      pdfCanvas.height = Math.floor(cssH * dpr);
      pdfCanvas.style.width = `${cssW}px`;
      pdfCanvas.style.height = `${cssH}px`;

      overlay.width = pdfCanvas.width;
      overlay.height = pdfCanvas.height;
      overlay.style.width = pdfCanvas.style.width;
      overlay.style.height = pdfCanvas.style.height;

      const pctx = pdfCanvas.getContext("2d");
      if (!pctx) {
        setStatus("Could not draw PDF (no canvas context).");
        return;
      }
      pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pctx.fillStyle = "#ffffff";
      pctx.fillRect(0, 0, cssW, cssH);

      const task = page.render({
        canvasContext: pctx,
        viewport,
      });
      await task.promise;

      setCssSize({ w: cssW, h: cssH });
      setStatus(`Page ${num} of ${doc.numPages}`);
    } catch (err) {
      console.error(err);
      setStatus("Could not render this page.");
    }
  }, []);

  const byPageRef = useRef(byPage);
  byPageRef.current = byPage;

  useEffect(() => {
    moveRef.current = null;
    resizeRef.current = null;
    setActiveResizeHandle(null);
    setSelectedShapeId(null);
  }, [pageNum]);

  useEffect(() => {
    if (!pdfDoc) return;
    renderPdfPage(pdfDoc, pageNum);
  }, [pdfDoc, pageNum, renderPdfPage]);

  useEffect(() => {
    if (!pdfDoc) return;
    const onResize = () => {
      renderPdfPage(pdfDoc, pageNum);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pdfDoc, pageNum, renderPdfPage]);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el || !pdfDoc) return;

    const dist = (a, b) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const cancelDrawGesture = () => {
      penPointsRef.current = null;
      draftRef.current = null;
      moveRef.current = null;
      resizeRef.current = null;
      setActiveResizeHandle(null);
      eraserActiveRef.current = false;
      setSelectedShapeId(null);
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          d0: dist(e.touches[0], e.touches[1]),
          z0: zoomRef.current,
        };
        setIsPinching(true);
        cancelDrawGesture();
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const { d0, z0 } = pinchRef.current;
        if (d0 > 4) {
          setZoom(clampZoom(z0 * (d / d0)));
        }
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        pinchRef.current = null;
        setIsPinching(false);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [pdfDoc, pageNum]);

  const handleWheelZoom = useCallback(
    (e) => {
      if (!pdfDoc || cssSize.w <= 0) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const mult = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
        setZoom((z) => clampZoom(z * mult));
      }
    },
    [pdfDoc, cssSize.w],
  );

  useEffect(() => {
    const el = zoomViewportRef.current;
    if (!el || !pdfDoc || cssSize.w <= 0) return;
    const fn = (e) => handleWheelZoom(e);
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [pdfDoc, cssSize.w, cssSize.h, handleWheelZoom]);

  const zoomOut = useCallback(() => {
    setZoom((z) => clampZoom(z / ZOOM_STEP));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => clampZoom(z * ZOOM_STEP));
  }, []);

  const zoomPct = Math.round(zoom * 100);

  const openFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      setStatus("Please choose a PDF file.");
      return;
    }
    setLoadingPdf(true);
    setLoadProgress(5);
    setActiveResizeHandle(null);
    setStatus("Reading file…");
    try {
      const buf = await file.arrayBuffer();
      setLoadProgress(25);
      setStatus("Opening PDF…");
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs
        .getDocument({
          data: buf,
          onProgress: (evt) => {
            if (evt.total > 0) {
              const ratio = evt.loaded / evt.total;
              setLoadProgress(25 + Math.round(ratio * 70));
            } else {
              setLoadProgress((p) => Math.min(92, p + 3));
            }
          },
        })
        .promise;
      setLoadProgress(100);
      setPdfDoc(doc);
      setPageCount(doc.numPages);
      setPageNum(1);
      setByPage({});
      setZoom(1);
      setSelectedShapeId(null);
      setMoreOpen(false);
      setStatus(`Page 1 of ${doc.numPages}`);
    } catch (err) {
      console.error(err);
      setStatus("Could not open this PDF. Try another file.");
    } finally {
      setLoadingPdf(false);
      setLoadProgress(0);
    }
    e.target.value = "";
  };

  const getPos = (e) => {
    const canvas = overlayRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
    const x = ((clientX - rect.left) / rect.width) * canvas.clientWidth;
    const y = ((clientY - rect.top) / rect.height) * canvas.clientHeight;
    return { x, y };
  };

  const onPointerDown = (e) => {
    if (!pdfDoc || !overlayRef.current || loadingPdf) return;
    e.preventDefault();
    const overlay = overlayRef.current;
    const { x, y } = getPos(e);
    const fill = hexToRgba(color, fillOpacity);
    let capture = false;

    if (tool === "select") {
      const L = byPage[pageKey] || emptyPage();
      const curSel =
        selectedShapeId &&
        L.shapes.find((s) => s.id === selectedShapeId);
      if (curSel) {
        const h = hitResizeHandle(x, y, curSel);
        if (h) {
          resizeRef.current = {
            id: curSel.id,
            handle: h,
            start: {
              x: curSel.x,
              y: curSel.y,
              w: curSel.w,
              h: curSel.h,
            },
          };
          setActiveResizeHandle(h);
          capture = true;
        }
      }
      if (!capture) {
        const hit = hitShape(x, y, L.shapes, 12);
        if (hit) {
          setSelectedShapeId(hit.id);
          moveRef.current = {
            id: hit.id,
            ox: x,
            oy: y,
            sx: hit.x,
            sy: hit.y,
          };
          capture = true;
        } else {
          setSelectedShapeId(null);
        }
      }
    } else if (tool === "resize") {
      setSelectedShapeId(null);
      const L = byPage[pageKey] || emptyPage();
      const target = hitShapeResizeTarget(x, y, L.shapes);
      if (target) {
        const s = target.shape;
        resizeRef.current = {
          id: s.id,
          handle: target.handle,
          start: { x: s.x, y: s.y, w: s.w, h: s.h },
        };
        setActiveResizeHandle(target.handle);
        capture = true;
      }
    } else if (tool === "pen") {
      setSelectedShapeId(null);
      penPointsRef.current = [{ x, y }];
      draftRef.current = {
        type: "penPreview",
        points: penPointsRef.current,
        color,
        width: penSize,
      };
      redrawOverlay();
      capture = true;
    } else if (tool === "eraser") {
      setSelectedShapeId(null);
      eraserActiveRef.current = true;
      applyEraserAt(x, y);
      capture = true;
    } else if (tool === "rectangle" || tool === "ellipse") {
      setSelectedShapeId(null);
      const t = tool === "rectangle" ? "rect" : "ellipse";
      draftRef.current = {
        type: "shape",
        shape: { type: t, x, y, w: 0, h: 0, fill, id: uid() },
      };
      capture = true;
    }

    if (capture) {
      overlay.setPointerCapture(e.pointerId);
    }
  };

  const applyEraserAt = (x, y) => {
    const r = eraserSize / 2;
    setLayer((L) => ({
      ...L,
      strokes: L.strokes.flatMap((st) =>
        splitStrokeByEraser(st, x, y, r),
      ),
    }));
  };

  const onPointerMove = (e) => {
    if (!pdfDoc || loadingPdf) return;
    const { x, y } = getPos(e);

    if (tool === "select" && moveRef.current) {
      const m = moveRef.current;
      const dx = x - m.ox;
      const dy = y - m.oy;
      setLayer((L) => ({
        ...L,
        shapes: L.shapes.map((s) =>
          s.id === m.id ? { ...s, x: m.sx + dx, y: m.sy + dy } : s,
        ),
      }));
      return;
    }

    if (
      (tool === "select" || tool === "resize") &&
      resizeRef.current
    ) {
      const r = resizeRef.current;
      const next = applyResize(r.handle, r.start, x, y);
      setLayer((L) => ({
        ...L,
        shapes: L.shapes.map((s) =>
          s.id === r.id ? { ...s, ...next } : s,
        ),
      }));
      return;
    }

    if (tool === "pen" && penPointsRef.current) {
      const pts = penPointsRef.current;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) > 1.2) {
        pts.push({ x, y });
        draftRef.current = {
          type: "penPreview",
          points: pts,
          color,
          width: penSize,
        };
      }
      redrawOverlay();
      return;
    }

    if (tool === "eraser" && eraserActiveRef.current) {
      applyEraserAt(x, y);
      return;
    }

    const d = draftRef.current;
    if (d && d.type === "shape" && (tool === "rectangle" || tool === "ellipse")) {
      const s0 = d.shape;
      d.shape = {
        ...s0,
        w: x - s0.x,
        h: y - s0.y,
        fill: hexToRgba(color, fillOpacity),
      };
      redrawOverlay();
    }
  };

  const onPointerUp = (e) => {
    if (overlayRef.current?.hasPointerCapture?.(e.pointerId)) {
      overlayRef.current.releasePointerCapture(e.pointerId);
    }
    eraserActiveRef.current = false;

    if (tool === "select") {
      moveRef.current = null;
      resizeRef.current = null;
      setActiveResizeHandle(null);
      return;
    }

    if (tool === "resize") {
      resizeRef.current = null;
      setActiveResizeHandle(null);
      return;
    }

    if (tool === "pen" && penPointsRef.current) {
      const pts = penPointsRef.current;
      penPointsRef.current = null;
      draftRef.current = null;
      if (pts.length >= 2) {
        setLayer((L) => ({
          ...L,
          strokes: [
            ...L.strokes,
            { id: uid(), points: pts, color, width: penSize },
          ],
        }));
      }
      redrawOverlay();
      return;
    }

    const d = draftRef.current;
    if (d && d.type === "shape") {
      draftRef.current = null;
      const s = d.shape;
      const rw = Math.abs(s.w);
      const rh = Math.abs(s.h);
      if (rw > 4 && rh > 4) {
        const nx = s.w < 0 ? s.x + s.w : s.x;
        const ny = s.h < 0 ? s.y + s.h : s.y;
        const nid = s.id || uid();
        setLayer((L) => ({
          ...L,
          shapes: [
            ...L.shapes,
            {
              ...s,
              id: nid,
              x: nx,
              y: ny,
              w: rw,
              h: rh,
              hexColor: color,
              opacity: fillOpacity,
              fill: hexToRgba(color, fillOpacity),
            },
          ],
        }));
        setTool("select");
        setSelectedShapeId(nid);
      }
      redrawOverlay();
    }
  };

  const bumpSelectedOpacity = useCallback(
    (delta) => {
      if (!selectedShapeId) return;
      setLayer((L) => ({
        ...L,
        shapes: L.shapes.map((s) =>
          s.id === selectedShapeId
            ? withShapeOpacity(s, readShapeOpacity(s) + delta)
            : s,
        ),
      }));
    },
    [selectedShapeId, setLayer],
  );

  const removeSelectedShape = useCallback(() => {
    if (!selectedShapeId) return;
    const id = selectedShapeId;
    setLayer((L) => ({
      ...L,
      shapes: L.shapes.filter((s) => s.id !== id),
    }));
    setSelectedShapeId(null);
  }, [selectedShapeId, setLayer]);

  const clearAllDrawings = () => {
    setByPage({});
    draftRef.current = null;
    penPointsRef.current = null;
    moveRef.current = null;
    resizeRef.current = null;
    setActiveResizeHandle(null);
    setSelectedShapeId(null);
    redrawOverlay();
    setStatus("All drawings cleared (PDF unchanged).");
  };

  const goPrev = () => setPageNum((p) => Math.max(1, p - 1));
  const goNext = () =>
    setPageNum((p) => Math.min(pageCount || 1, p + 1));

  const pickTool = (id) => {
    if (id !== "select") setSelectedShapeId(null);
    setTool(id);
  };

  const toolBtn = (id, ariaLabel, icon, titleText) => (
    <button
      key={id}
      type="button"
      onClick={() => pickTool(id)}
      className={`tool-btn ${tool === id ? "active" : ""}`}
      aria-pressed={tool === id}
      title={titleText ?? ariaLabel}
      aria-label={ariaLabel}
    >
      {icon}
    </button>
  );

  const overlayCursor = (() => {
    if (activeResizeHandle && (tool === "select" || tool === "resize")) {
      return cursorForResizeHandle(activeResizeHandle);
    }
    if (tool === "select") return "grab";
    if (tool === "eraser") return "cell";
    if (tool === "resize") return "crosshair";
    return "crosshair";
  })();

  return (
    <div className={`pdf-app${compact ? " pdf-app--compact" : ""}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden-input"
        onChange={openFile}
      />

      <header className="pdf-sticky-shell">
        <div className="pdf-toolbar">
          {!pdfDoc ? (
            <button
              type="button"
              className={`btn primary${compact ? " btn--icon-only" : ""}`}
              disabled={loadingPdf}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Open PDF"
            >
              <FileUp size={20} aria-hidden />
              {!compact ? "Open PDF" : null}
            </button>
          ) : (
            <button
              type="button"
              className={`btn ghost${compact ? " btn--icon-only" : ""}`}
              disabled={loadingPdf}
              onClick={() => fileInputRef.current?.click()}
              title="Change PDF"
              aria-label="Change PDF"
            >
              <FileUp size={18} aria-hidden />
              {!compact ? "Change PDF" : null}
            </button>
          )}

          {pdfDoc ? (
            <div className="page-nav">
              <button
                type="button"
                className="btn icon"
                onClick={goPrev}
                disabled={pageNum <= 1 || loadingPdf}
                aria-label="Previous page"
              >
                <ChevronLeft size={compact ? 20 : 22} />
              </button>
              <span className="page-label">
                {pageNum}/{pageCount}
              </span>
              <button
                type="button"
                className="btn icon"
                onClick={goNext}
                disabled={pageNum >= pageCount || loadingPdf}
                aria-label="Next page"
              >
                <ChevronRight size={compact ? 20 : 22} />
              </button>
            </div>
          ) : null}

          {pdfDoc && !loadingPdf ? (
            <div className="zoom-bar" aria-label="Zoom">
              <button
                type="button"
                className="btn icon"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                <ZoomOut size={18} />
              </button>
              <span className="zoom-pct">{zoomPct}%</span>
              <button
                type="button"
                className="btn icon"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                <ZoomIn size={18} />
              </button>
            </div>
          ) : null}

          {pdfDoc && !loadingPdf ? (
            <button
              type="button"
              className={`btn icon opts-toggle ${moreOpen ? "active" : ""}`}
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-label={
                moreOpen ? "Hide colors and sliders" : "Show colors and sliders"
              }
              title="Colors, highlight, pen, rubber"
            >
              <SlidersHorizontal size={18} />
            </button>
          ) : null}

          {(!pdfDoc || loadingPdf) && (
            <p className="status" role="status">
              {loadingPdf ? "Loading PDF…" : status}
            </p>
          )}
        </div>

        {loadingPdf ? (
          <div className="load-progress" aria-hidden={false}>
            <div
              className="load-progress-bar"
              style={{ width: `${Math.max(8, loadProgress)}%` }}
            />
          </div>
        ) : null}

        <div className="tool-strip" role="toolbar" aria-label="Drawing tools">
          {toolBtn(
            "select",
            "Select",
            <Hand size={18} />,
            "Select a highlight: drag to move, handles to resize, − / + for opacity, × to remove",
          )}
          {toolBtn(
            "resize",
            "Resize",
            <Maximize2 size={18} />,
            "Drag corners or edges to resize a highlight",
          )}
          {toolBtn("rectangle", "Box", <Square size={18} />, "Draw a box highlight")}
          {toolBtn(
            "ellipse",
            "Circle",
            <Circle size={18} />,
            "Draw a circle or oval highlight",
          )}
          {toolBtn("pen", "Pen", <Pencil size={18} />, "Draw freehand with the pen")}
          {toolBtn(
            "eraser",
            "Rubber",
            <Eraser size={18} />,
            "Rubber removes pen strokes only — not highlights",
          )}
          <button
            type="button"
            className="tool-btn danger"
            onClick={clearAllDrawings}
            title="Erase all drawings on every page"
            aria-label="Clear all drawings"
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>

        {pdfDoc ? (
        <div
          className={`controls-row controls-row--dense controls-row--collapsible${!moreOpen ? " controls-row--closed" : ""}`}
        >
          <div className="colors" aria-label="Colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch ${color === c ? "on" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          <div className="slider-label slider-label--with-stepper">
            <span className="slider-label-text">Highlight</span>
            <div className="opacity-stepper" aria-label="Highlight opacity">
              <button
                type="button"
                className="btn-step"
                onClick={() =>
                  setFillOpacity((o) => clampGlobalFillOpacity(o - 0.05))
                }
                aria-label="Decrease highlight opacity for new shapes"
              >
                −
              </button>
              <span className="opacity-stepper-value">
                {Math.round(fillOpacity * 100)}%
              </span>
              <button
                type="button"
                className="btn-step"
                onClick={() =>
                  setFillOpacity((o) => clampGlobalFillOpacity(o + 0.05))
                }
                aria-label="Increase highlight opacity for new shapes"
              >
                +
              </button>
            </div>
            <input
              type="range"
              min={0.15}
              max={0.7}
              step={0.01}
              value={fillOpacity}
              onChange={(e) => setFillOpacity(Number(e.target.value))}
            />
          </div>
          <label className="slider-label">
            <span className="slider-label-text">Pen</span>
            <input
              type="range"
              min={2}
              max={28}
              step={1}
              value={penSize}
              onChange={(e) => setPenSize(Number(e.target.value))}
            />
          </label>
          <label className="slider-label">
            <span className="slider-label-text">Rubber</span>
            <input
              type="range"
              min={8}
              max={80}
              step={2}
              value={eraserSize}
              onChange={(e) => setEraserSize(Number(e.target.value))}
            />
          </label>
        </div>
        ) : null}
      </header>

      <div ref={wrapRef} className="canvas-wrap">
        {!pdfDoc ? (
          <div className="placeholder">
            <p>
              <strong>Open PDF</strong> — on this device only; the file is not changed.
            </p>
            {!compact && (
              <p>
                Pinch or Ctrl+scroll to zoom. <strong>Select</strong> a highlight to
                move it or tap <strong>×</strong> to remove. Rubber only erases pen
                ink.
              </p>
            )}
            {compact && (
              <p className="placeholder-hint">
                Select → move or ×. Rubber = pen only.
              </p>
            )}
          </div>
        ) : null}
        {pdfDoc ? (
          <div
            ref={zoomViewportRef}
            className={`pdf-zoom-viewport${isPinching ? " is-pinching" : ""}`}
          >
            <div
              className="pdf-zoom-sheet"
              style={{
                width: Math.max(1, Math.ceil(Math.max(1, cssSize.w) * zoom)),
                height: Math.max(1, Math.ceil(Math.max(1, cssSize.h) * zoom)),
              }}
            >
              <div
                className="pdf-zoom-content"
                style={{
                  position: "relative",
                  width: Math.max(1, cssSize.w),
                  height: Math.max(1, cssSize.h),
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  transition: isPinching
                    ? "none"
                    : "transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                }}
              >
                <div
                  className={`stack visible${loadingPdf ? " loading-pdf" : ""}`}
                >
                  <canvas ref={pdfCanvasRef} className="pdf-layer" />
                  <canvas
                    ref={overlayRef}
                    className="draw-layer"
                    style={{ cursor: overlayCursor }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                </div>
                {tool === "select" && selectedShape
                  ? (() => {
                      const b = selectionBounds(selectedShape);
                      return (
                        <>
                          <button
                            type="button"
                            className="shape-remove-btn"
                            style={{
                              position: "absolute",
                              left: b.sbx + b.srw,
                              top: b.sby,
                              transform: "translate(-50%, -50%)",
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeSelectedShape();
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            aria-label="Remove this highlight"
                          >
                            <X size={22} strokeWidth={2.5} aria-hidden />
                          </button>
                          <div
                            className="shape-controls-bar"
                            style={{
                              position: "absolute",
                              left: b.sbx + b.srw / 2,
                              top: b.sby + b.srh + 8,
                              transform: "translateX(-50%)",
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="shape-ctl-btn"
                              aria-label="Less opaque"
                              onClick={(e) => {
                                e.stopPropagation();
                                bumpSelectedOpacity(-0.06);
                              }}
                            >
                              −
                            </button>
                            <span className="shape-ctl-value">
                              {Math.round(
                                readShapeOpacity(selectedShape) * 100,
                              )}
                              %
                            </span>
                            <button
                              type="button"
                              className="shape-ctl-btn"
                              aria-label="More opaque"
                              onClick={(e) => {
                                e.stopPropagation();
                                bumpSelectedOpacity(0.06);
                              }}
                            >
                              +
                            </button>
                          </div>
                        </>
                      );
                    })()
                  : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
