"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PageCanvas, PagePreview } from "@/components/PagePreview";
import { RichEditor } from "@/components/RichEditor";
import { downloadCurrentPageAsPng, exportBundleAsZip } from "@/lib/browser-export";
import { normalizeHexColor } from "@/lib/color";
import { checkCompliance } from "@/lib/compliance";
import { createDraftProject, getTemplate, TEMPLATES } from "@/lib/defaults";
import { applyGlobalTextColor } from "@/lib/doc";
import { createId } from "@/lib/id";
import { paginateDoc } from "@/lib/paginate";
import { BACKGROUND_PRESETS } from "@/lib/presets";
import { buildSuggestions } from "@/lib/suggestions";
import type { InlineNode, PageRender, Project, RichDoc, ThemeVars } from "@/lib/types";

interface ComplianceIssue {
  word: string;
  count: number;
  suggestion: string;
}

interface Suggestions {
  titles: string[];
  tags: string[];
}

function filterByKeyword<T>(
  items: T[],
  keyword: string,
  getSearchText: (item: T) => string
): T[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return items;
  }

  return items.filter((item) => getSearchText(item).toLowerCase().includes(normalizedKeyword));
}

function normalizeProject(project: Project): Project {
  const template = getTemplate(project.templateId);
  const themeVars: ThemeVars = {
    ...template.defaultTheme,
    ...project.themeVars,
    imageStylePreset:
      project.themeVars.imageStylePreset ||
      template.defaultTheme.imageStylePreset ||
      "soft-shadow"
  };

  return {
    ...project,
    themeVars,
    templateId: template.id
  };
}

function normalizeInlineNode(node: InlineNode): Record<string, unknown> {
  if (node.type === "hardBreak") {
    return { type: "hardBreak" };
  }

  const marks = node.marks
    ? {
      bold: Boolean(node.marks.bold),
      color: node.marks.color || "",
      fontSize: node.marks.fontSize ?? null,
      lineHeight: node.marks.lineHeight ?? null,
      letterSpacing: node.marks.letterSpacing ?? null,
      paddingInline: node.marks.paddingInline ?? null
    }
    : null;

  return {
    type: "text",
    text: node.text,
    marks
  };
}

function normalizeDocForCompare(doc: RichDoc): Record<string, unknown> {
  return {
    id: doc.id,
    title: doc.title,
    nodes: doc.nodes.map((node) => {
      if (node.type === "image") {
        return {
          type: "image",
          assetId: node.assetId,
          src: node.src,
          width: node.width,
          height: node.height,
          align: node.align,
          caption: node.caption || ""
        };
      }

      return {
        type: "paragraph",
        spacingAfter: node.spacingAfter ?? null,
        children: node.children.map((child) => normalizeInlineNode(child))
      };
    })
  };
}

function isSameDocContent(a: RichDoc, b: RichDoc): boolean {
  return JSON.stringify(normalizeDocForCompare(a)) === JSON.stringify(normalizeDocForCompare(b));
}

export default function HomePage() {
  const [project, setProject] = useState<Project>(() => normalizeProject(createDraftProject()));
  const [pages, setPages] = useState<PageRender[]>([]);
  const [pageFirstNodeId, setPageFirstNodeId] = useState<Record<number, string>>({});
  const [selectedPageNo, setSelectedPageNo] = useState(1);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [issues, setIssues] = useState<ComplianceIssue[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestions>({ titles: [], tags: [] });
  const [message, setMessage] = useState("当前内容仅保留在本次页面会话中，刷新后会重置。");
  const [history, setHistory] = useState<RichDoc[]>([]);
  const [future, setFuture] = useState<RichDoc[]>([]);
  const [presetKeyword, setPresetKeyword] = useState("");
  const [rightTab, setRightTab] = useState<"preview" | "templates" | "adjust">("preview");
  const [publishExpanded, setPublishExpanded] = useState(false);
  const exportPageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const thumbContainerRef = useRef<HTMLDivElement | null>(null);
  const [thumbScale, setThumbScale] = useState(0.13);

  const activeTemplate = useMemo(() => getTemplate(project.templateId), [project.templateId]);

  // Measure sidebar thumbnail container to compute correct scale for PageCanvas
  useLayoutEffect(() => {
    const el = thumbContainerRef.current;
    if (!el) return;
    const update = () => {
      const available = Math.max(60, el.clientWidth - 16);
      setThumbScale(available / activeTemplate.canvasWidth);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTemplate.canvasWidth]);

  const scrollToPage = useCallback((pageNo: number) => {
    const nodeId = pageFirstNodeId[pageNo];
    if (!nodeId) return;

    const editorRoot = document.querySelector<HTMLElement>(".editor-root");
    const editorCanvas = editorRoot?.querySelector<HTMLElement>(".editor-canvas");
    if (!editorRoot || !editorCanvas) return;

    // Fast path: find by data-node-id (present after innerHTML reset)
    let el: HTMLElement | null =
      editorCanvas.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);

    // Fallback: find by index in doc nodes (works after paste when data-node-id is missing)
    if (!el) {
      const nodeIndex = project.doc.nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex >= 0 && nodeIndex < editorCanvas.children.length) {
        el = editorCanvas.children[nodeIndex] as HTMLElement;
      }
    }

    if (!el) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = editorRoot.getBoundingClientRect();
    editorRoot.scrollTo({
      top: editorRoot.scrollTop + elRect.top - containerRect.top - 12,
      behavior: "smooth",
    });
  }, [pageFirstNodeId, project.doc.nodes]);

  const filteredBackgrounds = useMemo(
    () => filterByKeyword(BACKGROUND_PRESETS, presetKeyword, (item) => `${item.name} ${item.description}`),
    [presetKeyword]
  );

  const filteredTemplates = useMemo(
    () => filterByKeyword(TEMPLATES, presetKeyword, (item) => item.name),
    [presetKeyword]
  );

  const recalc = useCallback((docProject: Project) => {
    const paginateResult = paginateDoc({
      doc: docProject.doc,
      template: getTemplate(docProject.templateId),
      theme: docProject.themeVars
    });
    const complianceIssues = checkCompliance(docProject.doc);
    const suggestionResult = buildSuggestions(docProject.doc);

    startTransition(() => {
      setPages(paginateResult.pages || []);
      setPageFirstNodeId(paginateResult.pageFirstNodeId || {});
      setWarnings(paginateResult.warnings || []);
      setIssues(complianceIssues || []);
      setSuggestions({
        titles: suggestionResult.titles ?? [],
        tags: suggestionResult.tags ?? []
      });
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        recalc(project);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "预览计算失败");
      }
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [project, recalc]);

  useEffect(() => {
    if (!pages.length) {
      return;
    }

    if (!pages.some((item) => item.pageNo === selectedPageNo)) {
      setSelectedPageNo(pages[0].pageNo);
    }
  }, [pages, selectedPageNo]);

  const updateDoc = useCallback((nextDoc: RichDoc) => {
    setProject((current) => {
      const normalizedNext: RichDoc = {
        ...nextDoc,
        id: nextDoc.id || createId("doc")
      };

      if (isSameDocContent(current.doc, normalizedNext)) {
        return current;
      }

      setHistory((stack) => [...stack.slice(-49), current.doc]);
      setFuture([]);

      return {
        ...current,
        doc: normalizedNext,
        updatedAt: Date.now()
      };
    });
  }, []);

  const handleThemeChange = useCallback((patch: Partial<ThemeVars>) => {
    setProject((current) => ({
      ...current,
      themeVars: {
        ...current.themeVars,
        ...patch
      },
      updatedAt: Date.now()
    }));
  }, []);

  const applyGlobalTextColorChange = useCallback((color: string) => {
    const normalized = normalizeHexColor(color, "#111827");

    setProject((current) => ({
      ...current,
      themeVars: {
        ...current.themeVars,
        textColor: normalized
      },
      doc: applyGlobalTextColor(current.doc, normalized),
      updatedAt: Date.now()
    }));

    setMessage("已统一更新全文文字颜色。");
  }, []);

  const applyBackgroundPreset = useCallback(
    (presetId: string) => {
      const preset = BACKGROUND_PRESETS.find((item) => item.id === presetId);
      if (!preset) {
        return;
      }
      handleThemeChange(preset.patch);
      setMessage(`已应用页面皮肤：${preset.name}`);
    },
    [handleThemeChange]
  );

  const undo = useCallback(() => {
    setProject((current) => {
      if (history.length === 0) {
        return current;
      }

      const previous = history[history.length - 1];
      setHistory((stack) => stack.slice(0, -1));
      setFuture((stack) => [current.doc, ...stack].slice(0, 50));

      return {
        ...current,
        doc: previous,
        updatedAt: Date.now()
      };
    });
  }, [history]);

  const redo = useCallback(() => {
    setProject((current) => {
      if (future.length === 0) {
        return current;
      }

      const [nextDoc, ...rest] = future;
      setFuture(rest);
      setHistory((stack) => [...stack.slice(-49), current.doc]);

      return {
        ...current,
        doc: nextDoc,
        updatedAt: Date.now()
      };
    });
  }, [future]);

  const downloadPage = useCallback(
    async (pageNo: number) => {
      const node = exportPageRefs.current[pageNo];
      if (!node) {
        setMessage("当前页尚未渲染完成，请稍后再试。");
        return;
      }

      try {
        setMessage(`正在下载第 ${pageNo} 页...`);
        await downloadCurrentPageAsPng({
          node,
          title: project.title,
          pageNo
        });
        setMessage(`第 ${pageNo} 页已下载`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "下载当前页失败");
      }
    },
    [project.title]
  );

  const exportAll = useCallback(async () => {
    if (!pages.length) {
      setMessage("当前没有可导出的页面。");
      return;
    }

    try {
      setMessage("正在导出发布包...");
      await exportBundleAsZip({
        title: project.title,
        templateId: project.templateId,
        pageCount: pages.length,
        suggestions,
        complianceIssues: issues,
        getPageNode: (pageNo) => exportPageRefs.current[pageNo] || null
      });
      setMessage(`导出完成，共 ${pages.length} 张图片`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导出发布包失败");
    }
  }, [issues, pages, project.templateId, project.title, suggestions]);

  const selectedBackgroundId =
    BACKGROUND_PRESETS.find(
      (preset) =>
        preset.patch.pageBackground === project.themeVars.pageBackground &&
        preset.patch.textColor === project.themeVars.textColor
    )?.id || "";

  return (
    <main className="app-shell">
      {/* ---- TOP BAR ---- */}
      <section className="app-topbar">
        <div className="topbar-info">
          <strong>小红书长文转图工作台</strong>
          <div className="topbar-sub">Vercel 测试版 · 仅当前标签页 · 刷新后重置</div>
        </div>

        <div className="topbar-actions">
          <button type="button" onClick={undo} disabled={!history.length}>
            ↩ 撤销
          </button>
          <button type="button" onClick={redo} disabled={!future.length}>
            ↪ 重做
          </button>
          <button type="button" onClick={() => void exportAll()}>
            ↓ 导出发布包
          </button>
        </div>
      </section>

      <section className="studio-layout">
        {/* ---- LEFT SIDEBAR: page thumbnails + skins ---- */}
        <aside className="panel left-sidebar">
          <div className="panel-header">
            <strong>页面</strong>
            <span>{selectedPageNo}/{pages.length || 1}</span>
          </div>

          <div className="sidebar-skins">
            <div className="sidebar-skins-label">快捷皮肤</div>
            <div className="skin-swatch-grid">
              {BACKGROUND_PRESETS.slice(0, 6).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`skin-swatch-btn ${selectedBackgroundId === preset.id ? "is-active" : ""}`}
                  onClick={() => applyBackgroundPreset(preset.id)}
                  title={preset.name}
                >
                  <span style={{ background: preset.preview }} />
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-thumbnails" ref={thumbContainerRef}>
            {pages.length === 0 ? (
              <div className="page-thumb-btn is-active">
                <div className="page-thumb-label">1</div>
              </div>
            ) : (
              pages.map((page) => (
                <button
                  key={page.pageNo}
                  type="button"
                  className={`page-thumb-btn ${selectedPageNo === page.pageNo ? "is-active" : ""}`}
                  onClick={() => {
                    setSelectedPageNo(page.pageNo);
                    scrollToPage(page.pageNo);
                  }}
                  title={`第 ${page.pageNo} 页`}
                >
                  <PageCanvas
                    page={page}
                    scale={thumbScale}
                    template={activeTemplate}
                    theme={project.themeVars}
                    mini
                  />
                  <div className="page-thumb-label">{page.pageNo}</div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ---- CENTER: EDITOR STACK ---- */}
        <section className="editor-stack">
          {/* Project meta */}
          <section className="panel project-meta">
            <div className="toolbar project-toolbar">
              <label className="title-field">
                <span>标题</span>
                <input
                  type="text"
                  value={project.title}
                  onChange={(event) =>
                    setProject((current) => ({
                      ...current,
                      title: event.target.value,
                      updatedAt: Date.now()
                    }))
                  }
                />
              </label>

              <span className="save-status">仅当前会话</span>
              <span className="save-message">{message}</span>
            </div>
          </section>

          {/* Rich editor */}
          <RichEditor doc={project.doc} onDocChange={updateDoc} onCommandFeedback={setMessage} />

          {/* Publish assistant bar */}
          <section className="panel publish-bar-section">
            <div className="publish-bar">
              <span className={`publish-bar-badge ${issues.length ? "danger" : ""}`}>
                {issues.length ? `⚠ ${issues.length} 风险词` : "✓ 合规通过"}
              </span>

              {suggestions.titles.length > 0 && (
                <span className="publish-bar-badge">
                  ✦ {suggestions.titles.length} 标题候选
                </span>
              )}

              {suggestions.tags.length > 0 && (
                <span className="publish-bar-badge">
                  # {suggestions.tags.length} 标签建议
                </span>
              )}

              {warnings.length > 0 && (
                <span className="publish-bar-badge">
                  ⚡ {warnings.length} 分页提醒
                </span>
              )}

              <button
                type="button"
                className="publish-expand"
                onClick={() => setPublishExpanded((v) => !v)}
              >
                发布辅助 {publishExpanded ? "▴" : "▾"}
              </button>
            </div>

            {publishExpanded && (
              <div className="publish-detail">
                <div>
                  <strong>风险词</strong>
                  {issues.length ? (
                    <div className="chips danger">
                      {issues.map((item) => (
                        <span key={item.word} className="chip">
                          {item.word} ×{item.count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span>未发现风险词</span>
                  )}
                </div>

                <div>
                  <strong>标题候选</strong>
                  <div className="chips">
                    {suggestions.titles.slice(0, 4).map((title) => (
                      <span key={title} className="chip">
                        {title}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <strong>标签建议</strong>
                  <div className="chips">
                    {suggestions.tags.slice(0, 6).map((tag) => (
                      <span key={tag} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div>
                    <strong>分页提醒</strong>
                    <div className="chips">
                      {warnings.slice(0, 3).map((warning) => (
                        <span key={warning} className="chip">
                          {warning}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </section>

        {/* ---- RIGHT PANEL: Preview / Templates / Adjust ---- */}
        <aside className="panel right-panel">
          <div className="panel-header">
            <div className="right-tabs">
              <button
                type="button"
                className={`right-tab-btn ${rightTab === "preview" ? "is-active" : ""}`}
                onClick={() => setRightTab("preview")}
              >
                预览
              </button>
              <button
                type="button"
                className={`right-tab-btn ${rightTab === "templates" ? "is-active" : ""}`}
                onClick={() => setRightTab("templates")}
              >
                模板
              </button>
              <button
                type="button"
                className={`right-tab-btn ${rightTab === "adjust" ? "is-active" : ""}`}
                onClick={() => setRightTab("adjust")}
              >
                调整
              </button>
            </div>
            <span>即时生效</span>
          </div>

          <div className="right-content">
            {/* Preview tab: flat tiled display of all pages */}
            {rightTab === "preview" && (
              <PagePreview
                template={activeTemplate}
                theme={project.themeVars}
                pages={pages}
                selectedPageNo={selectedPageNo}
                onSelectPage={setSelectedPageNo}
                onDownloadPage={(pageNo) => {
                  void downloadPage(pageNo);
                }}
              />
            )}

            {/* Templates tab */}
            {rightTab === "templates" && (
              <>
                <div className="template-search">
                  <input
                    type="text"
                    value={presetKeyword}
                    onChange={(event) => setPresetKeyword(event.target.value)}
                    placeholder="搜索模板、页面皮肤"
                  />
                </div>

                <div className="library-section">
                  <h4>版式模板</h4>
                  <div className="preset-grid template-grid">
                    {filteredTemplates.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`preset-card compact ${project.templateId === template.id ? "is-active" : ""}`}
                        onClick={() => {
                          const nextTemplate = getTemplate(template.id);
                          setProject((current) => ({
                            ...current,
                            templateId: nextTemplate.id,
                            themeVars: {
                              ...nextTemplate.defaultTheme,
                              footerSignature: current.themeVars.footerSignature
                            },
                            updatedAt: Date.now()
                          }));
                          setMessage(`已切换版式模板：${nextTemplate.name}`);
                        }}
                      >
                        <div className="preset-meta">
                          <strong>{template.name}</strong>
                          <span>
                            {template.canvasWidth} × {template.canvasHeight}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="library-section">
                  <h4>页面皮肤（作用于全部页面）</h4>
                  <div className="preset-grid">
                    {filteredBackgrounds.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-card ${selectedBackgroundId === preset.id ? "is-active" : ""}`}
                        onClick={() => applyBackgroundPreset(preset.id)}
                      >
                        <div className="preset-swatch" style={{ background: preset.preview }} />
                        <div className="preset-meta">
                          <strong>{preset.name}</strong>
                          <span>{preset.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Adjust tab */}
            {rightTab === "adjust" && (
              <div className="library-section">
                <h4>全局调整</h4>
                <div className="adjust-grid">
                  <label>
                    文字颜色
                    <input
                      type="color"
                      value={normalizeHexColor(project.themeVars.textColor, "#111827")}
                      onChange={(event) => applyGlobalTextColorChange(event.target.value)}
                    />
                  </label>

                  <label>
                    背景色
                    <input
                      type="color"
                      value={normalizeHexColor(project.themeVars.pageBackground, "#fffaf4")}
                      onChange={(event) =>
                        handleThemeChange({
                          pageBackground: normalizeHexColor(event.target.value, "#fffaf4")
                        })
                      }
                    />
                  </label>

                  <label>
                    基础字号
                    <select
                      value={String(project.themeVars.bodyFontSize)}
                      onChange={(event) =>
                        handleThemeChange({ bodyFontSize: Number(event.target.value) })
                      }
                    >
                      {[28, 32, 36, 40, 44].map((size) => (
                        <option key={size} value={size}>
                          {size}px
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    页脚签名
                    <input
                      type="text"
                      value={project.themeVars.footerSignature}
                      onChange={(event) =>
                        handleThemeChange({ footerSignature: event.target.value })
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* Hidden export canvases */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          left: "-200vw",
          top: 0,
          width: activeTemplate.canvasWidth,
          pointerEvents: "none",
          opacity: 0
        }}
      >
        {pages.map((page) => (
          <div
            key={`export-${page.pageNo}`}
            ref={(node) => {
              exportPageRefs.current[page.pageNo] = node;
            }}
          >
            <PageCanvas page={page} scale={1} template={activeTemplate} theme={project.themeVars} />
          </div>
        ))}
      </div>
    </main>
  );
}
