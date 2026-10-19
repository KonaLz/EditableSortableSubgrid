import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { EditableGrid } from "./components/EditableGrid";
import { synchronizeSelection } from "./services/SelectionService";

type DataSet = ComponentFramework.PropertyTypes.DataSet;

export class EditableSortableSubgrid implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    public init(): void { /* Dataset is consumed from updateView after platform initialization. */ }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const dataset: DataSet = context.parameters.records;
        // contextInfo is currently exposed by model-driven subgrids but is not
        // part of the published PCF typings/API contract. Keep it as a guarded
        // runtime fallback; dataset row/filter resolution remains available.
        const modeContext = context.mode as ComponentFramework.Mode & {
            contextInfo?: { entityId?: string; entityTypeName?: string };
        };
        const runtimeParentId = modeContext.contextInfo?.entityId;
        const configuredParentId = context.parameters.parentRecordId?.raw;
        const effectiveParentId = runtimeParentId?.trim() ? runtimeParentId : configuredParentId;
        const datasetColumns = dataset.columns || [];
        const bindingColumns = datasetColumns.filter((column) => column.order < 0);
        const isWholeNumber = (column: ComponentFramework.PropertyHelper.DataSetApi.Column) => /whole|integer|number/i.test(column.dataType);
        const sortOrderColumn = datasetColumns.find((column) => column.alias === "SortOrder")?.name ?? bindingColumns.find(isWholeNumber)?.name
            ?? datasetColumns.find((column) => isWholeNumber(column) && /(?:^|_)(?:sort_?order|order|sequence|position)$/i.test(column.name))?.name;
        const parentLookupColumn = datasetColumns.find((column) => column.alias === "ParentLookup")?.name ?? bindingColumns.find((column) => /lookup/i.test(column.dataType))?.name;
        return React.createElement(EditableGrid, {
            dataset,
            webApi: context.webAPI,
            utils: context.utils,
            navigation: context.navigation,
            onSelectionChange: (ids: string[]) => synchronizeSelection(dataset, ids),
            language: context.userSettings.languageId,
            languageOverride: context.parameters.language?.raw,
            editableColumns: context.parameters.editableColumns?.raw ?? undefined,
            copyExcludedColumns: context.parameters.copyExcludedColumns?.raw ?? undefined,
            parentRecordId: effectiveParentId ?? undefined,
            parentEntityName: context.parameters.parentEntityName?.raw ?? undefined,
            sortOrderColumn,
            parentLookupColumn
        });
    }

    public getOutputs(): IOutputs { return {}; }
    public destroy(): void { /* React owns DOM lifecycle. */ }
}
