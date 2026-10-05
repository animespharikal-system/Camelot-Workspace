import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  ReactFlow,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  FolderKanban,
  Lightbulb,
  Link2,
  ListTodo,
  Network,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
  Scale,
} from "lucide-react";
import "./styles.css";

type Obj = {
  id: number;
  project_id?: number | null;
  type: string;
  title: string;
  content?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};
type Rel = {
  id: number;
  source_id: number;
  target_id: number;
  type: string;
  weight: number;
  created_at: string;
};
type Event = {
  id: number;
  object_id: number | null;
  event_type: string;
  description: string;
  actor?: string;
  created_at: string;
};
type Member = {
  id: number;
  name: string;
  initials: string;
  role: string;
  status: "online" | "away" | "offline";
  project_id?: number | null;
};
type Suggestion = {
  id?: number;
  kind: string;
  title: string;
  body: string;
  tag: string;
};
type Attachment = {
  id: number;
  object_id?: number | null;
  name: string;
  kind: string;
  url?: string | null;
  mime_type?: string | null;
  size?: number | null;
  created_at: string;
};
const API = "http://127.0.0.1:8000";
const REL_TYPES = [
  "CONTAINS",
  "DEPENDS_ON",
  "SUPPORTS",
  "CONTRADICTS",
  "REFERENCES",
  "RELATED_TO",
  "CREATED_BY",
  "ASSIGNED_TO",
  "SUPERSEDES",
  "DERIVED_FROM",
];
const META: Record<string, { label: string; icon: React.ReactNode }> = {
  project: { label: "Projects", icon: <FolderKanban size={15} /> },
  idea: { label: "Ideas", icon: <Lightbulb size={15} /> },
  question: { label: "Questions", icon: <CircleHelp size={15} /> },
  task: { label: "Tasks", icon: <ListTodo size={15} /> },
  decision: { label: "Decisions", icon: <Scale size={15} /> },
  document: { label: "Documents", icon: <FileText size={15} /> },
};
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? (undefined as T) : res.json();
}
function initials(title: string) {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}
function typeGlyph(type: string) {
  return (
    (
      {
        project: "◆",
        idea: "✦",
        question: "?",
        task: "✓",
        decision: "◇",
        document: "▤",
      } as Record<string, string>
    )[type] || "•"
  );
}
function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function GraphNode({
  data,
  selected,
}: {
  data: { obj: Obj; dropTarget?: boolean };
  selected?: boolean;
}) {
  const o = data.obj;
  return (
    <div
      className={`kg-node kg-${o.type} ${selected ? "is-selected" : ""} ${data.dropTarget ? "is-drop" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="kg-handle" />
      <div className="kg-glyph">{typeGlyph(o.type)}</div>
      <div className="kg-node-copy">
        <strong>{o.title}</strong>
        <span>
          {o.type} · {o.status}
        </span>
      </div>
      <Handle type="source" position={Position.Right} className="kg-handle" />
    </div>
  );
}
const nodeTypes: NodeTypes = { camelot: GraphNode };

function App() {
  const [page, setPage] = useState<"realm" | "project" | "object" | "graph">(
    "realm",
  );
  const [objects, setObjects] = useState<Obj[]>([]),
    [rels, setRels] = useState<Rel[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [members, setMembers] = useState<Member[]>([]);
  const [query, setQuery] = useState(""),
    [projectId, setProjectId] = useState<number | null>(null),
    [selected, setSelected] = useState<number | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null),
    [showNew, setShowNew] = useState(false),
    [showChat, setShowChat] = useState(false),
    [showSettings, setShowSettings] = useState(false),
    [showImport, setShowImport] = useState(false),
    [showLink, setShowLink] = useState(false),
    [showMember, setShowMember] = useState(false);
  const [link, setLink] = useState<{
      source: number;
      target: number;
      mode: "drop" | "connect";
    } | null>(null),
    [dropTarget, setDropTarget] = useState<number | null>(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]),
    [dismissed, setDismissed] = useState<number[]>([]),
    [aiMessage, setAiMessage] = useState(
      "Gemma 4 is connected. Open an object and use Improve with Gemma to refine its living context.",
    ),
    [aiTriggered, setAiTriggered] = useState(false);
  const [form, setForm] = useState({ type: "project", title: "", content: "" }),
    [memberForm, setMemberForm] = useState({
      name: "",
      role: "Developer",
      status: "online",
    });
  const [prompt, setPrompt] = useState(""),
    [chat, setChat] = useState<{ from: "user" | "ai"; text: string }[]>([]),
    [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftContent, setDraftContent] = useState("");
  const [aiPolishing, setAiPolishing] = useState(false);
  const [polishedContent, setPolishedContent] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    const [o, r, e, m] = await Promise.all([
      api<Obj[]>("/objects/"),
      api<Rel[]>("/relationships/"),
      api<Event[]>("/events/"),
      api<Member[]>("/members/"),
    ]);
    setObjects(o);
    setRels(r);
    setEvents(e);
    setMembers(m);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowNew(false);
        setShowChat(false);
        setShowSettings(false);
        setShowImport(false);
        setShowLink(false);
        setShowMember(false);
        setLink(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const projects = useMemo(
    () =>
      objects
        .filter((o) => o.type === "project")
        .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
    [objects],
  );
  const activeProject = objects.find((o) => o.id === projectId);
  const selectedObj = objects.find((o) => o.id === selected);
  const projectChildren = useMemo(
    () =>
      projectId
        ? (rels
            .filter((r) => r.source_id === projectId && r.type === "CONTAINS")
            .map((r) => objects.find((o) => o.id === r.target_id))
            .filter(Boolean) as Obj[])
        : [],
    [projectId, rels, objects],
  );
  const related = useMemo(
    () =>
      selected
        ? rels.filter(
            (r) => r.source_id === selected || r.target_id === selected,
          )
        : [],
    [selected, rels],
  );
  const linkedIds = useMemo(() => {
    if (!projectId) return new Set<number>();
    const ids = new Set<number>([projectId]);
    let changed = true;
    while (changed) {
      changed = false;
      rels.forEach((r) => {
        if (ids.has(r.source_id) && !ids.has(r.target_id)) {
          ids.add(r.target_id);
          changed = true;
        }
        if (ids.has(r.target_id) && !ids.has(r.source_id)) {
          ids.add(r.source_id);
          changed = true;
        }
      });
    }
    return ids;
  }, [projectId, rels]);
  const looseObjects = useMemo(
    () =>
      objects.filter((o) => {
        if (rels.some((r) => r.source_id === o.id || r.target_id === o.id))
          return false;
        if (!projectId) return true;
        return (
          o.id !== projectId &&
          o.type !== "project" &&
          (!o.project_id || o.project_id === projectId)
        );
      }),
    [objects, rels, projectId],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(META).map((t) => [
          t,
          objects.filter((o) => o.type === t).length,
        ]),
      ),
    [objects],
  );
  const projectEvents = useMemo(
    () =>
      projectId
        ? events.filter(
            (e) =>
              e.object_id === projectId || linkedIds.has(e.object_id || -1),
          )
        : [],
    [events, projectId, linkedIds],
  );
  const loadAttachments = async (id: number) => {
    setAttachments(await api<Attachment[]>(`/attachments/?object_id=${id}`));
  };
  useEffect(() => {
    if (selected) loadAttachments(selected).catch(() => setAttachments([]));
    else setAttachments([]);
  }, [selected]);
  useEffect(() => {
    if (selectedObj) setDraftContent(selectedObj.content || "");
  }, [selectedObj?.id]);

  const refreshSuggestions = useCallback(
    async (project?: number | null, object?: number | null) => {
      const p = project || projectId;
      if (!p) {
        setSuggestions([]);
        setAiTriggered(false);
        setAiMessage("Open a project or object to prepare contextual AI.");
        return;
      }
      try {
        const suffix = object ? `&object_id=${object}` : "";
        const r = await api<{
          suggestions: Suggestion[];
          triggered: boolean;
          message: string;
        }>(`/ai/suggestions?project_id=${p}${suffix}`, { method: "POST" });
        setSuggestions(r.suggestions || []);
        setAiTriggered(!!r.triggered);
        setAiMessage(r.message || "Gemma 4 context is ready.");
      } catch {
        setSuggestions([]);
        setAiTriggered(false);
        setAiMessage(
          "AI service is not connected yet; the contextual panel is ready for Gemma 4.",
        );
      }
    },
    [projectId],
  );
  useEffect(() => {
    if (page === "object" && selectedObj)
      refreshSuggestions(projectId, selectedObj.id);
    else if (page === "project" && projectId)
      refreshSuggestions(projectId, null);
    else {
      setSuggestions([]);
      setAiTriggered(false);
    }
  }, [page, selectedObj?.id, projectId, refreshSuggestions]);

  const openProject = (id: number) => {
    setProjectId(id);
    setSelected(id);
    setPage("project");
    setSelectedEdge(null);
  };
  const openObject = (id: number) => {
    const o = objects.find((x) => x.id === id);
    if (!o) return;
    setSelected(id);
    if (o.type === "project") {
      openProject(id);
    } else {
      if (o.project_id) setProjectId(o.project_id);
      else {
        const parent = rels.find(
          (r) =>
            r.target_id === id &&
            r.type === "CONTAINS" &&
            objects.find((x) => x.id === r.source_id)?.type === "project",
        );
        if (parent) setProjectId(parent.source_id);
      }
      setPage("object");
      setSelectedEdge(null);
    }
  };
  const openNew = () => {
    setForm({
      type: page === "realm" ? "project" : "idea",
      title: "",
      content: "",
    });
    setShowNew(true);
  };
  const createObject = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const scopedProjectId =
        page !== "realm" && form.type !== "project" ? projectId : null;
      const o = await api<Obj>("/objects/", {
        method: "POST",
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          content: form.content,
          project_id: scopedProjectId,
        }),
      });
      await load();
      setShowNew(false);
      setForm({ type: "project", title: "", content: "" });
      setToast(`Created ${o.title} — independent and ready to link`);
      if (o.type === "project") openProject(o.id);
      else openObject(o.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const openLink = (
    source: number,
    target: number,
    mode: "drop" | "connect" = "drop",
  ) => {
    if (source === target) return;
    setLink({ source, target, mode });
    setShowLink(true);
  };
  const createLink = async (type: string) => {
    if (!link) return;
    setBusy(true);
    try {
      let sourceId = link.source,
        targetId = link.target;
      if (type === "CONTAINS" && link.mode === "drop") {
        const dropped = objects.find((o) => o.id === link.source),
          parent = objects.find((o) => o.id === link.target);
        if (dropped && parent) {
          sourceId = parent.id;
          targetId = dropped.id;
        }
      }
      await api("/relationships/", {
        method: "POST",
        body: JSON.stringify({
          source_id: sourceId,
          target_id: targetId,
          type,
          weight: 1,
        }),
      });
      const source = objects.find((o) => o.id === sourceId),
        target = objects.find((o) => o.id === targetId);
      await load();
      setShowLink(false);
      setLink(null);
      setToast(`Linked ${source?.title} → ${target?.title}`);
      const p =
        source?.type === "project"
          ? source.id
          : target?.type === "project"
            ? target.id
            : projectId;
      if (p) {
        setProjectId(p);
        await refreshSuggestions(
          p,
          target?.type === "project"
            ? source?.id
            : source?.type === "project"
              ? target?.id
              : undefined,
        );
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const onConnect = (c: Connection) => {
    if (c.source && c.target)
      openLink(Number(c.source), Number(c.target), "connect");
  };
  const importFile = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (selected) fd.append("object_id", String(selected));
      if (projectId) fd.append("project_id", String(projectId));
      fd.append("create_document", "true");
      const r = await api<{ object_id: number }>("/uploads/import", {
        method: "POST",
        body: fd,
      });
      await load();
      if (projectId) {
        setToast(
          `Imported ${file.name} into ${activeProject?.title || "project"}`,
        );
        setPage("project");
      } else {
        setToast(`Imported ${file.name}`);
        openObject(r.object_id);
      }
      setShowImport(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const addMember = async () => {
    if (!memberForm.name.trim()) return;
    try {
      await api("/members/", {
        method: "POST",
        body: JSON.stringify({
          ...memberForm,
          initials: initials(memberForm.name),
          project_id: projectId,
        }),
      });
      await load();
      setShowMember(false);
      setMemberForm({ name: "", role: "Developer", status: "online" });
      setToast("Member added");
    } catch (e: any) {
      setError(e.message);
    }
  };
  const ask = async () => {
    if (!prompt.trim()) return;
    const p = prompt;
    setPrompt("");
    setChat((c) => [...c, { from: "user", text: p }]);
    try {
      const r = await api<{ answer: string }>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({
          prompt: p,
          project_id: projectId,
          object_id: selected,
        }),
      });
      setChat((c) => [...c, { from: "ai", text: r.answer }]);
    } catch (e: any) {
      setChat((c) => [...c, { from: "ai", text: e.message }]);
    }
  };
  const saveObject = async () => {
    if (!selectedObj || !draftContent.trim()) return;
    setBusy(true);
    try {
      await api(`/objects/${selectedObj.id}`, {
        method: "PATCH",
        body: JSON.stringify({ content: draftContent }),
      });
      setPolishedContent("");
      await load();
      setToast("Object context updated");
      await refreshSuggestions(projectId, selectedObj.id);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const improveContext = async () => {
    if (!draftContent.trim() || !selectedObj) return;

    setAiPolishing(true);
    setPolishedContent("");

    try {
      const r = await api<{ answer: string }>("/ai/ask", {
        method: "POST",
        body: JSON.stringify({
          prompt: `You are Gemma 4 assisting inside Camelot, a Temporal Intelligence Workspace.

Rewrite the following project/object context into a clear, concise and professional description.

Rules:
- Preserve the original meaning and technical intent.
- Do not invent facts, technologies, requirements, people, dates, metrics, or decisions.
- Do not remove important technical details.
- Improve grammar, clarity, structure, and readability.
- Keep it appropriate for a project knowledge workspace.
- Return only the rewritten context. Do not explain the changes.
- If the original text is already clear, make only minimal improvements.

Object:
${selectedObj.title}

Original context:
${draftContent}`,
          project_id: projectId,
          object_id: selectedObj.id,
        }),
      });

      setPolishedContent(r.answer.trim());
    } catch (e: any) {
      setError(e.message || "Gemma failed to improve the context.");
    } finally {
      setAiPolishing(false);
    }
  };
  const deleteRel = async (id: number) => {
    await api(`/relationships/${id}`, { method: "DELETE" });
    await load();
    setSelectedEdge(null);
    setToast("Relationship removed");
  };
  const deleteObject = async () => {
    if (!selected || !confirm("Delete this object and its relationships?"))
      return;
    await api(`/objects/${selected}`, { method: "DELETE" });
    setSelected(null);
    await load();
    setPage(projectId ? "project" : "realm");
    setToast("Object deleted");
  };
  const openGraph = (id?: number) => {
    if (id) setProjectId(id);
    setPage("graph");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">♜</div>
          <div>
            <strong>CAMELOT</strong>
            <span>Temporal Intelligence Workspace</span>
          </div>
        </div>
        <div className="realm-switch">
          <button
            className={page === "realm" ? "active" : ""}
            onClick={() => {
              setPage("realm");
              setSelected(null);
            }}
          >
            Realm
          </button>
          <button
            className={page === "graph" ? "active" : ""}
            onClick={() => openGraph(projectId || undefined)}
          >
            <Network size={14} /> Knowledge Graph
          </button>
        </div>
        <div className="top-actions">
          <div className="search">
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the realm…"
            />
          </div>
          <button
            className="icon-btn"
            onClick={() => setShowImport(true)}
            title="Import from PC"
          >
            <Upload size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowChat(true)}
            title="Context chat"
          >
            <Bot size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowSettings(true)}
            title="Workspace settings"
          >
            <Settings size={17} />
          </button>
        </div>
      </header>
      {page === "graph" ? (
        <GraphPage
          onBack={() => setPage(projectId ? "project" : "realm")}
          objects={objects}
          rels={rels}
          query={query}
          selected={selected}
          setSelected={openObject}
          selectedEdge={selectedEdge}
          setSelectedEdge={setSelectedEdge}
          projectId={projectId}
          setProjectId={setProjectId}
          dropTarget={dropTarget}
          setDropTarget={setDropTarget}
          openLink={openLink}
          onConnect={onConnect}
          deleteRel={deleteRel}
        />
      ) : page === "project" && activeProject ? (
        <ProjectPage
          project={activeProject}
          children={projectChildren}
          loose={looseObjects}
          events={projectEvents}
          members={members.filter(
            (m) => !m.project_id || m.project_id === projectId,
          )}
          suggestions={suggestions}
          aiMessage={aiMessage}
          aiTriggered={aiTriggered}
          onBack={() => {
            setPage("realm");
            setSelected(null);
          }}
          onNew={openNew}
          onGraph={() => openGraph(activeProject.id)}
          onImport={() => setShowImport(true)}
          onMember={() => setShowMember(true)}
          onOpen={openObject}
          onLink={openLink}
          query={query}
        />
      ) : page === "object" && selectedObj ? (
        <ObjectPage
          object={selectedObj}
          project={activeProject}
          events={projectEvents.filter((e) => e.object_id === selectedObj.id)}
          related={related}
          attachments={attachments}
          draftContent={draftContent}
          setDraftContent={setDraftContent}
          onSave={saveObject}
          onImprove={improveContext}
          aiPolishing={aiPolishing}
          polishedContent={polishedContent}
          setPolishedContent={setPolishedContent}
          onBack={() => setPage(projectId ? "project" : "realm")}
          onGraph={() => openGraph(projectId || undefined)}
          onNew={openNew}
          onImport={() => setShowImport(true)}
          onOpen={openObject}
          suggestions={suggestions}
          aiMessage={aiMessage}
          aiTriggered={aiTriggered}
        />
      ) : (
        <RealmPage
          projects={projects}
          counts={counts}
          events={events}
          query={query}
          onNew={openNew}
          onImport={() => setShowImport(true)}
          onOpen={openProject}
        />
      )}
      {showNew && (
        <Modal
          title={
            page === "project"
              ? "Create a loose object"
              : "Create a Universal Object"
          }
          onClose={() => setShowNew(false)}
        >
          <div className="field">
            <label>Object type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {Object.keys(META).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Title</label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Name the object…"
            />
          </div>
          <div className="field">
            <label>Context / raw idea</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Ideas can be messy. Capture the thought first; structure it later."
            />
          </div>
          <div className="link-preview">
            <span>Created as</span>
            <ArrowRight size={18} />
            <span>Independent / unlinked</span>
            <b>LINK LATER</b>
          </div>
          <button
            className="primary wide"
            onClick={createObject}
            disabled={busy}
          >
            <Plus size={15} /> Create object
          </button>
        </Modal>
      )}
      {showLink && link && (
        <Modal
          title="Weave a relationship"
          onClose={() => {
            setShowLink(false);
            setLink(null);
          }}
        >
          <div className="link-preview">
            <span>{objects.find((o) => o.id === link.source)?.title}</span>
            <ArrowRight size={18} />
            <span>{objects.find((o) => o.id === link.target)?.title}</span>
          </div>
          <div className="field">
            <label>Relationship type</label>
            <select defaultValue="CONTAINS" id="relationship-type">
              {REL_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            className="primary wide"
            onClick={() =>
              createLink(
                (
                  document.getElementById(
                    "relationship-type",
                  ) as HTMLSelectElement
                ).value,
              )
            }
            disabled={busy}
          >
            <Link2 size={15} /> Create relationship
          </button>
        </Modal>
      )}
      {showImport && (
        <Modal title="Import into Camelot" onClose={() => setShowImport(false)}>
          <p className="muted">
            Choose a file from your PC.{" "}
            {projectId ? (
              <>
                It will be imported into <b>{activeProject?.title}</b> as a
                document object.
              </>
            ) : (
              <>
                If you are inside a project later, Camelot will place the
                imported document in that project's graph.
              </>
            )}
          </p>
          <div
            className="dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) importFile(f);
            }}
          >
            <Upload size={25} />
            <strong>Choose a local file</strong>
            <span>PDF, CSV, JSON, images, Markdown, DOCX, XLSX and text</span>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept=".pdf,.csv,.json,.txt,.md,.png,.jpg,.jpeg,.webp,.docx,.xlsx"
              onChange={(e) =>
                e.target.files?.[0] && importFile(e.target.files[0])
              }
            />
          </div>
          <div className="import-options">
            <span>Import target</span>
            <b>{projectId ? activeProject?.title : "Global / unlinked"}</b>
          </div>
        </Modal>
      )}
      {showMember && (
        <Modal title="Add project member" onClose={() => setShowMember(false)}>
          <div className="field">
            <label>Name</label>
            <input
              autoFocus
              value={memberForm.name}
              onChange={(e) =>
                setMemberForm({ ...memberForm, name: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Role</label>
            <input
              value={memberForm.role}
              onChange={(e) =>
                setMemberForm({ ...memberForm, role: e.target.value })
              }
            />
          </div>
          <div className="field">
            <label>Status</label>
            <select
              value={memberForm.status}
              onChange={(e) =>
                setMemberForm({ ...memberForm, status: e.target.value as any })
              }
            >
              <option>online</option>
              <option>away</option>
              <option>offline</option>
            </select>
          </div>
          <button className="primary wide" onClick={addMember}>
            <Users size={15} /> Add member
          </button>
        </Modal>
      )}
      {showChat && (
        <aside className="chat-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">GEMMA 4</span>
              <h3>Context Chat</h3>
            </div>
            <button className="icon-btn" onClick={() => setShowChat(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="chat-log">
            {chat.length === 0 && (
              <div className="empty-chat">
                <Bot size={28} />
                <p>
                  Ask about this project, object, evidence, or relationship.
                  Gemma 4 uses the selected project and object context when
                  answering.
                </p>
              </div>
            )}
            {chat.map((m, i) => (
              <div className={`bubble ${m.from}`} key={i}>
                {m.text}
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about the current context…"
            />
            <button onClick={ask}>
              <Send size={16} />
            </button>
          </div>
        </aside>
      )}
      {showSettings && (
        <Modal
          title="Workspace settings"
          onClose={() => setShowSettings(false)}
        >
          <div className="settings-card">
            <span>AI engine</span>
            <strong>Gemma 4 · Gemini API</strong>
          </div>
          <div className="settings-card">
            <span>Model</span>
            <strong>gemma-4-26b-a4b-it</strong>
          </div>
          <div className="settings-card">
            <span>Graph behavior</span>
            <strong>One graph per project</strong>
          </div>
          <p className="muted">
            Gemma 4 is connected through the backend AI service. Context can be
            polished with AI while you remain in control of what gets saved.
          </p>
        </Modal>
      )}
      {selectedObj && page !== "object" && (
        <aside className="object-drawer">
          <button className="drawer-close" onClick={() => setSelected(null)}>
            <X size={16} />
          </button>
          <div className={`object-emblem ${selectedObj.type}`}>
            {typeGlyph(selectedObj.type)}
          </div>
          <div className="eyebrow">{selectedObj.type}</div>
          <h2>{selectedObj.title}</h2>
          <p>{selectedObj.content || "No description recorded."}</p>
          <div className="drawer-section">
            <span>Status</span>
            <b>{selectedObj.status}</b>
          </div>
          <div className="drawer-section">
            <span>Relationships</span>
            <b>{related.length}</b>
          </div>
          <div className="drawer-actions">
            <button onClick={() => openObject(selectedObj.id)}>
              <ChevronRight size={14} /> Open
            </button>
            <button onClick={openNew}>
              <Plus size={14} /> Create object
            </button>
            <button onClick={() => setShowImport(true)}>
              <Paperclip size={14} /> Import
            </button>
            <button className="danger" onClick={deleteObject}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </aside>
      )}
      {toast && (
        <div className="toast">
          <Check size={15} />
          {toast}
        </div>
      )}
      {error && (
        <div className="toast error">
          <X size={15} />
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
    </div>
  );
}

function RealmPage({
  projects,
  counts,
  events,
  query,
  onNew,
  onImport,
  onOpen,
}: {
  projects: Obj[];
  counts: Record<string, number>;
  events: Event[];
  query: string;
  onNew: () => void;
  onImport: () => void;
  onOpen: (id: number) => void;
}) {
  const cards = projects.filter((o) =>
    (o.title + " " + (o.content || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <main className="realm-grid">
      <aside className="rail left-rail">
        <button className="new-object" onClick={onNew}>
          <Plus size={18} /> New Object
        </button>
        <button className="rail-import" onClick={onImport}>
          <Upload size={15} /> Import from PC
        </button>
        <div className="rail-section">
          <div className="rail-title">Universal Objects</div>
          {Object.entries(META).map(([t, m]) => (
            <div className="count-row static" key={t}>
              <span>
                {m.icon}
                {m.label}
              </span>
              <b>{counts[t]}</b>
            </div>
          ))}
        </div>
        <div className="rail-section chronicle">
          <div className="rail-title">
            <Clock3 size={13} /> Chronicle
          </div>
          {events.slice(0, 10).map((e) => (
            <div className="event-row" key={e.id}>
              <span>{formatTime(e.created_at)}</span>
              <p>
                {e.description}
                <small> · {e.actor || "You"}</small>
              </p>
            </div>
          ))}
        </div>
      </aside>
      <section className="workspace">
        <div className="workspace-head">
          <div>
            <div className="eyebrow">PROJECT REALM</div>
            <h1>Your Projects</h1>
            <p>
              Each project is its own living world. Open a project to see its
              children, history, and knowledge map.
            </p>
          </div>
          <div className="workspace-tools">
            <button onClick={onImport}>
              <Upload size={15} /> Import
            </button>
            <button onClick={onNew}>
              <Plus size={15} /> New Project
            </button>
          </div>
        </div>
        <div className="state-banner">
          <Sparkles size={16} />
          <span>Living workspace</span>
          <i></i>
          <small>
            {projects.length} projects · {counts.idea || 0} ideas ·{" "}
            {counts.document || 0} documents
          </small>
        </div>
        <div className="object-grid project-grid">
          {cards.map((p) => (
            <button
              className="object-card project"
              key={p.id}
              onClick={() => onOpen(p.id)}
            >
              <div className="card-top">
                <span className="type-pill">
                  <FolderKanban size={14} />
                  project
                </span>
                <span>{formatDate(p.updated_at)}</span>
              </div>
              <div className="card-glyph">◆</div>
              <h3>{p.title}</h3>
              <p>{p.content || "No project description yet."}</p>
              <div className="card-footer">
                <span>{p.status}</span>
                <ChevronRight size={14} />
              </div>
            </button>
          ))}
          {cards.length === 0 && (
            <div className="empty-state">
              <FolderKanban size={34} />
              <h3>No projects yet</h3>
              <p>
                Start with one project. Everything else can remain loose until
                you decide how it connects.
              </p>
              <button className="primary" onClick={onNew}>
                <Plus size={15} /> Create first project
              </button>
            </div>
          )}
        </div>
      </section>
      <aside className="right-stack">
        <section className="side-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">CAMELOT</span>
              <h3>Project-first workspace</h3>
            </div>
            <Sparkles size={16} />
          </div>
          <div className="suggestion-empty ai-ready">
            <Network size={24} />
            <p>
              Projects are the top-level worlds. Their knowledge maps and
              Chronicle histories are isolated per project.
            </p>
          </div>
        </section>
      </aside>
    </main>
  );
}

function ProjectPage({
  project,
  children,
  loose,
  events,
  members,
  suggestions,
  aiMessage,
  aiTriggered,
  onBack,
  onNew,
  onGraph,
  onImport,
  onMember,
  onOpen,
  onLink,
  query,
}: {
  project: Obj;
  children: Obj[];
  loose: Obj[];
  events: Event[];
  members: Member[];
  suggestions: Suggestion[];
  aiMessage: string;
  aiTriggered: boolean;
  onBack: () => void;
  onNew: () => void;
  onGraph: () => void;
  onImport: () => void;
  onMember: () => void;
  onOpen: (id: number) => void;
  onLink: (a: number, b: number) => void;
  query: string;
}) {
  const visibleLoose = loose.filter((o) =>
    (o.title + " " + (o.content || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const visibleChildren = children.filter((o) =>
    (o.title + " " + (o.content || ""))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <main className="project-page">
      <div className="project-head">
        <div>
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={15} /> All projects
          </button>
          <div className="eyebrow">PROJECT WORLD</div>
          <h1>{project.title}</h1>
          <p>{project.content || "Project context is still being formed."}</p>
        </div>
        <div className="project-actions">
          <button onClick={onGraph}>
            <Network size={15} /> Knowledge Map
          </button>
          <button onClick={onImport}>
            <Upload size={15} /> Import
          </button>
          <button onClick={onMember}>
            <Users size={15} /> Members
          </button>
        </div>
      </div>
      <div className="project-layout">
        <section className="project-main">
          <div className="state-banner">
            <Sparkles size={16} />
            <span>Living state</span>
            <i></i>
            <small>
              {children.length} linked children · {events.length} history events
            </small>
          </div>
          <div
            className="project-drop-target"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const source = Number(e.dataTransfer.getData("text/object"));
              if (source && source !== project.id) onLink(source, project.id);
            }}
          >
            <div>
              <strong>Drop a loose object here</strong>
              <span>Choose how it belongs to {project.title}</span>
            </div>
            <Link2 size={18} />
          </div>
          <div className="section-title">
            <div>
              <span className="eyebrow">STRUCTURE</span>
              <h2>Inside {project.title}</h2>
            </div>
            <button className="primary" onClick={onNew}>
              <Plus size={14} /> New loose object
            </button>
          </div>
          <div className="child-grid">
            {visibleChildren.map((o) => (
              <button
                className={`object-card ${o.type}`}
                key={o.id}
                onClick={() => onOpen(o.id)}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/object", String(o.id))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const s = Number(e.dataTransfer.getData("text/object"));
                  if (s && s !== o.id) onLink(s, o.id);
                }}
              >
                <div className="card-top">
                  <span className="type-pill">
                    {META[o.type]?.icon}
                    {o.type}
                  </span>
                  <span>{formatDate(o.updated_at)}</span>
                </div>
                <div className="card-glyph">{typeGlyph(o.type)}</div>
                <h3>{o.title}</h3>
                <p>{o.content || "No context yet."}</p>
                <div className="card-footer">
                  <span>{o.status}</span>
                  <ChevronRight size={14} />
                </div>
              </button>
            ))}
            {visibleChildren.length === 0 && (
              <div className="empty-state">
                <Network size={30} />
                <h3>Nothing is linked into this project yet</h3>
                <p>
                  Create a loose object, then drag it onto the project or use
                  the Knowledge Map to decide how it belongs.
                </p>
                <button className="primary" onClick={onNew}>
                  <Plus size={14} /> Create loose object
                </button>
              </div>
            )}
          </div>
          <div className="section-title compact">
            <div>
              <span className="eyebrow">LOOSE OBJECTS</span>
              <h2>Unlinked ideas & material</h2>
            </div>
            <span className="muted">
              Drag a loose object onto a project/child to weave context.
            </span>
          </div>
          <div className="child-grid loose-grid">
            {visibleLoose
              .filter((o) => o.id !== project.id)
              .map((o) => (
                <button
                  className={`object-card ${o.type} loose`}
                  key={o.id}
                  onClick={() => onOpen(o.id)}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/object", String(o.id))
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const s = Number(e.dataTransfer.getData("text/object"));
                    if (s && s !== o.id) onLink(s, o.id);
                  }}
                >
                  <div className="card-top">
                    <span className="type-pill">
                      {META[o.type]?.icon}
                      {o.type}
                    </span>
                    <span>UNLINKED</span>
                  </div>
                  <div className="card-glyph">{typeGlyph(o.type)}</div>
                  <h3>{o.title}</h3>
                  <p>{o.content || "Raw material — no context yet."}</p>
                </button>
              ))}
          </div>
        </section>
        <aside className="project-side">
          <section className="side-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">CONTEXTUAL INTELLIGENCE</span>
                <h3>AI Suggestions</h3>
              </div>
              <span className={`ai-status ${aiTriggered ? "ready" : ""}`}>
                <Sparkles size={12} />{" "}
                {aiTriggered ? "context ready" : "Gemma 4 ready"}
              </span>
            </div>
            <div
              className={`suggestion-empty ${aiTriggered ? "ai-ready" : ""}`}
            >
              <Bot size={24} />
              <p>{aiMessage}</p>
              <small>
                {suggestions.length
                  ? `${suggestions.length} suggestions ready.`
                  : "No placeholder recommendations are shown."}
              </small>
            </div>
          </section>
          <section className="side-panel members">
            <div className="panel-head">
              <div>
                <span className="eyebrow">PROJECT CIRCLE</span>
                <h3>Members</h3>
              </div>
              <button className="mini-action" onClick={onMember}>
                <Plus size={14} />
              </button>
            </div>
            {members.length === 0 ? (
              <div className="suggestion-empty">
                <Users size={23} />
                <p>No members assigned yet.</p>
              </div>
            ) : (
              members.map((m) => (
                <div className="member" key={m.id}>
                  <div className="avatar">{m.initials}</div>
                  <div>
                    <strong>{m.name}</strong>
                    <span>{m.role}</span>
                  </div>
                  <i className={m.status}></i>
                </div>
              ))
            )}
          </section>
          <section className="side-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">CHRONICLE</span>
                <h3>{project.title} history</h3>
              </div>
              <Clock3 size={15} />
            </div>
            <div className="project-history">
              {events.slice(0, 15).map((e) => (
                <div className="history-row" key={e.id}>
                  <span>{formatTime(e.created_at)}</span>
                  <div>
                    <strong>{e.description}</strong>
                    <small>
                      {e.actor || "You"} · {formatDate(e.created_at)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ObjectPage({
  object,
  project,
  events,
  related,
  attachments,
  draftContent,
  setDraftContent,
  onSave,
  onImprove,
  aiPolishing,
  polishedContent,
  setPolishedContent,
  onBack,
  onGraph,
  onNew,
  onImport,
  onOpen,
  suggestions,
  aiMessage,
  aiTriggered,
}: {
  object: Obj;
  project?: Obj;
  events: Event[];
  related: Rel[];
  attachments: Attachment[];
  draftContent: string;
  setDraftContent: (v: string) => void;
  onSave: () => void;
  onImprove: () => void;
  aiPolishing: boolean;
  polishedContent: string;
  setPolishedContent: (v: string) => void;
  onBack: () => void;
  onGraph: () => void;
  onNew: () => void;
  onImport: () => void;
  onOpen: (id: number) => void;
  suggestions: Suggestion[];
  aiMessage: string;
  aiTriggered: boolean;
}) {
  return (
    <main className="object-page">
      <div className="object-page-head">
        <div>
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={15} /> {project?.title || "Projects"}
          </button>
          <div className="eyebrow">{object.type} OBJECT</div>
          <h1>{object.title}</h1>
          <p>
            Created {formatDate(object.created_at)} · updated{" "}
            {formatDate(object.updated_at)}
          </p>
        </div>
        <div className="project-actions">
          <button onClick={onGraph}>
            <Network size={15} /> Project Map
          </button>
          <button onClick={onImport}>
            <Upload size={15} /> Import
          </button>
          <button onClick={onNew}>
            <Plus size={15} /> New Object
          </button>
        </div>
      </div>
      <div className="object-detail-grid">
        <section className="object-editor">
          <div className="editor-card">
            <div className="panel-head">
              <div>
                <span className="eyebrow">LIVING CONTEXT</span>
                <h3>{object.title}</h3>
              </div>
              <span className="ai-status">{object.status}</span>
            </div>
            <textarea
              className="context-editor"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Write the raw idea, contradiction, requirement, document note, or any context here…"
            />
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <button
                className="primary"
                onClick={onSave}
                disabled={aiPolishing}
              >
                <Check size={14} /> Save context
              </button>

              <button
                className="primary"
                onClick={onImprove}
                disabled={aiPolishing || !draftContent.trim()}
                style={{
                  opacity: aiPolishing || !draftContent.trim() ? 0.55 : 1,
                  cursor:
                    aiPolishing || !draftContent.trim()
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                <Sparkles size={14} />
                {aiPolishing ? "Gemma is thinking…" : "Improve with Gemma"}
              </button>
            </div>

            {polishedContent && (
              <div
                className="suggestion-empty ai-ready"
                style={{
                  marginTop: 16,
                  textAlign: "left",
                  alignItems: "stretch",
                  gap: 10,
                }}
              >
                <div
                  className="panel-head"
                  style={{ width: "100%", marginBottom: 2 }}
                >
                  <div>
                    <span className="eyebrow">GEMMA 4 SUGGESTION</span>
                    <h3>Polished context</h3>
                  </div>
                  <Sparkles size={16} />
                </div>

                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.7,
                    fontSize: 13,
                    width: "100%",
                  }}
                >
                  {polishedContent}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 4,
                  }}
                >
                  <button
                    className="primary"
                    onClick={() => {
                      setDraftContent(polishedContent);
                      setPolishedContent("");
                    }}
                  >
                    <Check size={14} /> Use suggestion
                  </button>

                  <button
                    className="mini-action"
                    onClick={() => setPolishedContent("")}
                    title="Dismiss suggestion"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="editor-card">
            <div className="panel-head">
              <div>
                <span className="eyebrow">RELATIONSHIPS</span>
                <h3>Connected context</h3>
              </div>
              <Link2 size={15} />
            </div>
            {related.length === 0 ? (
              <p className="muted">
                Nothing linked yet. Keep the idea raw or connect it from the
                project map.
              </p>
            ) : (
              related.map((r) => (
                <button
                  className="relation-line"
                  key={r.id}
                  onClick={() =>
                    onOpen(
                      r.source_id === object.id ? r.target_id : r.source_id,
                    )
                  }
                >
                  <span>
                    {r.source_id === object.id ? "→" : "←"} {r.type}
                  </span>
                  <b>{r.source_id === object.id ? "target" : "source"}</b>
                </button>
              ))
            )}
          </div>
        </section>
        <aside className="object-side">
          <section className="side-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">CONTEXTUAL INTELLIGENCE</span>
                <h3>AI Suggestions</h3>
              </div>
              <span className={`ai-status ${aiTriggered ? "ready" : ""}`}>
                <Sparkles size={12} />{" "}
                {aiTriggered ? "context ready" : "Gemma 4 ready"}
              </span>
            </div>
            <div
              className={`suggestion-empty ${aiTriggered ? "ai-ready" : ""}`}
            >
              <Bot size={25} />
              <p>{aiMessage}</p>
              <small>
                {suggestions.length
                  ? `${suggestions.length} contextual suggestions will be shown here.`
                  : "Use Improve with Gemma to turn the current context into a clearer, more professional description."}
              </small>
            </div>
          </section>
          <section className="side-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">ATTACHMENTS</span>
                <h3>Evidence</h3>
              </div>
              <button className="mini-action" onClick={onImport}>
                <Paperclip size={14} />
              </button>
            </div>
            {attachments.length === 0 ? (
              <p className="muted">No files attached.</p>
            ) : (
              attachments.map((a) => (
                <div className="attachment-row" key={a.id}>
                  <FileText size={14} />
                  <span>{a.name}</span>
                </div>
              ))
            )}
          </section>
          <section className="side-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">CHRONICLE</span>
                <h3>Object history</h3>
              </div>
              <Clock3 size={15} />
            </div>
            {events.length === 0 ? (
              <p className="muted">No object events yet.</p>
            ) : (
              events.map((e) => (
                <div className="history-row" key={e.id}>
                  <span>{formatTime(e.created_at)}</span>
                  <div>
                    <strong>{e.description}</strong>
                    <small>{e.actor || "You"}</small>
                  </div>
                </div>
              ))
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function GraphPage({
  onBack,
  objects,
  rels,
  query,
  selected,
  setSelected,
  selectedEdge,
  setSelectedEdge,
  projectId,
  setProjectId,
  dropTarget,
  setDropTarget,
  openLink,
  onConnect,
  deleteRel,
}: {
  onBack: () => void;
  objects: Obj[];
  rels: Rel[];
  query: string;
  selected: number | null;
  setSelected: (v: number) => void;
  selectedEdge: number | null;
  setSelectedEdge: (v: number | null) => void;
  projectId: number | null;
  setProjectId: (v: number) => void;
  dropTarget: number | null;
  setDropTarget: (v: number | null) => void;
  openLink: (a: number, b: number) => void;
  onConnect: (c: Connection) => void;
  deleteRel: (id: number) => void;
}) {
  const projects = objects.filter((o) => o.type === "project");
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const mapObjects = useMemo(() => {
    const matches = (o: Obj) =>
      (o.title + " " + o.type + " " + (o.content || ""))
        .toLowerCase()
        .includes(query.toLowerCase());
    if (!projectId) return objects.filter(matches);
    const ids = new Set<number>([projectId]);
    objects.forEach((o) => {
      if (o.type !== "project" && o.project_id === projectId) ids.add(o.id);
    });
    let changed = true;
    while (changed) {
      changed = false;
      rels.forEach((r) => {
        if (
          r.type !== "CONTAINS" ||
          !ids.has(r.source_id) ||
          ids.has(r.target_id)
        )
          return;
        const target = objects.find((o) => o.id === r.target_id);
        if (
          target &&
          target.type !== "project" &&
          (!target.project_id || target.project_id === projectId)
        ) {
          ids.add(target.id);
          changed = true;
        }
      });
    }
    return objects.filter((o) => ids.has(o.id) && matches(o));
  }, [objects, rels, query, projectId]);
  const positions = useMemo(() => {
    const ids = new Set(mapObjects.map((o) => o.id));
    const root =
      projectId && ids.has(projectId)
        ? projectId
        : mapObjects.find((o) => o.type === "project")?.id || mapObjects[0]?.id;
    const depth = new Map<number, number>();
    if (root) depth.set(root, 0);
    let changed = true;
    while (changed) {
      changed = false;
      rels.forEach((r) => {
        if (!ids.has(r.source_id) || !ids.has(r.target_id)) return;
        if (depth.has(r.source_id) && !depth.has(r.target_id)) {
          depth.set(r.target_id, depth.get(r.source_id)! + 1);
          changed = true;
        }
        if (depth.has(r.target_id) && !depth.has(r.source_id)) {
          depth.set(r.source_id, depth.get(r.target_id)! + 1);
          changed = true;
        }
      });
    }
    const rows = new Map<number, number>();
    return new Map(
      mapObjects.map((o, i) => {
        const d = depth.get(o.id) ?? i % 3;
        const row = rows.get(d) || 0;
        rows.set(d, row + 1);
        return [o.id, { x: 80 + d * 310, y: 70 + row * 125 }];
      }),
    );
  }, [mapObjects, rels, projectId]);
  useEffect(() => {
    setFlowNodes(
      mapObjects.map((o) => ({
        id: String(o.id),
        type: "camelot",
        position: positions.get(o.id)!,
        data: { obj: o, dropTarget: o.id === dropTarget },
        selected: o.id === selected,
      })),
    );
  }, [mapObjects, positions, dropTarget, selected, setFlowNodes]);
  useEffect(() => {
    setFlowEdges(
      rels
        .filter(
          (r) =>
            mapObjects.some((o) => o.id === r.source_id) &&
            mapObjects.some((o) => o.id === r.target_id),
        )
        .map((r) => ({
          id: String(r.id),
          source: String(r.source_id),
          target: String(r.target_id),
          type: "smoothstep",
          label: r.type.replaceAll("_", " "),
          animated: r.id === selectedEdge,
          selected: r.id === selectedEdge,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
          style: { strokeWidth: r.id === selectedEdge ? 3 : 2 },
          labelStyle: { fontSize: 10, fontWeight: 800 },
          labelBgStyle: { fill: "#101217", fillOpacity: 0.95 },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 5,
        })),
    );
  }, [rels, mapObjects, selectedEdge, setFlowEdges]);
  const onNodeDragStop = (_: any, node: Node) => {
    const target = dropTarget;
    setDropTarget(null);
    if (target && target !== Number(node.id))
      openLink(Number(node.id), target, "drop");
  };
  return (
    <main className="graph-page">
      <div className="graph-head">
        <div>
          <button className="back-btn" onClick={onBack}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="eyebrow">PROJECT KNOWLEDGE MAP</div>
          <h1>
            {projects.find((p) => p.id === projectId)?.title ||
              "Knowledge Graph"}
          </h1>
          <p>
            Each project has its own graph. Drag an object onto another to weave
            a relationship.
          </p>
        </div>
        <div className="graph-controls">
          <select
            value={projectId || ""}
            onChange={(e) => setProjectId(Number(e.target.value))}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="graph-canvas">
        {mapObjects.length === 0 ? (
          <div className="graph-empty">
            <Network size={40} />
            <h2>No graph objects</h2>
            <p>Create or import objects first.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDrag={(_, n) => {
              const pt = { x: n.position.x + 120, y: n.position.y + 45 };
              const t = flowNodes.find(
                (x) =>
                  x.id !== n.id &&
                  pt.x >= x.position.x &&
                  pt.x <= x.position.x + 240 &&
                  pt.y >= x.position.y &&
                  pt.y <= x.position.y + 90,
              );
              setDropTarget(t ? Number(t.id) : null);
            }}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, n) => setSelected(Number(n.id))}
            onEdgeClick={(_, e) => setSelectedEdge(Number(e.id))}
            fitView
          >
            <Background gap={28} size={1} color="#242832" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n: any) =>
                n.data?.obj?.type === "project" ? "#f59e0b" : "#64748b"
              }
            />
            <Controls />
          </ReactFlow>
        )}
      </div>
      <div className="graph-footer">
        <span>
          <Link2 size={14} />{" "}
          {
            rels.filter(
              (r) =>
                mapObjects.some((o) => o.id === r.source_id) &&
                mapObjects.some((o) => o.id === r.target_id),
            ).length
          }{" "}
          relationships
        </span>
        <span>
          <Network size={14} /> {mapObjects.length} visible objects
        </span>
      </div>
      {selectedEdge && (
        <div className="edge-inspector">
          <span className="eyebrow">RELATIONSHIP</span>
          <strong>{rels.find((r) => r.id === selectedEdge)?.type}</strong>
          <p>
            {
              objects.find(
                (o) =>
                  o.id === rels.find((r) => r.id === selectedEdge)?.source_id,
              )?.title
            }{" "}
            →{" "}
            {
              objects.find(
                (o) =>
                  o.id === rels.find((r) => r.id === selectedEdge)?.target_id,
              )?.title
            }
          </p>
          <button
            className="danger-btn"
            onClick={() => deleteRel(selectedEdge)}
          >
            <Trash2 size={14} /> Remove relationship
          </button>
        </div>
      )}
    </main>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
