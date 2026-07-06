import React, { useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth/AuthContext";
import { createBike, fetchBrands, flagBike } from "./catalog/api";
import { useCatalog } from "./catalog/CatalogContext";
import type { FrameGeometry, FrameModel, SizeData } from "./frameCatalog";
import { validateFrameModelInput } from "./validation/frameModelSchema";

const MAX_UPLOAD_BYTES = 64 * 1024;

const blankSize = (): SizeData => ({
  size: "",
  geometry: {
    stack: 560,
    reach: 385,
    head_angle_deg: 73,
    seat_angle_deg: 73.5,
    bb_drop: 70,
    chainstay_length: 410,
    fork_length: 370,
    fork_offset: 45,
    wheel_radius: 340,
  },
});

const blankForm = (): Omit<FrameModel, "id"> => ({
  brand: "",
  model: "",
  launch_year: new Date().getFullYear(),
  category: "Road",
  popularity: "User submission",
  sources: [],
  sizes: [blankSize()],
});

type Tab = "form" | "json" | "submissions";

export const AddBikeMode: React.FC = () => {
  const { user } = useAuth();
  const { catalog, userBikes, refresh } = useCatalog();
  const [tab, setTab] = useState<Tab>("form");
  const [form, setForm] = useState<Omit<FrameModel, "id">>(blankForm());
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverBrands, setServerBrands] = useState<string[]>([]);

  useEffect(() => {
    fetchBrands().then(setServerBrands).catch(() => setServerBrands([]));
  }, [userBikes.length]);

  const allBrands = useMemo(() => {
    const fromCatalog = catalog.map((m) => m.brand);
    return Array.from(new Set([...fromCatalog, ...serverBrands])).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );
  }, [catalog, serverBrands]);

  const myBikes = useMemo(
    () => userBikes.filter((b) => b.submitted_by_user_id === user?.id),
    [userBikes, user],
  );

  const onSubmit = async (payload: Omit<FrameModel, "id">) => {
    setBusy(true);
    setErrors([]);
    setSuccess(null);
    try {
      const created = await createBike(payload);
      setSuccess(`Saved ${created.id}.`);
      setForm(blankForm());
      await refresh();
      setTab("submissions");
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateFrameModelInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    await onSubmit(result.value);
  };

  return (
    <div className="add-bike-mode">
      <div className="add-bike-mode__tabs">
        <button
          className={`tab-pill ${tab === "form" ? "tab-pill--active" : ""}`}
          onClick={() => setTab("form")}
        >
          Form
        </button>
        <button
          className={`tab-pill ${tab === "json" ? "tab-pill--active" : ""}`}
          onClick={() => setTab("json")}
        >
          JSON
        </button>
        <button
          className={`tab-pill ${tab === "submissions" ? "tab-pill--active" : ""}`}
          onClick={() => setTab("submissions")}
        >
          My submissions ({myBikes.length})
        </button>
      </div>

      {success ? <div className="auth-success">{success}</div> : null}
      {errors.length > 0 && tab !== "form" ? (
        <ul className="auth-error">
          {errors.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      ) : null}

      {tab === "form" ? (
        <BikeForm
          form={form}
          setForm={setForm}
          allBrands={allBrands}
          onSubmit={onSubmitForm}
          busy={busy}
          errors={errors}
        />
      ) : null}

      {tab === "json" ? (
        <JsonUpload
          onParsed={(payload) => onSubmit(payload)}
          setErrors={setErrors}
          busy={busy}
        />
      ) : null}

      {tab === "submissions" ? (
        <SubmissionsList bikes={myBikes} onChanged={refresh} />
      ) : null}
    </div>
  );
};

type FormProps = {
  form: Omit<FrameModel, "id">;
  setForm: React.Dispatch<React.SetStateAction<Omit<FrameModel, "id">>>;
  allBrands: string[];
  onSubmit: (e: React.FormEvent) => void;
  busy: boolean;
  errors: string[];
};

// Validation messages are prefixed with their field path (e.g.
// "sizes[0].geometry.stack: 200–900 mm.") so they can be shown inline.
const InlineError: React.FC<{ errors: string[]; prefix: string }> = ({ errors, prefix }) => {
  const match = errors.find((e) => e.startsWith(`${prefix}:`));
  if (!match) return null;
  return <span className="field-error">{match.slice(prefix.length + 1).trim()}</span>;
};

const BikeForm: React.FC<FormProps> = ({ form, setForm, allBrands, onSubmit, busy, errors }) => {
  const updateGeo = (i: number, key: keyof FrameGeometry, value: number) => {
    setForm((f) => {
      const sizes = [...f.sizes];
      sizes[i] = {
        ...sizes[i],
        geometry: { ...sizes[i].geometry, [key]: value },
      };
      return { ...f, sizes };
    });
  };

  const updateSizeLabel = (i: number, label: string) => {
    setForm((f) => {
      const sizes = [...f.sizes];
      sizes[i] = { ...sizes[i], size: label };
      return { ...f, sizes };
    });
  };

  const addSize = () => setForm((f) => ({ ...f, sizes: [...f.sizes, blankSize()] }));
  const removeSize = (i: number) =>
    setForm((f) => ({ ...f, sizes: f.sizes.filter((_, idx) => idx !== i) }));

  return (
    <form onSubmit={onSubmit} className="add-bike-form">
      <div className="form-row">
        <label>
          Brand
          <input
            list="bike-brands"
            value={form.brand}
            onChange={(e) => setForm({ ...form, brand: e.target.value })}
            required
          />
          <datalist id="bike-brands">
            {allBrands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <InlineError errors={errors} prefix="brand" />
        </label>
        <label>
          Model
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            required
          />
          <InlineError errors={errors} prefix="model" />
        </label>
      </div>

      <div className="form-row">
        <label>
          Launch year
          <input
            type="number"
            value={form.launch_year}
            min={1950}
            max={2100}
            onChange={(e) => setForm({ ...form, launch_year: Number(e.target.value) })}
            required
          />
          <InlineError errors={errors} prefix="launch_year" />
        </label>
        <label>
          Category
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            required
          />
          <InlineError errors={errors} prefix="category" />
        </label>
        <label>
          Notes / popularity
          <input
            value={form.popularity}
            onChange={(e) => setForm({ ...form, popularity: e.target.value })}
          />
          <InlineError errors={errors} prefix="popularity" />
        </label>
      </div>

      <label>
        Source URL (https only, optional)
        <input
          type="url"
          placeholder="https://example.com/spec"
          value={form.sources[0] ?? ""}
          onChange={(e) =>
            setForm({ ...form, sources: e.target.value ? [e.target.value] : [] })
          }
        />
        <InlineError errors={errors} prefix="sources[0]" />
      </label>

      {errors.length > 0 && (() => {
        const FIELD_RE = /^(brand|model|category|popularity|launch_year|sources\[|sizes\[)/;
        const general = errors.filter((e) => !FIELD_RE.test(e));
        const fieldCount = errors.length - general.length;
        return (
          <div className="auth-error">
            {fieldCount > 0 && <div>Fix the highlighted fields, then submit again.</div>}
            {general.map((m, i) => (
              <div key={i}>{m}</div>
            ))}
          </div>
        );
      })()}

      <h3>Sizes</h3>
      {form.sizes.map((size, i) => (
        <fieldset key={i} className="size-block">
          <legend>
            Size {i + 1}
            {form.sizes.length > 1 ? (
              <button type="button" className="link-btn" onClick={() => removeSize(i)}>
                remove
              </button>
            ) : null}
          </legend>
          <div className="form-row">
            <label>
              Size label
              <input
                value={size.size}
                onChange={(e) => updateSizeLabel(i, e.target.value)}
                required
              />
              <InlineError errors={errors} prefix={`sizes[${i}].size`} />
            </label>
          </div>
          <div className="form-grid">
            {(
              [
                ["stack", "Stack (mm)"],
                ["reach", "Reach (mm)"],
                ["head_angle_deg", "Head angle (°)"],
                ["seat_angle_deg", "Seat angle (°)"],
                ["bb_drop", "BB drop (mm)"],
                ["chainstay_length", "Chainstay (mm)"],
                ["fork_length", "Fork length (mm)"],
                ["fork_offset", "Fork offset (mm)"],
                ["wheel_radius", "Wheel radius (mm, 340 for 700c)"],
              ] as Array<[keyof FrameGeometry, string]>
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  step="any"
                  value={(size.geometry[key] as number) ?? ""}
                  onChange={(e) => updateGeo(i, key, Number(e.target.value))}
                  required
                />
                <InlineError errors={errors} prefix={`sizes[${i}].geometry.${key}`} />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="button" className="link-btn" onClick={addSize}>
        + Add another size
      </button>

      <div className="form-actions">
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? "Saving…" : "Submit bike"}
        </button>
      </div>
    </form>
  );
};

type JsonUploadProps = {
  onParsed: (payload: Omit<FrameModel, "id">) => Promise<void> | void;
  setErrors: (errors: string[]) => void;
  busy: boolean;
};

const JsonUpload: React.FC<JsonUploadProps> = ({ onParsed, setErrors, busy }) => {
  const [text, setText] = useState("");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.length > MAX_UPLOAD_BYTES) {
      setErrors(["Payload too large (>64 KB)."]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setErrors([`Invalid JSON: ${(err as Error).message}`]);
      return;
    }
    const result = validateFrameModelInput(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    await onParsed(result.value);
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors(["File too large (>64 KB)."]);
      return;
    }
    const txt = await file.text();
    setText(txt);
  };

  return (
    <form onSubmit={handle} className="add-bike-json">
      <p>
        Paste JSON below or <a href="/bike-template.json" download>download the template</a>.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={16}
        placeholder='{ "brand": "...", "model": "...", "launch_year": 2026, "category": "Road", "popularity": "...", "sources": [], "sizes": [...] }'
      />
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <div className="form-actions">
        <button type="submit" className="primary-btn" disabled={busy || text.length === 0}>
          {busy ? "Submitting…" : "Submit JSON"}
        </button>
      </div>
    </form>
  );
};

type SubmissionsListProps = {
  bikes: FrameModel[];
  onChanged: () => Promise<void>;
};

const SubmissionsList: React.FC<SubmissionsListProps> = ({ bikes, onChanged }) => {
  const [flagging, setFlagging] = useState<string | null>(null);

  if (bikes.length === 0) {
    return (
      <div className="empty-state">
        <p>You haven't submitted any bikes yet.</p>
        <p>Use the Form or JSON tab to contribute a frame to the catalog.</p>
      </div>
    );
  }

  return (
    <div className="submissions-list">
      {bikes.map((b) => (
        <div key={b.id} className="submission-row">
          <div>
            <strong>{b.brand}</strong> {b.model} ({b.launch_year}) — {b.sizes.length} size
            {b.sizes.length === 1 ? "" : "s"}
            <div className="submission-row__id">{b.id}</div>
          </div>
          <button className="link-btn" onClick={() => setFlagging(b.id)}>
            Flag for review
          </button>
        </div>
      ))}
      {flagging ? (
        <FlagDialog
          bikeId={flagging}
          onClose={() => setFlagging(null)}
          onFlagged={async () => {
            setFlagging(null);
            await onChanged();
          }}
        />
      ) : null}
    </div>
  );
};

type FlagDialogProps = {
  bikeId: string;
  onClose: () => void;
  onFlagged: () => Promise<void>;
};

const FlagDialog: React.FC<FlagDialogProps> = ({ bikeId, onClose, onFlagged }) => {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = reason.length >= 10 && reason.length <= 500;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await flagBike(bikeId, reason);
      await onFlagged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Flag for review</h3>
        <p>
          Flagged bikes are hidden from the catalog and queued for operator review. Tell us why
          (10–500 chars):
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={5}
          minLength={10}
          maxLength={500}
          required
        />
        {error ? <div className="auth-error">{error}</div> : null}
        <div className="modal__actions">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={busy || !valid}>
            {busy ? "Flagging…" : "Flag"}
          </button>
        </div>
      </form>
    </div>
  );
};
