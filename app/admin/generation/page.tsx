"use client";

import { useRef, useState, type ReactNode } from "react";
import { BIBLE_BOOKS, chapterCount, slugFor } from "@/lib/bible/books";
import {
  buildStudioGenerateRequest,
  decideMark8StudioPreflight,
  isStudioGenerateEntryDisabled,
  MARK_8_CONFIRMATION_MESSAGE,
  MARK_8_PREFLIGHT_ERROR,
  MARK_8_SOURCE_PREPARATION_MESSAGE,
  MARK_8_STUDIO_SLUG,
} from "@/lib/studio-mark8-preflight";
import { studioPreviewUrl } from "@/lib/studio-preview";
import { parseOverlapAuditDiagnostics } from "@/lib/audit-overlap-diagnostics";
import {
  buildMark8StudioSetupRequest,
  decideMark8StudioSetup,
  type Mark8StudioSetupDecision,
} from "@/lib/studio-mark8-setup";

// Selah Studio — a calm, guided publishing flow (not a developer console).
// Choose Chapter → Generate Draft → Preview Text → Create & Review Images →
// Publish Final. All technical controls stay out of the guided flow. Nothing
// sensitive is in the page; service credentials remain server-side.
type GenSettings = {
  text_generation_enabled: boolean;
  image_generation_enabled: boolean;
  allowed_slugs: string[];
  selected_text_model: string;
  selected_image_model: string;
  daily_budget_limit_usd: number | null;
  require_confirm: boolean;
  updated_at: string;
};

type AuditEntry = {
  created_at?: string;
  action: string;
  slug: string | null;
  status: string;
  model: string | null;
  message?: string | null;
};

type Rule = {
  id: string;
  rule_id?: string | null;
  title: string;
  rule_text: string;
  category: string;
  priority?: string;
  active: boolean;
};

type Example = {
  id: string;
  title: string;
  genre: string;
  example_type: string;
  source_title: string | null;
  active: boolean;
};

type Phase = "idle" | "checking" | "generating" | "ready" | "error";
type Verdict = "" | "yes" | "needs_work";
type Scope = "chapter" | "future" | "both";
type StepState = "done" | "current" | "todo";
type ImagePhase = "idle" | "checking" | "confirming" | "queued" | "running" | "ready" | "error";

type StudioImage = {
  kind: string;
  label: string;
  description: string;
  status: string;
};

type StudioImageStatus = {
  total: number;
  stored: number;
  done: boolean;
  state: "idle" | "queued" | "running" | "blocked" | "failed";
  heroKind: string | null;
  model: string | null;
  planDigest: string;
  images: StudioImage[];
  reviewDigest: string | null;
  spentCount: number;
  estimatedCostUsd: number;
};

type StudioCopyReview =
  | { status: "warning"; reportDigest: string; findingCount: number }
  | { status: "invalid" };

const QUICK_TAGS = [
  "Too academic",
  "Too generic",
  "Too much hedging",
  "Needs more visual detail",
  "Needs stronger Jesus connection",
  "Map missing",
  "Great — save as example",
];
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;

export default function SelahStudioPage() {
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<GenSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginMsg, setLoginMsg] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");

  const [book, setBook] = useState("Mark");
  const [chapter, setChapter] = useState(8);
  const [phase, setPhase] = useState<Phase>("idle");
  const [genMsg, setGenMsg] = useState("");
  const [draftTakingLonger, setDraftTakingLonger] = useState(false);
  const [statusProblem, setStatusProblem] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmingMark8Source, setConfirmingMark8Source] = useState(false);
  const [confirmingImageDiscard, setConfirmingImageDiscard] = useState(false);
  const [approvedImageDiscard, setApprovedImageDiscard] = useState(false);
  const [preparingMark8, setPreparingMark8] = useState(false);
  const [mark8ManifestDigest, setMark8ManifestDigest] = useState<string | null>(null);
  const [mark8Blockers, setMark8Blockers] = useState<string[]>([]);
  const [mark8SetupDecision, setMark8SetupDecision] = useState<Mark8StudioSetupDecision | null>(null);
  const [mark8SetupBusy, setMark8SetupBusy] = useState(false);
  const [mark8SetupMsg, setMark8SetupMsg] = useState("");

  const [previewed, setPreviewed] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>("");
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<Scope>("chapter");
  const [tags, setTags] = useState<string[]>([]);
  const [noteSaved, setNoteSaved] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");
  const [copyReview, setCopyReview] = useState<StudioCopyReview | null>(null);
  const [approvedCopyReviewDigest, setApprovedCopyReviewDigest] = useState<string | null>(null);

  const [imagePhase, setImagePhase] = useState<ImagePhase>("idle");
  const [imageStatus, setImageStatus] = useState<StudioImageStatus | null>(null);
  const [imageMsg, setImageMsg] = useState("");
  const [imagesPreviewed, setImagesPreviewed] = useState(false);
  const [approvedReviewDigest, setApprovedReviewDigest] = useState<string | null>(null);

  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [examples, setExamples] = useState<Example[] | null>(null);

  const activeSlug = useRef("");
  const mark8SetupRequest = useRef(0);
  const mark8PreflightRequest = useRef(0);
  const imageStatusRequest = useRef(0);
  const currentImageReviewDigest = useRef("");
  const currentCopyReviewDigest = useRef("");
  const confirmedSettings = useRef<GenSettings | null>(null);
  const slug = slugFor(book, chapter) ?? "";

  async function api(method: "GET" | "POST", body?: unknown) {
    const r = await fetch("/api/admin/generation", {
      method,
      headers: { "x-admin-token": token, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.json();
  }

  async function connect() {
    setBusy(true);
    setLoginMsg("");
    try {
      const j = await api("GET");
      if (j.ok) {
        const next = j.settings as GenSettings;
        confirmedSettings.current = next;
        setSettings(next);
        const target = slugFor(book, chapter) ?? "";
        activeSlug.current = target;
        if (target) {
          setPhase("checking");
          void loadChapterStatus(target);
        }
      } else {
        setLoginMsg(j.error || "That key didn't work — try again.");
      }
    } catch {
      setLoginMsg("Studio could not connect. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function resetImageReview() {
    imageStatusRequest.current++;
    currentImageReviewDigest.current = "";
    setImagePhase("idle");
    setImageStatus(null);
    setImageMsg("");
    setImagesPreviewed(false);
    setApprovedReviewDigest(null);
    setConfirmingImageDiscard(false);
    setApprovedImageDiscard(false);
  }

  // Reset the review, image, and publish state when the chapter changes or a
  // fresh draft begins. An approval must never carry into a different draft.
  function resetReview() {
    setPreviewed(false);
    setVerdict("");
    setNote("");
    setScope("chapter");
    setTags([]);
    setNoteSaved(false);
    setShowFeedback(false);
    setReviewMsg("");
    currentCopyReviewDigest.current = "";
    setCopyReview(null);
    setApprovedCopyReviewDigest(null);
    resetImageReview();
    setPublished(false);
    setPublishMsg("");
  }

  function applyCopyReview(value: unknown) {
    const next = readStudioCopyReview(value);
    const nextDigest = next?.status === "warning" ? next.reportDigest : "";
    if (currentCopyReviewDigest.current !== nextDigest) {
      currentCopyReviewDigest.current = nextDigest;
      setApprovedCopyReviewDigest(null);
      setVerdict("");
    }
    setCopyReview(next);
  }

  function onPickChapter(nextBook: string, nextChapter: number) {
    setBook(nextBook);
    setChapter(nextChapter);
    setPhase("checking");
    setGenMsg("");
    setDraftTakingLonger(false);
    setStatusProblem(false);
    setConfirming(false);
    setConfirmingMark8Source(false);
    setConfirmingImageDiscard(false);
    setApprovedImageDiscard(false);
    setPreparingMark8(false);
    setMark8ManifestDigest(null);
    setMark8Blockers([]);
    setMark8SetupDecision(null);
    setMark8SetupBusy(false);
    setMark8SetupMsg("");
    mark8SetupRequest.current++;
    mark8PreflightRequest.current++;
    resetReview();
    const target = slugFor(nextBook, nextChapter) ?? "";
    activeSlug.current = target;
    if (target) void loadChapterStatus(target);
  }

  async function loadChapterStatus(target: string) {
    if (target === MARK_8_STUDIO_SLUG) void loadMark8Setup(target);
    setPhase("checking");
    setStatusProblem(false);
    setGenMsg("");
    setDraftTakingLonger(false);

    let j: Record<string, unknown>;
    try {
      j = await api("POST", { action: "status", slug: target });
    } catch {
      if (activeSlug.current !== target) return;
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio could not check this chapter. Check your connection and try again.");
      return;
    }
    if (activeSlug.current !== target) return;
    if (!j.ok) {
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio could not check this chapter. Try again before creating a draft.");
      return;
    }

    const status = j.status as string | null;
    applyCopyReview(j.copyReview);
    setStatusProblem(false);
    if (status === "reviewed") {
      setPhase("ready");
      setPublished(true);
      setGenMsg("");
    } else if (status === "draft" || status === "ready") {
      setPhase("ready");
      setPublished(false);
      setGenMsg("");
      if (target === MARK_8_STUDIO_SLUG) void loadImagesStatus(target);
    } else if (status === "generating") {
      setPhase("generating");
      setPublished(false);
      setGenMsg("");
      void pollStatus(target);
    } else if (status === "failed") {
      setPhase("error");
      setPublished(false);
      setDraftTakingLonger(false);
      setGenMsg(
        typeof j.failureMessage === "string"
          ? j.failureMessage
          : "The last draft did not finish. Check readiness before trying again.",
      );
    } else {
      setPhase("idle");
      setPublished(false);
      setGenMsg("");
    }
  }

  async function pollStatus(target: string, attempt = 0) {
    if (activeSlug.current !== target) return;
    if (attempt > 150) {
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("This is taking longer than expected. It may still be working. You can safely return later or check again.");
      return;
    }
    if (attempt === 48) setDraftTakingLonger(true);
    let j: Record<string, unknown>;
    try {
      j = await api("POST", { action: "status", slug: target });
    } catch {
      if (activeSlug.current !== target) return;
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio lost its connection while checking the draft. Try checking again.");
      return;
    }
    if (activeSlug.current !== target) return;
    if (!j.ok) {
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio could not check the draft. Try checking again.");
      return;
    }
    const st = j.status as string | null;
    applyCopyReview(j.copyReview);
    if (st === "draft" || st === "ready" || st === "reviewed") {
      setPhase("ready");
      setPublished(st === "reviewed");
      setGenMsg("");
      setDraftTakingLonger(false);
      // A run just reached a terminal state — pull fresh history so Recent
      // activity reflects it without a full page reload (issue #17).
      refreshAuditAfterTerminalRun();
      if (st !== "reviewed" && target === MARK_8_STUDIO_SLUG) void loadImagesStatus(target);
    } else if (st === "failed") {
      setPhase("error");
      setStatusProblem(false);
      const safeFailure = typeof j.failureMessage === "string" ? j.failureMessage : "Something went wrong while writing the draft.";
      setGenMsg(safeFailure);
      setDraftTakingLonger(false);
      refreshAuditAfterTerminalRun();
    } else {
      setTimeout(() => pollStatus(target, attempt + 1), 5000);
    }
  }

  async function loadMark8Setup(target: string) {
    if (target !== MARK_8_STUDIO_SLUG) return;
    const requestId = ++mark8SetupRequest.current;
    setMark8SetupDecision(null);
    setMark8SetupMsg("");
    try {
      const response = await api("POST", {
        action: "mark8_setup_status",
        slug: target,
      });
      if (activeSlug.current !== target || mark8SetupRequest.current !== requestId) return;
      setMark8SetupDecision(decideMark8StudioSetup(response));
    } catch {
      if (activeSlug.current === target && mark8SetupRequest.current === requestId) {
        setMark8SetupDecision({ kind: "error" });
      }
    }
  }

  async function setupMark8() {
    const target = slug;
    const decision = mark8SetupDecision;
    if (target !== MARK_8_STUDIO_SLUG || decision?.kind !== "setup") return;
    const requestId = ++mark8SetupRequest.current;
    setMark8SetupBusy(true);
    setMark8SetupMsg("");
    try {
      const response = await api("POST", buildMark8StudioSetupRequest(decision));
      if (activeSlug.current !== target || mark8SetupRequest.current !== requestId) return;
      const next = decideMark8StudioSetup(response);
      setMark8SetupDecision(next);
      if (next.kind !== "ready") {
        setMark8SetupMsg(
          typeof response.error === "string"
            ? response.error
            : "Studio could not safely finish Mark 8 setup.",
        );
      }
    } catch {
      if (activeSlug.current === target && mark8SetupRequest.current === requestId) {
        setMark8SetupDecision({ kind: "error" });
        setMark8SetupMsg("Studio could not safely finish Mark 8 setup.");
      }
    } finally {
      if (activeSlug.current === target && mark8SetupRequest.current === requestId) {
        setMark8SetupBusy(false);
      }
    }
  }

  function onGenerateClick() {
    const imageWorkLocked =
      slug === MARK_8_STUDIO_SLUG &&
      (imagePhase === "checking" || imagePhase === "queued" || imagePhase === "running" ||
        imageStatus?.state === "failed" || imageStatus?.state === "blocked");
    if (
      !slug ||
      phase === "checking" ||
      phase === "generating" ||
      preparingMark8 ||
      statusProblem ||
      published ||
      imageWorkLocked ||
      (slug === MARK_8_STUDIO_SLUG && mark8SetupDecision?.kind !== "ready")
    ) return;
    if (slug === MARK_8_STUDIO_SLUG) {
      if ((imageStatus?.stored ?? 0) > 0 && !approvedImageDiscard) {
        setConfirming(false);
        setConfirmingMark8Source(false);
        setConfirmingImageDiscard(true);
        return;
      }
      setConfirming(false);
      setConfirmingImageDiscard(false);
      setConfirmingMark8Source(true);
      return;
    }
    if (
      settings?.text_generation_enabled !== true ||
      confirmedSettings.current?.text_generation_enabled !== true
    ) return;
    if (
      settings?.require_confirm !== false ||
      confirmedSettings.current?.require_confirm !== false
    ) {
      setConfirming(true);
      return;
    }
    void doGenerate();
  }

  async function prepareMark8ForConfirmation() {
    const target = slug;
    if (target !== MARK_8_STUDIO_SLUG) return;
    const requestId = ++mark8PreflightRequest.current;
    setConfirmingMark8Source(false);
    setPreparingMark8(true);
    setConfirming(false);
    setMark8ManifestDigest(null);
    setMark8Blockers([]);
    setGenMsg("");
    activeSlug.current = target;

    try {
      const response = await api("POST", {
        action: "mark_sprint_prepare",
        slug: target,
      });
      if (activeSlug.current !== target || mark8PreflightRequest.current !== requestId) return;
      const decision = decideMark8StudioPreflight(response);
      if (decision.kind === "blocked") {
        setApprovedImageDiscard(false);
        setMark8Blockers(decision.blockers);
        return;
      }
      setMark8ManifestDigest(decision.manifestDigest);
      setConfirming(true);
    } catch {
      if (activeSlug.current === target && mark8PreflightRequest.current === requestId) {
        setApprovedImageDiscard(false);
        setMark8Blockers([MARK_8_PREFLIGHT_ERROR]);
      }
    } finally {
      if (activeSlug.current === target && mark8PreflightRequest.current === requestId) {
        setPreparingMark8(false);
      }
    }
  }

  async function doGenerate() {
    const target = slug;
    const discardCompletedImages = target === MARK_8_STUDIO_SLUG && approvedImageDiscard;
    const approvedManifestDigest =
      target === MARK_8_STUDIO_SLUG ? mark8ManifestDigest : null;
    if (target === MARK_8_STUDIO_SLUG && !approvedManifestDigest) {
      setConfirming(false);
      setMark8Blockers([MARK_8_PREFLIGHT_ERROR]);
      return;
    }
    setConfirming(false);
    setPhase("generating");
    setGenMsg("");
    setMark8Blockers([]);
    setStatusProblem(false);
    resetReview();
    activeSlug.current = target;
    let j: Record<string, unknown>;
    try {
      j = await api(
        "POST",
        buildStudioGenerateRequest(target, approvedManifestDigest, discardCompletedImages),
      );
    } catch {
      if (activeSlug.current !== target) return;
      setPhase("error");
      setStatusProblem(true);
      setGenMsg("Studio lost its connection while starting the draft. Check the chapter before trying again.");
      return;
    }
    if (activeSlug.current !== target) return;
    if (!j.ok) {
      setPhase("error");
      if (target === MARK_8_STUDIO_SLUG) setMark8ManifestDigest(null);
      setGenMsg(typeof j.error === "string" ? j.error : "Couldn't start the draft.");
      return;
    }
    void pollStatus(target);
  }

  async function previewDraft() {
    const target = slug;
    const previewUrl = studioPreviewUrl(target);
    if (!previewUrl) return;
    const reviewingImages = imagePhase === "ready" && Boolean(imageStatus?.reviewDigest);
    let previewFailure = "";

    // Open synchronously so browsers do not block the tab while Studio waits
    // for the authenticated cookie response.
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      if (reviewingImages) {
        setImageMsg("Allow pop-ups for Selah, then try the image preview again.");
      } else {
        setReviewMsg("Allow pop-ups for Selah, then try Preview Draft again.");
      }
      return;
    }
    previewWindow.opener = null;
    try {
      if (reviewingImages) {
        const statusResponse = await api("POST", { action: "images_status", slug: target });
        const fresh = readStudioImageStatus(statusResponse);
        const freshComplete =
          fresh &&
          (fresh.total === 3 || fresh.total === 5) &&
          fresh.done &&
          fresh.stored === fresh.total &&
          Boolean(fresh.reviewDigest);
        if (!fresh || !freshComplete) {
          if (fresh) applyImageStatus(fresh);
          setImagePhase(fresh?.state === "queued" || fresh?.state === "running" ? fresh.state : "error");
          previewFailure = "The images changed or are not ready yet. Check them again before previewing.";
          throw new Error("fresh image review unavailable");
        }
        applyImageStatus(fresh);
        setImagePhase("ready");
      }
      const response = await api("POST", { action: "preview_access", slug: target });
      if (!response.ok) throw new Error("preview access refused");
      previewWindow.location.href = previewUrl;
      setPreviewed(true);
      if (reviewingImages) {
        setImagesPreviewed(true);
        setApprovedReviewDigest(null);
        setImageMsg("");
      }
      setReviewMsg("");
    } catch {
      previewWindow.close();
      if (reviewingImages) {
        setImageMsg(previewFailure || "Studio could not open the image preview. Try again.");
      } else {
        setReviewMsg("Studio could not open the preview. Try again.");
      }
    }
  }

  function applyImageStatus(next: StudioImageStatus) {
    const nextDigest = next.reviewDigest ?? "";
    if (currentImageReviewDigest.current !== nextDigest) {
      currentImageReviewDigest.current = nextDigest;
      setImagesPreviewed(false);
      setApprovedReviewDigest(null);
    }
    setImageStatus(next);
  }

  async function loadImagesStatus(target: string) {
    if (target !== MARK_8_STUDIO_SLUG) return;
    const requestId = ++imageStatusRequest.current;
    setImagePhase("checking");
    setImageMsg("");
    await checkImagesStatus(target, requestId, 0, false);
  }

  async function checkImagesStatus(
    target: string,
    requestId: number,
    attempt: number,
    expectWork: boolean,
  ) {
    if (activeSlug.current !== target || imageStatusRequest.current !== requestId) return;
    if (attempt > 150) {
      setImagePhase("error");
      setImageMsg("The images are taking longer than expected. They may still be working—check again in a moment.");
      return;
    }

    let response: Record<string, unknown>;
    try {
      response = await api("POST", { action: "images_status", slug: target });
    } catch {
      if (activeSlug.current !== target || imageStatusRequest.current !== requestId) return;
      setImagePhase("error");
      setImageMsg("Studio lost track of the images. They may still be working—check again.");
      return;
    }
    if (activeSlug.current !== target || imageStatusRequest.current !== requestId) return;

    const next = readStudioImageStatus(response);
    if (!next) {
      setImagePhase("error");
      setImageMsg("Studio could not check the images. Nothing was published. Try checking again.");
      return;
    }
    applyImageStatus(next);

    const exactPlan = next.total === 3 || next.total === 5;
    const complete =
      exactPlan &&
      next.done &&
      next.stored === next.total &&
      Boolean(next.reviewDigest);
    if (complete) {
      setImagePhase("ready");
      setImageMsg("");
      return;
    }

    if (next.state === "blocked" || next.state === "failed") {
      setImagePhase("error");
      setImageMsg(
        next.state === "blocked"
          ? "The image run stopped after using image credit, but Studio could not safely finish its record. Studio needs attention before another image run. Nothing was published."
          : next.spentCount > 0
            ? `The images stopped before they finished. Image credit was used for ${next.spentCount} ${next.spentCount === 1 ? "image" : "images"}. Nothing was published.`
            : "The images stopped before they finished. No image credit was used. Nothing was published.",
      );
      return;
    }

    if (next.state === "queued" || next.state === "running") {
      setImagePhase(next.state);
      setTimeout(() => {
        void checkImagesStatus(target, requestId, attempt + 1, true);
      }, 6000);
      return;
    }

    if (expectWork) {
      if (attempt < 3) {
        setImagePhase("queued");
        setTimeout(() => {
          void checkImagesStatus(target, requestId, attempt + 1, true);
        }, 4000);
      } else {
        setImagePhase("error");
        setImageMsg("The image run stopped before it finished. Nothing was published. You can try again.");
      }
      return;
    }

    if (!exactPlan) {
      setImagePhase("error");
      setImageMsg("This draft does not have a complete 3- or 5-image plan yet. Create a fresh draft before making images.");
      return;
    }
    setImagePhase("idle");
    setImageMsg("");
  }

  function confirmImageCreation() {
    if (
      slug !== MARK_8_STUDIO_SLUG ||
      verdict !== "yes" ||
      !previewed ||
      !copyReviewApproved(copyReview, approvedCopyReviewDigest)
    ) return;
    if (!imageStatus || (imageStatus.total !== 3 && imageStatus.total !== 5)) {
      void loadImagesStatus(slug);
      return;
    }
    setImagePhase("confirming");
    setImageMsg("");
  }

  async function createImages() {
    const target = slug;
    if (
      target !== MARK_8_STUDIO_SLUG ||
      verdict !== "yes" ||
      !previewed ||
      !copyReviewApproved(copyReview, approvedCopyReviewDigest) ||
      settings?.image_generation_enabled !== true ||
      confirmedSettings.current?.image_generation_enabled !== true ||
      !imageStatus ||
      !imageStatus.planDigest ||
      !imageStatus.model ||
      (imageStatus.total !== 3 && imageStatus.total !== 5)
    ) return;

    const requestId = ++imageStatusRequest.current;
    currentImageReviewDigest.current = "";
    setApprovedReviewDigest(null);
    setImagesPreviewed(false);
    setImagePhase("queued");
    setImageMsg("");
    try {
      const response = await api("POST", {
        action: "generate_images",
        slug: target,
        approvedImagePlanDigest: imageStatus.planDigest,
        approvedImageCount: imageStatus.total,
        approvedImageModel: imageStatus.model,
        ...(approvedCopyReviewDigest
          ? { sourceOverlapReportDigest: approvedCopyReviewDigest }
          : {}),
      });
      if (activeSlug.current !== target || imageStatusRequest.current !== requestId) return;
      if (!response.ok) {
        setImagePhase("error");
        setImageMsg(
          typeof response.error === "string"
            ? response.error
            : "Studio could not start the images. No images were approved or published. You can try again.",
        );
        return;
      }
      // A successful trigger only means the work was accepted. Studio waits
      // for the stored image set and its exact review digest before saying ready.
      await checkImagesStatus(target, requestId, 0, true);
    } catch {
      if (activeSlug.current === target && imageStatusRequest.current === requestId) {
        setImagePhase("error");
        setImageMsg("Studio could not start the images. Nothing was published. You can try again.");
      }
    }
  }

  function approveImages() {
    if (!imagesPreviewed || imagePhase !== "ready" || !imageStatus?.reviewDigest) return;
    setApprovedReviewDigest(imageStatus.reviewDigest);
  }

  function toggleTag(t: string) {
    setNoteSaved(false);
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function saveNote() {
    if (!verdict) return;
    const target = slug;
    setBusy(true);
    setReviewMsg("");
    try {
      const j = await api("POST", { action: "feedback", slug: target, verdict, note, scope, tags });
      if (activeSlug.current !== target) return;
      setNoteSaved(Boolean(j.ok));
      if (!j.ok) setReviewMsg("Studio could not save that feedback. Try again.");
      // A future/both note may have created a global rule — refresh the panel if open.
      if (j.ok && scope !== "chapter" && rules !== null) void loadRules();
    } catch {
      if (activeSlug.current === target) setReviewMsg("Studio could not save that feedback. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRules() {
    const j = await api("POST", { action: "rules_list" });
    if (j.ok) setRules(j.rules as Rule[]);
  }

  async function toggleRule(id: string, active: boolean) {
    setRules((rs) => rs?.map((r) => (r.id === id ? { ...r, active } : r)) ?? rs);
    await api("POST", { action: "rule_toggle", id, active });
  }

  async function removeRule(id: string) {
    setRules((rs) => rs?.filter((r) => r.id !== id) ?? rs);
    await api("POST", { action: "rule_delete", id });
  }

  async function loadExamples() {
    const j = await api("POST", { action: "examples_list" });
    if (j.ok) setExamples(j.examples as Example[]);
  }

  async function toggleExample(id: string, active: boolean) {
    setExamples((xs) => xs?.map((x) => (x.id === id ? { ...x, active } : x)) ?? xs);
    await api("POST", { action: "example_toggle", id, active });
  }

  async function removeExample(id: string) {
    setExamples((xs) => xs?.filter((x) => x.id !== id) ?? xs);
    await api("POST", { action: "example_delete", id });
  }

  async function publishFinal() {
    const target = slug;
    const hasFeedback = note.trim().length > 0 || tags.length > 0;
    setBusy(true);
    setPublishing(true);
    setPublishMsg("");
    try {
      // Optional teaching notes stay outside the publish-critical path. A plain
      // Ready choice is represented by the final review digest, not an empty
      // chapter_review_notes insert.
      if (hasFeedback && !noteSaved) {
        const feedback = await api("POST", { action: "feedback", slug: target, verdict, note, scope, tags });
        if (activeSlug.current !== target) return;
        if (!feedback.ok) {
          setPublishMsg("Studio could not save your approval, so nothing was published. Try again.");
          return;
        }
        setNoteSaved(true);
      }
      const j = await api("POST", {
        action: "publish",
        slug: target,
        ...(target === MARK_8_STUDIO_SLUG ? { reviewDigest: approvedReviewDigest } : {}),
        ...(target === MARK_8_STUDIO_SLUG && approvedCopyReviewDigest
          ? { sourceOverlapReportDigest: approvedCopyReviewDigest }
          : {}),
      });
      if (activeSlug.current !== target) {
        return;
      }
      setPublished(Boolean(j.ok));
      if (!j.ok) {
        setPublishMsg(j.error || "Publish failed.");
        if (target === MARK_8_STUDIO_SLUG) {
          setImagesPreviewed(false);
          setApprovedReviewDigest(null);
          void loadImagesStatus(target);
        }
      }
    } catch {
      if (activeSlug.current === target) {
        setPublishMsg("Studio lost its connection after the publish attempt. Checking what happened…");
        try {
          const status = await api("POST", { action: "status", slug: target });
          if (activeSlug.current !== target) return;
          if (status.ok && status.status === "reviewed") {
            setPublished(true);
            setPhase("ready");
            setPublishMsg("");
          } else {
            setPublishMsg("Nothing was confirmed as published. Check the chapter before trying again.");
          }
        } catch {
          if (activeSlug.current === target) {
            setPublishMsg("Nothing was confirmed as published. Check the chapter before trying again.");
          }
        }
      }
    } finally {
      setBusy(false);
      setPublishing(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    const requestedSettings = {
      text_generation_enabled: settings.text_generation_enabled,
      image_generation_enabled: settings.image_generation_enabled,
      require_confirm: settings.require_confirm,
    };
    setBusy(true);
    setSettingsMsg("");
    const confirmAfterUncertainSave = async () => {
      try {
        const check = await api("GET");
        if (!check.ok) throw new Error("settings check failed");
        const live = check.settings as GenSettings;
        confirmedSettings.current = live;
        setSettings(live);
        const saved =
          live.text_generation_enabled === requestedSettings.text_generation_enabled &&
          live.image_generation_enabled === requestedSettings.image_generation_enabled &&
          live.require_confirm === requestedSettings.require_confirm;
        setSettingsMsg(
          saved
            ? "Saved"
            : "Studio reconnected, but those switches were not saved. Review them and try again.",
        );
      } catch {
        // The request may have reached the server even though its response was
        // lost. Keep every spending action blocked until a later save confirms
        // the live switches instead of guessing which state won.
        confirmedSettings.current = null;
        setSettingsMsg(
          "Studio could not confirm those switches. Check your connection and save again before creating anything.",
        );
      }
    };
    try {
      // Only send the three switches this screen actually owns. Chapter
      // access and model choices may have changed server-side since sign-in;
      // sending the full, stale object could silently undo those changes.
      const j = await api("POST", {
        action: "save",
        settings: requestedSettings,
      });
      if (j.ok) {
        const next = j.settings as GenSettings;
        confirmedSettings.current = next;
        setSettings(next);
        setSettingsMsg("Saved");
      } else {
        await confirmAfterUncertainSave();
      }
    } catch {
      await confirmAfterUncertainSave();
    } finally {
      setBusy(false);
    }
  }

  async function loadAudit() {
    const j = await api("POST", { action: "audit" });
    if (j.ok) setAudit(j.entries as AuditEntry[]);
  }

  function refreshAuditAfterTerminalRun() {
    // The worker persists the chapter status FIRST and writes the history row
    // just after (completeGenerationJob/failGenerationJob → audit), so a read
    // triggered by the terminal status can land one row early. One bounded
    // delayed follow-up read narrows that window — it cannot guarantee closure
    // if the insert lags past it; the manual Refresh control is the backstop.
    // No loop, no retry policy.
    void loadAudit();
    setTimeout(() => void loadAudit(), 1500);
  }

  function setS<K extends keyof GenSettings>(k: K, v: GenSettings[K]) {
    setSettingsMsg("");
    setSettings((s) => (s ? { ...s, [k]: v } : s));
  }

  // ---- shared styles ----
  const field = "w-full rounded-lg border bg-card-soft px-3 py-2 text-[14px] text-primary";
  const primary =
    "rounded-full bg-accent-strong px-5 py-2.5 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40";
  const ghost =
    "rounded-full border bg-card px-5 py-2.5 text-[14px] font-medium text-primary transition disabled:cursor-not-allowed disabled:opacity-40";

  // ---------------- Login ----------------
  if (!settings) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <p className="text-eyebrow">SELAH STUDIO</p>
        <h1 className="mt-1 text-title text-primary">Welcome back</h1>
        <p className="mt-2 text-[14px] text-secondary">Enter your studio key to continue.</p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && token && connect()}
          placeholder="Studio key"
          className={`${field} mt-5`}
        />
        <button type="button" onClick={connect} disabled={busy || !token} className={`${primary} mt-3`}>
          {busy ? "…" : "Enter Studio"}
        </button>
        {loginMsg && <p className="mt-3 text-[13px] text-jesus-red">{loginMsg}</p>}
      </div>
    );
  }

  // ---------------- Step states ----------------
  // Spending controls follow the last server-confirmed save. Editing a switch
  // locally must never make Studio look ready before the save actually lands.
  const textOff =
    settings.text_generation_enabled !== true ||
    confirmedSettings.current?.text_generation_enabled !== true;
  const imagesOff =
    settings.image_generation_enabled !== true ||
    confirmedSettings.current?.image_generation_enabled !== true;
  const isMark8 = slug === MARK_8_STUDIO_SLUG;
  const mark8SetupReady = !isMark8 || mark8SetupDecision?.kind === "ready";
  const draftReady = phase === "ready";
  const wordingReviewed = copyReviewApproved(
    copyReview,
    approvedCopyReviewDigest,
  );
  const textApproved = previewed && verdict === "yes" && wordingReviewed;
  const exactImagesReady =
    imagePhase === "ready" &&
    Boolean(imageStatus?.reviewDigest) &&
    imageStatus?.stored === imageStatus?.total &&
    (imageStatus?.total === 3 || imageStatus?.total === 5);
  const mark8ImageWorkLocked =
    isMark8 &&
    (imagePhase === "checking" || imagePhase === "queued" || imagePhase === "running" ||
      imageStatus?.state === "failed" || imageStatus?.state === "blocked");
  const imagesApproved =
    exactImagesReady &&
    imagesPreviewed &&
    Boolean(approvedReviewDigest) &&
    approvedReviewDigest === imageStatus?.reviewDigest;
  const canPublish =
    draftReady &&
    textApproved &&
    !published &&
    (!isMark8 || imagesApproved);

  const step1: StepState = phase === "idle" && !published ? "current" : "done";
  const step2: StepState =
    published ? "done" : phase === "idle" ? "todo" : phase === "ready" ? "done" : "current";
  const step3: StepState = published || previewed ? "done" : draftReady ? "current" : "todo";
  const step4: StepState = published || imagesApproved ? "done" : textApproved ? "current" : "todo";
  const publishStep: StepState = published ? "done" : canPublish ? "current" : "todo";

  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-12">
      <header className="mb-2">
        <p className="text-eyebrow">SELAH STUDIO</p>
        <h1 className="mt-1 text-title text-primary">Launch a Chapter</h1>
        <p className="mt-1 text-[14px] text-secondary">
          Choose a chapter, review one fresh draft, then decide when it goes live.
        </p>
      </header>

      {/* Step 1 — Choose Chapter */}
      <Step n={1} title="Choose Chapter" state={step1}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[12px] text-secondary">Book</label>
            <select disabled={busy} className={`${field} mt-1`} value={book} onChange={(e) => onPickChapter(e.target.value, 1)}>
              {BIBLE_BOOKS.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-secondary">Chapter</label>
            <select disabled={busy} className={`${field} mt-1`} value={chapter} onChange={(e) => onPickChapter(book, Number(e.target.value))}>
              {Array.from({ length: chapterCount(book) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-[13px] text-secondary">
          You&rsquo;re working on <span className="font-semibold text-primary">{book} {chapter}</span>.
        </p>
      </Step>

      {/* Step 2 — Generate Draft */}
      <Step n={2} title="Generate Draft" state={step2}>
        {isMark8 && mark8SetupDecision === null && (
          <p className="text-[13px] text-secondary">Checking Mark 8 setup…</p>
        )}
        {isMark8 && mark8SetupDecision?.kind === "locked" && (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] font-semibold text-primary">Mark 8 setup is locked</p>
            <p className="mt-1 text-[13px] text-secondary">
              The exact Selah Brain and 10 Mark 8 notes still need your approval.
            </p>
          </div>
        )}
        {isMark8 && mark8SetupDecision?.kind === "setup" && (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] text-primary">
              Load the approved {mark8SetupDecision.ruleCount} Selah Brain rules and {mark8SetupDecision.noteCount} Mark 8 notes into private Studio? This creates no draft and publishes nothing.
            </p>
            <button
              type="button"
              onClick={() => void setupMark8()}
              disabled={mark8SetupBusy}
              className={`${primary} mt-2.5`}
            >
              {mark8SetupBusy ? "Setting up…" : "Set up Mark 8"}
            </button>
          </div>
        )}
        {isMark8 && mark8SetupDecision?.kind === "error" && (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] text-jesus-red">
              {mark8SetupMsg || "Studio could not safely check Mark 8 setup."}
            </p>
            <button type="button" onClick={() => void loadMark8Setup(slug)} className={`${ghost} mt-2.5`}>
              Check setup again
            </button>
          </div>
        )}
        {isMark8 && mark8SetupDecision?.kind === "ready" && (
          <p className="mb-2.5 text-[13px] font-medium text-accent-strong">
            ✓ Selah Brain and Mark 8 notes are ready
          </p>
        )}
        {mark8SetupReady && (statusProblem ? (
          <button type="button" onClick={() => void loadChapterStatus(slug)} className={ghost}>
            Check chapter again
          </button>
        ) : confirmingImageDiscard ? (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] text-primary">
              Creating a new Mark 8 draft will remove the current {imageStatus?.stored ?? 0} finished images.
              Their image credit cannot be recovered. Continue?
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmingImageDiscard(false);
                  setApprovedImageDiscard(true);
                  setConfirmingMark8Source(true);
                }}
                className={primary}
              >
                Continue
              </button>
              <button type="button" onClick={() => setConfirmingImageDiscard(false)} className={ghost}>
                Keep current draft
              </button>
            </div>
          </div>
        ) : confirmingMark8Source ? (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] text-primary">{MARK_8_SOURCE_PREPARATION_MESSAGE}</p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => void prepareMark8ForConfirmation()}
                className={primary}
              >
                Prepare Mark 8
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingMark8Source(false);
                  setApprovedImageDiscard(false);
                }}
                className={ghost}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : !confirming ? (
          <button
            type="button"
            onClick={onGenerateClick}
            disabled={isStudioGenerateEntryDisabled({
              slug,
              chapterBusy: phase === "checking" || phase === "generating" || mark8ImageWorkLocked,
              preflightBusy: preparingMark8,
              textGenerationEnabled: !textOff,
              published,
            })}
            className={primary}
          >
            {published
              ? "Already Published"
              : mark8ImageWorkLocked
                ? "Finish Current Images"
              : phase === "checking"
                ? "Checking…"
                : preparingMark8
                  ? "Checking readiness…"
                : phase === "generating"
                  ? "Generating…"
                  : draftReady
                    ? "Generate Again"
                    : isMark8
                      ? "Prepare Mark 8"
                      : "Generate Draft"}
          </button>
        ) : (
          <div className="rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] text-primary">
              {slug === MARK_8_STUDIO_SLUG ? (
                <>{MARK_8_CONFIRMATION_MESSAGE}</>
              ) : (
                <>Create one fresh private draft of <span className="font-semibold">{book} {chapter}</span>? It will not publish, and it uses a small amount of credit.</>
              )}
            </p>
            <div className="mt-2.5 flex gap-2">
              <button type="button" onClick={() => void doGenerate()} disabled={textOff} className={primary}>Create draft</button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  if (slug === MARK_8_STUDIO_SLUG) {
                    setMark8ManifestDigest(null);
                    setApprovedImageDiscard(false);
                  }
                }}
                className={ghost}
              >
                Cancel
              </button>
            </div>
          </div>
        ))}

        {mark8Blockers.length > 0 && (
          <div role="alert" className="mt-3 rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] font-semibold text-primary">Mark 8 is still locked:</p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-secondary">
              {mark8Blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
            </ul>
          </div>
        )}

        {mark8SetupReady && textOff && (
          <p className="mt-2.5 text-[13px] text-secondary">
            Draft creation is paused. Turn it on and save in <span className="text-primary">Settings &amp; history</span> below to begin.
          </p>
        )}
        {phase === "generating" && (
          <DraftWaitCard reference={`${book} ${chapter}`} takingLonger={draftTakingLonger} />
        )}
        {mark8ImageWorkLocked && phase !== "generating" && (
          <p className="mt-2.5 text-[13px] text-secondary">
            Finish or safely resolve the current image step before creating a new text draft.
          </p>
        )}
        {draftReady && !published && <p className="mt-2.5 text-[13px] font-medium text-accent-strong">✓ Private draft saved</p>}
        {published && <p className="mt-2.5 text-[13px] font-medium text-accent-strong">✓ This chapter is already live</p>}
        {phase === "error" && genMsg && <p role="alert" className="mt-2.5 text-[13px] text-jesus-red">{genMsg}</p>}
      </Step>

      {/* Step 3 — Preview Draft + Selah Brain review */}
      <Step n={3} title="Preview Draft" state={step3}>
        {copyReview?.status === "warning" && (
          <div role="alert" className="mb-3 rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] font-semibold text-primary">Bible wording needs your review</p>
            <p className="mt-1 text-[13px] text-secondary">
              Selah found wording that may be too close to the Bible text. The draft is saved and nothing is live. Preview it, then decide whether the wording is acceptable.
            </p>
          </div>
        )}
        {copyReview?.status === "invalid" && (
          <div role="alert" className="mb-3 rounded-lg border bg-card-soft p-3">
            <p className="text-[13px] font-semibold text-primary">This draft needs attention</p>
            <p className="mt-1 text-[13px] text-secondary">
              Studio could not verify its Bible-wording review. You can preview the draft, but images and publishing stay locked.
            </p>
          </div>
        )}
        {published ? (
          <a href={`/chapter/${slug}`} target="_blank" rel="noreferrer" className="text-[13px] text-primary underline">
            View live chapter ↗
          </a>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={previewDraft} disabled={!draftReady} className={ghost}>
              Preview Draft ↗
            </button>
          </div>
        )}
        {reviewMsg && !previewed && (
          <p role="alert" className="mt-2.5 text-[13px] text-jesus-red">{reviewMsg}</p>
        )}
        {draftReady && !published && !previewed && (
          <p className="mt-2.5 text-[13px] text-secondary">Open the preview, then tell Selah how it feels.</p>
        )}

        {previewed && !published && (
          <div className="mt-3 space-y-4 rounded-lg border bg-card-soft p-4">
            <div>
              <p className="text-[13px] font-semibold text-primary">Before you choose Ready</p>
              <ul className="mt-2 space-y-1 text-[12px] text-secondary">
                <li>• Bible: Is it faithful to this chapter and honest about what we do not know?</li>
                <li>• Jesus: Does it help people see and follow Him without forcing a connection?</li>
                <li>• Voice: Is it warm, clear, and memorable like Mark 6—without copying it?</li>
                <li>• Usefulness: Do the explanation, application, and prayer grow from the chapter?</li>
              </ul>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-primary">
                {isMark8 ? "Is the text ready?" : "Is this ready to publish?"}
              </p>
              <div className="mt-2 flex gap-2">
                <Seg
                  active={verdict === "yes"}
                  disabled={copyReview?.status === "invalid"}
                  onClick={() => {
                    const newlyReady = verdict !== "yes";
                    setVerdict("yes");
                    setNoteSaved(false);
                    setShowFeedback(false);
                    setApprovedCopyReviewDigest(
                      copyReview?.status === "warning"
                        ? copyReview.reportDigest
                        : null,
                    );
                    if (isMark8 && newlyReady) {
                      setImagesPreviewed(false);
                      setApprovedReviewDigest(null);
                      if (imagePhase !== "queued" && imagePhase !== "running") {
                        void loadImagesStatus(slug);
                      }
                    }
                  }}
                >
                  {copyReview?.status === "warning"
                    ? "I reviewed the wording — Ready"
                    : "Ready"}
                </Seg>
                <Seg
                  active={verdict === "needs_work"}
                  onClick={() => {
                    setVerdict("needs_work");
                    setApprovedCopyReviewDigest(null);
                    setNoteSaved(false);
                    setShowFeedback(true);
                    setImagesPreviewed(false);
                    setApprovedReviewDigest(null);
                  }}
                >
                  Needs work
                </Seg>
              </div>
            </div>

            {verdict && (
              <>
                {!showFeedback && (
                  <button
                    type="button"
                    onClick={() => setShowFeedback(true)}
                    className="text-[13px] text-secondary underline"
                  >
                    Add feedback for Selah Brain (optional)
                  </button>
                )}

                {showFeedback && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[13px] text-secondary">What should Selah learn?</label>
                      <textarea
                        value={note}
                        onChange={(e) => { setNote(e.target.value); setNoteSaved(false); }}
                        rows={3}
                        placeholder="Tell Selah what was strong or what needs to change."
                        className={`${field} mt-1`}
                      />
                    </div>

                    <div>
                      <p className="text-[13px] text-secondary">Use this feedback for:</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <Seg active={scope === "chapter"} onClick={() => { setScope("chapter"); setNoteSaved(false); }}>Only this chapter</Seg>
                        <Seg active={scope === "future"} onClick={() => { setScope("future"); setNoteSaved(false); }}>Future chapters</Seg>
                        <Seg active={scope === "both"} onClick={() => { setScope("both"); setNoteSaved(false); }}>Both</Seg>
                      </div>
                    </div>

                    <div>
                      <p className="text-[13px] text-secondary">Quick notes (optional)</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {QUICK_TAGS.map((t) => (
                          <button
                            type="button"
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                              tags.includes(t) ? "border-accent-strong bg-accent-strong/15 text-primary" : "bg-card text-secondary"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button type="button" onClick={saveNote} disabled={busy} className={ghost}>
                        {busy ? "Saving…" : "Save feedback"}
                      </button>
                      {noteSaved && <span className="text-[13px] text-accent-strong">Saved</span>}
                    </div>
                    {reviewMsg && <p role="alert" className="text-[13px] text-jesus-red">{reviewMsg}</p>}
                  </div>
                )}

                {verdict === "needs_work" && (
                  <p className="text-[13px] text-secondary">
                    This won&rsquo;t publish. Adjust and <span className="text-primary">Generate Again</span> when you&rsquo;re ready.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Step>

      {/* Mark 8 launch gate — images are a separate, owner-approved spend and review. */}
      {isMark8 && (
        <Step n={4} title="Create & Review Images" state={step4}>
          {published ? (
            <p className="text-[13px] font-medium text-accent-strong">✓ Images approved</p>
          ) : !textApproved ? (
            <p className="text-[13px] text-secondary">
              {copyReview?.status === "warning"
                ? "Preview the draft and review its Bible wording first."
                : copyReview?.status === "invalid"
                  ? "The Bible-wording review must be repaired before creating images."
                  : "Preview the draft and mark the text Ready first."}
            </p>
          ) : imagePhase === "checking" ? (
            <p role="status" className="text-[13px] text-secondary">Checking the image plan…</p>
          ) : imagePhase === "confirming" && imageStatus ? (
            <div className="rounded-lg border bg-card-soft p-3">
              <p className="text-[13px] text-primary">
                Create these <span className="font-semibold">{imageStatus.total} images</span> for Mark 8?
                Estimated image cost: <span className="font-semibold">about {formatUsd(imageStatus.estimatedCostUsd)}</span>.
                This uses image credit and does not publish the chapter.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => void createImages()} className={primary}>
                  Create {imageStatus.total} images
                </button>
                <button type="button" onClick={() => setImagePhase("idle")} className={ghost}>Cancel</button>
              </div>
            </div>
          ) : imagePhase === "queued" || imagePhase === "running" ? (
            <ImageWaitCard phase={imagePhase} />
          ) : imagePhase === "ready" && exactImagesReady ? (
            <div className="space-y-3">
              {imageMsg && <p role="alert" className="text-[13px] text-jesus-red">{imageMsg}</p>}
              <p className="text-[13px] font-medium text-accent-strong">
                ✓ {imageStatus?.total} images are ready to review
              </p>
              {imageStatus?.images && imageStatus.images.length > 0 && (
                <ul className="space-y-1 text-[12px] text-secondary">
                  {imageStatus.images.map((image) => (
                    <li key={image.kind}>
                      {image.kind === imageStatus.heroKind ? "Featured: " : ""}{image.label}
                    </li>
                  ))}
                </ul>
              )}
              {!imagesPreviewed ? (
                <>
                  <button type="button" onClick={previewDraft} className={ghost}>Preview with images ↗</button>
                  <p className="text-[12px] text-secondary">
                    Look at the featured image and every scene before approving them.
                  </p>
                </>
              ) : !imagesApproved ? (
                <div>
                  <button type="button" onClick={approveImages} className={primary}>Images look right</button>
                  <p className="mt-2 text-[12px] text-secondary">This approval is only for the exact chapter you just previewed.</p>
                </div>
              ) : (
                <p className="text-[13px] font-medium text-accent-strong">✓ Image review approved</p>
              )}
            </div>
          ) : imagePhase === "error" ? (
            <div>
              <p role="alert" className="text-[13px] text-jesus-red">{imageMsg}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" onClick={() => void loadImagesStatus(slug)} className={ghost}>Check images again</button>
                {!imagesOff &&
                  imageStatus &&
                  imageStatus.state !== "blocked" &&
                  !imageStatus.done &&
                  !imageStatus.reviewDigest &&
                  (imageStatus.total === 3 || imageStatus.total === 5) && (
                  <button type="button" onClick={confirmImageCreation} className={ghost}>Try creating again</button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={confirmImageCreation}
                disabled={
                  imagesOff ||
                  !imageStatus ||
                  (imageStatus.total !== 3 && imageStatus.total !== 5)
                }
                className={primary}
              >
                {imageStatus ? `Create ${imageStatus.total} images` : "Check image plan"}
              </button>
              {imagesOff && (
                <p className="mt-2.5 text-[13px] text-secondary">
                  Image creation is paused. Turn it on and save in <span className="text-primary">Settings &amp; history</span> when you are ready.
                </p>
              )}
            </div>
          )}
        </Step>
      )}

      {/* Publish stays Step 4 for legacy chapters and becomes Step 5 for Mark 8. */}
      <Step n={isMark8 ? 5 : 4} title="Publish Final" state={isMark8 ? publishStep : step4}>
        <button type="button" onClick={publishFinal} disabled={!canPublish || busy} className={primary}>
          {publishing ? "Publishing…" : "Publish Final"}
        </button>
        {publishMsg && <p role="alert" className="mt-2.5 text-[13px] text-jesus-red">{publishMsg}</p>}
        {published ? (
          <p className="mt-2.5 text-[13px] font-medium text-accent-strong">
            ✓ Published — {book} {chapter} is live.{" "}
            <a href={`/chapter/${slug}`} target="_blank" rel="noreferrer" className="underline">View it ↗</a>
          </p>
        ) : (
          <p className="mt-2.5 text-[13px] text-secondary">
            {!draftReady
              ? "Generate a draft first."
              : !previewed
                ? "Preview the draft first."
                : verdict !== "yes" || !wordingReviewed
                  ? "Confirm it feels like Selah above to unlock publishing."
                  : isMark8 && !exactImagesReady
                    ? "Create and review the images first."
                    : isMark8 && !imagesPreviewed
                      ? "Preview the finished chapter with its images."
                      : isMark8 && !imagesApproved
                        ? "Confirm the images look right to unlock publishing."
                        : "Ready to go live."}
          </p>
        )}
      </Step>

      {/* Settings and history stay out of the main launch flow. */}
      <div className="mt-2 rounded-lg border bg-card shadow-hair">
        <button
          type="button"
          aria-expanded={showAdvanced}
          aria-controls="studio-settings-panel"
          onClick={() => {
            setShowAdvanced((v) => !v);
            if (!audit) void loadAudit();
            if (!rules) void loadRules();
            if (!examples) void loadExamples();
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-[14px] font-medium text-primary"
        >
          Settings &amp; history
          <span className="text-secondary">{showAdvanced ? "⌃" : "⌄"}</span>
        </button>
        {showAdvanced && (
          <div id="studio-settings-panel" className="space-y-3 border-t px-4 py-4">
            <Toggle label="Create text drafts" checked={settings.text_generation_enabled} onChange={(v) => setS("text_generation_enabled", v)} />
            <Toggle
              label="Create chapter images"
              hint="Keep off until the text is approved"
              checked={settings.image_generation_enabled}
              onChange={(v) => setS("image_generation_enabled", v)}
            />
            <Toggle label="Confirm before spending credit" checked={settings.require_confirm} onChange={(v) => setS("require_confirm", v)} />
            <p className="text-[12px] text-secondary">
              Chapter access and the approved AI setup are managed automatically.
            </p>

            <button type="button" onClick={saveSettings} disabled={busy} className={primary}>
              {busy ? "…" : "Save settings"}
            </button>
            {settingsMsg && (
              <p
                role={settingsMsg === "Saved" ? "status" : "alert"}
                className={`text-[12px] ${settingsMsg === "Saved" ? "text-accent-strong" : "text-jesus-red"}`}
              >
                {settingsMsg}
              </p>
            )}

            {/* What Selah Has Learned — active global rules */}
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Selah Brain rules</summary>
              <div className="mt-1.5 space-y-1.5">
                {rules === null ? (
                  <p className="text-[12px] text-secondary">Loading…</p>
                ) : rules.length === 0 ? (
                  <p className="text-[12px] text-secondary">
                    No rules yet. Add one from a review, or run the Selah Brain SQL to seed the starters.
                  </p>
                ) : (
                  rules.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center gap-2 rounded-lg border bg-card-soft px-2.5 py-2 ${r.active ? "" : "opacity-50"}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-primary" title={r.rule_text}>{r.title}</p>
                        <p className="text-[11px] text-secondary">
                          {r.rule_id ? `${r.rule_id} · ` : ""}{r.category}{r.priority ? ` · ${r.priority}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRule(r.id, !r.active)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${
                          r.active ? "border-accent-strong bg-accent-strong/15 text-primary" : "bg-card text-secondary"
                        }`}
                      >
                        {r.active ? "Active" : "Off"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRule(r.id)}
                        title="Remove rule"
                        className="rounded-full px-1.5 text-[14px] text-secondary hover:text-jesus-red"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </details>

            {/* Approved Examples — voice exemplars retrieved by genre */}
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Approved examples</summary>
              <div className="mt-1.5 space-y-1.5">
                {examples === null ? (
                  <p className="text-[12px] text-secondary">Loading…</p>
                ) : examples.length === 0 ? (
                  <p className="text-[12px] text-secondary">No approved examples yet.</p>
                ) : (
                  examples.map((x) => (
                    <div key={x.id} className={`flex items-center gap-2 rounded-lg border bg-card-soft px-2.5 py-2 ${x.active ? "" : "opacity-50"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-primary">{x.title}</p>
                        <p className="text-[11px] text-secondary">{x.genre} · {x.example_type}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExample(x.id, !x.active)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${x.active ? "border-accent-strong bg-accent-strong/15 text-primary" : "bg-card text-secondary"}`}
                      >
                        {x.active ? "Active" : "Off"}
                      </button>
                      <button type="button" onClick={() => removeExample(x.id)} title="Remove example" className="rounded-full px-1.5 text-[14px] text-secondary hover:text-jesus-red">×</button>
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="border-t pt-3">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Recent activity</summary>
              <div className="mt-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => void loadAudit()}
                  className="text-[12px] text-secondary underline"
                >
                  Refresh history
                </button>
                {audit === null ? (
                  <p className="text-[12px] text-secondary">Loading…</p>
                ) : audit.length === 0 ? (
                  <p className="text-[12px] text-secondary">Nothing yet.</p>
                ) : (
                  audit.map((e, i) => {
                    // Issue #17: overlap stops get a rebuilt diagnostic line.
                    // The raw stored message is NEVER rendered — only the
                    // strictly parsed, whitelisted fields are.
                    const overlap = parseOverlapAuditDiagnostics(e);
                    return (
                      <div key={i}>
                        <p className="text-[12px] text-secondary">
                          <span className="text-primary">{e.action}</span>
                          {e.slug ? ` · ${e.slug}` : ""} · {e.status}
                          {e.created_at ? ` · ${e.created_at.slice(0, 16).replace("T", " ")}` : ""}
                        </p>
                        {overlap ? (
                          <div className="ml-3 mt-0.5 space-y-0.5 font-mono text-[11px] text-secondary">
                            <p>
                              {overlap.code} · manifest {overlap.manifestDigestPrefix}…
                              {overlap.cleanup ? ` · cleanup ${overlap.cleanup}` : ""}
                            </p>
                            {overlap.qualityCodes.map((code, j) => (
                              <p key={`q${j}`}>quality check failed: {code}</p>
                            ))}
                            {overlap.findings.map((f, j) => (
                              <p key={j}>
                                {f.code} [{f.severity}] {f.path} · {f.tokens} tokens · {f.chars} chars
                              </p>
                            ))}
                            {overlap.more > 0 ? <p>+{overlap.more} more finding{overlap.more === 1 ? "" : "s"}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </details>
            <p className="text-[11px] text-secondary">
              Last saved: {settings.updated_at ? settings.updated_at.slice(0, 16).replace("T", " ") : "—"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- small presentational helpers ----------------
function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children: ReactNode }) {
  const badge = state === "todo" ? "bg-card-soft text-secondary" : "bg-accent-strong text-white";
  return (
    <section
      className={`rounded-xl border bg-card p-4 shadow-hair transition ${state === "todo" ? "opacity-55" : ""} ${
        state === "current" ? "ring-1 ring-accent-strong/40" : ""
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${badge}`}>
          {state === "done" ? "✓" : n}
        </span>
        <h2 className="text-[15px] font-semibold text-primary">{title}</h2>
      </div>
      <div className="mt-3 pl-[34px]">{children}</div>
    </section>
  );
}

function Seg({
  active,
  disabled = false,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-1.5 text-[13px] transition ${
        active ? "border-transparent bg-accent-strong text-white" : "bg-card text-secondary"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function readStudioCopyReview(value: unknown): StudioCopyReview | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const review = value as Record<string, unknown>;
  if (review.status === "invalid") return { status: "invalid" };
  if (
    review.status !== "warning" ||
    typeof review.reportDigest !== "string" ||
    !LOWERCASE_SHA256.test(review.reportDigest) ||
    !Number.isSafeInteger(review.findingCount) ||
    (review.findingCount as number) < 1 ||
    (review.findingCount as number) > 100
  ) {
    return { status: "invalid" };
  }
  return {
    status: "warning",
    reportDigest: review.reportDigest,
    findingCount: review.findingCount as number,
  };
}

function copyReviewApproved(
  review: StudioCopyReview | null,
  approvedDigest: string | null,
): boolean {
  if (review === null) return true;
  return (
    review.status === "warning" &&
    approvedDigest === review.reportDigest
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[14px] text-primary">
      <span>
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-secondary">({hint})</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function DraftWaitCard({ reference, takingLonger }: { reference: string; takingLonger: boolean }) {
  return (
    <div role="status" aria-live="polite" className="mt-3 rounded-lg border bg-card-soft p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-strong" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-primary">
          {takingLonger ? `Still creating your private ${reference} draft` : `Creating your private ${reference} draft`}
        </p>
      </div>
      <p className="mt-2 text-[13px] text-secondary">
        {takingLonger
          ? "This chapter is taking longer, but Studio is still checking it. A full Mark 8 draft can take up to about 10 minutes."
          : "This usually takes 2–4 minutes while Selah studies the chapter, writes the work-up, and checks it for completeness."}
      </p>
      <p className="mt-2 text-[13px] font-medium text-primary">
        Nothing will publish automatically. Images come later, after you approve the text.
      </p>
      <p className="mt-2 text-[12px] text-secondary">
        You may safely leave this page and return. Studio will find the draft when it is ready.
      </p>
    </div>
  );
}

function ImageWaitCard({
  phase,
}: {
  phase: "queued" | "running";
}) {
  const title =
    phase === "queued"
      ? "Preparing the image run"
      : "Creating the chapter images";
  const detail =
    phase === "queued"
      ? "Selah is checking the approved scene plan before using image credit."
      : "This can take several minutes. You can leave this page and come back.";

  return (
    <div role="status" aria-live="polite" className="rounded-lg border bg-card-soft p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-strong" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-primary">{title}</p>
      </div>
      <p className="mt-2 text-[13px] text-secondary">{detail}</p>
      <p className="mt-2 text-[13px] font-medium text-primary">
        Nothing will publish automatically. You will review every image first.
      </p>
    </div>
  );
}

function readStudioImageStatus(value: unknown): StudioImageStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.ok !== true) return null;
  if (!Number.isInteger(row.total) || !Number.isInteger(row.stored)) return null;
  const total = row.total as number;
  const stored = row.stored as number;
  if (total < 0 || stored < 0 || stored > total) return null;
  if (
    row.state !== "idle" &&
    row.state !== "queued" &&
    row.state !== "running" &&
    row.state !== "blocked" &&
    row.state !== "failed"
  ) return null;

  const rawImages = Array.isArray(row.images)
    ? row.images
    : Array.isArray(row.items)
      ? row.items
      : [];
  const images: StudioImage[] = [];
  for (const value of rawImages) {
    if (!value || typeof value !== "object") return null;
    const image = value as Record<string, unknown>;
    if (
      typeof image.kind !== "string" ||
      typeof image.label !== "string" ||
      typeof image.description !== "string" ||
      typeof image.status !== "string"
    ) return null;
    images.push({
      kind: image.kind,
      label: image.label,
      description: image.description,
      status: image.status,
    });
  }

  const spentCount = row.spentCount === undefined ? 0 : row.spentCount;
  if (!Number.isInteger(spentCount) || (spentCount as number) < 0 || (spentCount as number) > total) return null;
  if (
    typeof row.estimatedCostUsd !== "number" ||
    !Number.isFinite(row.estimatedCostUsd) ||
    row.estimatedCostUsd < 0
  ) return null;
  if (typeof row.planDigest !== "string" || !LOWERCASE_SHA256.test(row.planDigest)) return null;
  if (typeof row.model !== "string" || row.model.trim() === "") return null;

  return {
    total,
    stored,
    done: row.done === true,
    state: row.state,
    heroKind: typeof row.heroKind === "string" && row.heroKind ? row.heroKind : null,
    model: row.model,
    planDigest: row.planDigest,
    images,
    reviewDigest: typeof row.reviewDigest === "string" && row.reviewDigest ? row.reviewDigest : null,
    spentCount: spentCount as number,
    estimatedCostUsd: row.estimatedCostUsd,
  };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
