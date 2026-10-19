import * as React from "react";
import { createPortal } from "react-dom";
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { errorDescription } from "../services/Errors";
import { hasRecordWriteAccess } from "../services/RecordAccess";
import { commitScalarValue } from "../services/CellValues";
import { buildCopyPayload, excludedCopyColumns, loadCopyDefinition, loadCopySource, lookupEntitySet } from "../services/CopyRecords";
import { defaultColumnWidth, loadViewWidths } from "../services/ColumnWidths";
import { cellDestination, typedEditValue } from "../services/KeyboardNavigation";
import { creationAttributeNames, resolveParentRecord } from "../services/ParentRecord";
import { ColumnMetadata as EntityColumnMetadata, EntityMetadata, metadataProperty as getMetadataProperty, normalizeChoiceOptions, loadEntityMetadata, isColumnWritable, isDateOnly, dateEditorValue, serializeDate } from "../services/Metadata";
import { getStrings } from "../i18n/strings";
import { EditableGridProps, GridColumn, GridRow } from "../types/grid";

interface CellEditor { rowId: string; columnName: string; originalValue: string; value: string; lookup?: LookupChoice; }
interface ContextMenuState { x: number; y: number; rowId: string; }
interface ActiveCell { rowId: string; columnName: string; }
interface ChoiceOption { value: number; label: string; }
interface LookupTarget { logicalName: string; entitySetName: string; primaryIdAttribute: string; primaryNameAttribute: string; }
interface LookupChoice { id: string; entityType: string; label: string; }

function getColumns(dataset: ComponentFramework.PropertyTypes.DataSet, sortOrderColumn?: string): GridColumn[] {
    const source = Array.isArray(dataset.columns) ? dataset.columns : [];
    const visibleColumns = source.filter((column) => column.isHidden !== true && column.order >= 0
        && column.name.toLowerCase() !== sortOrderColumn?.toLowerCase()).sort((left, right) => left.order - right.order);
    return visibleColumns.map((column) => {
        const factor = Number(column.visualSizeFactor);

        return {
            name: column.name,
            title: column.displayName || column.name,
            dataType: column.dataType || "",
            width: defaultColumnWidth(column.name, factor, {}),
            isPrimary: column.isPrimary
        };
    });
}

function getRows(dataset: ComponentFramework.PropertyTypes.DataSet): GridRow[] {
    const ids = Array.isArray(dataset.sortedRecordIds) ? dataset.sortedRecordIds : [];
    const records = dataset.records || {};
    const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
    return ids.map((id) => {
        const record = records[id];
        const values: Record<string, string> = {};
        columns.forEach((column) => { values[column.name] = record?.getFormattedValue?.(column.name) || ""; });
        return { id, values };
    });
}

function getRawValues(dataset: ComponentFramework.PropertyTypes.DataSet): Record<string, Record<string, unknown>> {
    const rawValues: Record<string, Record<string, unknown>> = {};
    const ids = Array.isArray(dataset.sortedRecordIds) ? dataset.sortedRecordIds : [];
    const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
    ids.forEach((id) => {
        const record = dataset.records?.[id];
        if (!record) return;
        rawValues[id] = {};
        columns.forEach((column) => { rawValues[id][column.name] = record.getValue(column.name); });
    });
    return rawValues;
}

function getSelectedIds(dataset: ComponentFramework.PropertyTypes.DataSet): string[] {
    try {
        const ids = dataset.getSelectedRecordIds?.();
        return Array.isArray(ids) ? ids : [];
    } catch { return []; }
}

const entityMetadataCache = new Map<string, Promise<EntityMetadata>>();
const dataverseIdPattern = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i;

function isPersistentRecordId(id: string): boolean { return dataverseIdPattern.test(id); }

function getAttributeTypeName(attributeType?: string | number): string {
    if (typeof attributeType !== "number") return attributeType ?? "";
    const names: Record<number, string> = { 0: "Boolean", 1: "Customer", 2: "DateTime", 3: "Decimal", 4: "Double", 5: "Integer", 6: "Lookup", 7: "Memo", 8: "Money", 9: "Owner", 10: "PartyList", 11: "Picklist", 12: "State", 13: "Status", 14: "String", 15: "Uniqueidentifier", 18: "BigInt" };
    return names[attributeType] ?? String(attributeType);
}

function getEntityMetadata(entityName: string, attributeNames: string[] = []): Promise<EntityMetadata> {
    const cacheKey = entityName.toLowerCase() + ":" + attributeNames.map((name) => name.toLowerCase()).sort().join(",");
    let pending = entityMetadataCache.get(cacheKey);
    if (!pending) {
        pending = loadEntityMetadata(entityName, attributeNames).catch((error: unknown) => { entityMetadataCache.delete(cacheKey); throw error; });
        entityMetadataCache.set(cacheKey, pending);
    }
    return pending;
}

function isInlineEditableType(dataType: string): boolean {
    return /singleline|multiline|whole|decimal|currency|floating|dateandtime|optionset|picklist|choice|lookup|twooptions|boolean/i.test(dataType);
}

function getLookupReference(value: unknown): { id: string; entityType: string } | undefined {
    const item: unknown = Array.isArray(value) ? value[0] as unknown : value;
    if (!item || typeof item !== "object") return undefined;
    const reference = item as { id?: string | { guid?: string }; etn?: string; entityType?: string };
    const id = typeof reference.id === "string" ? reference.id : reference.id?.guid;
    const entityType = reference.etn ?? reference.entityType;
    return id && entityType ? { id: id.replace(/[{}]/g, ""), entityType } : undefined;
}

function parseColumnValue(value: string, dataType: string, currentValue?: unknown, metadata?: EntityColumnMetadata): unknown {
    if (typeof currentValue === "number" || /whole|decimal|currency|float|number/i.test(dataType)) {
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error("Enter a valid number");
        return number;
    }
    if (currentValue instanceof Date || /date|time/i.test(dataType)) return serializeDate(value, metadata);
    if (typeof currentValue === "boolean" || /twooptions|boolean/i.test(dataType)) {
        if (!["true", "false", "1", "0"].includes(value.toLowerCase())) throw new Error("Enter true or false");
        return value.toLowerCase() === "true" || value === "1";
    }
    if (/optionset|picklist|choice/i.test(dataType)) {
        const choice = Number(value);
        if (!Number.isInteger(choice)) throw new Error("Choose a valid option");
        return choice;
    }
    return value;
}

function getEditorValue(rawValue: unknown, dataType: string, formattedValue: string): string {
    if (rawValue === null || rawValue === undefined) return "";
    if (rawValue instanceof Date) return rawValue.toISOString();
    if (/lookup/i.test(dataType)) return formattedValue;
    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") return String(rawValue);
    return formattedValue;
}


interface SortableRowProps {
    row: GridRow;
    index: number;
    columns: GridColumn[];
    columnWidths: Record<string, number>;
    selected: boolean;
    activeCell: ActiveCell | null;
    hovered: boolean;
    editing: CellEditor | null;
    rawValues: Record<string, Record<string, unknown>>;
    onHover: (id: string | null) => void;
    onToggle: (id: string) => void;
    onSelectCell: (rowId: string, columnName: string) => void;
    onNavigateCell: (rowId: string, columnName: string, key: string, shift?: boolean) => boolean;
    onFocusCell: (rowId: string, columnName: string) => void;
    onInsertBefore: (id: string) => void;
    onInsertAfter: (id: string) => void;
    onContextMenu: (event: React.MouseEvent<HTMLTableRowElement>, id: string) => void;
    onStartEdit: (rowId: string, columnName: string, value: string, lookup?: LookupChoice) => void;
    onDraftChange: (rowId: string, columnName: string, value: string) => void;
    onCommitEdit: (rowId: string, columnName: string, value: string) => void;
    onCommitLookup: (rowId: string, columnName: string, value: LookupChoice) => void;
    onSaveDraft: (rowId: string) => void;
    editableColumnNames: Set<string>;
    rowReadOnly: boolean;
    choiceOptions: Record<string, ChoiceOption[]>;
    lookupTargets: Record<string, LookupTarget[]>;
    metadataErrors: Record<string, string>;
    metadataLoading: boolean;
    fieldMetadata: Record<string, EntityColumnMetadata>;
    webApi: ComponentFramework.WebApi;
    language: number;
    onFinishEdit: () => void;
    onCancelEdit: () => void;
    strings: ReturnType<typeof getStrings>;
}

function SortableRow(props: SortableRowProps): React.ReactElement {
    const { row, index } = props;
    const sortable = useSortable({ id: row.id });
    const lastCellClick = React.useRef<{ columnName: string; timestamp: number } | null>(null);
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.45 : 1
    };
    return <tr ref={sortable.setNodeRef} style={style}
        className={`ess-row ${props.hovered ? "is-hovered" : ""} ${props.selected ? "is-selected" : ""} ${row.id.startsWith("local-") ? "is-local-row" : ""}`}
        onMouseEnter={() => props.onHover(row.id)} onMouseLeave={(event) => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof Element && nextTarget.closest(".ess-insert")) return;
            props.onHover(null);
        }} onContextMenu={(event) => props.onContextMenu(event, row.id)}>
        <td className="ess-leading">
            <div className="ess-leading-content">
                <span className="ess-index" aria-label={`${index + 1}`}>{index + 1}</span>
                <button type="button" className="ess-handle" aria-label={props.strings.reorder} title={props.strings.dragHint}
                    ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners}><span className="ess-grip" aria-hidden="true" /></button>
            <button type="button" className="ess-select" aria-label={`${props.strings.select} ${row.id}`} aria-pressed={props.selected} onClick={() => props.onToggle(row.id)}>
                    {props.selected ? "✓" : ""}
                </button>
                {row.isDraft && <button type="button" className="ess-draft-save" onClick={() => props.onSaveDraft(row.id)}>{props.strings.save}</button>}
            </div>
            <button type="button" className="ess-insert ess-insert-before" title={props.strings.insertBefore} aria-label={props.strings.insertBefore}
                onMouseEnter={() => props.onHover(row.id)} onClick={() => props.onInsertBefore(row.id)} />
            <button type="button" className="ess-insert ess-insert-after" title={props.strings.insertAfter} aria-label={props.strings.insertAfter}
                onMouseEnter={() => props.onHover(row.id)} onClick={() => props.onInsertAfter(row.id)} />
        </td>
        {props.columns.map((column, columnIndex) => {
            const isEditing = !props.rowReadOnly && props.editing?.rowId === row.id && props.editing.columnName === column.name;
            const value = row.values[column.name] || "";
            const width = props.columnWidths[column.name];
            const canEdit = !props.rowReadOnly && props.editableColumnNames.has(column.name.toLowerCase()) && isInlineEditableType(column.dataType);
            const isNumeric = /currency|whole|decimal|floating|number|duration/i.test(column.dataType);
            const isActive = props.activeCell?.rowId === row.id && props.activeCell.columnName === column.name;
            const beginCellEdit = (event?: React.MouseEvent<HTMLTableCellElement>, firstKey?: string) => {
                if (!canEdit) return;
                event?.preventDefault();
                event?.stopPropagation();
                const rawValue = row.rawValues?.[column.name] ?? props.rawValues[row.id]?.[column.name];
                const reference = /lookup/i.test(column.dataType) ? getLookupReference(rawValue) : undefined;
                const current = getEditorValue(rawValue, column.dataType, value);
                props.onStartEdit(row.id, column.name, firstKey === undefined ? current : typedEditValue(column.dataType, current, firstKey), reference && firstKey === undefined ? { ...reference, label: value } : undefined);
            };
            return <td key={column.name} tabIndex={0} data-row-index={index} data-column-index={columnIndex} className={`ess-cell ${canEdit ? "is-editable" : !props.metadataLoading ? "is-readonly" : ""} ${isEditing ? "is-editing" : ""} ${isActive ? "is-active" : ""} ${isNumeric ? "is-numeric" : ""}`} style={width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : { width: `${column.width ?? 160}px` }}
                onFocus={() => props.onSelectCell(row.id, column.name)}
                onKeyDown={(event) => {
                    if (isEditing || event.target !== event.currentTarget || event.nativeEvent.isComposing) return;
                    if (event.ctrlKey || event.metaKey || event.altKey) return;
                    if (/^Arrow(Up|Down|Left|Right)$/.test(event.key) || event.key === "Tab") {
                        lastCellClick.current = null;
                        if (props.onNavigateCell(row.id, column.name, event.key, event.shiftKey)) { event.preventDefault(); event.stopPropagation(); }
                        return;
                    }
                    if (canEdit && (event.key === "Enter" || event.key === "F2" || (event.key.length === 1 && event.key !== " "))) {
                        event.preventDefault();
                        event.stopPropagation();
                        lastCellClick.current = null;
                        beginCellEdit(undefined, event.key.length === 1 ? event.key : undefined);
                    }
                }}
                onClick={(event) => {
                    if (isEditing) { event.stopPropagation(); return; }
                    event.currentTarget.focus();
                    props.onSelectCell(row.id, column.name);
                    const now = Date.now();
                    const previous = lastCellClick.current;
                    if (previous?.columnName === column.name && now - previous.timestamp < 500) {
                        lastCellClick.current = null;
                        beginCellEdit();
                    } else {
                        lastCellClick.current = { columnName: column.name, timestamp: now };
                    }
                }} onDoubleClick={(event) => { if (!isEditing) beginCellEdit(event); }} title={canEdit ? props.strings.editHint : props.metadataLoading ? props.strings.loading : props.strings.readOnly}>
                {isEditing ? <CellEditorControl {...props} column={column} rowId={row.id} displayValue={value} /> : value}
            </td>;
        })}
    </tr>;
}

interface CellEditorControlProps extends SortableRowProps { column: GridColumn; rowId: string; displayValue: string; }
function CellEditorControl(props: CellEditorControlProps): React.ReactElement {
    const editor = props.editing!;
    const dataType = props.column.dataType;
    const choiceOptions = props.choiceOptions[props.column.name.toLowerCase()] ?? [];
    const lookupTargets = props.lookupTargets[props.column.name.toLowerCase()] ?? [];
    const [lookupText, setLookupText] = React.useState(editor.lookup?.label ?? editor.value);
    const [lookupResults, setLookupResults] = React.useState<LookupChoice[]>([]);
    const [lookupLoading, setLookupLoading] = React.useState(false);
    const [lookupOpen, setLookupOpen] = React.useState(false);
    const [lookupError, setLookupError] = React.useState("");
    const committed = React.useRef(false);
    const metadataError = props.metadataErrors[props.column.name.toLowerCase()];
    const lookupTarget = lookupTargets.find((target) => target.logicalName === editor.lookup?.entityType) ?? lookupTargets[0];
    const dateMetadata = props.fieldMetadata[props.column.name.toLowerCase()];
    const [dateInputValue, setDateInputValue] = React.useState(() => dateEditorValue(editor.value, dateMetadata));
    React.useEffect(() => {
        if (!/lookup/i.test(dataType) || !lookupTarget || !lookupOpen) return;
        let active = true;
        const timer = window.setTimeout(() => {
            setLookupLoading(true);
            setLookupError("");
            const safeAttribute = lookupTarget.primaryNameAttribute.replace(/[^A-Za-z0-9_]/g, "");
            const term = lookupText.trim().replace(/'/g, "''");
            const filter = term ? `&$filter=contains(${safeAttribute},'${term}')` : "";
            const query = `?$select=${lookupTarget.primaryIdAttribute},${safeAttribute}&$top=20${filter}`;
            void props.webApi.retrieveMultipleRecords(lookupTarget.logicalName, query).then((result) => {
                if (!active) return result;
                const options = result.entities.map((entity) => ({ id: String(entity[lookupTarget.primaryIdAttribute] ?? entity.id ?? "").replace(/[{}]/g, ""), entityType: lookupTarget.logicalName, label: String(entity[safeAttribute] ?? "") })).filter((option) => !!option.id);
                setLookupResults(options);
                return result;
            }).catch((error: unknown) => {
                if (active) {
                    setLookupResults([]);
                    setLookupError(`${props.strings.lookupSearchError}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }).finally(() => { if (active) setLookupLoading(false); });
        }, 220);
        return () => { active = false; window.clearTimeout(timer); };
    }, [dataType, lookupOpen, lookupTarget?.logicalName, lookupTarget?.primaryNameAttribute, lookupText, props.webApi]);
    const change = (value: string) => props.onDraftChange(props.rowId, props.column.name, value);
    const commit = (value = editor.value, lookup?: LookupChoice) => {
        if (committed.current) return;
        committed.current = true;
        if (lookup) props.onCommitLookup(props.rowId, props.column.name, lookup);
        else props.onCommitEdit(props.rowId, props.column.name, value);
        props.onFinishEdit();
    };
    const keyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation();
            committed.current = true;
            props.onCancelEdit();
            props.onFocusCell(props.rowId, props.column.name);
        }
        if (event.key === "Tab" || event.key === "Enter") {
            event.stopPropagation();
            if (/lookup/i.test(dataType)) {
                if (event.key === "Enter" && lookupResults.length) commit(lookupResults[0].label, lookupResults[0]);
                else { committed.current = true; props.onFinishEdit(); }
            } else {
                const value = event.currentTarget instanceof HTMLInputElement || event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : editor.value;
                if (value === "" && /optionset|picklist|choice|boolean|twooptions/i.test(dataType)) { committed.current = true; props.onFinishEdit(); }
                else commit(value);
            }
            if (event.key === "Tab") {
                if (props.onNavigateCell(props.rowId, props.column.name, "Tab", event.shiftKey)) event.preventDefault();
            } else {
                event.preventDefault();
                props.onFocusCell(props.rowId, props.column.name);
            }
        }
    };
    if (/optionset|picklist|choice/i.test(dataType)) return <select className="ess-editor" autoFocus value={choiceOptions.length ? editor.value : ""} title={metadataError} onChange={(event) => { if (event.currentTarget.value !== "") { change(event.currentTarget.value); commit(event.currentTarget.value); props.onFocusCell(props.rowId, props.column.name); } }} onKeyDown={keyDown} onBlur={() => { if (!committed.current) { committed.current = true; props.onFinishEdit(); } }}>
        <option value="">{props.metadataLoading ? props.strings.loading : !choiceOptions.length ? (metadataError || props.strings.metadataError) : "—"}</option>{choiceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>;
    if (/twooptions|boolean/i.test(dataType)) return <select className="ess-editor" autoFocus value={editor.value} onChange={(event) => { change(event.currentTarget.value); commit(event.currentTarget.value); props.onFocusCell(props.rowId, props.column.name); }} onKeyDown={keyDown} onBlur={() => { if (!committed.current) { committed.current = true; props.onFinishEdit(); } }}>
        <option value="">—</option><option value="true">{props.strings.yes}</option><option value="false">{props.strings.no}</option>
    </select>;
    if (/lookup/i.test(dataType)) return <span className="ess-lookup-editor">
        <input className="ess-editor" autoFocus value={lookupText} placeholder={props.strings.searchLookup} onFocus={() => setLookupOpen(true)} onChange={(event) => { setLookupText(event.currentTarget.value); setLookupOpen(true); }} onKeyDown={keyDown} onBlur={() => { setLookupOpen(false); if (!committed.current) { committed.current = true; props.onFinishEdit(); } }} />
        {lookupOpen && <span className="ess-lookup-options">{props.metadataLoading || lookupLoading ? <span>{props.strings.loading}</span> : metadataError || lookupError || !lookupTarget ? <span role="alert">{metadataError || lookupError || props.strings.metadataError}</span> : lookupResults.length ? lookupResults.map((option) => <button type="button" key={`${option.entityType}:${option.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setLookupText(option.label); commit(option.label, option); }}>{option.label}</button>) : <span>{props.strings.noLookupResults}</span>}</span>}
    </span>;
    if (/dateandtime|date|time/i.test(dataType)) return <input className="ess-editor" autoFocus type={isDateOnly(dateMetadata) || /dateonly/i.test(dataType) ? "date" : "datetime-local"} value={dateInputValue}
        onChange={(event) => { setDateInputValue(event.currentTarget.value); change(event.currentTarget.value); }} onKeyDown={keyDown} onBlur={(event) => commit(event.currentTarget.value)} />;
    return <input className="ess-editor" autoFocus value={editor.value}
        onChange={(event) => change(event.currentTarget.value)} onKeyDown={keyDown}
        onBlur={() => { commit(); }} />;
}

export function EditableGrid(props: EditableGridProps): React.ReactElement {
    const { dataset } = props;
    const strings = getStrings(props.language, props.languageOverride);
    const sourceRows = getRows(dataset);
    const rawValues = getRawValues(dataset);
    const dataKey = JSON.stringify(sourceRows);
    const [rows, setRows] = React.useState<GridRow[]>(sourceRows);
    const [selected, setSelected] = React.useState<string[]>(() => getSelectedIds(dataset));
    const [activeCell, setActiveCell] = React.useState<ActiveCell | null>(null);
    const [hovered, setHovered] = React.useState<string | null>(null);
    const [editing, setEditing] = React.useState<CellEditor | null>(null);
    const viewId = dataset.getViewId?.() ?? "";
    const [viewWidths, setViewWidths] = React.useState<{ viewId: string; widths: Record<string, number> }>({ viewId: "", widths: {} });
    const [resizedWidths, setResizedWidths] = React.useState<{ viewId: string; widths: Record<string, number> }>({ viewId: "", widths: {} });
    const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
    const [actionMessage, setActionMessage] = React.useState("");
    const [writableColumns, setWritableColumns] = React.useState<Set<string>>(() => new Set());
    const [fieldMetadata, setFieldMetadata] = React.useState<Record<string, EntityColumnMetadata>>({});
    const [choiceOptions, setChoiceOptions] = React.useState<Record<string, ChoiceOption[]>>({});
    const [lookupTargets, setLookupTargets] = React.useState<Record<string, LookupTarget[]>>({});
    const [metadataErrors, setMetadataErrors] = React.useState<Record<string, string>>({});
    const [metadataLoading, setMetadataLoading] = React.useState(true);
    const [draftLookups, setDraftLookups] = React.useState<Record<string, LookupChoice>>({});
    const [recordStates, setRecordStates] = React.useState<{ key: string; values: Record<string, number> }>({ key: "", values: {} });
    const entityName = dataset.getTargetEntityType?.() || "";
    const stateKey = entityName + ":" + dataKey;
    const isRowReadOnly = (row: GridRow) => props.isControlDisabled || (!row.isDraft
        && (recordStates.key !== stateKey || recordStates.values[row.id] !== 0));
    const tableRef = React.useRef<HTMLTableElement | null>(null);
    const copyInProgress = React.useRef(false);
    const resizeSession = React.useRef<{ columnName: string; startX: number; startWidth: number } | null>(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
    const recordKey = Array.isArray(dataset.sortedRecordIds) ? dataset.sortedRecordIds.join(",") : "";
    const columns = getColumns(dataset, props.sortOrderColumn);
    const columnWidths = Object.fromEntries(columns.map((column) => [column.name,
        (resizedWidths.viewId === viewId ? resizedWidths.widths[column.name] : undefined)
        ?? defaultColumnWidth(column.name, column.width, viewWidths.viewId === viewId ? viewWidths.widths : {})]));
    const tableWidth = 56 + columns.reduce((total, column) => total + columnWidths[column.name], 0);
    const setColumnWidth = (name: string, width: number) => setResizedWidths((current) => ({ viewId, widths: { ...(current.viewId === viewId ? current.widths : {}), [name]: width } }));
    const configuredEditableColumns = (props.editableColumns ?? "").split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
    const matchingEditableColumns = configuredEditableColumns.filter((name) => columns.some((column) => column.name.toLowerCase() === name));
    const editableColumnNames = new Set(columns.filter((column) => !column.isPrimary && writableColumns.has(column.name.toLowerCase())
        && (!matchingEditableColumns.length || matchingEditableColumns.includes(column.name.toLowerCase())))
        .map((column) => column.name.toLowerCase()));

    React.useEffect(() => {
        let active = true;
        void loadViewWidths(props.webApi, viewId).then((widths) => { if (active) setViewWidths({ viewId, widths }); return widths; });
        return () => { active = false; };
    }, [viewId, props.webApi]);

    const beginResize = (event: React.PointerEvent<HTMLDivElement>, column: GridColumn) => {
        event.preventDefault();
        event.stopPropagation();
        const currentWidth = columnWidths[column.name] ?? event.currentTarget.parentElement?.getBoundingClientRect().width ?? 160;
        resizeSession.current = { columnName: column.name, startX: event.clientX, startWidth: currentWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const moveResize = (event: React.PointerEvent<HTMLDivElement>, column: GridColumn) => {
        const resize = resizeSession.current;
        if (!resize || resize.columnName !== column.name) return;
        event.preventDefault();
        const nextWidth = Math.max(40, resize.startWidth + event.clientX - resize.startX);
        setColumnWidth(column.name, nextWidth);
    };
    const finishResize = () => { resizeSession.current = null; };

    React.useEffect(() => { setRows(sourceRows); }, [dataKey]);
    React.useEffect(() => {
        let active = true;
        setRecordStates({ key: stateKey, values: {} });
        if (!entityName || dataset.loading || props.isControlDisabled) return () => { active = false; };
        // Read state independently of the visible view, including when statecode is hidden.
        void (async () => {
            const metadata = await getEntityMetadata(entityName);
            const primaryId = metadata.PrimaryIdAttribute;
            if (!/^[a-z][a-z0-9_]*$/i.test(primaryId)) throw new Error("Missing primary ID attribute");
            const ids = sourceRows.map((row) => row.id).filter(isPersistentRecordId);
            const values: Record<string, number> = {};
            for (let start = 0; start < ids.length; start += 50) {
                const batch = ids.slice(start, start + 50);
                const filter = batch.map((id) => `${primaryId} eq ${id.replace(/[{}]/g, "")}`).join(" or ");
                const result = await props.webApi.retrieveMultipleRecords(entityName,
                    `?$select=${primaryId},statecode&$filter=${encodeURIComponent(filter)}`, 50);
                for (const record of result.entities) {
                    const id = String(record[primaryId]).toLowerCase();
                    const sourceId = batch.find((candidate) => candidate.replace(/[{}]/g, "").toLowerCase() === id);
                    if (sourceId && typeof record.statecode === "number") values[sourceId] = record.statecode;
                }
            }
            // Limit concurrent access checks to avoid flooding the host with requests.
            for (let start = 0; start < ids.length; start += 5) {
                await Promise.all(ids.slice(start, start + 5).map(async (id) => {
                    if (values[id] === 0 && !await hasRecordWriteAccess(props.userId, metadata.EntitySetName, id)) values[id] = -1;
                }));
                if (!active) return;
            }
            if (active) setRecordStates({ key: stateKey, values });
        })().catch(() => { if (active) setActionMessage(strings.recordStateError); });
        return () => { active = false; };
    }, [stateKey, dataset.loading, props.webApi, props.userId, props.isControlDisabled]);
    React.useEffect(() => { setSelected(getSelectedIds(dataset)); }, [dataset, recordKey]);
    React.useEffect(() => {
        if (!entityName) return;
        let active = true;
        void getEntityMetadata(entityName, columns.map((column) => column.name)).then((metadata) => {
            const matchingAttributes = metadata.Attributes.filter((attribute) => columns.some((column) => column.name.toLowerCase() === attribute.LogicalName.toLowerCase()));
            const writable = matchingAttributes.filter((attribute) => isColumnWritable(attribute)).map((attribute) => attribute.LogicalName.toLowerCase());
            if (active) {
                setWritableColumns(new Set(writable));
                setFieldMetadata(Object.fromEntries(metadata.Attributes.map((attribute) => [attribute.LogicalName.toLowerCase(), attribute])));
            }
            return metadata;
        }).catch(() => {
            if (active) {
                setWritableColumns(new Set());
                setActionMessage("");
            }
        });
        return () => { active = false; };
    }, [entityName, props.utils, columns.map((column) => column.name).join("|")]);
    React.useEffect(() => {
        if (!entityName) return;
        let active = true;
        setMetadataLoading(true);
        void getEntityMetadata(entityName, columns.map((column) => column.name)).then(async (metadata) => {
            const choices: Record<string, ChoiceOption[]> = {};
            const lookups: Record<string, LookupTarget[]> = {};
            const errors: Record<string, string> = {};
            await Promise.all(columns.map(async (column) => {
                const attribute = metadata.Attributes.find((item) => item.LogicalName.toLowerCase() === column.name.toLowerCase());
                if (!attribute) { errors[column.name.toLowerCase()] = `${strings.metadataError}: ${column.name}`; return; }
                const attributeType = getAttributeTypeName(attribute.AttributeType);
                if (/optionset|picklist|choice|state|status/i.test(column.dataType + " " + attributeType)) {
                    choices[column.name.toLowerCase()] = normalizeChoiceOptions(attribute, props.language);
                    if (!choices[column.name.toLowerCase()].length) errors[column.name.toLowerCase()] = `${strings.metadataError}: ${column.name} (OptionSet)`;
                }
                if (/lookup/i.test(column.dataType)) {
                    const nested = getMetadataProperty(attribute, "attributes") as Record<string, unknown> | undefined;
                    const targetMetadata = getMetadataProperty(attribute, "Targets") ?? (nested && getMetadataProperty(nested, "Targets"));
                    const targets = Array.isArray(targetMetadata) ? targetMetadata.filter((target): target is string => typeof target === "string") : [];
                    // A single unsupported lookup target must not prevent choice metadata
                    // (or other lookup targets) from being made available to the grid.
                    const resolvedTargets = await Promise.all(targets.map(async (target) => {
                        try {
                            const metadata = await getEntityMetadata(target);
                            if (!metadata.EntitySetName || !metadata.PrimaryIdAttribute || !metadata.PrimaryNameAttribute) return null;
                            return { logicalName: target, entitySetName: metadata.EntitySetName, primaryIdAttribute: metadata.PrimaryIdAttribute, primaryNameAttribute: metadata.PrimaryNameAttribute };
                        } catch { return null; }
                    }));
                    lookups[column.name.toLowerCase()] = resolvedTargets.filter((target): target is LookupTarget => target !== null);
                    if (!lookups[column.name.toLowerCase()].length) errors[column.name.toLowerCase()] = `${strings.metadataError}: ${column.name} (Targets)`;
                }
            }));
            if (active) { setChoiceOptions(choices); setLookupTargets(lookups); setMetadataErrors(errors); }
            return metadata;
        }).catch((error: unknown) => {
            if (active) {
                const message = `${strings.metadataError}: ${error instanceof Error ? error.message : String(error)}`;
                setMetadataErrors(Object.fromEntries(columns.map((column) => [column.name.toLowerCase(), message])));
                setActionMessage(message);
            }
        }).finally(() => { if (active) setMetadataLoading(false); });
        return () => { active = false; };
    }, [entityName, props.utils, props.webApi, props.language, columns.map((column) => `${column.name}:${column.dataType}`).join("|")]);
    React.useEffect(() => {
        if (!contextMenu) return;
        const closeMenu = (event: MouseEvent | KeyboardEvent) => {
            if (event instanceof KeyboardEvent && event.key !== "Escape") return;
            if (event instanceof MouseEvent && event.target instanceof Element && event.target.closest(".ess-context-menu")) return;
            setContextMenu(null);
        };
        document.addEventListener("click", closeMenu);
        document.addEventListener("keydown", closeMenu);
        return () => {
            document.removeEventListener("click", closeMenu);
            document.removeEventListener("keydown", closeMenu);
        };
    }, [contextMenu]);

    const toggle = (id: string) => {
        const next = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
        setSelected(next);
        props.onSelectionChange(next);
    };
    const selectCell = (rowId: string, columnName: string) => { setActiveCell({ rowId, columnName }); };
    const focusCell = (rowId: string, columnName: string) => {
        const rowIndex = rows.findIndex((row) => row.id === rowId);
        const columnIndex = columns.findIndex((column) => column.name === columnName);
        const cell = tableRef.current?.querySelector<HTMLTableCellElement>(`td[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`);
        if (!cell) return;
        setActiveCell({ rowId, columnName });
        cell.focus({ preventScroll: true });
        cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    const navigateCell = (rowId: string, columnName: string, key: string, shift = false): boolean => {
        const rowIndex = rows.findIndex((row) => row.id === rowId);
        const columnIndex = columns.findIndex((column) => column.name === columnName);
        if (rowIndex < 0 || columnIndex < 0) return false;
        const next = cellDestination(rowIndex, columnIndex, rows.length, columns.length, key, shift);
        if (!next) return false;
        focusCell(rows[next.row].id, columns[next.column].name);
        return true;
    };
    const openRowMenu = (event: React.MouseEvent<HTMLTableRowElement>, id: string) => {
        event.preventDefault();
        event.stopPropagation();
        const nextSelection = selected.includes(id) ? selected : [id];
        if (!selected.includes(id)) {
            setSelected(nextSelection);
            props.onSelectionChange(nextSelection);
        }
        setContextMenu({ x: event.clientX, y: event.clientY, rowId: id });
        setActionMessage("");
    };
    const openRecordForm = async () => {
        const rowId = contextMenu?.rowId;
        setContextMenu(null);
        if (selected.length > 1) { setActionMessage(strings.openRecordSingleOnly); return; }
        if (!rowId || !isPersistentRecordId(rowId)) { setActionMessage(strings.openRecordSaveFirst); return; }
        if (!entityName) { setActionMessage(strings.openRecordError); return; }
        try {
            await props.navigation.openForm({ entityName, entityId: rowId.replace(/[{}]/g, "") });
        } catch (error: unknown) {
            setActionMessage(`${strings.openRecordError}: ${errorDescription(error, strings.openRecordError)}`);
        }
    };
    const copySelected = async () => {
        if (props.isControlDisabled) return;
        if (copyInProgress.current) return;
        const targetIds = selected.includes(contextMenu?.rowId ?? "") ? selected : contextMenu ? [contextMenu.rowId] : selected;
        const targetEntity = dataset.getTargetEntityType?.();
        setContextMenu(null);
        if (!targetIds.length || !targetEntity) { setActionMessage(strings.copyError); return; }
        if (targetIds.some((id) => !isPersistentRecordId(id))) { setActionMessage(strings.copySaveFirst); return; }
        if (!props.parentLookupColumn) { setActionMessage(strings.parentLookupRequired); return; }
        copyInProgress.current = true;
        setActionMessage(strings.copying);
        let createdCount = 0;
        let stage = strings.copyReadDefinition as string;
        let sourceId = "";
        let payloadFields: string[] = [];
        try {
            const definition = await loadCopyDefinition(targetEntity);
            const exclusions = excludedCopyColumns(props.copyExcludedColumns);
            const sets = new Map<string, Promise<string>>();
            const resolveEntitySet = (entity: string): Promise<string> => {
                let pending = sets.get(entity);
                if (!pending) { pending = lookupEntitySet(entity); sets.set(entity, pending); }
                return pending;
            };
            for (const id of targetIds) {
                sourceId = id;
                stage = strings.copyReadSource;
                const source = await loadCopySource(definition, id);
                stage = strings.copyPrepare;
                const payload = await buildCopyPayload(definition, source, exclusions, props.parentLookupColumn, resolveEntitySet,
                    props.sortOrderColumn, (rows.findIndex((row) => row.id === id) + 1) * 1000 + 500);
                payloadFields = Object.keys(payload);
                stage = strings.copyCreate;
                await props.webApi.createRecord(targetEntity, payload);
                createdCount += 1;
            }
            setActionMessage(strings.copySuccess);
        } catch (error: unknown) {
            const message = `${strings.copyError} (${createdCount}/${targetIds.length}) — ${stage}: ${errorDescription(error, strings.copyError)}`;
            setActionMessage(message);
            try {
                await props.navigation.openErrorDialog({ message,
                    details: [`${stage}`, `Table: ${targetEntity}`, `Source: ${sourceId}`, `Parent lookup: ${props.parentLookupColumn}`, `Fields: ${payloadFields.join(", ")}`, `Excluded: ${props.copyExcludedColumns ?? ""}`].join("\n") });
            } catch { /* Keep the actual server error visible in the grid toolbar. */ }
        } finally {
            if (createdCount) dataset.refresh();
            copyInProgress.current = false;
        }
    };
    const deleteSelected = async () => {
        if (props.isControlDisabled) return;
        setContextMenu(null);
        try {
            const result = await props.navigation.openConfirmDialog({
                title: strings.deleteTitle,
                text: strings.deleteConfirm,
                confirmButtonLabel: strings.delete,
                cancelButtonLabel: strings.cancel
            }, { width: 520 });
            if (!result.confirmed) return;
        } catch {
            setActionMessage(strings.deleteError);
            return;
        }
        const targetEntity = dataset.getTargetEntityType?.();
        const targetIds = selected.includes(contextMenu?.rowId ?? "") ? selected : contextMenu ? [contextMenu.rowId] : selected;
        const persistentIds = targetIds.filter(isPersistentRecordId);
        if (!targetEntity || (persistentIds.length > 0 && typeof props.webApi?.deleteRecord !== "function")) {
            setActionMessage(strings.deleteError);
            return;
        }
        try {
            const deletedIds = new Set(targetIds.filter((id) => !isPersistentRecordId(id)));
            for (const id of persistentIds) {
                await props.webApi.deleteRecord(targetEntity, id);
                deletedIds.add(id);
            }
            setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
            const remainingSelection = targetIds.filter((id) => !deletedIds.has(id));
            setSelected(remainingSelection);
            props.onSelectionChange(remainingSelection);
            if (persistentIds.length > 0) dataset.refresh();
        } catch {
            const selectedRecords = dataset.records || {};
            const remainingSelection = targetIds.filter((id) => !!selectedRecords[id]);
            setSelected(remainingSelection);
            props.onSelectionChange(remainingSelection);
            dataset.refresh();
            setActionMessage(strings.deleteError);
        }
    };
    const confirmWritableRow = async (rowId: string): Promise<boolean> => {
        if (props.isControlDisabled) return false;
        try {
            const record = await props.webApi.retrieveRecord(entityName, rowId.replace(/[{}]/g, ""), "?$select=statecode");
            if (typeof record.statecode !== "number") throw new Error("Missing record state");
            const metadata = await getEntityMetadata(entityName);
            const writable = record.statecode === 0 && await hasRecordWriteAccess(props.userId, metadata.EntitySetName, rowId);
            setRecordStates((current) => current.key === stateKey
                ? { ...current, values: { ...current.values, [rowId]: writable ? 0 : -1 } } : current);
            if (writable) return true;
            setActionMessage(strings.recordReadOnly);
        } catch { setActionMessage(strings.recordStateError); }
        setEditing(null);
        return false;
    };
    const commitEdit = async (rowId: string, columnName: string, value: string) => {
        const row = rows.find((item) => item.id === rowId);
        const column = columns.find((item) => item.name === columnName);
        if (!row || !column || isRowReadOnly(row)) return;
        const updateValue = (item: GridRow) => item.id === rowId
            ? commitScalarValue(item, columnName, value, column.dataType, choiceOptions[columnName.toLowerCase()] ?? [], strings.yes, strings.no)
            : item;
        if (row.isDraft) {
            setRows((current) => current.map(updateValue));
            return;
        }
        if (!isPersistentRecordId(rowId) || !editableColumnNames.has(columnName.toLowerCase())) return;
        try {
            if (!await confirmWritableRow(rowId)) return;
            const rawValue = dataset.records?.[rowId]?.getValue(columnName);
            const converted = parseColumnValue(value, String((dataset.columns || []).find((item) => item.name === columnName)?.dataType ?? ""), rawValue, fieldMetadata[columnName.toLowerCase()]);
            setActionMessage(strings.saving);
            await props.webApi.updateRecord(entityName, rowId.replace(/[{}]/g, ""), { [columnName]: converted });
            setRows((current) => current.map(updateValue));
            setActionMessage(strings.saved);
            dataset.refresh();
        } catch (error: unknown) {
            setActionMessage(strings.saveError + ": " + (error instanceof Error ? error.message : String(error)));
        }
    };
    const commitLookup = async (rowId: string, columnName: string, value: LookupChoice) => {
        const row = rows.find((item) => item.id === rowId);
        if (!row || isRowReadOnly(row)) return;
        if (row.isDraft) {
            setDraftLookups((current) => ({ ...current, [`${rowId}:${columnName}`]: value }));
            setRows((current) => current.map((item) => item.id === rowId ? { ...item, values: { ...item.values, [columnName]: value.label } } : item));
            return;
        }
        if (!isPersistentRecordId(rowId) || !editableColumnNames.has(columnName.toLowerCase())) return;
        try {
            if (!await confirmWritableRow(rowId)) return;
            const target = (lookupTargets[columnName.toLowerCase()] ?? []).find((item) => item.logicalName === value.entityType);
            if (!target?.entitySetName) throw new Error("Lookup target metadata is unavailable");
            setActionMessage(strings.saving);
            await props.webApi.updateRecord(entityName, rowId.replace(/[{}]/g, ""), { [`${columnName}@odata.bind`]: `/${target.entitySetName}(${value.id})` });
            setRows((current) => current.map((item) => item.id === rowId ? { ...item, values: { ...item.values, [columnName]: value.label } } : item));
            setActionMessage(strings.saved);
            dataset.refresh();
        } catch { setActionMessage(strings.saveError); }
    };
    const updateEditDraft = (rowId: string, columnName: string, value: string) => {
        setEditing((current) => current?.rowId === rowId && current.columnName === columnName ? { ...current, value } : current);
    };
    const addRowAt = (at: number) => {
        if (props.isControlDisabled) return;
        const newRow: GridRow = { id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`, values: Object.fromEntries(columns.map((column) => [column.name, ""])), isDraft: true };
        setRows((current) => [...current.slice(0, at), newRow, ...current.slice(at)]);
        const firstEditable = columns.find((column) => editableColumnNames.has(column.name.toLowerCase())) ?? columns[0];
        setEditing(firstEditable ? { rowId: newRow.id, columnName: firstEditable.name, originalValue: "", value: "" } : null);
    };
    const addRowBefore = (id: string) => {
        const index = rows.findIndex((row) => row.id === id);
        if (index >= 0) addRowAt(index);
    };
    const addRowAfter = (id: string) => {
        const index = rows.findIndex((row) => row.id === id);
        if (index >= 0) addRowAt(index + 1);
    };
    const cancelEdit = () => {
        if (editing?.rowId.startsWith("local-")) setRows((current) => current.filter((row) => row.id !== editing.rowId));
        else if (editing) setRows((current) => current.map((row) => row.id === editing.rowId ? { ...row, values: { ...row.values, [editing.columnName]: editing.originalValue } } : row));
        setEditing(null);
    };
    const saveDraft = async (rowId: string) => {
        if (props.isControlDisabled) return;
        const row = rows.find((item) => item.id === rowId && item.isDraft);
        if (!row || !entityName) return;
        if (!props.sortOrderColumn) { setActionMessage(strings.sortOrderRequired); return; }
        if (!props.parentLookupColumn) { setActionMessage(strings.parentLookupRequired); return; }
        try {
            setActionMessage(strings.saving);
            const [metadata, definition] = await Promise.all([
                getEntityMetadata(entityName, creationAttributeNames(columns.map((column) => column.name), props.parentLookupColumn, props.sortOrderColumn)),
                loadCopyDefinition(entityName)
            ]);
            const parentAttribute = metadata.Attributes.find((attribute) => attribute.LogicalName.toLowerCase() === props.parentLookupColumn!.toLowerCase());
            const rawTargets = getMetadataProperty(parentAttribute, "Targets");
            const parentRelations = definition.Relationships.filter((relation) => relation.ReferencingAttribute.toLowerCase() === props.parentLookupColumn!.toLowerCase());
            const parentTargets = [...new Set([
                ...(Array.isArray(rawTargets) ? rawTargets.filter((target): target is string => typeof target === "string") : []),
                ...parentRelations.map((relation) => relation.ReferencedEntity)
            ])];
            const parentRecord = resolveParentRecord(dataset, props.parentLookupColumn, props.parentRecordId, props.parentEntityName, parentTargets);
            if (!parentRecord) {
                setActionMessage(`${strings.parentRecordMissing} [parentId=${props.parentRecordId ? "present" : "missing"}; parentTable=${parentTargets.join(",") || "missing"}]`);
                return;
            }
            const createAllowed = new Set(metadata.Attributes.filter((attribute) => isColumnWritable(attribute, "create")).map((attribute) => attribute.LogicalName.toLowerCase()));
            const payload: ComponentFramework.WebApi.Entity = {};
            for (const column of columns) {
                const key = column.name.toLowerCase();
                const value = row.rawValues?.[column.name] ?? row.values[column.name] ?? "";
                if (column.isPrimary || column.name.toLowerCase() === props.sortOrderColumn.toLowerCase() || !createAllowed.has(key)) continue;
                const lookup = draftLookups[`${rowId}:${column.name}`];
                if (lookup) {
                    const target = (lookupTargets[key] ?? []).find((item) => item.logicalName === lookup.entityType);
                    if (!target?.entitySetName) throw new Error("Lookup target metadata is unavailable");
                    payload[`${column.name}@odata.bind`] = `/${target.entitySetName}(${lookup.id})`;
                    continue;
                }
                if (!value) continue;
                payload[column.name] = parseColumnValue(value, String((dataset.columns || []).find((item) => item.name === column.name)?.dataType ?? ""), undefined, fieldMetadata[column.name.toLowerCase()]);
            }
            const parentMetadata = await getEntityMetadata(parentRecord.entityType);
            if (!parentMetadata.EntitySetName) throw new Error("Parent table metadata unavailable");
            const parentRelation = parentRelations.find((relation) => relation.ReferencedEntity.toLowerCase() === parentRecord.entityType.toLowerCase());
            if (!parentRelation?.ReferencingEntityNavigationPropertyName) throw new Error(`Parent relationship metadata unavailable: ${props.parentLookupColumn}`);
            payload[`${parentRelation.ReferencingEntityNavigationPropertyName}@odata.bind`] = `/${parentMetadata.EntitySetName}(${parentRecord.id})`;
            const rowIndex = rows.findIndex((item) => item.id === rowId);
            payload[props.sortOrderColumn] = (rowIndex + 1) * 1000;
            const created = await props.webApi.createRecord(entityName, payload);
            const newId = created.id;
            if (!newId) throw new Error("Dataverse did not return the created record ID");
            setRows((current) => current.map((item) => item.id === rowId ? { ...item, id: newId.replace(/[{}]/g, ""), isDraft: false } : item));
            setDraftLookups((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${rowId}:`))));
            setActionMessage(strings.saved);
            dataset.refresh();
        } catch (error: unknown) {
            setActionMessage(`${strings.createError}: ${errorDescription(error, strings.createError)}`);
        }
    };
    const onDragEnd = async (event: DragEndEvent) => {
        if (!event.over || event.active.id === event.over.id) return;
        if (!props.sortOrderColumn) { setActionMessage(strings.sortOrderRequired); return; }
        if (rows.some((row) => row.isDraft === true || !isPersistentRecordId(row.id))) { setActionMessage(strings.saveDraftFirst); return; }
        const totalCount = dataset.paging?.totalResultCount;
        if (typeof totalCount === "number" && totalCount > rows.length) { setActionMessage(strings.loadAllBeforeSort); return; }
        const reordered = (() => {
            const from = rows.findIndex((row) => row.id === event.active.id);
            const to = rows.findIndex((row) => row.id === event.over?.id);
            return from < 0 || to < 0 ? rows : arrayMove(rows, from, to);
        })();
        setRows(reordered);
        try {
            setActionMessage(strings.saving);
            await Promise.all(reordered.map((row, index) => props.webApi.updateRecord(entityName, row.id.replace(/[{}]/g, ""), { [props.sortOrderColumn!]: (index + 1) * 1000 })));
            dataset.sorting = [{ name: props.sortOrderColumn, sortDirection: 0 }];
            setActionMessage(strings.saved);
            dataset.refresh();
        } catch {
            setRows(sourceRows);
            setActionMessage(strings.saveError);
        }
    };
    const requestMore = () => { if (dataset.paging?.hasNextPage && !dataset.loading) dataset.paging.loadNextPage(); };

    return <div className="ess-grid" role="region" aria-label="Editable sortable subgrid">
        <div className="ess-toolbar"><span>{actionMessage || strings.editHint}</span></div>
        <div className="ess-scroll" onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) requestMore();
        }}>
            <DndContext sensors={sensors} onDragEnd={(event) => { void onDragEnd(event); }}>
                <table ref={tableRef} className="ess-table" style={{ width: tableWidth }}>
                    <colgroup><col style={{ width: 56 }} />{columns.map((column) => <col key={column.name} style={{ width: columnWidths[column.name] }} />)}</colgroup>
                    <thead><tr><th className="ess-leading">
                        <div className="ess-leading-content ess-leading-header">
                        <button type="button" className="ess-select ess-select-all" aria-label={selected.length === rows.length && rows.length > 0 ? strings.deselectAll : strings.selectAll}
                            aria-pressed={rows.length > 0 && selected.length === rows.length}
                            title={selected.length === rows.length && rows.length > 0 ? strings.deselectAll : strings.selectAll}
                            onClick={() => {
                                const next = rows.length > 0 && selected.length === rows.length ? [] : rows.map((row) => row.id);
                                setSelected(next);
                                props.onSelectionChange(next);
                            }}>
                            {rows.length > 0 && selected.length === rows.length ? "✓" : ""}
                        </button>
                        </div>
                    </th>
                        {columns.map((column) => {
                            const width = columnWidths[column.name];
                            return <th key={column.name} style={width ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : { width: `${column.width ?? 160}px` }}>
                                <span className="ess-column-title">{column.title}</span>
                                <div className="ess-resize-handle" role="separator" aria-orientation="vertical" aria-label={`${column.title} width`}
                                    tabIndex={0} onPointerDown={(event) => beginResize(event, column)}
                                    onPointerMove={(event) => moveResize(event, column)} onPointerUp={finishResize} onPointerCancel={finishResize}
                                    onKeyDown={(event) => {
                                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                        event.preventDefault();
                                        const delta = event.key === "ArrowRight" ? 16 : -16;
                                        const currentWidth = columnWidths[column.name] ?? event.currentTarget.parentElement?.getBoundingClientRect().width ?? 160;
                                        setColumnWidth(column.name, Math.max(40, currentWidth + delta));
                                    }} />
                            </th>;
                        })}
                    </tr></thead>
                    <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                        <tbody>
                            {rows.map((row, index) => <SortableRow key={row.id} row={row} index={index} columns={columns} columnWidths={columnWidths}
                                selected={selected.includes(row.id)} activeCell={activeCell} hovered={hovered === row.id} editing={editing} rawValues={rawValues} strings={strings}
                                rowReadOnly={isRowReadOnly(row)}
                                onHover={setHovered} onToggle={toggle} onSelectCell={selectCell} onNavigateCell={navigateCell} onFocusCell={focusCell} onInsertBefore={addRowBefore} onInsertAfter={addRowAfter}
                                onContextMenu={openRowMenu}
                                onStartEdit={(rowId, columnName, originalValue, lookup) => setEditing({ rowId, columnName, originalValue: row.values[columnName] ?? "", value: originalValue, lookup })}
                                onDraftChange={updateEditDraft} onSaveDraft={(rowId) => { void saveDraft(rowId); }} editableColumnNames={editableColumnNames}
                                onCommitEdit={(rowId, columnName, value) => { void commitEdit(rowId, columnName, value); }} onCommitLookup={(rowId, columnName, value) => { void commitLookup(rowId, columnName, value); }}
                                choiceOptions={choiceOptions} lookupTargets={lookupTargets} metadataErrors={metadataErrors} metadataLoading={metadataLoading} fieldMetadata={fieldMetadata} webApi={props.webApi} language={props.language}
                                onFinishEdit={() => setEditing(null)} onCancelEdit={() => cancelEdit()} />)}
                            <tr className="ess-add-row"><td colSpan={columns.length + 1}><button type="button" disabled={props.isControlDisabled} onClick={() => addRowAt(rows.length)}>{strings.addRow}</button></td></tr>
                        </tbody>
                    </SortableContext>
                </table>
            </DndContext>
            {dataset.loading && <div className="ess-status"><span className="ess-spinner" aria-hidden="true" />{strings.loading}</div>}
            {!dataset.loading && rows.length === 0 && <div className="ess-status">{strings.empty}</div>}
            {dataset.paging?.hasNextPage && <button className="ess-more" onClick={requestMore}>{strings.loadMore}</button>}
        </div>
        {contextMenu && createPortal(<div className="ess-context-menu" role="menu" style={{
            left: Math.max(4, Math.min(contextMenu.x, window.innerWidth - 180)),
            top: Math.max(4, Math.min(contextMenu.y, window.innerHeight - 132))
        }} onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" role="menuitem" disabled={props.isControlDisabled} onClick={() => { void copySelected(); }}>{strings.copy}{selected.length > 1 ? ` (${selected.length})` : ""}</button>
            <button type="button" role="menuitem" disabled={selected.length > 1 || !isPersistentRecordId(contextMenu.rowId)} title={selected.length > 1 ? strings.openRecordSingleOnly : !isPersistentRecordId(contextMenu.rowId) ? strings.openRecordSaveFirst : strings.openRecord}
                onClick={() => { void openRecordForm(); }}>{strings.openRecord}</button>
            <button type="button" role="menuitem" className="ess-context-delete" disabled={props.isControlDisabled} onClick={() => { void deleteSelected(); }}>{strings.delete}{selected.length > 1 ? ` (${selected.length})` : ""}</button>
        </div>, document.body)}
    </div>;
}
